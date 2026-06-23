"use client";

import { useEffect, useState } from "react";
import { GraphType, Period } from "./VaultGraphs";
import { PerformanceBreakdownStat } from "./PerformanceBreakdownStat";
import { VaultHistoryGraph } from "./VaultHistoryGraph";
import { UIMarket } from "@drift/common";
import { BigNum, PublicKey, QUOTE_PRECISION_EXP } from "@velocity-exchange/sdk";
import useAppStore from "@/stores/app/useAppStore";
import { getUiVaultConfig } from "@/lib/utils";
import { Typo } from "@velocity-exchange/react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const PerformanceBreakdownStats = (props: {
  vaultPubkey: string;
  marketSymbol: string;
}) => {
const vaultStats = useAppStore((s) => s.vaultsStats[props.vaultPubkey]);
  const isVaultStatsLoading = !vaultStats?.hasLoadedOnChainStats;
  const uiVaultConfig = getUiVaultConfig(props.vaultPubkey);
  const vaultClient = useAppStore((s) => s.vaultClient);

  const [totalPnl, setTotalPnl] = useState<BigNum | undefined>(undefined);

  useEffect(() => {
    if (vaultStats && uiVaultConfig && vaultClient) {
      if (uiVaultConfig.isNotionalGrowthStrategy) {
        vaultClient
          .getSubscribedVaultUser(new PublicKey(uiVaultConfig.userPubKeyString))
          .then((vaultUser) => {
            const vaultNetQuoteDeposits = vaultUser
              .getUserAccount()
              .totalDeposits.sub(vaultUser.getUserAccount().totalWithdraws);
            const currentNotionalPnl = vaultStats.tvlQuote.sub(
              BigNum.from(vaultNetQuoteDeposits, QUOTE_PRECISION_EXP),
            );

            setTotalPnl(currentNotionalPnl);
          });
      } else {
        setTotalPnl(vaultStats.totalBasePnl);
      }
    }
  }, [vaultStats, uiVaultConfig, vaultClient]);

  return (
    <div className="flex flex-col w-full gap-2 mt-4 sm:divide-x divide-container-border sm:flex-row sm:gap-0">
      <div className="flex flex-col flex-1 gap-2 sm:pr-4">
        <PerformanceBreakdownStat
          label="Total Earnings (All)"
          value={`${totalPnl?.prettyPrint(true)}`}
          loading={isVaultStatsLoading}
          marketSymbol={props.marketSymbol}
        />
        <PerformanceBreakdownStat
          label="Max Daily Drawdown"
          value={`${vaultStats?.maxDrawdownPct.toFixed(2)}%`}
          loading={isVaultStatsLoading}
        />
      </div>
      <div className="flex flex-col flex-1 gap-2 sm:pl-4">
        <PerformanceBreakdownStat
          label="30D Volume"
          value={`$${vaultStats?.volume30Days.toMillified()}`}
          loading={isVaultStatsLoading}
        />
      </div>
    </div>
  );
};

const GRAPH_OPTIONS: { label: string; value: GraphType }[] = [
  {
    label: "P&L",
    value: "pnl",
  },
  {
    label: "Share Price",
    value: "sharePrice",
  },
  {
    label: "Vault Balance",
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

export const VaultPerformanceBreakdown = (props: {
  vaultPubkey: string;
  depositAssetMarketIndex: number;
}) => {
  const [selectedGraph, setSelectedGraph] = useState(GRAPH_OPTIONS[0].value);
  const [selectedPeriod, setSelectedPeriod] = useState(PERIOD_OPTIONS[0].value);
  const uiVaultConfig = getUiVaultConfig(props.vaultPubkey);

  const marketSymbol = uiVaultConfig?.isNotionalGrowthStrategy
    ? "USDC"
    : UIMarket.createSpotMarket(props.depositAssetMarketIndex).market.symbol;

  return (
    <div className="flex flex-col w-screen p-4 -mx-4 sm:w-full sm:rounded sm:mx-0 bg-container-bg border-container-border border-y sm:border">
      <Typo.T3>Performance Breakdown</Typo.T3>
      <PerformanceBreakdownStats
        vaultPubkey={props.vaultPubkey}
        marketSymbol={marketSymbol}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 mt-5">
        <ToggleGroup
          type="single"
          className="bg-gray-300 rounded"
          value={selectedGraph}
          onValueChange={(value) => {
            if (value) setSelectedGraph(value as GraphType);
          }}
        >
          {GRAPH_OPTIONS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          type="single"
          className="bg-gray-300 rounded"
          value={selectedPeriod}
          onValueChange={(value) => {
            if (value) setSelectedPeriod(value as Period);
          }}
        >
          {PERIOD_OPTIONS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <VaultHistoryGraph
        vaultPubkey={props.vaultPubkey}
        depositAssetMarketIndex={props.depositAssetMarketIndex}
        graphType={selectedGraph}
        period={selectedPeriod}
      />
    </div>
  );
};
