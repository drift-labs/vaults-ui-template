import { MarketIcon } from "../MarketIcon";
import { SPOT_MARKETS_LOOKUP } from "@/constants/environment";
import { PublicKey } from "@velocity-exchange/sdk";
import { Button } from "../ui/button";
import Link from "next/link";
import { PAGES } from "@/constants/pages";
import { getUiVaultConfig } from "@/lib/utils";
import { VaultStats } from "@/types/vaults";

const VaultInfoRow = ({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) => {
  return (
    <div className="flex justify-between">
      <span className="text-sm text-gray-500 max-w-[200px]">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
};

export const VaultCard = ({
  vaultStat,
  vaultPubkey,
}: {
  vaultStat: VaultStats;
  vaultPubkey: string;
}) => {
  const uiVaultConfig = getUiVaultConfig(vaultPubkey);
  const spotMarketConfig = uiVaultConfig?.market ?? SPOT_MARKETS_LOOKUP[0];

  if (!uiVaultConfig) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 p-4 border border-gray-200 rounded-md">
      <VaultInfoRow label="Vault Name" value={uiVaultConfig.name} />
      <VaultInfoRow label="Vault Pubkey" value={vaultPubkey} />
      <VaultInfoRow
        label="Main Collateral"
        value={<MarketIcon marketSymbol={spotMarketConfig.symbol} />}
      />
      <VaultInfoRow
        label="APY (90D)"
        value={`${vaultStat.apys["90d"].toFixed(2)}%`}
      />
      <VaultInfoRow
        label="Base TVL"
        value={
          <div className="flex items-center gap-1">
            <span>{vaultStat.tvlBase.toNum()}</span>
            <MarketIcon marketSymbol={spotMarketConfig.symbol} />
          </div>
        }
      />
      <VaultInfoRow label="Quote TVL" value={vaultStat.tvlQuote.toNotional()} />
      <VaultInfoRow
        label="Capacity %"
        value={`${vaultStat.capacityPct.toFixed(2)}%`}
      />
      <VaultInfoRow
        label="Max Drawdown"
        value={`${vaultStat.maxDrawdownPct}%`}
      />
      <VaultInfoRow
        label="30D Volume"
        value={vaultStat.volume30Days.toNotional()}
      />
      <Link href={`${PAGES.vaultsHome}/${vaultPubkey}`}>
        <Button className="w-full mt-2">View Vault</Button>
      </Link>
    </div>
  );
};
