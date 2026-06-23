import { UiVaultConfig, VAULTS } from "@/constants/vaults";
import { SerializedVaultSnapshot } from "@/db/schema";
import { PublicKey } from "@solana/web3.js";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { BN, PERCENTAGE_PRECISION, ZERO } from "@velocity-exchange/sdk";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getUiVaultConfig = (
  vaultPubKey: PublicKey | string,
): UiVaultConfig | undefined => {
  const vault = VAULTS.find(
    (vault) => vault.vaultPubkeyString === vaultPubKey.toString(),
  );
  return vault;
};

export const getMaxDailyDrawdownFromHistory = (
  vaultSnapshots: Pick<
    SerializedVaultSnapshot,
    "ts" | "totalAccountBaseValue" | "netDeposits" | "totalAccountQuoteValue"
  >[],
  valueField: "totalAccountBaseValue" | "totalAccountQuoteValue",
) => {
  const formattedSnapshots = vaultSnapshots.map((snapshot) => {
    const basePnl = new BN(snapshot.totalAccountBaseValue).sub(
      new BN(snapshot.netDeposits),
    );

    return {
      ts: +snapshot.ts,
      basePnl,
      tvlBase: new BN(snapshot[valueField]),
    };
  });

  const sortedSnapshots = formattedSnapshots.sort((a, b) => a.ts - b.ts);
  let maxDrawdown = 0;

  for (let i = 0; i < sortedSnapshots.length - 1; i++) {
    const currentDayAllTimeDayPnl = sortedSnapshots[i].basePnl;
    const previousDayAllTimeDayPnl = sortedSnapshots[i - 1]?.basePnl ?? ZERO;

    if (currentDayAllTimeDayPnl > previousDayAllTimeDayPnl) continue; // made profit for that day; no drawdown

    const currentDayPnl = currentDayAllTimeDayPnl.sub(previousDayAllTimeDayPnl);
    const currentDayTotalAccValue = sortedSnapshots[i].tvlBase;

    if (currentDayTotalAccValue.eqn(0)) {
      continue;
    }

    const drawdown =
      currentDayPnl
        .mul(PERCENTAGE_PRECISION)
        .div(currentDayTotalAccValue.sub(currentDayPnl))
        .toNumber() / PERCENTAGE_PRECISION.toNumber();

    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
};
