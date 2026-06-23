import { getOraclePrice, setupClients } from "@/lib/api";
import { SerializedVaultSnapshot, vault_snapshots } from "@/db/schema";
import {
  BigNum,
  PRICE_PRECISION_EXP,
  PublicKey,
  QUOTE_PRECISION_EXP,
  SpotMarkets,
} from "@velocity-exchange/sdk";
import { VaultAccount } from "@velocity-exchange/vaults-sdk";
import dayjs from "dayjs";
import { NextRequest, NextResponse } from "next/server";
import { VAULTS, UiVaultConfig } from "@/constants/vaults";
import { db } from "@/db";

const { driftClient, vaultClient, accountLoader, connection } = setupClients();

const MAINNET_SPOT_MARKETS_LOOKUP = SpotMarkets["mainnet-beta"];

const getVaultDataForSnapshot = async (
  vaultPubKey: PublicKey,
  driftUserPubkey: PublicKey,
  uiVaultConfig: UiVaultConfig,
  numOfAttempts = 0,
): Promise<Omit<SerializedVaultSnapshot, "id">> => {
  try {
    const vault = new VaultAccount(
      vaultClient.program,
      vaultPubKey,
      accountLoader,
      "polling",
    );

    await vault.subscribe();

    const vaultAccountData = vault.getData();
    const vaultTotalQuoteValue = await vaultClient.calculateVaultEquity({
      address: vaultPubKey,
    });

    const vaultUser = await vaultClient.getSubscribedVaultUser(driftUserPubkey);
    const vaultUserAccount = vaultUser.getUserAccount();

    const totalQuoteDeposits = vaultUserAccount.totalDeposits;
    const totalQuoteWithdraws = vaultUserAccount.totalWithdraws;
    const netQuoteDeposits = totalQuoteDeposits.sub(totalQuoteWithdraws);

    const oraclePrice = await getOraclePrice(
      vaultAccountData.spotMarketIndex,
      connection,
      driftClient.program,
    );

    const vaultTotalBaseValue = BigNum.from(
      vaultTotalQuoteValue,
      QUOTE_PRECISION_EXP,
    )
      .shift(PRICE_PRECISION_EXP)
      .div(BigNum.from(oraclePrice, PRICE_PRECISION_EXP))
      .shiftTo(
        MAINNET_SPOT_MARKETS_LOOKUP[vaultAccountData.spotMarketIndex]
          .precisionExp,
      );
    const ts = dayjs().unix();

    const slot = vault.accountSubscriber.getAccountAndSlot().slot;

    const serializedData = {
      ts: ts.toString(),
      slot,
      oraclePrice: oraclePrice.toString(),
      totalAccountQuoteValue: vaultTotalQuoteValue.toString(),
      totalAccountBaseValue: vaultTotalBaseValue.toString(),
      totalAccountBaseValueEwma: null,
      vault: vaultPubKey.toString(),
      userShares: vaultAccountData.userShares.toString(),
      totalShares: vaultAccountData.totalShares.toString(),
      netDeposits: vaultAccountData.netDeposits.toString(),
      netQuoteDeposits: netQuoteDeposits.toString(), // notional value of net deposits; mainly used for notional growth strategy vaults to calculate quote P&L better
      totalDeposits: vaultAccountData.totalDeposits.toString(),
      totalWithdraws: vaultAccountData.totalWithdraws.toString(),
      totalWithdrawRequested:
        vaultAccountData.totalWithdrawRequested.toString(),
      managerNetDeposits: vaultAccountData.managerNetDeposits.toString(),
      managerTotalDeposits: vaultAccountData.managerTotalDeposits.toString(),
      managerTotalWithdraws: vaultAccountData.managerTotalWithdraws.toString(),
      managerTotalProfitShare:
        vaultAccountData.managerTotalProfitShare.toString(),
      managerTotalFee: vaultAccountData.managerTotalFee.toString(),
    };

    return serializedData;
  } catch (err) {
    console.error(
      `Error fetching vault data for ${vaultPubKey.toString()} snapshot`,
      err,
    );

    if (numOfAttempts >= 2) {
      console.log(
        `Max attempts reached, skipping vault ${vaultPubKey.toString()}`,
      );
      throw err;
    }

    console.log("Retrying getVaultDataForSnapshot in 5 seconds");

    await new Promise((resolve) => setTimeout(resolve, 5000));
    return getVaultDataForSnapshot(
      vaultPubKey,
      driftUserPubkey,
      uiVaultConfig,
      ++numOfAttempts,
    );
  }
};

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", {
      status: 401,
    });
  }

  await driftClient.subscribe();

  const params = request.nextUrl.searchParams;
  const vaultParam = params.get("vault");
  const nativeVaultsConfigs = VAULTS;

  const specificVault = nativeVaultsConfigs.find(
    (vault) => vault.vaultPubkeyString === vaultParam,
  );

  const vaultsToSnapshot = specificVault
    ? [specificVault]
    : nativeVaultsConfigs;

  const vaultsSnapshotsResults = await Promise.allSettled(
    vaultsToSnapshot.map((uiVaultConfig) =>
      getVaultDataForSnapshot(
        new PublicKey(uiVaultConfig.vaultPubkeyString),
        new PublicKey(uiVaultConfig.userPubKeyString),
        uiVaultConfig,
      ),
    ),
  );

  const vaultsSnapshotsData = vaultsSnapshotsResults
    .filter((result) => result.status === "fulfilled")
    .map(
      (result) =>
        (result as PromiseFulfilledResult<Omit<SerializedVaultSnapshot, "id">>)
          .value,
    );

  await db.insert(vault_snapshots).values(vaultsSnapshotsData);

  return NextResponse.json(vaultsSnapshotsData, {
    status: 200,
  });
}
