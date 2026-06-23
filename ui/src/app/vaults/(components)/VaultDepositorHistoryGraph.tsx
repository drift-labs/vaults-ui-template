import dayjs from "dayjs";
import {
  ResponsiveContainer,
  AreaChart,
  CartesianGrid,
  TooltipProps,
  Area,
  XAxis,
  YAxis,
  Tooltip as ChartsTooltip,
} from "recharts";
import { getAreaStops } from "@/lib/graph";
import {
  BigNum,
  BN,
  PRICE_PRECISION_EXP,
  SpotMarketConfig,
  ZERO,
} from "@velocity-exchange/sdk";
import {
  VaultHistoryGraphTooltip,
  GraphType,
  Period,
  VaultGraphMarketLegend,
} from "./VaultGraphs";
import { SerializedVaultDepositorRecord } from "@/db/schema";
import { getVaultDepositorBalance } from "@/lib/vault";
import { useVaultDepositorHistory } from "@/hooks/useVaultDepositorHistory";
import { useVaultSnapshotHistory } from "@/hooks/useVaultSnapshotHistory";
import { MarketId } from "@drift/common";
import { useOraclePriceStore } from "@velocity-exchange/react";
import useAppStore from "@/stores/app/useAppStore";
import { getUiVaultConfig } from "@/lib/utils";
import { Vault, VaultDepositor } from "@velocity-exchange/vaults-sdk";
import { SPOT_MARKETS_LOOKUP } from "@/constants/environment";

export function getYDomain(minY: number, maxY: number) {
  if (minY >= 0) {
    const difference = maxY - minY;
    const offset = difference * 2; // make the curve look less steep
    const absoluteMinY = Math.max(minY - offset, 0); // shouldn't go below 0

    return [absoluteMinY, "auto"];
  }

  return [minY, "auto"];
}

const CUSTOM_LINE_COLORS_ID = "custom-line-colors_vault-graph";
const CUSTOM_AREA_COLORS_ID = "custom-area-colors_vault-graph";

export const VaultDepositorHistoryGraph = (props: {
  vaultPubkey: string;
  depositAssetConfig: SpotMarketConfig;
  graphType: GraphType;
  period: Period;
  vaultAccountData: Vault;
  vaultDepositorAccountData: VaultDepositor;
  isVaultDepositorLoaded: boolean;
}) => {
  const uiVaultConfig = getUiVaultConfig(props.vaultPubkey);
  const precisionExp = props.depositAssetConfig.precisionExp;
  const dataKey = props.graphType === "pnl" ? "pnl" : "baseBalance";
  const isUsdcAsset =
    props.depositAssetConfig.marketIndex === 0 ||
    (props.graphType === "pnl" && uiVaultConfig?.isNotionalGrowthStrategy);

  const vaultStats = useAppStore((s) => s.vaultsStats[props.vaultPubkey]);
  const vaultTvlBase = vaultStats?.tvlBase;

  const getOraclePrice = useOraclePriceStore((s) => s.getMarketPriceData);

  const {
    isVaultDepositorLoaded,
    vaultDepositorAccountData,
    vaultAccountData,
  } = props;

  const { vaultSnapshots, isVaultSnapshotsLoading } = useVaultSnapshotHistory(
    props.vaultPubkey,
  );

  const { vaultDepositorHistory, isVaultDepositorHistoryLoading } =
    useVaultDepositorHistory(props.vaultPubkey);

  const isLoading =
    isVaultSnapshotsLoading ||
    isVaultDepositorHistoryLoading ||
    !isVaultDepositorLoaded;
  const displayedData: {
    ts: number;
    pnl: number;
    baseBalance: number;
  }[] = getDisplayedData();

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

  function getDisplayedData(): {
    ts: number;
    pnl: number;
    baseBalance: number;
  }[] {
    if (
      !vaultDepositorAccountData ||
      !vaultSnapshots.length ||
      !vaultDepositorHistory.length ||
      isVaultDepositorHistoryLoading
    )
      return [] as { ts: number; pnl: number; baseBalance: number }[];

    const currentOraclePrice =
      getOraclePrice(
        MarketId.createSpotMarket(props.depositAssetConfig.marketIndex),
      )?.rawPriceData.price ?? ZERO;

    type ReconstructedVaultDepositorRecord = Pick<
      SerializedVaultDepositorRecord,
      | "vaultSharesAfter"
      | "vaultSharesBefore"
      | "ts"
      | "amount"
      | "action"
      | "assetPrice"
    > & { netDeposits: string; netDepositsNotional: string };

    const reconstructedVaultDepositorHistory: ReconstructedVaultDepositorRecord[] =
      vaultDepositorHistory.reduce((acc, record, index) => {
        // re-construct the netDeposits attribute, since this isn't stored in the database
        if (index === 0) {
          return acc.concat({
            ...record,
            netDeposits: record.amount, // assumes that we fetch all depositor's transactions, and first transaction is a deposit
            netDepositsNotional: record.notionalValue,
          });
        }

        const previousRecord = acc[index - 1];

        if (record.action !== "deposit" && record.action !== "withdraw") {
          return acc.concat({
            ...record,
            netDeposits: previousRecord.netDeposits,
            netDepositsNotional: previousRecord.netDepositsNotional,
          });
        }

        const previousNetDepositBase = BigNum.from(
          previousRecord.netDeposits,
          precisionExp,
        );
        const currentAmountBase = BigNum.from(record.amount, precisionExp);
        const currentNetDepositBase =
          record.action === "deposit"
            ? previousNetDepositBase.add(currentAmountBase)
            : previousNetDepositBase.sub(currentAmountBase);

        const previousNetDepositNotional = BigNum.from(
          previousRecord.netDepositsNotional,
          precisionExp,
        );
        const currentAmountNotional = BigNum.from(
          record.notionalValue,
          precisionExp,
        );
        const currentNetDepositNotional =
          record.action === "deposit"
            ? previousNetDepositNotional.add(currentAmountNotional)
            : previousNetDepositNotional.sub(currentAmountNotional);

        return acc.concat({
          ...record,
          netDeposits: currentNetDepositBase.toString(),
          netDepositsNotional: currentNetDepositNotional.toString(),
        });
      }, [] as ReconstructedVaultDepositorRecord[]);

    // if no vault depositor's transaction and has vault shares, use his current vault shares as the constant throughout the history of the vault snapshots
    if (
      !reconstructedVaultDepositorHistory.length &&
      !vaultDepositorAccountData.vaultShares.eqn(0)
    ) {
      const currentNetDepositsNotional = BigNum.from(
        vaultDepositorAccountData.netDeposits,
        precisionExp,
      )
        .mul(currentOraclePrice)
        .shiftTo(PRICE_PRECISION_EXP);

      reconstructedVaultDepositorHistory.push({
        vaultSharesBefore: vaultDepositorAccountData.vaultShares.toString(),
        vaultSharesAfter: vaultDepositorAccountData.vaultShares.toString(),
        amount: "0",
        action: "deposit",
        netDeposits: vaultDepositorAccountData.netDeposits.toString(),
        netDepositsNotional: currentNetDepositsNotional.toString(),
        ts: vaultSnapshots[0].ts,
        assetPrice: vaultSnapshots[0].oraclePrice.toString(),
      });
    }

    // extrapolate the user's pnl and balance using the vault snapshots
    const vaultDepositorHistoryData: {
      ts: number;
      pnl: number;
      baseBalance: number;
    }[] = [];

    for (const vaultSnapshot of vaultSnapshots) {
      if (new BN(vaultSnapshot.totalShares).eqn(0)) {
        vaultDepositorHistoryData.push({
          ts: +vaultSnapshot.ts,
          pnl: 0,
          baseBalance: 0,
        });

        continue;
      }

      const lastVaultDepositorTransactionBeforeVaultSnapshot =
        reconstructedVaultDepositorHistory.reduce((acc, curr) => {
          // find the last vault depositor transaction before current snapshot's
          if (curr.ts > vaultSnapshot.ts) {
            return acc;
          }

          if (curr.ts > acc.ts) {
            return curr;
          } else {
            return acc;
          }
        }, reconstructedVaultDepositorHistory[0]);

      // this means vault depositor have not done first deposit yet
      if (
        lastVaultDepositorTransactionBeforeVaultSnapshot.ts > vaultSnapshot.ts
      ) {
        vaultDepositorHistoryData.push({
          ts: +vaultSnapshot.ts,
          pnl: 0,
          baseBalance: 0,
        });

        continue;
      }

      // get snapshot user base pnl/balance
      const snapshotUserNetDeposits = BigNum.from(
        lastVaultDepositorTransactionBeforeVaultSnapshot.netDeposits,
        precisionExp,
      );
      const snapshotUserShares = new BN(
        lastVaultDepositorTransactionBeforeVaultSnapshot.vaultSharesAfter,
      );

      const snapshotVaultDepositorBaseBalance = getVaultDepositorBalance(
        {
          vaultShares: snapshotUserShares,
        },
        {
          totalShares: new BN(vaultSnapshot.totalShares),
          profitShare: vaultAccountData?.profitShare ?? 0,
        },
        BigNum.from(vaultSnapshot.totalAccountBaseValue, precisionExp),
        props.depositAssetConfig.precisionExp,
      );

      const snapshotUserBasePnl = snapshotVaultDepositorBaseBalance.sub(
        snapshotUserNetDeposits,
      );

      // get snapshot user notional pnl
      const snapshotUserNotionalBalance = snapshotVaultDepositorBaseBalance
        .mul(BigNum.from(vaultSnapshot.oraclePrice, PRICE_PRECISION_EXP))
        .shiftTo(PRICE_PRECISION_EXP);
      const snapshotUserNetNotionalDeposits = BigNum.from(
        lastVaultDepositorTransactionBeforeVaultSnapshot.netDepositsNotional,
        PRICE_PRECISION_EXP,
      );
      const snapshotUserNotionalPnl = snapshotUserNotionalBalance
        .sub(snapshotUserNetNotionalDeposits)
        .shiftTo(PRICE_PRECISION_EXP);

      vaultDepositorHistoryData.push({
        ts: +vaultSnapshot.ts,
        pnl: uiVaultConfig?.isNotionalGrowthStrategy
          ? snapshotUserNotionalPnl.toNum()
          : snapshotUserBasePnl.toNum(),
        baseBalance: snapshotVaultDepositorBaseBalance.toNum(),
      });
    }

    const cutoffDays =
      props.period === "7d"
        ? 7
        : props.period === "30d"
          ? 30
          : props.period === "90d"
            ? 90
            : 0;
    const cutoffDate = dayjs().subtract(cutoffDays, "day");

    const periodData = vaultDepositorHistoryData.filter((snapshot) => {
      return dayjs.unix(+snapshot.ts).isAfter(cutoffDate);
    });

    // add current user's balance as part of history
    if (vaultDepositorAccountData && vaultTvlBase && vaultAccountData) {
      // get current user base pnl/balance
      const currentUserBaseBalance = getVaultDepositorBalance(
        vaultDepositorAccountData,
        vaultAccountData,
        vaultTvlBase,
        precisionExp,
        true,
      );

      const currentUserBasePnl = currentUserBaseBalance.sub(
        BigNum.from(vaultDepositorAccountData.netDeposits, precisionExp),
      );

      // get current user notional pnl
      const currentUserNetDepositsNotional = BigNum.from(
        reconstructedVaultDepositorHistory[
          reconstructedVaultDepositorHistory.length - 1
        ].netDepositsNotional,
        PRICE_PRECISION_EXP,
      );
      const currentUserNotionalBalance = currentUserBaseBalance
        .mul(currentOraclePrice)
        .shiftTo(PRICE_PRECISION_EXP);
      const currentUserNotionalPnl = currentUserNotionalBalance.sub(
        currentUserNetDepositsNotional,
      );

      const currentUserSnapshot = {
        ts: dayjs().unix(),
        pnl: uiVaultConfig?.isNotionalGrowthStrategy
          ? currentUserNotionalPnl.toNum()
          : currentUserBasePnl.toNum(),
        baseBalance: currentUserBaseBalance.toNum(),
      };

      if (dayjs.unix(periodData.slice(-1)[0]?.ts).date() !== dayjs().date()) {
        periodData.push(currentUserSnapshot);
      } else {
        // replace the last data point with the current data point if they are on the same day
        periodData[periodData.length - 1] = currentUserSnapshot;
      }
    }

    return periodData;
  }

  if (isLoading) return null;

  if (!displayedData.length) return null;

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
              `${isUsdcAsset ? "$" : ""}${BigNum.from(tick).toMillified()}`
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
                    : props.depositAssetConfig
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
            : props.depositAssetConfig.symbol
        }
      />
    </div>
  );
};
