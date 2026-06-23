import { SerializedVaultDepositorRecord } from "@/db/schema";
import { GET_API_ROUTE } from "@/constants/api";
import { useCommonDriftStore } from "@velocity-exchange/react";
import { useQuery } from "@tanstack/react-query";

const DEFAULT_VAULT_DEPOSITOR_HISTORY: SerializedVaultDepositorRecord[] = [];

export const useVaultDepositorHistory = (vaultPubkey: string) => {
  const authority = useCommonDriftStore((s) => s.authority);

  const {
    data: vaultDepositorHistory = DEFAULT_VAULT_DEPOSITOR_HISTORY,
    isLoading: isVaultDepositorHistoryLoading,
  } = useQuery<SerializedVaultDepositorRecord[]>({
    queryKey: ["vault-depositor-history", vaultPubkey],
    queryFn: () => {
      return fetch(
        `${GET_API_ROUTE(
          "vault-depositor",
        )}?depositorAuthority=${authority?.toString()}&vault=${vaultPubkey}`,
      ).then((res) => res.json());
    },
    enabled: !!authority && !!vaultPubkey,
    placeholderData: DEFAULT_VAULT_DEPOSITOR_HISTORY,
  });

  return {
    vaultDepositorHistory,
    isVaultDepositorHistoryLoading,
  };
};
