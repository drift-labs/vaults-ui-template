import { Typo } from "@velocity-exchange/react";
import { MarketIcon } from "@/components/MarketIcon";

export const PerformanceBreakdownStat = (props: {
  label: string;
  value: string;
  marketSymbol?: string; // displays the market icon if provided
  loading?: boolean;
}) => {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1 text-text-label">
        <Typo.B5>{props.label}</Typo.B5>
      </div>
      {props.loading ? null : (
        <div className="flex items-center gap-1">
          {props.marketSymbol && (
            <MarketIcon marketSymbol={props.marketSymbol} className="w-4 h-4" />
          )}
          <Typo.B4 className="text-right">{props.value}</Typo.B4>
        </div>
      )}
    </div>
  );
};
