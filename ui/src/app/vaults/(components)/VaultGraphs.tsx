import dayjs from "dayjs";
import { TooltipProps } from "recharts";
import { BigNum, SpotMarketConfig } from "@velocity-exchange/sdk";
import { twMerge } from "tailwind-merge";
import { MarketIcon } from "@/components/MarketIcon";
import { Typo } from "@velocity-exchange/react";

export type GraphType = "pnl" | "balance" | "sharePrice";
export type Period = "7d" | "30d" | "90d";

export function getYDomain(minY: number, maxY: number) {
  if (minY >= 0) {
    const difference = maxY - minY;
    const offset = difference * 2; // make the curve look less steep
    const absoluteMinY = Math.max(minY - offset, 0); // shouldn't go below 0

    return [absoluteMinY, "auto"];
  }

  return [minY, "auto"];
}

export const VaultHistoryGraphTooltip = ({
  active,
  payload,
  label,
  marketConfig,
  isPnl,
}: TooltipProps<number, string> & {
  marketConfig: SpotMarketConfig;
  isPnl: boolean;
}) => {
  if (active && payload && payload.length) {
    const date = dayjs.unix(label).format("D MMM YYYY");
    const value = payload[0].value ?? 0;

    const isRemoveDecimals = value >= 100;

    const isProfit = value >= 0;
    const isUsdcAsset = marketConfig.marketIndex === 0;

    return (
      <div className="flex flex-col gap-1 p-2 border bg-container-bg border-container-border">
        <Typo.T4>{date}</Typo.T4>
        <Typo.T3
          className={twMerge(
            isProfit ? "text-positive-green" : "text-negative-red",
          )}
        >
          {isProfit && isPnl && "+"}
          {`${isUsdcAsset ? "$" : ""}${BigNum.fromPrint(
            isRemoveDecimals ? value.toFixed(0) : value.toString(),
            marketConfig.precisionExp,
          ).prettyPrint()}${isUsdcAsset ? "" : ` ${marketConfig.symbol}`}`}
        </Typo.T3>
      </div>
    );
  }

  return null;
};

export const VaultGraphMarketLegend = (props: { marketSymbol: string }) => {
  return (
    <Typo.B3 className="flex items-center gap-1 text-text-label">
      <span>Denominated in</span>
      <MarketIcon marketSymbol={props.marketSymbol} className="w-4 h-4" />
      <span>{props.marketSymbol}</span>
    </Typo.B3>
  );
};
