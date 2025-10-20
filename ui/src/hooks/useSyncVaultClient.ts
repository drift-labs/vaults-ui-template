"use client";

import { useEffect } from "react";
import { getDriftVaultProgram, VaultClient } from "@drift-labs/vaults-sdk";
import { COMMON_UI_UTILS } from "@drift/common";
import { useCommonDriftStore, useDriftClientIsReady } from "@drift-labs/react";
import useAppStore from "@/stores/app/useAppStore";

export const useSyncVaultClient = () => {
  const driftClient = useCommonDriftStore((s) => s.driftClient?.client);
  const driftClientIsReady = useDriftClientIsReady();
  const connection = useCommonDriftStore((s) => s.connection);
  const setAppStore = useAppStore((s) => s.set);

  useEffect(() => {
    if (driftClientIsReady && driftClient && connection) {
      const vaultProgram = getDriftVaultProgram(
        connection,
        COMMON_UI_UTILS.createPlaceholderIWallet(),
      );
      const vaultClient = new VaultClient({
        driftClient,
        program: vaultProgram,
      });
      setAppStore((s) => {
        s.vaultClient = vaultClient;
      });
    }
  }, [driftClient, driftClientIsReady, connection]);
};
