import {
  BN,
  DepositRecord,
  fetchLogs,
  PublicKey,
  ZERO,
  LogParser as DriftLogParser,
  BigNum,
  PRICE_PRECISION_EXP,
} from "@velocity-exchange/sdk";
import { db } from "@/db";
import {
  SerializedVaultDepositorRecord,
  vault_depositor_records,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import dayjs from "dayjs";
import { NextRequest } from "next/server";
import { VAULTS } from "@/constants/vaults";
import {
  VaultDepositorAction,
  WrappedEvent,
  LogParser as VaultsLogParser,
  VaultDepositorRecord,
  VaultDepositorV1Record,
} from "@velocity-exchange/vaults-sdk";
import { ENUM_UTILS } from "@drift/common";
import {
  getHistoricalPriceFromPyth,
  getSpotMarketConfig,
  setupClients,
} from "@/lib/api";
import _ from "lodash";

const MAX_TXNS_PER_REQUEST = 1000;
const MAX_TXNS_BUFFER = 200;

const { driftClient, vaultClient, connection } = setupClients();
// @ts-ignore
const vaultsLogParser = new VaultsLogParser(vaultClient.program);
const driftLogParser = new DriftLogParser(driftClient.program);

type VaultDepositorRecordWithPrices = WrappedEvent<
  "VaultDepositorRecord" | "VaultDepositorV1Record"
> & {
  assetPrice: BN;
  notionalValue: BN;
};

/**
 * There is a need to get the amount and the oracle price from the Drift DepositRecord event,
 * because the amount is 0 for the VaultDepositorRecord event when it is a vault manager action.
 * Hence, the amount from the Drift DepositRecord event is the source of truth.
 */
const reconcileVaultAndDriftEvents = (
  vaultDepositorRecordEvent: WrappedEvent<
    "VaultDepositorRecord" | "VaultDepositorV1Record"
  >,
  depositRecordEvent: DepositRecord,
): VaultDepositorRecordWithPrices => {
  const oraclePrice = depositRecordEvent.oraclePrice;
  const amount = depositRecordEvent.amount;
  const notionalValue = amount
    .mul(oraclePrice)
    .div(
      getSpotMarketConfig(vaultDepositorRecordEvent.spotMarketIndex).precision,
    );

  const recordWithPrices = {
    ...vaultDepositorRecordEvent,
    amount,
    assetPrice: oraclePrice,
    notionalValue,
  };

  return recordWithPrices;
};

/**
 * Sometimes the oracle price is stale, and the transaction logs is unable to be parsed.
 * Or we are unable to parse the Drift DepositRecord event, and therefore cannot obtain the logged oracle price.
 * We can then fetch the oracle price from the Pyth API and calculate the notional value.
 */
const handleNoLoggedOraclePrice = async (
  vaultDepositorRecordEvent: WrappedEvent<
    "VaultDepositorRecord" | "VaultDepositorV1Record"
  >,
) => {
  const amount = vaultDepositorRecordEvent.amount;

  const spotMarketConfig = getSpotMarketConfig(
    vaultDepositorRecordEvent.spotMarketIndex,
  );
  const amountBigNum = BigNum.from(amount, spotMarketConfig.precisionExp);
  const oraclePriceBigNum = await getHistoricalPriceFromPyth(
    +vaultDepositorRecordEvent.ts,
    vaultDepositorRecordEvent.spotMarketIndex,
  );
  const notionalValue = amountBigNum
    .mul(oraclePriceBigNum)
    .shiftTo(PRICE_PRECISION_EXP).val;

  const recordWithPrices = {
    ...vaultDepositorRecordEvent,
    amount: amountBigNum.val,
    assetPrice: oraclePriceBigNum.val,
    notionalValue,
  };

  return recordWithPrices;
};

const serializeVaultDepositorRecord = (
  record: VaultDepositorRecordWithPrices,
): Omit<SerializedVaultDepositorRecord, "id"> => {
  return {
    ts: record.ts.toString(),
    txSig: record.txSig,
    slot: record.slot,
    vault: record.vault.toString(),
    action: ENUM_UTILS.toStr(record.action),
    amount: record.amount.toString(),
    spotMarketIndex: record.spotMarketIndex,
    vaultSharesBefore: record.vaultSharesBefore.toString(),
    vaultSharesAfter: record.vaultSharesAfter.toString(),
    depositorAuthority: record.depositorAuthority.toString(),
    vaultEquityBefore: record.vaultEquityBefore.toString(),
    userVaultSharesBefore: record.userVaultSharesBefore.toString(),
    totalVaultSharesBefore: record.totalVaultSharesBefore.toString(),
    userVaultSharesAfter: record.userVaultSharesAfter.toString(),
    totalVaultSharesAfter: record.totalVaultSharesAfter.toString(),
    profitShare:
      record.eventType === "VaultDepositorRecord"
        ? (record as VaultDepositorRecord).profitShare.toString()
        : (record as VaultDepositorV1Record).managerProfitShare.toString(),
    managementFee: record.managementFee.toString(),
    managementFeeShares: record.managementFeeShares.toString(),
    assetPrice: record.assetPrice.toString(),
    notionalValue: record.notionalValue.toString(),
  };
};

const recursivelyGetTransactions = async (
  pubkeyToFetch: PublicKey,
  vaultManager: string,
  records: VaultDepositorRecordWithPrices[] = [],
  beforeTx?: string,
  untilTx?: string,
): Promise<VaultDepositorRecordWithPrices[]> => {
  try {
    const response = await fetchLogs(
      connection,
      pubkeyToFetch,
      "finalized",
      beforeTx,
      untilTx,
    );
    console.log("fetchLogs response length:", response?.transactionLogs.length);

    if (!response) {
      console.log("fetch logs response is null, ending transactions fetch");
      return records;
    }

    for (const log of response.transactionLogs) {
      const vaultsEvents = vaultsLogParser.parseEventsFromLogs(log);

      for (const vaultsEvent of vaultsEvents) {
        if (
          vaultsEvent.eventType !== "VaultDepositorRecord" &&
          vaultsEvent.eventType !== "VaultDepositorV1Record"
        ) {
          continue;
        }

        const isDepositOrWithdraw =
          ENUM_UTILS.match(vaultsEvent.action, VaultDepositorAction.DEPOSIT) ||
          ENUM_UTILS.match(vaultsEvent.action, VaultDepositorAction.WITHDRAW);

        if (isDepositOrWithdraw) {
          let driftEvents: ReturnType<
            typeof driftLogParser.parseEventsFromLogs
          > = [];

          try {
            driftEvents = driftLogParser.parseEventsFromLogs(log);
          } catch (err) {
            const rawLogs = log.logs;
            const isOracleStaleError = rawLogs.some((log) =>
              log.includes("Invalid Oracle: Stale"),
            );

            if (isOracleStaleError) {
              const recordWithPrices = await handleNoLoggedOraclePrice(
                vaultsEvent,
                // rawLogs
              );

              records.push(recordWithPrices);
              continue;
            }

            console.error(err);
          }

          const driftDepositEvent =
            driftEvents.find(
              (event) =>
                event.eventType === "DepositRecord" &&
                (event as DepositRecord).amount.eq(vaultsEvent.amount),
            ) ||
            driftEvents.find((event) => event.eventType === "DepositRecord"); // sometimes the deposit event is from the vault manager

          if (!driftDepositEvent) {
            // check if event is a non-vault manager deposit, if so, can use the amount from the VaultDepositorRecord event
            const isVaultManagerDeposit =
              vaultsEvent.depositorAuthority.toString() === vaultManager;
            if (isVaultManagerDeposit) {
              throw new Error(
                "Cannot find Drift 'DepositRecord' event for vault manager tx: " +
                  vaultsEvent.txSig,
              );
            }

            console.log(
              "no drift deposit event found for tx:",
              vaultsEvent.txSig,
              "using Pyth API to fetch oracle price and calculate notional value.",
            );
            const recordWithPrices =
              await handleNoLoggedOraclePrice(vaultsEvent);

            records.push(recordWithPrices);
            continue;
          }

          const recordWithPrices = reconcileVaultAndDriftEvents(
            vaultsEvent,
            driftDepositEvent as DepositRecord,
          );
          records.push(recordWithPrices);
        } else {
          // other actions like withdraw request, cancel withdraw request, fee payment, etc
          records.push({
            ...vaultsEvent,
            assetPrice: ZERO,
            notionalValue: ZERO,
          });
        }
      }
    }

    if (
      !response ||
      response.transactionLogs.length === 0 ||
      response.transactionLogs.length <
        MAX_TXNS_PER_REQUEST - MAX_TXNS_BUFFER || // sometimes the response is less than the max txns per request even though there are old txns, so we add a buffer
      response.earliestTx === response.mostRecentTx
    ) {
      console.log("fetch ended with num of records:", records.length);
      return records;
    } else {
      console.log("response continued with num of records:", records.length);
      return recursivelyGetTransactions(
        pubkeyToFetch,
        vaultManager,
        records,
        response.earliestTx,
      );
    }
  } catch (err) {
    console.error(err);

    return records;
  }
};

const validateRecords = (
  records: ReturnType<typeof serializeVaultDepositorRecord>[],
) => {
  let assetPriceZeros = 0;
  let notionalValueZeros = 0;

  records.forEach((record) => {
    if (record.action === "deposit" || record.action === "withdraw") {
      if (record.assetPrice === "0") {
        console.log("asset price is 0 for record: " + record.txSig);
        assetPriceZeros++;
      }

      if (record.notionalValue === "0") {
        console.log("notional value is 0 for record: " + record.txSig);
        notionalValueZeros++;
      }
    }
  });

  if (assetPriceZeros > 0 || notionalValueZeros > 0) {
    throw new Error(
      "asset price or notional value is 0 for some deposit/withdraw records",
    );
  }
};

const bulkInsertVaultDepositorRecords = async (
  records: Omit<SerializedVaultDepositorRecord, "id">[],
) => {
  const chunks = _.chunk(records, 1000);

  for (const chunk of chunks) {
    await db.insert(vault_depositor_records).values(chunk);
    console.log("inserted chunk of", chunk.length, "records");
  }
};

const backfillVaultDeposits = async (
  vaultPubKey: string,
  vaultManager: string,
  fullBackfill = false,
) => {
  console.log("\n\nbackfilling vault deposits for vault:", vaultPubKey);

  let latestTxSignature: string | undefined;

  if (!fullBackfill) {
    const latestTxSignatureResult = await db
      .select({
        txSig: vault_depositor_records.txSig,
        ts: vault_depositor_records.ts,
      })
      .from(vault_depositor_records)
      .where(eq(vault_depositor_records.vault, vaultPubKey.toString()))
      .orderBy(desc(vault_depositor_records.slot))
      .limit(1);
    const latestTxSignature = latestTxSignatureResult?.[0]?.txSig;
    const latestTs = latestTxSignatureResult?.[0]?.ts;
    console.log("latest tx signature:", latestTxSignature);
    console.log(
      "latest tx timestamp:",
      dayjs.unix(+latestTs).format("DD/MM/YYYY HH:mm:ss"),
    );
  }

  console.log("attempting to get all vault depositor records");
  const allVaultDepositorRecords = await recursivelyGetTransactions(
    new PublicKey(vaultPubKey),
    vaultManager,
    [],
    undefined,
    latestTxSignature,
  );

  if (!allVaultDepositorRecords || allVaultDepositorRecords.length === 0) {
    console.log("no records to insert. exiting script");
    return;
  }

  const serializedSortedVaultDepositorRecords = allVaultDepositorRecords.map(
    serializeVaultDepositorRecord,
  );

  let newRecords = serializedSortedVaultDepositorRecords;

  const allTxSigs = await db
    .select({ txSig: vault_depositor_records.txSig })
    .from(vault_depositor_records)
    .where(eq(vault_depositor_records.vault, vaultPubKey.toString()));

  // filter out records that already exist in the database
  newRecords = serializedSortedVaultDepositorRecords.filter(
    (record) => !allTxSigs.some((txSig) => txSig.txSig === record.txSig),
  );

  console.log("attempting db insert of", newRecords.length, "records");

  validateRecords(newRecords);

  await bulkInsertVaultDepositorRecords(newRecords);
  console.log("db insert complete");
};

/**
 * Backfills the vault deposit records in the database for a given vault.
 * It fetches the latest transactions signature and timestamp for the vault from the database,
 * retrieves all vault depositor records after the latest transaction from the blockchain,
 * before inserting these records into the database.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", {
      status: 401,
    });
  }

  const params = request.nextUrl.searchParams;
  const vaultsInput = params.get("vaults");
  const isFullBackfill = params.get("fullBackfill") === "true";
  const backfillableVaults = VAULTS;

  let vaults: { pubkey: string; vaultManager: string }[] = [];

  if (vaultsInput) {
    const vaultPubkeys = vaultsInput.split(",");
    const validVaultPubkeys = vaultPubkeys.filter((pubkey) =>
      backfillableVaults.find((v) => v.vaultPubkeyString === pubkey),
    );
    vaults = validVaultPubkeys.map((pubkey) => ({
      pubkey,
      vaultManager: backfillableVaults.find(
        (v) => v.vaultPubkeyString === pubkey,
      )!.managerPubkeyString,
    }));
  } else {
    vaults = backfillableVaults.map((vault) => ({
      pubkey: vault.vaultPubkeyString,
      vaultManager: vault.managerPubkeyString,
    }));
  }

  for (const vault of vaults) {
    await backfillVaultDeposits(
      vault.pubkey,
      vault.vaultManager.toString(),
      isFullBackfill,
    );
  }

  return new Response("ok", {
    status: 200,
  });
}
