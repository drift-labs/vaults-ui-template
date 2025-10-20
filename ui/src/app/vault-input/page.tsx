"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { VaultDepositWithdrawForm } from "../vaults/(components)/VaultDepositWithdrawForm";
import { useVault } from "@/hooks/useVault";
import { getUiVaultConfig } from "@/lib/utils";
import { SPOT_MARKETS_LOOKUP } from "@/constants/environment";
import { decodeName } from "@drift-labs/vaults-sdk";

export default function VaultInputPage() {
  const [vaultAddress, setVaultAddress] = useState("");
  const [submittedVaultAddress, setSubmittedVaultAddress] = useState("");
  const [error, setError] = useState("");

  const {
    vaultAccountData,
    vaultDepositorAccountData,
    isVaultDepositorLoaded,
    syncVaultStats,
  } = useVault(submittedVaultAddress);

  const uiVaultConfig = submittedVaultAddress
    ? getUiVaultConfig(submittedVaultAddress)
    : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!vaultAddress.trim()) {
      setError("Please enter a vault address");
      return;
    }

    try {
      setSubmittedVaultAddress(vaultAddress.trim());
    } catch (err) {
      setError("Invalid vault address format");
    }
  };

  const handleClear = () => {
    setVaultAddress("");
    setSubmittedVaultAddress("");
    setError("");
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Vault Input</h1>
        <p className="text-text-secondary">
          Enter a vault address to deposit or withdraw funds
        </p>
      </div>

      <Card className="p-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="vault-address">Vault Address</Label>
            <div className="flex gap-2">
              <Input
                id="vault-address"
                type="text"
                placeholder="Enter vault public key..."
                value={vaultAddress}
                onChange={(e) => setVaultAddress(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={!vaultAddress.trim()}>
                Load Vault
              </Button>
              {submittedVaultAddress && (
                <Button type="button" variant="outline" onClick={handleClear}>
                  Clear
                </Button>
              )}
            </div>
          </div>

          {error && <Alert className="text-red-600">{error}</Alert>}
        </form>
      </Card>

      {submittedVaultAddress && (
        <div className="flex flex-col gap-4">
          {vaultAccountData ? (
            <div className="flex flex-col gap-4">
              <Card className="p-6">
                <h2 className="mb-4 text-xl font-semibold">Vault Details</h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label className="font-medium">Name</Label>
                    <p className="text-text-secondary">
                      {decodeName(vaultAccountData.name)}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="font-medium">Vault Address</Label>
                    <p className="font-mono text-sm break-all text-text-secondary">
                      {submittedVaultAddress}
                    </p>
                  </div>
                </div>
              </Card>

              <div className="flex justify-center">
                <VaultDepositWithdrawForm
                  uiVaultConfig={
                    uiVaultConfig ?? {
                      vaultPubkeyString: submittedVaultAddress,
                      market: SPOT_MARKETS_LOOKUP[0],
                    }
                  }
                  vaultDepositorAccountData={vaultDepositorAccountData}
                  isVaultDepositorLoaded={isVaultDepositorLoaded}
                  vaultAccountData={vaultAccountData}
                  syncVaultStats={syncVaultStats}
                />
              </div>
            </div>
          ) : (
            <Card className="p-6">
              <div className="text-center">
                {vaultAccountData === null ? (
                  <div>
                    <h3 className="mb-2 text-lg font-medium text-red-600">
                      Vault Not Found
                    </h3>
                    <p className="text-text-secondary">
                      The vault address you entered could not be found or is not
                      supported.
                    </p>
                  </div>
                ) : (
                  <div>
                    <h3 className="mb-2 text-lg font-medium">
                      Loading Vault...
                    </h3>
                    <p className="text-text-secondary">
                      Fetching vault information, please wait...
                    </p>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
