"use client";

import { use, useCallback, useEffect, useState } from "react";
import { decodeName, Vault, WithdrawUnit } from "@drift-labs/vaults-sdk";
import useAppStore from "@/stores/app/useAppStore";
import { PublicKey } from "@solana/web3.js";
import { SPOT_MARKETS_LOOKUP } from "@/constants/environment";
import { BigNum, BN, PERCENTAGE_PRECISION, UserAccount } from "@drift-labs/sdk";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UpdateVaultForm } from "../(components)/UpdateVaultForm";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import { twMerge } from "tailwind-merge";
import { useCommonDriftStore } from "@drift-labs/react";
import { createVaultSnapshot } from "@/server-actions/vaults";
import { TransactionInstruction } from "@solana/web3.js";

type FetchVaultFn = () => Promise<void>;

const VaultInfoRow = ({
  label,
  value,
  labelClassName,
}: {
  label: string;
  value: React.ReactNode;
  labelClassName?: string;
}) => {
  return (
    <div className="flex gap-1 justify-between pt-1">
      <span
        className={twMerge(
          "text-sm text-gray-500++ max-w-[300px]",
          labelClassName,
        )}
      >
        {label}
      </span>
      <span className="text-sm text-right break-all">{value}</span>
    </div>
  );
};

const tokenValueDisplayCurried =
  (precisionExp: number | BN, symbol: string) => (value: BN) => {
    return `${BigNum.from(value, precisionExp).toNum()} ${symbol}`;
  };

const VaultOnChainInformation = ({ vault }: { vault: Vault }) => {
  const spotMarketConfig = SPOT_MARKETS_LOOKUP[vault.spotMarketIndex];
  const precisionExp = spotMarketConfig.precisionExp;

  const tokenValueDisplay = tokenValueDisplayCurried(
    precisionExp,
    spotMarketConfig.symbol,
  );

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader>Vault On-Chain Account Information</SectionHeader>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1 w-full divide-y divide-gray-200">
          <VaultInfoRow label="Name" value={decodeName(vault.name)} />
          <VaultInfoRow label="Pubkey" value={vault.pubkey.toBase58()} />
          <VaultInfoRow label="Manager" value={vault.manager.toBase58()} />
          <VaultInfoRow
            label="Token Account"
            value={vault.tokenAccount.toBase58()}
          />
          <VaultInfoRow label="User Stats" value={vault.userStats.toBase58()} />
          <VaultInfoRow
            label="Drift User Account"
            value={vault.user.toBase58()}
          />
          <VaultInfoRow label="Delegate" value={vault.delegate.toBase58()} />
          <VaultInfoRow
            label="Liquidation Delegate"
            value={vault.liquidationDelegate.toBase58()}
          />
          <VaultInfoRow
            label="Spot Market Index"
            value={`${vault.spotMarketIndex} -> ${spotMarketConfig.symbol}`}
          />
          <VaultInfoRow
            label="Redeem Period"
            value={`${vault.redeemPeriod.toString()} seconds`}
          />
          <VaultInfoRow
            label="Max Tokens"
            value={tokenValueDisplay(vault.maxTokens)}
          />
          <VaultInfoRow
            label="Min Deposit Amount"
            value={tokenValueDisplay(vault.minDepositAmount)}
          />
          <VaultInfoRow
            label="Management Fee"
            value={`${
              (vault.managementFee.toNumber() /
                PERCENTAGE_PRECISION.toNumber()) *
              100
            }%`}
          />
          <VaultInfoRow
            label="Profit Share"
            value={`${
              (vault.profitShare / PERCENTAGE_PRECISION.toNumber()) * 100
            }%`}
          />
          <VaultInfoRow label="Hurdle Rate" value={vault.hurdleRate} />
          <VaultInfoRow
            label="Permissioned"
            value={vault.permissioned.toString()}
          />
        </div>
        <div className="flex flex-col gap-1 divide-y divide-gray-200">
          <VaultInfoRow
            label="Total Withdraw Requested"
            value={tokenValueDisplay(vault.totalWithdrawRequested)}
            labelClassName={twMerge(
              !vault.totalWithdrawRequested.isZero() && "text-red-500",
            )}
          />
          <VaultInfoRow
            label="User Shares"
            value={vault.userShares.toString()}
          />
          <VaultInfoRow
            label="Total Shares"
            value={vault.totalShares.toString()}
          />
          <VaultInfoRow
            label="Last Fee Update Timestamp"
            value={vault.lastFeeUpdateTs.toString()}
          />
          <VaultInfoRow
            label="Liquidation Start Timestamp"
            value={vault.liquidationStartTs.toString()}
          />
          <VaultInfoRow
            label="Net Deposits"
            value={tokenValueDisplay(vault.netDeposits)}
          />
          <VaultInfoRow
            label="Total Deposits"
            value={tokenValueDisplay(vault.totalDeposits)}
          />
          <VaultInfoRow
            label="Total Withdraws"
            value={tokenValueDisplay(vault.totalWithdraws)}
          />
          <VaultInfoRow
            label="Manager Net Deposits"
            value={tokenValueDisplay(vault.managerNetDeposits)}
          />
          <VaultInfoRow
            label="Manager Total Deposits"
            value={tokenValueDisplay(vault.managerTotalDeposits)}
          />
          <VaultInfoRow
            label="Manager Total Withdraws"
            value={tokenValueDisplay(vault.managerTotalWithdraws)}
          />
          <VaultInfoRow
            label="Manager Total Fee"
            value={tokenValueDisplay(vault.managerTotalFee)}
          />
          <VaultInfoRow
            label="Manager Total Profit Share"
            value={tokenValueDisplay(vault.managerTotalProfitShare)}
          />
          <VaultInfoRow
            label="Last Manager Withdraw Request Shares"
            value={vault.lastManagerWithdrawRequest.shares.toString()}
          />
          <VaultInfoRow
            label="Last Manager Withdraw Request Value"
            value={tokenValueDisplay(vault.lastManagerWithdrawRequest.value)}
          />
          <VaultInfoRow
            label="Last Manager Withdraw Request Timestamp"
            value={vault.lastManagerWithdrawRequest.ts.toString()}
          />
        </div>
      </div>
    </div>
  );
};

const SectionHeader = ({ children }: { children: React.ReactNode }) => {
  return <h3 className="text-xl font-bold underline">{children}</h3>;
};

const SubSectionHeader = ({ children }: { children: React.ReactNode }) => {
  return <h3 className="text-lg font-semibold">{children}</h3>;
};

const ManagerDeposit = ({
  vault,
  fetchVault,
}: {
  vault: Vault;
  fetchVault: FetchVaultFn;
}) => {
  const spotMarketConfig = SPOT_MARKETS_LOOKUP[vault.spotMarketIndex];
  const vaultClient = useAppStore((s) => s.vaultClient);
  const [depositAmount, setDepositAmount] = useState("");

  const handleDeposit = async () => {
    if (!vaultClient) {
      return;
    }

    const amountBigNum = BigNum.fromPrint(
      depositAmount,
      spotMarketConfig.precisionExp,
    );

    try {
      await vaultClient.managerDeposit(vault.pubkey, amountBigNum.val);
      await fetchVault();
      toast.success("Deposit successful");
    } catch (e) {
      toast.error("Failed to deposit");
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <SubSectionHeader>Manager Deposit</SubSectionHeader>
      <div className="flex flex-col gap-1">
        <span>Deposit Amount ({spotMarketConfig.symbol})</span>
        <div className="flex gap-4">
          <Input
            type="number"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
          />
          <Button onClick={handleDeposit}>Deposit</Button>
        </div>
      </div>
    </div>
  );
};

enum WithdrawalState {
  UnRequested,
  RequestedAndPending,
  Available,
}

const ManagerWithdraw = ({
  vault,
  fetchVault,
}: {
  vault: Vault;
  fetchVault: FetchVaultFn;
}) => {
  const spotMarketConfig = SPOT_MARKETS_LOOKUP[vault.spotMarketIndex];
  const precisionExp = spotMarketConfig.precisionExp;
  const lastManagerWithdrawRequest = vault.lastManagerWithdrawRequest;
  const vaultClient = useAppStore((s) => s.vaultClient);
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const withdrawalState = getWithdrawalState();

  const tokenValueDisplay = tokenValueDisplayCurried(
    precisionExp,
    spotMarketConfig.symbol,
  );

  function getWithdrawalState() {
    if (lastManagerWithdrawRequest.shares.isZero()) {
      return WithdrawalState.UnRequested;
    }

    if (
      lastManagerWithdrawRequest.ts.toNumber() + vault.redeemPeriod.toNumber() >
      Date.now() / 1000
    ) {
      return WithdrawalState.RequestedAndPending;
    }

    return WithdrawalState.Available;
  }

  async function handleWithdrawCta() {
    if (!vaultClient) {
      return;
    }

    try {
      if (withdrawalState === WithdrawalState.UnRequested) {
        const amountBigNum = BigNum.fromPrint(withdrawAmount, precisionExp);
        await vaultClient.managerRequestWithdraw(
          vault.pubkey,
          amountBigNum.val,
          WithdrawUnit.TOKEN, // WithdrawUnit.SHARES may be a better option to handle max values
        );
        await fetchVault();
        toast.success("Withdrawal requested");
      } else if (withdrawalState === WithdrawalState.RequestedAndPending) {
        await vaultClient.managerCancelWithdrawRequest(vault.pubkey);
        await fetchVault();
        toast.success("Withdrawal cancelled");
      } else if (withdrawalState === WithdrawalState.Available) {
        await vaultClient.managerWithdraw(vault.pubkey);
        await fetchVault();
        toast.success("Withdrawal successful");
      }
    } catch (e) {
      toast.error("Failed withdrawal action. Check console for error logs");
      console.error(e);
    }
  }

  function renderWithdrawalState() {
    switch (withdrawalState) {
      case WithdrawalState.UnRequested:
        return (
          <div className="flex flex-col gap-1">
            <span>Withdraw Amount ({spotMarketConfig.symbol})</span>
            <div className="flex gap-4">
              <Input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
              />
              <Button onClick={handleWithdrawCta}>Request Withdraw</Button>
            </div>
          </div>
        );
      case WithdrawalState.RequestedAndPending:
        return (
          <div className="flex gap-4 items-center">
            <span>
              {`Shares Requested: ${lastManagerWithdrawRequest.shares.toString()} | Max Value: ${tokenValueDisplay(
                lastManagerWithdrawRequest.value,
              )} | Withdrawal Available On: ${dayjs
                .unix(
                  lastManagerWithdrawRequest.ts.toNumber() +
                    vault.redeemPeriod.toNumber(),
                )
                .format("DD/MM/YYYY hh:mm:ss A")}`}
            </span>
            <Button onClick={handleWithdrawCta}>Cancel Withdraw Request</Button>
          </div>
        );
      case WithdrawalState.Available:
        return (
          <div className="flex gap-4 items-center">
            <span>
              {`Shares Requested: ${lastManagerWithdrawRequest.shares.toString()} | Max Value: ${tokenValueDisplay(
                lastManagerWithdrawRequest.value,
              )} | Withdrawal Available ✅`}
            </span>
            <Button onClick={handleWithdrawCta}>Withdraw</Button>
          </div>
        );
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SubSectionHeader>Manager Withdraw</SubSectionHeader>
      {renderWithdrawalState()}
    </div>
  );
};

const ManagerApplyProfitShare = ({ vault }: { vault: Vault }) => {
  const vaultClient = useAppStore((s) => s.vaultClient);

  const handleApplyProfitShare = async () => {
    if (!vaultClient) {
      return;
    }

    try {
      // Get all vault depositors for this vault
      const allVaultDepositors = await vaultClient.getAllVaultDepositors(
        vault.pubkey,
      );

      if (allVaultDepositors.length === 0) {
        toast("No vault depositors found");
        return;
      }

      // Create chunks of 5 depositors per transaction
      const CHUNK_SIZE = 5;
      const chunks = [];
      for (let i = 0; i < allVaultDepositors.length; i += CHUNK_SIZE) {
        chunks.push(allVaultDepositors.slice(i, i + CHUNK_SIZE));
      }

      toast(
        `Applying profit share to ${allVaultDepositors.length} depositors in ${chunks.length} transactions...`,
      );

      // Process each chunk
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const instructions: TransactionInstruction[] = [];

        // Create applyProfitShare instructions for each depositor in the chunk
        for (const depositor of chunk) {
          const instruction = await vaultClient.getApplyProfitShareIx(
            vault.pubkey,
            depositor.publicKey,
          );
          instructions.push(instruction);
        }

        // Send the transaction with the chunk of instructions
        await vaultClient.createAndSendTxn(instructions);

        // Small delay between transactions to avoid rate limiting
        if (i < chunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      toast.success(
        `Successfully applied profit share to ${allVaultDepositors.length} depositors`,
      );
    } catch (e) {
      toast.error("Failed to apply profit share");
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <SubSectionHeader>Apply Profit Share</SubSectionHeader>
      <Button onClick={handleApplyProfitShare}>Apply Profit Share</Button>
    </div>
  );
};

const UpdateMarginTrading = ({
  vault,
  isMarginTradingEnabled,
  fetchVault,
}: {
  vault: Vault;
  isMarginTradingEnabled: boolean;
  fetchVault: FetchVaultFn;
}) => {
  const vaultClient = useAppStore((s) => s.vaultClient);
  const [stagedIsMarginTradingEnabled, setStagedIsMarginTradingEnabled] =
    useState(isMarginTradingEnabled);

  const handleToggleMarginTrading = async () => {
    if (
      !vaultClient ||
      stagedIsMarginTradingEnabled === isMarginTradingEnabled
    ) {
      return;
    }

    try {
      await vaultClient.updateMarginTradingEnabled(
        vault.pubkey,
        stagedIsMarginTradingEnabled,
      );
      await fetchVault();
      toast.success(
        `Margin trading ${isMarginTradingEnabled ? "disabled" : "enabled"}`,
      );
    } catch (e) {
      toast.error(
        "Failed to update margin trading. Check console for error logs",
      );
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <SubSectionHeader>Update Margin Trading</SubSectionHeader>
      <div className="flex gap-4 items-center w-full">
        <span>Margin Trading</span>
        <Switch
          checked={stagedIsMarginTradingEnabled}
          onCheckedChange={setStagedIsMarginTradingEnabled}
        />
        <Button
          onClick={handleToggleMarginTrading}
          disabled={
            !vaultClient ||
            stagedIsMarginTradingEnabled === isMarginTradingEnabled
          }
        >
          Update
        </Button>
      </div>
    </div>
  );
};

const UpdateVaultDelegate = ({
  vault,
  fetchVault,
}: {
  vault: Vault;
  fetchVault: FetchVaultFn;
}) => {
  const vaultClient = useAppStore((s) => s.vaultClient);
  const [stagedDelegate, setStagedDelegate] = useState(
    vault.delegate.toBase58(),
  );

  const handleUpdateVaultDelegate = async () => {
    if (!vaultClient) {
      return;
    }

    let updatedDelegate: PublicKey;

    try {
      updatedDelegate = new PublicKey(stagedDelegate);
    } catch (e) {
      toast.error("Invalid delegate address");
      return;
    }

    try {
      await vaultClient.updateDelegate(vault.pubkey, updatedDelegate);
      await fetchVault();
      toast.success("Vault delegate updated");
    } catch (e) {
      toast.error("Failed to update vault delegate");
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <SubSectionHeader>Update Vault Delegate</SubSectionHeader>
      <div className="flex flex-col gap-1">
        <span>Delegate</span>

        <div className="flex gap-4">
          <Input
            value={stagedDelegate}
            onChange={(e) => setStagedDelegate(e.target.value)}
          />
          <Button onClick={handleUpdateVaultDelegate}>Update Delegate</Button>
        </div>
      </div>
    </div>
  );
};

const UpdateVault = ({
  vault,
  fetchVault,
}: {
  vault: Vault;
  fetchVault: FetchVaultFn;
}) => {
  const precisionExp = SPOT_MARKETS_LOOKUP[vault.spotMarketIndex].precisionExp;
  const defaultVaultValues = {
    redeemPeriod: {
      days: Math.floor(vault.redeemPeriod.toNumber() / 86400),
      hours: Math.floor(vault.redeemPeriod.toNumber() / 3600) % 24,
      minutes: Math.floor(vault.redeemPeriod.toNumber() / 60) % 60,
      seconds: vault.redeemPeriod.toNumber() % 60,
    },
    maxTokens: BigNum.from(vault.maxTokens, precisionExp).toNum(),
    minDepositAmount: BigNum.from(vault.minDepositAmount, precisionExp).toNum(),
    managementFee:
      (vault.managementFee.toNumber() * 100) / PERCENTAGE_PRECISION.toNumber(),
    profitShare: (vault.profitShare * 100) / PERCENTAGE_PRECISION.toNumber(),
    hurdleRate: vault.hurdleRate,
    permissioned: vault.permissioned,
  };

  return (
    <div className="flex flex-col gap-3">
      <SubSectionHeader>Update Vault Params</SubSectionHeader>
      <UpdateVaultForm
        vault={vault}
        vaultParams={defaultVaultValues}
        onSuccess={fetchVault}
      />
    </div>
  );
};

const WhitelistWallet = ({ vault }: { vault: Vault }) => {
  const vaultClient = useAppStore((s) => s.vaultClient);
  const manager = useCommonDriftStore((s) => s.authority);
  const [walletToWhitelist, setWalletToWhitelist] = useState("");

  const handleWhitelistWallet = async () => {
    if (!vaultClient || !manager) {
      return;
    }

    try {
      await vaultClient.initializeVaultDepositor(
        vault.pubkey,
        new PublicKey(walletToWhitelist),
        manager,
      );
      toast.success("Wallet whitelisted");
      setWalletToWhitelist("");
    } catch (e) {
      toast.error("Failed to whitelist wallet. Check console for error logs");
      console.error(e);
    }
  };

  if (!vault.permissioned) {
    return <div>Vault is not permissioned.</div>;
  }

  return (
    <div className="flex flex-col gap-1">
      <span>Wallet</span>
      <div className="flex gap-4">
        <Input
          value={walletToWhitelist}
          onChange={(e) => setWalletToWhitelist(e.target.value)}
        />
        <Button onClick={handleWhitelistWallet}>Whitelist</Button>
      </div>
    </div>
  );
};

const DatabaseActions = ({ vault }: { vault: Vault }) => {
  const handleVaultSnapshot = async () => {
    const vaultSnapshot = await createVaultSnapshot(vault.pubkey.toBase58());
    toast.success("Vault snapshot created. Check console for data");
    console.log(vaultSnapshot);
  };

  return (
    <div className="flex flex-col gap-3">
      <span className="text-red-400">
        Note: This will create a snapshot of the vault and store it in the
        database, and the time of snapshot may not be consistent with the rest
        of your data. It is still recommended to take a snapshot after your
        first deposit.
      </span>
      <Button onClick={handleVaultSnapshot}>Create Vault Snapshot</Button>
    </div>
  );
};

export default function VaultManagerVaultPage(props: {
  params: Promise<{
    vaultPubkey: string;
  }>;
}) {
  const params = use(props.params);

  const [vault, setVault] = useState<Vault | null>(null);
  const [vaultDriftUser, setVaultDriftUser] = useState<UserAccount | null>(
    null,
  );
  const vaultClient = useAppStore((s) => s.vaultClient);

  const fetchVault = useCallback(async () => {
    if (vaultClient && params.vaultPubkey) {
      const vault = await vaultClient.getVault(
        new PublicKey(params.vaultPubkey),
      );
      setVault(vault);

      const vaultDriftUser = await vaultClient.getSubscribedVaultUser(
        vault.user,
      );
      const userAccount = await vaultDriftUser.getUserAccount();
      setVaultDriftUser(userAccount);
    } else {
      setVault(null);
      setVaultDriftUser(null);
    }
  }, [vaultClient, params.vaultPubkey]);

  useEffect(() => {
    fetchVault();
  }, [fetchVault]);

  if (!vault || !vaultDriftUser) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <VaultOnChainInformation vault={vault} />

      <div className="w-full h-[1px] bg-gray-500 my-4" />

      <SectionHeader>Manager Actions</SectionHeader>
      <ManagerDeposit vault={vault} fetchVault={fetchVault} />
      <ManagerWithdraw vault={vault} fetchVault={fetchVault} />
      <ManagerApplyProfitShare vault={vault} />

      <div className="w-full h-[1px] bg-gray-500 my-4" />

      <SectionHeader>Database Actions</SectionHeader>
      <DatabaseActions vault={vault} />

      <div className="w-full h-[1px] bg-gray-500 my-4" />

      <SectionHeader>Whitelist Wallets</SectionHeader>
      <WhitelistWallet vault={vault} />

      <div className="w-full h-[1px] bg-gray-500 my-4" />

      <SectionHeader>Vault Updates</SectionHeader>
      <UpdateMarginTrading
        vault={vault}
        isMarginTradingEnabled={vaultDriftUser.isMarginTradingEnabled}
        fetchVault={fetchVault}
      />
      <UpdateVaultDelegate vault={vault} fetchVault={fetchVault} />
      <UpdateVault vault={vault} fetchVault={fetchVault} />
    </div>
  );
}
