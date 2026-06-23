import toast from "react-hot-toast";
import {
  VaultDepositorAccount,
  Vault,
  VaultClient,
  VaultDepositor,
  VAULT_PROGRAM_ID,
  WithdrawUnit,
} from "@velocity-exchange/vaults-sdk";
import { BN, DriftClient } from "@velocity-exchange/sdk";
import { PublicKey, TransactionSignature } from "@solana/web3.js";

export const depositVault = async (
  driftClient: DriftClient,
  vault: Vault,
  vaultClient: VaultClient,
  amount: BN,
  vaultDepositor?: VaultDepositor,
): Promise<TransactionSignature | undefined> => {
  if (!vaultDepositor && vault.permissioned) {
    toast.error("You are not authorized to deposit into this vault");
    return undefined;
  }

  const authority = driftClient.authority;
  const toastId = "depositVault";

  try {
    toast.loading("Awaiting transaction confirmation", {
      id: toastId,
    });

    let txSig: TransactionSignature;

    if (!vaultDepositor) {
      if (!authority) {
        toast.error("Please connect your wallet to deposit into this vault");
        return undefined;
      }

      const vaultDepositorPubkey = VaultDepositorAccount.getAddressSync(
        VAULT_PROGRAM_ID,
        vault.pubkey,
        authority,
      );

      txSig = await vaultClient.deposit(vaultDepositorPubkey, amount, {
        authority,
        vault: vault.pubkey,
      });
    } else {
      txSig = await vaultClient.deposit(
        vaultDepositor.pubkey,
        amount,
        undefined,
      );
    }

    toast.success("Deposit successful!");

    return txSig;
  } catch (e) {
    console.error(e);
    toast.error("There was an error depositing into this vault");
    return undefined;
  }
};

export const requestVaultWithdrawal = async (
  vaultDepositorPubKey: PublicKey,
  userSharesPercentage: BN,
  vaultClient: VaultClient,
): Promise<TransactionSignature | undefined> => {
  if (!vaultClient) {
    console.error("No vault client provided");
    return undefined;
  }

  try {
    toast.loading("Awaiting transaction confirmation");

    const txSig = await vaultClient.requestWithdraw(
      vaultDepositorPubKey,
      userSharesPercentage,
      WithdrawUnit.SHARES_PERCENT,
    );

    toast.success("Withdrawal request successful");

    return txSig;
  } catch (err) {
    console.error(err);
    toast.error("There was an error requesting a withdrawal from this vault");
    return undefined;
  }
};

export const cancelVaultWithdrawalRequest = async (
  vaultDepositorPubKey: PublicKey,
  vaultClient: VaultClient,
): Promise<TransactionSignature | undefined> => {
  if (!vaultClient || !vaultDepositorPubKey) {
    console.error("No vault client or vault depositor pubkey provided");
    return undefined;
  }

  toast.loading("Awaiting transaction confirmation");

  try {
    const txSig = await vaultClient.cancelRequestWithdraw(vaultDepositorPubKey);

    toast.success("Withdrawal request canceled");

    return txSig;
  } catch (err) {
    console.error(err);
    toast.error(
      "There was an error canceling a withdrawal request from this vault",
    );
    return undefined;
  }
};

export const withdrawFromVault = async (
  vaultDepositor: VaultDepositor,
  vaultClient: VaultClient,
): Promise<TransactionSignature | undefined> => {
  if (!vaultClient || !vaultDepositor) {
    console.error("No vault client or vault depositor provided");
    return undefined;
  }

  try {
    toast.loading("Awaiting transaction confirmation");

    const txSig = await vaultClient.withdraw(vaultDepositor.pubkey);

    toast.success("Withdrawal successful");

    return txSig;
  } catch (err) {
    console.error(err);
    toast.error("There was an error withdrawing from this vault");
    return undefined;
  }
};
