"use client";

import {
  Vault,
  VAULT_SHARES_PRECISION_EXP,
  VaultClient,
} from "@drift-labs/vaults-sdk";
import { MarketId, UIMarket } from "@drift/common";
import {
  BigNum,
  BN,
  DriftClient,
  getUserAccountPublicKey,
  getUserStatsAccountPublicKey,
  PRICE_PRECISION_EXP,
  PublicKey,
  QUOTE_PRECISION_EXP,
  SpotMarketConfig,
  UserAccount,
  UserStatsAccount,
  ZERO,
} from "@drift-labs/sdk";
import { ApyReturnsLookup, VaultStats } from "@/types/vaults";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_OFF_CHAIN_STATS, DEFAULT_PERIOD_APY } from "@/constants/misc";
import { Connection } from "@solana/web3.js";
import { getVaultsApyReturns } from "@/server-actions/vaults";
import { getUiVaultConfig } from "@/lib/utils";
import {
  OraclePriceInfo,
  useCommonDriftStore,
  useDriftClientIsReady,
  useOraclePriceStore,
} from "@drift-labs/react";
import { VAULTS } from "@/constants/vaults";
import useAppStore, { AppStoreState } from "@/stores/app/useAppStore";

const fetchUserStats = async (
  driftClient: DriftClient,
  vaultPubkey: PublicKey,
) => {
  const userStatsPubkey = getUserStatsAccountPublicKey(
    driftClient.program.programId,
    vaultPubkey,
  );
  const userStats =
    await driftClient.program.account.userStats.fetch(userStatsPubkey);

  return userStats as UserStatsAccount;
};

const fetchDriftUserAccount = async (
  driftClient: DriftClient,
  vaultDriftUserPubkey: PublicKey,
) => {
  const driftUserAccount =
    await driftClient.program.account.user.fetch(vaultDriftUserPubkey);

  return driftUserAccount as UserAccount;
};

export type VaultsOnChainDataLookup = Record<
  string,
  {
    vaultAccountData: Vault;
    userStatsData: UserStatsAccount;
    vaultQuoteTvl: BN;
    vaultDriftUser: UserAccount;
  }
>;

const vaultDataDecoder = (
  buffer: Buffer,
  vaultProgram: VaultClient["program"],
): Vault => {
  const account = vaultProgram.account.vault.coder.accounts.decode(
    "vault",
    buffer,
  );
  return account;
};

const userStatsDataDecoder = (
  buffer: Buffer,
  driftProgram: DriftClient["program"],
): UserStatsAccount => {
  const account = driftProgram.account.userStats.coder.accounts.decodeUnchecked(
    "UserStats",
    buffer,
  );
  return account;
};

const userAccountDataDecoder = (
  buffer: Buffer,
  driftProgram: DriftClient["program"],
): UserAccount => {
  const account = driftProgram.account.user.coder.accounts.decodeUnchecked(
    "User",
    buffer,
  );
  return account;
};

// this method of processing is used to reduce the number of individual RPC calls needed to
// be made to get a vault's on-chain data, by combining most accounts into one `getMultipleAccountsInfo` RPC call
export const getMultipleOnChainVaultData = async (
  driftClient: DriftClient,
  vaultClient: VaultClient,
  connection: Connection,
  vaultPubKeys: PublicKey[],
): Promise<VaultsOnChainDataLookup> => {
  // create pairs of vault public keys and its user stats account
  const pubKeysToFetch = vaultPubKeys
    .map((vaultPubKey) => [
      vaultPubKey,
      getUserStatsAccountPublicKey(driftClient.program.programId, vaultPubKey),
      new PublicKey(getUiVaultConfig(vaultPubKey.toString())!.userPubKeyString),
    ])
    .flat();

  const response = await connection.getMultipleAccountsInfo(pubKeysToFetch);

  const vaultsOnChainDataLookup: VaultsOnChainDataLookup = {};

  // process each pair of data
  for (let i = 0; i < vaultPubKeys.length; i++) {
    const responseIndex = i * 3;
    const vaultAccountBuffer = response[responseIndex]!.data;
    const userStatsBuffer = response[responseIndex + 1]!.data;
    const driftUserAccountBuffer = response[responseIndex + 2]!.data;

    const vaultAccountData = vaultDataDecoder(
      vaultAccountBuffer,
      vaultClient.program,
    );
    const userStatsData = userStatsDataDecoder(
      userStatsBuffer,
      driftClient.program,
    );
    const driftUserAccountData: UserAccount = userAccountDataDecoder(
      driftUserAccountBuffer,
      driftClient.program,
    );

    const vaultPubKeyString = vaultPubKeys[i].toString();
    vaultsOnChainDataLookup[vaultPubKeyString] = {
      vaultAccountData,
      userStatsData,
      vaultQuoteTvl: ZERO,
      vaultDriftUser: driftUserAccountData,
    };
  }

  const vaultQuoteTvlPromises = vaultPubKeys.map((vaultPubKey) => {
    return vaultClient.calculateVaultEquity({
      vault: vaultsOnChainDataLookup[vaultPubKey.toString()].vaultAccountData,
    });
  });
  const vaultsQuoteTvl = await Promise.all(vaultQuoteTvlPromises);

  vaultsQuoteTvl.forEach((vaultQuoteTvl, index) => {
    vaultsOnChainDataLookup[vaultPubKeys[index].toString()].vaultQuoteTvl =
      vaultQuoteTvl;
  });

  return vaultsOnChainDataLookup;
};

export function constructVaultStats(
  vaultPubKey: string,
  vaultOnChainData: VaultsOnChainDataLookup[string],
  apyReturnStat: ApyReturnsLookup[string] | undefined,
  oraclePriceGetter: (marketId: MarketId) => OraclePriceInfo,
): VaultStats {
  const uiVaultConfig = getUiVaultConfig(vaultPubKey);

  let vaultMarketIndex: number;

  if (uiVaultConfig) {
    vaultMarketIndex = uiVaultConfig.market.marketIndex;
  } else {
    vaultMarketIndex = 0;
  }

  const uiMarket = UIMarket.createSpotMarket(vaultMarketIndex);
  const marketConfig = uiMarket.market as SpotMarketConfig;
  const oraclePriceBigNum = BigNum.from(
    oraclePriceGetter(uiMarket.marketId)?.rawPriceData.price ?? ZERO,
    PRICE_PRECISION_EXP,
  );

  const offChainStats = apyReturnStat
    ? { ...apyReturnStat, hasLoadedOffChainStats: true }
    : DEFAULT_OFF_CHAIN_STATS;

  if (oraclePriceBigNum.eqZero()) {
    return {
      hasLoadedOnChainStats: false,
      totalBasePnl: BigNum.from(ZERO, marketConfig.precisionExp),
      totalQuotePnl: BigNum.from(ZERO, QUOTE_PRECISION_EXP),
      tvlBase: BigNum.from(ZERO, marketConfig.precisionExp),
      tvlQuote: BigNum.from(ZERO, QUOTE_PRECISION_EXP),
      capacityPct: 0,
      volume30Days: BigNum.from(ZERO, QUOTE_PRECISION_EXP),
      isUncappedCapacity: false,
      totalShares: BigNum.from(ZERO, VAULT_SHARES_PRECISION_EXP),
      vaultRedeemPeriodSecs: ZERO,
      notionalGrowthQuotePnl: BigNum.from(ZERO, QUOTE_PRECISION_EXP),
      profitShare: 0,
      ...offChainStats,
    };
  }

  const vaultAccountData = vaultOnChainData.vaultAccountData;
  const userStats = vaultOnChainData.userStatsData;

  const vaultQuoteTvl = BigNum.from(
    vaultOnChainData.vaultQuoteTvl,
    QUOTE_PRECISION_EXP,
  );
  const vaultBaseTvl = vaultQuoteTvl
    .shift(marketConfig.precisionExp)
    .div(oraclePriceBigNum);
  const totalBasePnl = vaultBaseTvl.sub(
    BigNum.from(vaultAccountData.netDeposits, marketConfig.precisionExp),
  );
  const totalQuotePnl = totalBasePnl
    .mul(oraclePriceBigNum)
    .shiftTo(QUOTE_PRECISION_EXP);
  const capacityPct = vaultAccountData.maxTokens.eqn(0) // uncapped capacity
    ? "0"
    : vaultBaseTvl.toPercentage(
        BigNum.from(vaultAccountData.maxTokens, marketConfig.precisionExp),
        marketConfig.precisionExp.toNumber(),
      );

  const volume30Days = BigNum.from(
    userStats.makerVolume30D.add(userStats.takerVolume30D),
    QUOTE_PRECISION_EXP,
  );

  const vaultDriftUserQuoteNetDeposits = BigNum.from(
    vaultOnChainData.vaultDriftUser.totalDeposits.sub(
      vaultOnChainData.vaultDriftUser.totalWithdraws,
    ),
    QUOTE_PRECISION_EXP,
  );
  const notionalGrowthQuotePnl = vaultQuoteTvl.sub(
    vaultDriftUserQuoteNetDeposits,
  );

  return {
    hasLoadedOnChainStats: true,
    totalBasePnl,
    totalQuotePnl,
    tvlBase: vaultBaseTvl,
    tvlQuote: vaultQuoteTvl,
    capacityPct: Math.min(+capacityPct, 100),
    isUncappedCapacity: vaultAccountData.maxTokens.eqn(0),
    volume30Days,
    totalShares: BigNum.from(
      vaultAccountData.totalShares,
      VAULT_SHARES_PRECISION_EXP,
    ),
    vaultRedeemPeriodSecs: vaultAccountData.redeemPeriod,
    notionalGrowthQuotePnl,
    profitShare: vaultAccountData.profitShare,
    ...offChainStats,
  };
}

/**
 * Fetches the on-chain vault stats.
 */
export const getSingleVaultStats = async (
  driftClient: DriftClient,
  vaultClient: VaultClient,
  vaultPubkey: PublicKey,
  apyReturnStat: ApyReturnsLookup[string],
  oraclePriceGetter: (marketId: MarketId) => OraclePriceInfo,
): Promise<VaultStats> => {
  const uiVaultConfig = getUiVaultConfig(vaultPubkey.toString());

  let vaultUserPubkey: PublicKey;

  if (uiVaultConfig) {
    vaultUserPubkey = new PublicKey(uiVaultConfig.userPubKeyString);
  } else {
    vaultUserPubkey = await getUserAccountPublicKey(
      driftClient.program.programId,
      vaultPubkey,
      0,
    );
  }

  const [vaultAccountData, vaultQuoteTvlBN, userStats, vaultDriftUserAccount] =
    await Promise.all([
      vaultClient.getVault(vaultPubkey),
      vaultClient.calculateVaultEquity({
        address: vaultPubkey,
      }),
      fetchUserStats(driftClient, vaultPubkey),
      fetchDriftUserAccount(driftClient, vaultUserPubkey),
    ]);

  const vaultStats = constructVaultStats(
    vaultPubkey.toString(),
    {
      vaultAccountData,
      userStatsData: userStats,
      vaultQuoteTvl: vaultQuoteTvlBN,
      vaultDriftUser: vaultDriftUserAccount,
    },
    apyReturnStat,
    oraclePriceGetter,
  );

  return vaultStats;
};

const DEFAULT_VAULTS_STATS: ApyReturnsLookup = {};

// if undefined, use the actual apy value
const APY_CLAMP = {
  min: 0,
  max: undefined,
};

/**
 * Fetches the apy and returns of all vaults.
 */
export const useVaultsApyReturnsLookup = () => {
  const [data, setData] = useState<ApyReturnsLookup>(DEFAULT_VAULTS_STATS);

  useEffect(() => {
    getVaultsApyReturns().then((res) => {
      for (const vault of Object.keys(res)) {
        res[vault].apys[DEFAULT_PERIOD_APY] = Math.min(
          Math.max(
            res[vault].apys[DEFAULT_PERIOD_APY],
            APY_CLAMP.min ?? res[vault].apys[DEFAULT_PERIOD_APY],
          ),
          APY_CLAMP.max ?? res[vault].apys[DEFAULT_PERIOD_APY],
        );
      }

      setData(res);
    });
  }, []);

  return data;
};

/**
 * Syncs the stats for vaults that uses the Drift Vault program (a.k.a native vaults).
 */
export const useSyncAllVaultsStats = () => {
  const offChainVaultsStats = useVaultsApyReturnsLookup();
  const isLoadingOffChainVaultsStats =
    Object.keys(offChainVaultsStats).length === 0;
  const vaultClient = useAppStore((s) => s.vaultClient);
  const driftClient = useCommonDriftStore((s) => s.driftClient.client);
  const driftClientIsReady = useDriftClientIsReady();
  const connection = useCommonDriftStore((s) => s.connection);
  const getOraclePriceForMarket = useOraclePriceStore(
    (s) => s.getMarketPriceData,
  );
  const setVaultsStore = useAppStore((s) => s.set);

  const [isVaultStatsLoaded, setIsVaultStatsLoaded] = useState(false);

  const [vaultsOnChainDataLookup, setVaultsOnChainDataLookup] =
    useState<VaultsOnChainDataLookup | null>(null);

  const vaultsToFetch = useMemo(
    () => VAULTS.map((vault) => new PublicKey(vault.vaultPubkeyString)),
    [],
  );

  const hasLoadedNativeVaultsStats =
    !isLoadingOffChainVaultsStats &&
    vaultsOnChainDataLookup &&
    isVaultStatsLoaded;

  useEffect(() => {
    if (driftClient && driftClientIsReady && vaultClient && connection) {
      getMultipleOnChainVaultData(
        driftClient,
        vaultClient,
        connection,
        vaultsToFetch,
      ).then((lookup) => {
        setVaultsOnChainDataLookup(lookup);
      });
    }
  }, [driftClient, vaultClient, connection, vaultsToFetch]);

  /**
   * Syncs the vaults' stats in vaults store. Mainly updates in terms of oracle price (through `getOraclePriceForMarket`)
   */
  useEffect(() => {
    if (offChainVaultsStats && vaultsOnChainDataLookup) {
      const vaultStatsLookup: AppStoreState["vaultsStats"] = {};

      vaultsToFetch.forEach((vaultPubKey) => {
        const vaultPubKeyString = vaultPubKey.toString();
        const onChainData = vaultsOnChainDataLookup[vaultPubKeyString];
        const offChainData = offChainVaultsStats[vaultPubKeyString];

        if (onChainData && offChainData) {
          const vaultStat = constructVaultStats(
            vaultPubKeyString,
            vaultsOnChainDataLookup[vaultPubKeyString],
            offChainVaultsStats[vaultPubKeyString],
            getOraclePriceForMarket,
          );

          vaultStatsLookup[vaultPubKeyString] = vaultStat;
        }
      });

      if (Object.keys(vaultStatsLookup).length > 0) {
        setVaultsStore((s) => {
          s.vaultsStats = {
            ...s.vaultsStats,
            ...vaultStatsLookup,
          };
        });
        setIsVaultStatsLoaded(true);
      }
    }
  }, [
    offChainVaultsStats,
    vaultsOnChainDataLookup,
    getOraclePriceForMarket,
    vaultsToFetch,
  ]);

  return hasLoadedNativeVaultsStats;
};
