"use client";

import { useModalStore } from "@/stores/useModalStore";
import { Wallet } from "@velocity-exchange/icons";
import { useCommonDriftStore } from "@velocity-exchange/react";
import { COMMON_UI_UTILS } from "@drift/common";
import { twMerge } from "tailwind-merge";

import { Button } from "./ui/button";

export default function ConnectButton({ className }: { className?: string }) {
  const authority = useCommonDriftStore((s) => s.authority);

  const setModalStore = useModalStore((s) => s.set);

  const openConnectWalletModal = () => {
    setModalStore((s) => {
      s.modals.showConnectWalletModal = true;
    });
  };

  return (
    <Button
      className={twMerge("flex items-center gap-2")}
      onClick={openConnectWalletModal}
    >
      {!authority && (
        <>
          <span>Connect to</span>
          <Wallet size={24} />
        </>
      )}

      {authority && <span>{COMMON_UI_UTILS.abbreviateAddress(authority)}</span>}
    </Button>
  );
}
