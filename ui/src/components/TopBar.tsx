"use client";

import Link from "next/link";
import ConnectButton from "./ConnectButton";
import { usePathname } from "next/navigation";
import { PAGES } from "@/constants/pages";

const NavLink = ({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) => {
  const pathname = usePathname();
  const isActive = pathname.split("/")[1] === href.split("/")[1];

  return (
    <Link
      href={href}
      className={`px-4 py-2 rounded-lg transition-colors ${
        isActive
          ? "bg-blue-500 text-white hover:bg-blue-600"
          : "hover:bg-gray-100"
      }`}
    >
      {children}
    </Link>
  );
};

export const TopBar = () => {
  return (
    <div className="flex flex-row items-center justify-between w-full">
      <span className="text-2xl font-bold">Vaults UI</span>

      <div className="flex flex-row items-center gap-4">
        {/** Whitelist wallets to display this, to hide this link from normal users */}
        <NavLink href={PAGES.vaultManagerHome}>Vault Manager</NavLink>

        <NavLink href="/vaults">Vaults</NavLink>
        
        <NavLink href="/vault-input">Vault Input</NavLink>
      </div>

      <ConnectButton />
    </div>
  );
};
