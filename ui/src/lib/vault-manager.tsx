import { SOLANA_EXPLORER_URL } from "@/constants/misc";
import { VaultClient, VaultParams } from "@velocity-exchange/vaults-sdk";
import { PublicKey } from "@solana/web3.js";
import toast from "react-hot-toast";

/**
 * Creates a new vault, with the connected wallet as the manager.
 * @param vaultClient - The vault client
 * @param vaultParams - The vault params
 * @returns The vault
 */
export const createVault = async (
  vaultClient: VaultClient,
  vaultParams: VaultParams,
) => {
  const txSig = await vaultClient.initializeVault(vaultParams, {
    cuLimit: 120_000,
    cuPriceMicroLamports: 300_000,
  });
  toast.success(
    <div className="flex flex-col gap-1">
      <span>Vault Created</span>
      <a
        href={`${SOLANA_EXPLORER_URL}/tx/${txSig}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 underline"
      >
        View Transaction
      </a>
    </div>,
  );
  return txSig;
};

export const fetchAllVaultsOfManager = async (
  vaultClient: VaultClient,
  manager: PublicKey,
) => {
  const vaultAccountDiscriminator =
    vaultClient.program.coder.accounts.memcmp("Vault");
  const result = await vaultClient.driftClient.connection.getProgramAccounts(
    vaultClient.program.programId,
    {
      filters: [
        {
          memcmp: vaultAccountDiscriminator,
        },
        {
          memcmp: {
            offset: 72, // 8 -> account discriminator + 32 -> vault name + 32 -> vault pubkey
            bytes: manager.toBase58(),
            encoding: "base58",
          },
        },
      ],
    },
  );

  const formattedVaults = result.map((res) => {
    return vaultClient.program.account.vault.coder.accounts.decode(
      "vault",
      res.account.data,
    );
  });

  return formattedVaults;
};
