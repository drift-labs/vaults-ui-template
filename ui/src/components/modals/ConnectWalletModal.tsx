import { useWallet } from "@velocity-exchange/react";
import { Wallet } from "@solana/wallet-adapter-react";
import Image from "next/image";
import { twMerge } from "tailwind-merge";

import { Modal } from "@/components/modals/Modal";
import { useModalStore } from "@/stores/useModalStore";

const WalletOption = ({
  onClick,
  wallet,
  index,
}: {
  onClick: () => void;
  wallet: Wallet;
  index: number;
}) => {
  return (
    <div
      onClick={onClick}
      className="flex justify-between text-white transition-opacity cursor-pointer hover:opacity-60"
    >
      <div className="flex gap-2">
        <Image
          src={wallet.adapter.icon}
          alt={wallet.adapter.name}
          width={24}
          height={24}
        />
        <span>{wallet.adapter.name}</span>
      </div>
      <div
        className={twMerge(
          wallet.adapter.connected && "font-semibold text-text-selected",
        )}
      >
        {wallet.adapter.connected
          ? "Connected"
          : wallet.adapter.readyState === "Installed"
            ? "Detected"
            : ""}
      </div>
    </div>
  );
};

export default function ConnectWalletModal() {
  const setModalStore = useModalStore((s) => s.set);
  const walletContext = useWallet();

  const handleOnClose = () => {
    setModalStore((s) => {
      s.modals.showConnectWalletModal = false;
    });
  };

  const handleConnectWallet = (wallet: Wallet) => {
    walletContext.select(wallet.adapter.name);
    wallet.adapter.connect();
  };

  return (
    <Modal onClose={handleOnClose} header="Connect Wallet">
      <div className="flex flex-col gap-6 min-w-[300px]">
        {walletContext?.wallets?.length > 0
          ? walletContext?.wallets?.map((wallet, index) => (
              <WalletOption
                key={wallet.adapter.name.toString()}
                wallet={wallet}
                onClick={() => handleConnectWallet(wallet)}
                index={index}
              />
            ))
          : "No Solana wallets found."}
      </div>
    </Modal>
  );
}
