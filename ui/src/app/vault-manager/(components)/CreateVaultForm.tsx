import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  VaultParamsFormFields,
  createVaultSchema,
  type CreateVaultSchema,
} from "./VaultParamsFormFields";
import { createVault } from "@/lib/vault-manager";
import useAppStore from "@/stores/app/useAppStore";
import { encodeName } from "@velocity-exchange/vaults-sdk";
import { BN, PERCENTAGE_PRECISION } from "@velocity-exchange/sdk";
import { SPOT_MARKETS_LOOKUP } from "@/constants/environment";

export const CreateVaultForm = () => {
  const vaultClient = useAppStore((s) => s.vaultClient);

  const form = useForm<CreateVaultSchema>({
    resolver: zodResolver(createVaultSchema),
    defaultValues: {
      name: "",
      spotMarketIndex: 0,
      redeemPeriod: {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
      },
      maxTokens: 0,
      minDepositAmount: 0,
      managementFee: 0,
      profitShare: 0,
      hurdleRate: 0,
      permissioned: false,
    },
  });

  const spotMarketConfig =
    SPOT_MARKETS_LOOKUP[form.getValues("spotMarketIndex")];

  const onSubmit = async (values: CreateVaultSchema) => {
    if (!vaultClient) {
      console.error("Vault client not initialized");
      return;
    }

    // Convert time to seconds for redeemPeriod
    const redeemPeriodSeconds =
      values.redeemPeriod.days * 86400 +
      values.redeemPeriod.hours * 3600 +
      values.redeemPeriod.minutes * 60 +
      values.redeemPeriod.seconds;

    const precision = SPOT_MARKETS_LOOKUP[values.spotMarketIndex].precision;

    await createVault(vaultClient, {
      name: encodeName(values.name),
      spotMarketIndex: values.spotMarketIndex,
      redeemPeriod: new BN(redeemPeriodSeconds),
      maxTokens: new BN(values.maxTokens * precision.toNumber()),
      minDepositAmount: new BN(values.minDepositAmount * precision.toNumber()),
      managementFee: new BN(
        (values.managementFee / 100) * PERCENTAGE_PRECISION.toNumber(),
      ),
      profitShare: (values.profitShare / 100) * PERCENTAGE_PRECISION.toNumber(),
      hurdleRate: values.hurdleRate * PERCENTAGE_PRECISION.toNumber(),
      permissioned: values.permissioned,
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <VaultParamsFormFields
          form={form}
          mode="create"
          spotMarketConfig={spotMarketConfig}
        />
        <Button type="submit">Create Vault</Button>
      </form>
    </Form>
  );
};
