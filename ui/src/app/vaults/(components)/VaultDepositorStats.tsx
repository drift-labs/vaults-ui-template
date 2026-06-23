import { VaultStatProps, VaultStatsSkeleton } from "./VaultStatsSkeleton";
import {
  getVaultDepositorBalance,
  getVaultDepositorNotionalNetDeposits,
} from "@/lib/vault";
import { BigNum, QUOTE_PRECISION_EXP, SpotMarketConfig } from "@velocity-exchange/sdk";
import { MarketId } from "@drift/common";
import { MarketIcon } from "@/components/MarketIcon";
import { useVaultDepositorHistory } from "@/hooks/useVaultDepositorHistory";
import {
  calcModifiedDietz,
  Vault,
  VaultDepositor,
} from "@velocity-exchange/vaults-sdk";
import { getUiVaultConfig } from "@/lib/utils";
import useAppStore from "@/stores/app/useAppStore";
import {
  Typo,
  useIsMobileScreenSize,
  useOraclePriceStore,
} from "@velocity-exchange/react";

export const VaultDepositorStats = (props: {
  depositAssetConfig: SpotMarketConfig;
  vaultPubkey: string;
  vaultAccountData: Vault;
  vaultDepositorAccountData: VaultDepositor;
  isVaultDepositorLoaded: boolean;
}) => {
  const getOraclePrice = useOraclePriceStore((s) => s.getMarketPriceData);
  const vaultStats = useAppStore((s) => s.vaultsStats[props.vaultPubkey]);
  const vaultTvlBase = vaultStats?.tvlBase;
  const marketId = MarketId.createSpotMarket(
    props.depositAssetConfig.marketIndex,
  );
  const uiVaultConfig = getUiVaultConfig(props.vaultPubkey);
  const { vaultDepositorHistory, isVaultDepositorHistoryLoading } =
    useVaultDepositorHistory(props.vaultPubkey);

  const isMobile = useIsMobileScreenSize();
  const {
    vaultAccountData,
    vaultDepositorAccountData,
    isVaultDepositorLoaded,
  } = props;

  const currentUserBaseBalance = getVaultDepositorBalance(
    vaultDepositorAccountData,
    vaultAccountData,
    vaultTvlBase,
    props.depositAssetConfig.precisionExp,
    true,
  );
  const currentUserNotionalBalance = getCurrentUserNotionalBalance();

  const totalBaseEarnings = getTotalBaseEarnings();
  const totalNotionalEarnings = getTotalNotionalEarnings();

  const roi = getTimeWeightedRoi();

  function getCurrentUserNotionalBalance() {
    const oraclePrice = getOraclePrice(marketId);
    const currentUserNotionalBalance = currentUserBaseBalance
      .mul(oraclePrice.rawPriceData.price)
      .shiftTo(QUOTE_PRECISION_EXP);

    return currentUserNotionalBalance;
  }

  function getTotalBaseEarnings() {
    if (!vaultDepositorAccountData || !vaultAccountData)
      return BigNum.from(0, props.depositAssetConfig.precisionExp);

    const totalEarnings = currentUserBaseBalance.sub(
      BigNum.from(
        vaultDepositorAccountData.netDeposits,
        props.depositAssetConfig.precisionExp,
      ),
    );

    return totalEarnings;
  }

  function getTotalNotionalEarnings() {
    const userNotionalNetDeposits = getVaultDepositorNotionalNetDeposits(
      vaultDepositorHistory,
    );

    const totalNotionalEarnings = currentUserNotionalBalance.sub(
      userNotionalNetDeposits,
    );

    return totalNotionalEarnings;
  }

  function getTimeWeightedRoi() {
    if (
      !vaultDepositorAccountData ||
      vaultDepositorAccountData.totalDeposits.eqn(0) ||
      !vaultAccountData
    )
      return 0;

    const formattedHistory = vaultDepositorHistory
      .filter((r) => r.action === "deposit" || r.action === "withdraw")
      .map((deposit) => {
        return {
          ts: deposit.ts,
          marketIndex: deposit.spotMarketIndex, // not needed
          amount: uiVaultConfig?.isNotionalGrowthStrategy
            ? deposit.notionalValue
            : deposit.amount,
          direction: deposit.action as "deposit" | "withdraw",
        };
      })
      .sort((a, b) => +b.ts - +a.ts); // need to sort in descending order

    if (uiVaultConfig?.isNotionalGrowthStrategy) {
      const { returns } = calcModifiedDietz(
        currentUserNotionalBalance,
        QUOTE_PRECISION_EXP,
        formattedHistory,
      );

      return returns * 100;
    } else {
      const { returns } = calcModifiedDietz(
        currentUserBaseBalance,
        props.depositAssetConfig.precisionExp,
        formattedHistory,
      );

      return returns * 100;
    }
  }

  const stats: VaultStatProps[] = [
    {
      label: "Current Balance",
      value: uiVaultConfig?.isNotionalGrowthStrategy
        ? currentUserNotionalBalance.prettyPrint()
        : currentUserBaseBalance.prettyPrint(),
      marketSymbol: uiVaultConfig?.isNotionalGrowthStrategy
        ? "USDC"
        : props.depositAssetConfig.symbol,
      loading:
        !isVaultDepositorLoaded ||
        (uiVaultConfig?.isNotionalGrowthStrategy &&
          isVaultDepositorHistoryLoading),
      subValue: uiVaultConfig?.isNotionalGrowthStrategy ? (
        <Typo.B4 className="flex items-center gap-1 text-text-secondary">
          <MarketIcon
            marketSymbol={props.depositAssetConfig.symbol}
            className="w-4 h-4"
          />
          <span>{currentUserBaseBalance.prettyPrint()}</span>
        </Typo.B4>
      ) : undefined,
    },
    {
      label: "Total Earnings (All Time)",
      value: uiVaultConfig?.isNotionalGrowthStrategy
        ? totalNotionalEarnings.prettyPrint()
        : totalBaseEarnings.prettyPrint(),
      marketSymbol: uiVaultConfig?.isNotionalGrowthStrategy
        ? "USDC"
        : props.depositAssetConfig.symbol,
      loading: !isVaultDepositorLoaded,
      subValue: uiVaultConfig?.isNotionalGrowthStrategy ? (
        <Typo.B4 className="flex items-center gap-1 text-text-secondary">
          <MarketIcon
            marketSymbol={props.depositAssetConfig.symbol}
            className="w-4 h-4"
          />
          <span>{totalBaseEarnings.prettyPrint()}</span>
        </Typo.B4>
      ) : undefined,
    },
    {
      label: "ROI",
      value: `${roi.toFixed(2)}%`,
      loading: !isVaultDepositorLoaded,
    },
  ];

  if (isMobile) {
    // swap index 1 and 2 for stats; for UI-vanity purposes
    const temp = stats[1];
    stats[1] = stats[2];
    stats[2] = temp;
  }

  return <VaultStatsSkeleton stats={stats} />;
};
