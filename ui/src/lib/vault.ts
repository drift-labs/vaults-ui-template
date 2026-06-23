import {
  Vault,
  VAULT_SHARES_PRECISION_EXP,
  VaultDepositor,
} from "@velocity-exchange/vaults-sdk";
import {
  BigNum,
  BN,
  PERCENTAGE_PRECISION,
  QUOTE_PRECISION_EXP,
} from "@velocity-exchange/sdk";
import { SerializedVaultDepositorRecord } from "@/db/schema";
import invariant from "tiny-invariant";
import dayjs from "dayjs";

/**
 * Returns the balance of a vault depositor, after fees if `afterFees` is true.
 */
export const getVaultDepositorBalance = (
  vaultDepositorAccountData:
    | (Pick<VaultDepositor, "vaultShares"> &
        Partial<
          Pick<VaultDepositor, "cumulativeProfitShareAmount" | "netDeposits">
        >)
    | undefined,
  vaultAccountData: Pick<Vault, "totalShares" | "profitShare"> | undefined,
  vaultTvlBase: BigNum | undefined,
  depositAssetPrecisionExp: BN,
  afterFees = false,
) => {
  if (
    !vaultDepositorAccountData ||
    !vaultAccountData ||
    !vaultTvlBase ||
    vaultAccountData.totalShares?.eqn(0)
  ) {
    return BigNum.from(0, depositAssetPrecisionExp);
  }

  const userVaultShares = BigNum.from(
    vaultDepositorAccountData.vaultShares,
    VAULT_SHARES_PRECISION_EXP,
  );
  const totalVaultShares = BigNum.from(
    vaultAccountData.totalShares,
    VAULT_SHARES_PRECISION_EXP,
  );

  const userBalanceBaseValue = userVaultShares
    .mul(vaultTvlBase)
    .div(totalVaultShares)
    .shiftTo(depositAssetPrecisionExp);

  if (afterFees) {
    invariant(
      vaultDepositorAccountData.cumulativeProfitShareAmount,
      "Need to provide cumulativeProfitShareAmount to calculate balance after fees",
    );
    invariant(
      vaultDepositorAccountData.netDeposits,
      "Need to provide netDeposits to calculate balance after fees",
    );

    const highWaterMark =
      vaultDepositorAccountData.cumulativeProfitShareAmount.add(
        vaultDepositorAccountData.netDeposits,
      );

    const taxableGains = userBalanceBaseValue.sub(
      BigNum.from(highWaterMark, depositAssetPrecisionExp),
    );

    if (!taxableGains.gtZero()) {
      return userBalanceBaseValue;
    }

    const feesPayable = taxableGains.scale(
      new BN(vaultAccountData.profitShare),
      PERCENTAGE_PRECISION,
    );
    const userBalanceAfterFees = userBalanceBaseValue.sub(feesPayable);

    return userBalanceAfterFees;
  }

  return userBalanceBaseValue;
};

export const getVaultDepositorNotionalNetDeposits = (
  vaultDepositorHistory: SerializedVaultDepositorRecord[],
) => {
  const notionalNetDeposits = vaultDepositorHistory.reduce(
    (acc, record) => {
      const notionalBigNum = BigNum.from(
        record.notionalValue,
        QUOTE_PRECISION_EXP,
      );

      if (record.action === "deposit") {
        return acc.add(notionalBigNum);
      } else if (record.action === "withdraw") {
        return acc.sub(notionalBigNum);
      } else {
        return acc;
      }
    },
    BigNum.from(0, QUOTE_PRECISION_EXP),
  );

  return notionalNetDeposits;
};

export enum WithdrawalState {
  /**
   * No withdrawal request has been made
   */
  UnRequested,
  /**
   * A withdrawal request has been made but not yet available
   */
  Requested,
  /**
   * A withdrawal request has been made and is available
   */
  AvailableForWithdrawal,
}

export const getWithdrawalState = (
  vaultDepositorAccountData: VaultDepositor | undefined,
  vaultAccountData: Vault | undefined,
) => {
  const withdrawalAvailableTs =
    (vaultDepositorAccountData?.lastWithdrawRequest.ts.toNumber() ?? 0) +
    (vaultAccountData?.redeemPeriod.toNumber() ?? 0);
  const lastRequestedShares =
    vaultDepositorAccountData?.lastWithdrawRequest.shares ?? new BN(0);

  const hasRequestedWithdrawal = lastRequestedShares.toNumber() > 0;
  const isBeforeWithdrawalAvailableDate = dayjs().isBefore(
    dayjs.unix(withdrawalAvailableTs),
  );

  const withdrawalState = deriveWithdrawalState();

  const isFullWithdrawal = lastRequestedShares.eq(
    vaultDepositorAccountData?.vaultShares ?? new BN(0),
  );
  const isWithdrawalInProgress =
    withdrawalState !== WithdrawalState.UnRequested;

  // update withdrawal state

  function deriveWithdrawalState() {
    if (hasRequestedWithdrawal) {
      if (isBeforeWithdrawalAvailableDate) {
        return WithdrawalState.Requested;
      } else {
        return WithdrawalState.AvailableForWithdrawal;
      }
    } else {
      return WithdrawalState.UnRequested;
    }
  }

  return { withdrawalState, isFullWithdrawal, isWithdrawalInProgress };
};

export const redeemPeriodToString = (seconds = 0) => {
  const totalHours = Math.floor(seconds / 60 / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  let mins = 0;

  if (seconds % (60 * 60) !== 0) {
    mins = Math.floor((seconds % (60 * 60)) / 60);
  }

  if (totalHours < 1) {
    return `${mins} mins`;
  } else if (totalHours < 24) {
    return `${totalHours} hours${mins > 0 ? ` ${mins} mins` : ""}`;
  } else {
    return `${days} day${days > 1 ? "s" : ""}${
      hours > 0 ? ` ${hours} hours` : ""
    }${mins > 0 ? ` ${mins} mins` : ""}`;
  }
};
