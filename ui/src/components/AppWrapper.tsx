"use client";

import useAppStore from "@/stores/app/useAppStore";
import {
  DEFAULT_BREAKPOINTS,
  DriftProvider,
  initializeDriftStore,
  MarketAndAccount,
  useCommonDriftStore,
  useHandleBadRpc,
  useSyncOraclePriceStore,
} from "@velocity-exchange/react";
import { WalletContext, WalletProvider } from "@solana/wallet-adapter-react";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import useSyncWalletToStore from "@/hooks/useSyncWalletToStore";

import Env, {
  PERP_MARKETS_LOOKUP,
  SPOT_MARKETS_LOOKUP,
} from "@/constants/environment";
import { UIMarket } from "@drift/common";
import { useSyncVaultClient } from "@/hooks/useSyncVaultClient";

initializeDriftStore(Env);

// Initialize QueryClient outside component to prevent recreation on re-renders
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
    },
  },
});

const marketsAndAccounts: MarketAndAccount[] = [];
PERP_MARKETS_LOOKUP.forEach((market) => {
  marketsAndAccounts.push({
    market: UIMarket.createPerpMarket(market.marketIndex),
    accountToUse: market.oracle,
  });
});
SPOT_MARKETS_LOOKUP.forEach((market) => {
  marketsAndAccounts.push({
    market: UIMarket.createSpotMarket(market.marketIndex),
    accountToUse: market.oracle,
  });
});

const AppSetup = ({ children }: { children: React.ReactNode }) => {
  useSyncWalletToStore();
  useSyncOraclePriceStore(marketsAndAccounts);
  useSyncVaultClient();
  useHandleBadRpc();

  return <>{children}</>;
};

const AppWrapper = ({ children }: { children: React.ReactNode }) => {
  const get = useAppStore((s) => s.get);
  const getCommon = useCommonDriftStore((s) => s.get);

  useEffect(() => {
    // easy access the app & common store from the window object in the console
    // @ts-ignore
    window.drift_dev = { getStore: get, getCommonStore: getCommon };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider wallets={[]} autoConnect>
        <DriftProvider
          // @ts-ignore
          walletContext={WalletContext}
          disable={{}}
          additionalDriftClientConfig={{
            opts: {
              skipPreflight: true,
            },
          }}
          breakpoints={DEFAULT_BREAKPOINTS}
        >
          <AppSetup>{children}</AppSetup>
        </DriftProvider>
      </WalletProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
};

export default AppWrapper;
