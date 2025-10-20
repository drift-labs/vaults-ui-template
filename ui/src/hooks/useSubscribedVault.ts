import { useEffect, useRef, useState } from "react";
import {
  Vault,
  VaultAccount,
  getDriftVaultProgram,
} from "@drift-labs/vaults-sdk";
import { useCommonDriftStore } from "@drift-labs/react";
import { COMMON_UI_UTILS } from "@drift/common";
import { PublicKey, BulkAccountLoader } from "@drift-labs/sdk";
import { Connection } from "@solana/web3.js";

/**
 * Subscribed to changes in the vault account.
 */
export const useSubscribedVault = (
  vaultPubkey?: string,
): {
  vaultAccountData: Vault | undefined;
  vaultAccount: VaultAccount | undefined;
} => {
  const connection = useCommonDriftStore((s) => s.connection);
  const bulkAccountLoader = useCommonDriftStore((s) => s.bulkAccountLoader);

  const [vaultAccountData, setVaultAccountData] = useState<Vault | undefined>();
  const [vaultAccount, setVaultAccount] = useState<VaultAccount | undefined>();
  const vaultAccountRef = useRef<VaultAccount | undefined>();

  useEffect(() => {
    if (!vaultPubkey || !connection || !bulkAccountLoader) return;

    syncVaultAccountAndData(connection, bulkAccountLoader, vaultPubkey);

    return () => {
      setVaultAccount(undefined);
      vaultAccountRef.current?.unsubscribe();
    };
  }, [vaultPubkey, connection, bulkAccountLoader]);

  async function syncVaultAccountAndData(
    connection: Connection,
    bulkAccountLoader: BulkAccountLoader,
    vaultPubkey: string,
  ) {
    const newWallet = COMMON_UI_UTILS.createPlaceholderIWallet();
    const driftVaultsProgram = getDriftVaultProgram(connection, newWallet);

    const vaultAccount = new VaultAccount(
      driftVaultsProgram,
      new PublicKey(vaultPubkey),
      bulkAccountLoader,
    );

    setVaultAccount(vaultAccount);
    vaultAccountRef.current = vaultAccount;

    await vaultAccount.subscribe();

    const vaultAccountData = vaultAccount.getData();

    setVaultAccountData(vaultAccountData);

    vaultAccount.eventEmitter.on("vaultUpdate", (newVaultAccountData) => {
      setVaultAccountData(newVaultAccountData);
    });
  }

  return { vaultAccountData, vaultAccount };
};
