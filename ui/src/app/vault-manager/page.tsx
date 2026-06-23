"use client";

import { PAGES } from "@/constants/pages";
import { fetchAllVaultsOfManager } from "@/lib/vault-manager";
import useAppStore from "@/stores/app/useAppStore";
import { useCommonDriftStore } from "@velocity-exchange/react";
import { useEffect, useState } from "react";
import { Vault } from "@velocity-exchange/vaults-sdk";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ManageVaultCard } from "./(components)/ManageVaultCard";

export default function VaultManagerPage() {
  const vaultClient = useAppStore((s) => s.vaultClient);
  const authority = useCommonDriftStore((s) => s.authority);

  const [vaults, setVaults] = useState<Vault[]>([]);

  useEffect(() => {
    if (vaultClient && authority) {
      fetchAllVaultsOfManager(vaultClient, authority).then((vaults) =>
        setVaults(vaults),
      );
    } else {
      setVaults([]);
    }
  }, [vaultClient, authority]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between">
        <h3 className="text-xl font-bold">Manage Vaults</h3>
        <Link href={PAGES.vaultManagerCreateVault}>
          <Button className="flex items-center gap-2 bg-emerald-500">
            <Plus className="w-4 h-4" />
            Create Vault
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-8">
        {vaults.map((vault) => (
          <ManageVaultCard key={vault.pubkey.toBase58()} vault={vault} />
        ))}
      </div>
    </div>
  );
}
