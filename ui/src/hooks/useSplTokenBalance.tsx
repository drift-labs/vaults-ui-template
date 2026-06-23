import { useCommonDriftStore } from "@velocity-exchange/react";
import { PublicKey } from "@velocity-exchange/sdk";
import { useEffect, useRef, useState } from "react";

export default function useSPLTokenBalance(
  tokenMintAddress: string | PublicKey,
  authority?: PublicKey,
) {
  const currentAuthority = useCommonDriftStore((s) => s.authority);
  const connection = useCommonDriftStore((s) => s.connection);

  const [balance, setBalance] = useState(0);

  const tokenAccountListener = useRef<number | undefined>(undefined);

  useEffect(() => {
    tokenAccountListener.current &&
      connection?.removeAccountChangeListener(tokenAccountListener.current);
    getBalance();
  }, [tokenMintAddress, authority, connection, currentAuthority]);

  const getBalance = async () => {
    let tokenAccountOwner = authority ? authority : currentAuthority;

    if (!connection || !tokenAccountOwner) return;

    const { value: tokenAccounts } =
      await connection.getParsedTokenAccountsByOwner(tokenAccountOwner, {
        mint: new PublicKey(tokenMintAddress),
      });
    const tokenAccount = tokenAccounts[0];

    if (!tokenAccount) return;

    const newBalance =
      tokenAccount.account.data.parsed.info.tokenAmount.uiAmount;
    setBalance(newBalance);

    if (!tokenAccountListener.current) {
      tokenAccountListener.current = connection.onAccountChange(
        tokenAccount.pubkey,
        () => {
          getBalance();
        },
        "confirmed",
      );
    }
  };

  return balance;
}
