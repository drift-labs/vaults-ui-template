import { produce } from "immer";
import { create } from "zustand";
import { VaultClient } from "@velocity-exchange/vaults-sdk";
import { VaultStats } from "@/types/vaults";

export interface AppStoreState {
  set: (x: (s: AppStoreState) => void) => void;
  get: () => AppStoreState;
  vaultClient: VaultClient | null;
  vaultsStats: Record<string, VaultStats>;
}

const DEFAULT_APP_STORE_STATE = {};

const useAppStore = create<AppStoreState>((set, get) => {
  const setProducerFn = (fn: (s: AppStoreState) => void) => set(produce(fn));
  return {
    ...DEFAULT_APP_STORE_STATE,
    set: setProducerFn,
    get: () => get(),
    vaultClient: null,
    vaultsStats: {},
  };
});

export default useAppStore;
