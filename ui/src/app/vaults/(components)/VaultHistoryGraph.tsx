import dayjs from "dayjs";
import {
  ResponsiveContainer,
  AreaChart,
  CartesianGrid,
  Area,
  XAxis,
  YAxis,
  TooltipProps,
  Tooltip as ChartsTooltip,
} from "recharts";
import { getAreaStops } from "@/lib/graph";
import {
  BigNum,
  PublicKey,
  QUOTE_PRECISION_EXP,
  SpotMarketConfig,
  ZERO,
} from "@velocity-exchange/sdk";
import { UIMarket } from "@drift/common";
import {
  GraphType,
  Period,
  getYDomain,
  VaultHistoryGraphTooltip,
  VaultGraphMarketLegend,
} from "./VaultGraphs";
import { useVaultSnapshotHistory } from "@/hooks/useVaultSnapshotHistory";
import { useEffect, useState } from "react";
import { VAULT_SHARES_PRECISION_EXP } from "@velocity-exchange/vaults-sdk";
import { SPOT_MARKETS_LOOKUP } from "@/constants/environment";
import { getUiVaultConfig } from "@/lib/utils";
import useAppStore from "@/stores/app/useAppStore";

const CUSTOM_LINE_COLORS_ID = "custom-line-colors_vault-graph";
const CUSTOM_AREA_COLORS_ID = "custom-area-colors_vault-graph";

export const VaultHistoryGraph = (props: {
  vaultPubkey: string;
  depositAssetMarketIndex: number;
  graphType: GraphType;
  period: Period;
}) => {
  const uiMarket = UIMarket.createSpotMarket(props.depositAssetMarketIndex);
  const uiVaultConfig = getUiVaultConfig(props.vaultPubkey);
  const precisionExp = (uiMarket.market as SpotMarketConfig).precisionExp;
  const dataKey =
    props.graphType === "pnl"
      ? "pnl"
      : props.graphType === "balance"
        ? "baseBalance"
        : "sharePrice";
  const isUsdcAsset =
    props.depositAssetMarketIndex === 0 ||
    (props.graphType === "pnl" && uiVaultConfig?.isNotionalGrowthStrategy);

  const { vaultSnapshots, isVaultSnapshotsLoading } = useVaultSnapshotHistory(
    props.vaultPubkey,
  );
  const vaultStat = useAppStore((s) => s.vaultsStats[props.vaultPubkey]);
  const vaultClient = useAppStore((s) => s.vaultClient);

  const [displayedData, setDisplayedData] = useState<
    { ts: number; pnl: number; baseBalance: number; sharePrice: number }[]
  >([]);

  useEffect(() => {
    getAndSetDisplayedData().then((data) => {
      setDisplayedData(data);
    });
  }, [vaultSnapshots, precisionExp, props.period, vaultStat, vaultClient]);

  const isLoading = isVaultSnapshotsLoading || !displayedData.length;

  const minX = displayedData.reduce(
    (acc, curr) => Math.min(acc, curr.ts),
    Infinity,
  );
  const maxX = displayedData.reduce(
    (acc, curr) => Math.max(acc, curr.ts),
    -Infinity,
  );
  const xDomain = [minX, maxX];

  const minY = displayedData.reduce(
    (acc, curr) => Math.min(acc, curr[dataKey]),
    Infinity,
  );
  const maxY = displayedData.reduce(
    (acc, curr) => Math.max(acc, curr[dataKey]),
    -Infinity,
  );
  const yDomain = getYDomain(minY, maxY);

  async function getAndSetDisplayedData() {
    if (!vaultSnapshots || !uiVaultConfig || !vaultStat || !vaultClient)
      return [];

    const cutoffDays =
      props.period === "7d"
        ? 7
        : props.period === "30d"
          ? 30
          : props.period === "90d"
            ? 90
            : 0;
    const cutoffDate = dayjs().subtract(cutoffDays, "day").subtract(1, "day"); // subtract 1 day to include starting point of APY calculation (e.g. 7d period should include from previous Sunday to current Sunday)
    const periodData = vaultSnapshots.filter((snapshot) => {
      return dayjs.unix(+snapshot.ts).isAfter(cutoffDate);
    });

    const periodSnapshots = periodData.map((snapshot) => {
      const basePnl = BigNum.from(
        snapshot.totalAccountBaseValue,
        precisionExp,
      ).sub(BigNum.from(snapshot.netDeposits, precisionExp));

      const netQuoteDeposits = BigNum.from(
        snapshot.netQuoteDeposits ?? ZERO,
        QUOTE_PRECISION_EXP,
      );
      const quoteTvl = BigNum.from(
        snapshot.totalAccountQuoteValue,
        QUOTE_PRECISION_EXP,
      );
      const notionalPnl = quoteTvl.sub(netQuoteDeposits);

      const pnl = uiVaultConfig.isNotionalGrowthStrategy
        ? notionalPnl
        : basePnl;

      const sharePrice = BigNum.from(
        snapshot.totalAccountBaseValue,
        precisionExp,
      )
        .shift(VAULT_SHARES_PRECISION_EXP)
        .div(BigNum.from(snapshot.totalShares, VAULT_SHARES_PRECISION_EXP))
        .toNum();

      return {
        ts: +snapshot.ts,
        pnl: pnl.toNum(),
        baseBalance: BigNum.from(
          snapshot.totalAccountBaseValue,
          precisionExp,
        ).toNum(),
        sharePrice,
      };
    });

    // add current live data point to graph
    if (vaultStat) {
      const vaultUser = await vaultClient.getSubscribedVaultUser(
        new PublicKey(uiVaultConfig.userPubKeyString),
      );
      const vaultNetQuoteDeposits = vaultUser
        .getUserAccount()
        .totalDeposits.sub(vaultUser.getUserAccount().totalWithdraws);
      const currentNotionalPnl = vaultStat.tvlQuote.sub(
        BigNum.from(vaultNetQuoteDeposits, QUOTE_PRECISION_EXP),
      );

      const pnl = uiVaultConfig.isNotionalGrowthStrategy
        ? currentNotionalPnl
        : vaultStat.totalBasePnl;

      if (vaultStat.totalShares.eq(ZERO)) {
        return periodSnapshots;
      }

      const sharePrice = vaultStat.tvlBase
        .shift(VAULT_SHARES_PRECISION_EXP)
        .div(vaultStat.totalShares)
        .toNum();

      const currentDataPoint = {
        ts: dayjs().unix(),
        pnl: pnl.toNum(),
        baseBalance: vaultStat.tvlBase.toNum(),
        sharePrice,
      };

      if (
        dayjs.unix(periodSnapshots.slice(-1)[0]?.ts).date() !== dayjs().date()
      ) {
        periodSnapshots.push(currentDataPoint);
      } else {
        // replace the last data point with the current data point if they are on the same day
        periodSnapshots[periodSnapshots.length - 1] = currentDataPoint;
      }
    }

    return periodSnapshots;
  }

  if (isLoading) return null;

  return (
    <div className="w-full h-full min-h-[266px] mt-4 flex flex-col gap-2">
      <ResponsiveContainer width={"100%"} className="flex-grow h-20">
        <AreaChart data={displayedData}>
          <CartesianGrid stroke={"var(--stroke-secondary)"} />

          <defs>
            <linearGradient
              id={CUSTOM_LINE_COLORS_ID}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              {getAreaStops(minY, maxY)}
            </linearGradient>
          </defs>
          <defs>
            <linearGradient
              id={CUSTOM_AREA_COLORS_ID}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              {getAreaStops(minY, maxY, {
                startOpacity: 0.6,
                endOpacity: 0.2,
              })}
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            fill={`url(#${CUSTOM_AREA_COLORS_ID})`}
            stroke={`url(#${CUSTOM_LINE_COLORS_ID})`}
            strokeWidth={2}
            dataKey={dataKey}
          />

          <XAxis
            tickCount={40}
            tickMargin={8}
            dataKey="ts"
            domain={xDomain}
            tickFormatter={(tick) => {
              return dayjs.unix(tick).format("DD/MM");
            }}
            stroke={"var(--container-border)"}
          />
          <YAxis
            tickMargin={8}
            stroke={"var(--container-border)"}
            dataKey={dataKey}
            // @ts-ignore
            domain={yDomain}
            tickFormatter={(tick: number) =>
              `${tick < 0 ? "-" : ""}${isUsdcAsset ? "$" : ""}${BigNum.from(
                tick,
              )
                .abs()
                .toMillified()}`
            }
          />

          <ChartsTooltip
            content={(tooltipProps: TooltipProps<number, string>) => (
              <VaultHistoryGraphTooltip
                {...tooltipProps}
                marketConfig={
                  props.graphType === "pnl" &&
                  uiVaultConfig?.isNotionalGrowthStrategy
                    ? SPOT_MARKETS_LOOKUP[0]
                    : (uiMarket.market as SpotMarketConfig)
                }
                isPnl={props.graphType === "pnl"}
              />
            )}
            cursor={{
              strokeDasharray: "4",
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
      <VaultGraphMarketLegend
        marketSymbol={
          uiVaultConfig?.isNotionalGrowthStrategy && props.graphType === "pnl"
            ? "USDC"
            : uiMarket.market.symbol
        }
      />
    </div>
  );
};
