import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  VaultParamsFormFields,
  updateVaultSchema,
  type UpdateVaultSchema,
} from "./VaultParamsFormFields";
import { Vault } from "@velocity-exchange/vaults-sdk";
import { SPOT_MARKETS_LOOKUP } from "@/constants/environment";
import useAppStore from "@/stores/app/useAppStore";
import { BN, PERCENTAGE_PRECISION, BigNum } from "@velocity-exchange/sdk";
import { toast } from "react-hot-toast";

type UpdateVaultFormProps = {
  vault: Vault;
  vaultParams: UpdateVaultSchema;
  onSuccess?: () => void;
};

export const UpdateVaultForm = ({
  vault,
  vaultParams,
  onSuccess,
}: UpdateVaultFormProps) => {
  const spotMarketConfig = SPOT_MARKETS_LOOKUP[vault.spotMarketIndex];

  const vaultClient = useAppStore((s) => s.vaultClient);
  const form = useForm<UpdateVaultSchema>({
    resolver: zodResolver(updateVaultSchema),
    defaultValues: {
      redeemPeriod: vaultParams.redeemPeriod,
      maxTokens: vaultParams.maxTokens,
      minDepositAmount: vaultParams.minDepositAmount,
      managementFee: vaultParams.managementFee,
      profitShare: vaultParams.profitShare,
      hurdleRate: vaultParams.hurdleRate,
      permissioned: vaultParams.permissioned,
    },
  });

  const onSubmit = async (data: UpdateVaultSchema) => {
    if (!vaultClient) return;

    const precisionExp =
      SPOT_MARKETS_LOOKUP[vault.spotMarketIndex].precisionExp;

    const totalRedeemPeriodSeconds =
      data.redeemPeriod.days * 86400 +
      data.redeemPeriod.hours * 3600 +
      data.redeemPeriod.minutes * 60 +
      data.redeemPeriod.seconds;

    const formattedUpdateVaultParams = {
      redeemPeriod: new BN(totalRedeemPeriodSeconds),
      maxTokens: BigNum.fromPrint(data.maxTokens.toString(), precisionExp).val,
      minDepositAmount: BigNum.fromPrint(
        data.minDepositAmount.toString(),
        precisionExp,
      ).val,
      managementFee: new BN(
        (data.managementFee * PERCENTAGE_PRECISION.toNumber()) / 100,
      ),
      profitShare: (data.profitShare * PERCENTAGE_PRECISION.toNumber()) / 100,
      hurdleRate: data.hurdleRate,
      permissioned: data.permissioned,
    };

    const updatedParams = {
      // must be lower than previous value
      redeemPeriod: !formattedUpdateVaultParams.redeemPeriod.eq(
        vault.redeemPeriod,
      )
        ? formattedUpdateVaultParams.redeemPeriod
        : null,
      maxTokens: !formattedUpdateVaultParams.maxTokens.eq(vault.maxTokens)
        ? formattedUpdateVaultParams.maxTokens
        : null,
      minDepositAmount: !formattedUpdateVaultParams.minDepositAmount.eq(
        vault.minDepositAmount,
      )
        ? formattedUpdateVaultParams.minDepositAmount
        : null,
      // must be lower than previous value
      managementFee: !formattedUpdateVaultParams.managementFee.eq(
        vault.managementFee,
      )
        ? formattedUpdateVaultParams.managementFee
        : null,
      // must be lower than previous value
      profitShare:
        formattedUpdateVaultParams.profitShare !== vault.profitShare
          ? formattedUpdateVaultParams.profitShare
          : null,
      hurdleRate:
        formattedUpdateVaultParams.hurdleRate !== vault.hurdleRate
          ? formattedUpdateVaultParams.hurdleRate
          : null,
      permissioned:
        formattedUpdateVaultParams.permissioned !== vault.permissioned
          ? formattedUpdateVaultParams.permissioned
          : null,
    };

    try {
      await vaultClient.managerUpdateVault(vault.pubkey, updatedParams);
      toast.success("Vault updated successfully");
      onSuccess?.();
    } catch (error) {
      console.error("Error updating vault:", error);
      toast.error("Error updating vault");
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <VaultParamsFormFields
          form={form}
          mode="update"
          spotMarketConfig={spotMarketConfig}
        />
        <Button type="submit" className="w-full">
          Update Vault Params
        </Button>
      </form>
    </Form>
  );
};
