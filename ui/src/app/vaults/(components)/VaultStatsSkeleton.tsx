import { MarketIcon } from "@/components/MarketIcon";
import { Typo } from "@velocity-exchange/react";

export type VaultStatProps = {
  label: string;
  value: string | undefined;
  valueClassName?: string;
  loading?: boolean;
  marketSymbol?: string;
  subValue?: React.ReactNode;
};

const VaultStat = (props: VaultStatProps) => {
  return (
    <div className="flex flex-col flex-1 gap-2 sm:px-4 first:pl-0 last:pr-0 even:border-l even:pl-4 border-container-border">
      <div className="flex items-center gap-1 text-text-label">
        <Typo.B4>{props.label}</Typo.B4>
      </div>
      {props.loading ? null : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1">
            {props.marketSymbol && (
              <MarketIcon
                marketSymbol={props.marketSymbol}
                className="w-6 h-6"
              />
            )}
            <Typo.T1 className={props.valueClassName}>{props.value}</Typo.T1>
          </div>
          {props.subValue}
        </div>
      )}
    </div>
  );
};

export const VaultStatsSkeleton = (props: { stats: VaultStatProps[] }) => {
  return (
    <div className="grid w-full grid-cols-2 gap-4 p-4 border rounded sm:divide-x sm:flex border-container-border divide-container-border bg-container-bg sm:gap-0">
      {props.stats.map((stat) => {
        return <VaultStat key={stat.label} {...stat} />;
      })}
    </div>
  );
};
