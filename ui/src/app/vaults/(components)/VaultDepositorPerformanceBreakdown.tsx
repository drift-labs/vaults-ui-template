import {
  BigNum,
  BN,
  PERCENTAGE_PRECISION,
  PERCENTAGE_PRECISION_EXP,
  SpotMarketConfig,
} from "@velocity-exchange/sdk";
import { PerformanceBreakdownStat } from "./PerformanceBreakdownStat";
import { GraphType, Period } from "./VaultGraphs";
import { Typo, useCommonDriftStore } from "@velocity-exchange/react";
import { useState } from "react";
import { VaultDepositorHistoryGraph } from "./VaultDepositorHistoryGraph";
import { useVaultSnapshotHistory } from "@/hooks/useVaultSnapshotHistory";
import { useVaultDepositorHistory } from "@/hooks/useVaultDepositorHistory";
import useAppStore from "@/stores/app/useAppStore";
import { ToggleGroupItem } from "@/components/ui/toggle-group";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { getMaxDailyDrawdownFromHistory, getUiVaultConfig } from "@/lib/utils";
import { Vault, VaultDepositor } from "@velocity-exchange/vaults-sdk";

const HUNDRED = new BN(100);

const UserPerformanceBreakdownStats = (props: {
  depositAssetConfig: SpotMarketConfig;
  vaultPubkey: string;
  vaultAccountData: Vault;
  vaultDepositorAccountData: VaultDepositor;
  isVaultDepositorLoaded: boolean;
}) => {
  const vaultStats = useAppStore((s) => s.vaultsStats[props.vaultPubkey]);
  const { vaultSnapshots, isVaultSnapshotsLoading } = useVaultSnapshotHistory(
    props.vaultPubkey,
  );
  const uiVaultConfig = getUiVaultConfig(props.vaultPubkey);
  const { vaultDepositorHistory, isVaultDepositorHistoryLoading } =
    useVaultDepositorHistory(props.vaultPubkey);
  const {
    vaultAccountData,
    isVaultDepositorLoaded,
    vaultDepositorAccountData,
  } = props;

  const isLoading =
    !vaultAccountData ||
    !isVaultDepositorLoaded ||
    !vaultStats?.hasLoadedOnChainStats;
  const isMaxDailyDrawdownLoading =
    isVaultSnapshotsLoading || isVaultDepositorHistoryLoading;

  const precisionExp = props.depositAssetConfig.precisionExp;
  const marketSymbol = props.depositAssetConfig.symbol;

  const cumulativeNetDeposits = BigNum.from(
    vaultDepositorAccountData?.netDeposits ?? 0,
    precisionExp,
  );
  const userVaultSharesPct = getUserVaultSharesPct();
  const feesPaid = BigNum.from(
    vaultDepositorAccountData?.profitShareFeePaid ?? 0,
    precisionExp,
  );
  const highWaterMark = BigNum.from(
    vaultDepositorAccountData?.cumulativeProfitShareAmount ?? 0,
    precisionExp,
  );
  const highWaterMarkWithCurrentDeposit = highWaterMark
    .add(
      BigNum.from(vaultDepositorAccountData?.totalDeposits ?? 0, precisionExp),
    )
    .sub(
      BigNum.from(vaultDepositorAccountData?.totalWithdraws ?? 0, precisionExp),
    );
  const maxDailyDrawdownPct = getMaxDailyDrawdownPct();

  function getUserVaultSharesPct() {
    if (!vaultDepositorAccountData || !vaultAccountData)
      return BigNum.from(0, PERCENTAGE_PRECISION_EXP);

    const userShares = vaultDepositorAccountData.vaultShares;
    const vaultShares = vaultAccountData.totalShares;

    if (vaultShares.eqn(0)) {
      return BigNum.from(0, PERCENTAGE_PRECISION_EXP);
    }

    const userVaultSharesPct = userShares
      .mul(PERCENTAGE_PRECISION)
      .div(vaultShares);

    return BigNum.from(userVaultSharesPct, PERCENTAGE_PRECISION_EXP).mul(
      HUNDRED,
    );
  }

  function getMaxDailyDrawdownPct() {
    if (
      !vaultDepositorAccountData ||
      !vaultAccountData ||
      !vaultSnapshots.length ||
      !vaultDepositorHistory.length
    )
      return 0;

    const firstDepositorTxn = vaultDepositorHistory[0];
    const relevantVaultSnapshots = vaultSnapshots
      .filter((snapshot) => +snapshot.ts >= +firstDepositorTxn.ts)
      .sort((a, b) => +a.ts - +b.ts);

    const maxDailyDrawdown = getMaxDailyDrawdownFromHistory(
      relevantVaultSnapshots,
      uiVaultConfig?.isNotionalGrowthStrategy
        ? "totalAccountQuoteValue"
        : "totalAccountBaseValue",
    );

    return maxDailyDrawdown * 100;
  }

  return (
    <div className="flex flex-col w-full gap-2 mt-4 sm:divide-x divide-container-border sm:flex-row sm:gap-0">
      <div className="flex flex-col flex-1 gap-2 sm:pr-4">
        <PerformanceBreakdownStat
          label="Your Cumulative Net Deposits"
          value={`${cumulativeNetDeposits.prettyPrint()}`}
          marketSymbol={marketSymbol}
          loading={isLoading}
        />
        <PerformanceBreakdownStat
          label="Vault Shares"
          value={`${userVaultSharesPct.prettyPrint()}%`}
          loading={isLoading}
        />
        <PerformanceBreakdownStat
          label="Max Daily Drawdown"
          value={`${maxDailyDrawdownPct.toFixed(2)}%`}
          loading={isMaxDailyDrawdownLoading}
        />
      </div>
      <div className="flex flex-col flex-1 gap-2 sm:pl-4">
        <PerformanceBreakdownStat
          label="Fees Paid"
          value={`${feesPaid.prettyPrint()}`}
          marketSymbol={marketSymbol}
          loading={isLoading}
        />
        <PerformanceBreakdownStat
          label="High-Water Mark"
          value={`${highWaterMarkWithCurrentDeposit.prettyPrint()}`}
          marketSymbol={marketSymbol}
          loading={isLoading}
        />
      </div>
    </div>
  );
};

const GRAPH_OPTIONS: { label: string; value: GraphType }[] = [
  {
    label: "Earnings",
    value: "pnl",
  },
  {
    label: "Balance",
    value: "balance",
  },
];

const PERIOD_OPTIONS: { label: string; value: Period }[] = [
  {
    label: "7D",
    value: "7d",
  },
  {
    label: "30D",
    value: "30d",
  },
  {
    label: "90D",
    value: "90d",
  },
];

export const VaultDepositorPerformanceBreakdown = (props: {
  depositAssetConfig: SpotMarketConfig;
  vaultPubkey: string;
  vaultAccountData: Vault;
  vaultDepositorAccountData: VaultDepositor;
  isVaultDepositorLoaded: boolean;
}) => {
  const authority = useCommonDriftStore((s) => s.authority);
  const { isVaultDepositorLoaded, vaultDepositorAccountData } = props;

  const [selectedGraph, setSelectedGraph] = useState(GRAPH_OPTIONS[0].value);
  const [selectedPeriod, setSelectedPeriod] = useState(PERIOD_OPTIONS[0].value);

  const isNotVaultDepositor =
    !authority ||
    (isVaultDepositorLoaded &&
      (!vaultDepositorAccountData ||
        vaultDepositorAccountData.netDeposits.eqn(0)));

  return (
    <div className="flex flex-col w-screen p-4 -mx-4 border sm:rounded sm:w-full sm:mx-0 bg-container-bg border-container-border sm:border">
      <Typo.T3>Performance Breakdown</Typo.T3>
      <UserPerformanceBreakdownStats
        depositAssetConfig={props.depositAssetConfig}
        vaultPubkey={props.vaultPubkey}
        vaultAccountData={props.vaultAccountData}
        vaultDepositorAccountData={props.vaultDepositorAccountData}
        isVaultDepositorLoaded={props.isVaultDepositorLoaded}
      />

      {!isNotVaultDepositor && (
        <>
          <div className="flex items-center justify-between mt-5">
            <ToggleGroup
              type="single"
              value={selectedGraph}
              onValueChange={(value) => setSelectedGraph(value as GraphType)}
            >
              {GRAPH_OPTIONS.map((option) => (
                <ToggleGroupItem key={option.value} value={option.value}>
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <ToggleGroup
              type="single"
              value={selectedPeriod}
              onValueChange={(value) => setSelectedPeriod(value as Period)}
            >
              {PERIOD_OPTIONS.map((option) => (
                <ToggleGroupItem key={option.value} value={option.value}>
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <VaultDepositorHistoryGraph
            vaultPubkey={props.vaultPubkey}
            depositAssetConfig={props.depositAssetConfig}
            graphType={selectedGraph}
            period={selectedPeriod}
            vaultAccountData={props.vaultAccountData}
            vaultDepositorAccountData={props.vaultDepositorAccountData}
            isVaultDepositorLoaded={props.isVaultDepositorLoaded}
          />
        </>
      )}
    </div>
  );
};
