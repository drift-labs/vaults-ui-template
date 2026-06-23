import { VaultDepositorStats } from "./VaultDepositorStats";
import { SpotMarketConfig } from "@velocity-exchange/sdk";
import { VaultDepositorPerformanceBreakdown } from "./VaultDepositorPerformanceBreakdown";
import { getUiVaultConfig } from "@/lib/utils";
import { NotionalGrowthStrategyAlert } from "./NotionalGrowthStrategyAlert";
import { Vault, VaultDepositor } from "@velocity-exchange/vaults-sdk";

export const UserPerformance = (props: {
  depositAssetConfig: SpotMarketConfig;
  vaultPubkey: string;
  vaultAccountData: Vault;
  vaultDepositorAccountData: VaultDepositor;
  isVaultDepositorLoaded: boolean;
}) => {
  const uiVaultConfig = getUiVaultConfig(props.vaultPubkey);
  return (
    <div className="flex flex-col w-full gap-6">
      {uiVaultConfig?.isNotionalGrowthStrategy && (
        <NotionalGrowthStrategyAlert />
      )}

      <VaultDepositorStats
        depositAssetConfig={props.depositAssetConfig}
        vaultPubkey={props.vaultPubkey}
        vaultAccountData={props.vaultAccountData}
        vaultDepositorAccountData={props.vaultDepositorAccountData}
        isVaultDepositorLoaded={props.isVaultDepositorLoaded}
      />
      <VaultDepositorPerformanceBreakdown
        depositAssetConfig={props.depositAssetConfig}
        vaultPubkey={props.vaultPubkey}
        vaultAccountData={props.vaultAccountData}
        vaultDepositorAccountData={props.vaultDepositorAccountData}
        isVaultDepositorLoaded={props.isVaultDepositorLoaded}
      />
    </div>
  );
};
