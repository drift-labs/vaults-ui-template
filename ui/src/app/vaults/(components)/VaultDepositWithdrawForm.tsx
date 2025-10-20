import { useState } from "react";
import { twMerge } from "tailwind-merge";
import { COMMON_UI_UTILS } from "@drift/common";
import {
  BigNum,
  PERCENTAGE_PRECISION,
  PERCENTAGE_PRECISION_EXP,
  BN,
  ZERO,
} from "@drift-labs/sdk";
import { Vault, VaultDepositor } from "@drift-labs/vaults-sdk";
import {
  getWithdrawalState,
  redeemPeriodToString,
  WithdrawalState,
} from "@/lib/vault";
import { Alert } from "@/components/ui/alert";
import dayjs from "dayjs";
import { getVaultDepositorBalance } from "@/lib/vault";
import { MarketIcon } from "@/components/MarketIcon";
import { Typo, useCommonDriftStore, useWallet } from "@drift-labs/react";
import { Button } from "@/components/ui/button";
import { UiVaultConfig } from "@/constants/vaults";
import useAppStore from "@/stores/app/useAppStore";
import useSPLTokenBalance from "@/hooks/useSplTokenBalance";
import {
  cancelVaultWithdrawalRequest,
  requestVaultWithdrawal,
  withdrawFromVault,
  depositVault,
} from "@/actions/vaults";
import { Input } from "@/components/ui/input";

type VaultDepositWithdrawFormProps = {
  uiVaultConfig: Pick<UiVaultConfig, "vaultPubkeyString" | "market">;
  vaultDepositorAccountData: VaultDepositor | undefined;
  isVaultDepositorLoaded: boolean;
  vaultAccountData: Vault | undefined;
  syncVaultStats: () => void;
};

export const VaultDepositWithdrawForm = (
  props: VaultDepositWithdrawFormProps,
) => {
  const depositAssetConfig = props.uiVaultConfig.market;

  const vaultStats = useAppStore(
    (s) => s.vaultsStats[props.uiVaultConfig.vaultPubkeyString],
  );
  const vaultClient = useAppStore((s) => s.vaultClient);
  const driftClient = useCommonDriftStore((s) => s.driftClient.client);
  const isWalletConnected = useWallet()?.connected;
  const syncVaultStats = props.syncVaultStats;

  const [formType, setFormType] = useState<"deposit" | "withdraw">("deposit");
  const depositAssetWalletBalance = useSPLTokenBalance(depositAssetConfig.mint);

  const [inputAmount, setInputAmount] = useState("");

  const isDeposit = formType === "deposit";
  const redemptionPeriod = props.vaultAccountData?.redeemPeriod;

  const currentUserVaultBaseBalanceAfterFees = getCurrentUserVaultBalance();
  const afterInputAmountUserVaultBalance =
    getAfterInputAmountUserVaultBalance();
  const maxAmount = getMaxAmount();
  const { withdrawalState } = getWithdrawalState(
    props.vaultDepositorAccountData,
    props.vaultAccountData,
  );

  const isVaultDepositorWhitelisted = getIsVaultDepositorWhitelisted();
  const isInputAmountLessThanMinDepositAmount =
    getIsInputAmountLessThanMinDepositAmount();
  const isCtaDisabled = getIsCtaDisabled();
  const withdrawalCtaState = getWithdrawalFormState();
  const withdrawalBaseAmount = getWithdrawalBaseAmount();
  const tsUntilWithdrawal = getTsUntilWithdrawal();
  const alertDetails = getAlertDetails();

  function getIsInputAmountLessThanMinDepositAmount() {
    return (
      props.vaultAccountData?.minDepositAmount.gtn(0) &&
      !isNaN(+inputAmount) &&
      +inputAmount > 0 &&
      BigNum.fromPrint(inputAmount, depositAssetConfig.precisionExp).val.lt(
        props.vaultAccountData.minDepositAmount,
      )
    );
  }

  function getIsVaultDepositorWhitelisted() {
    if (!props.vaultAccountData?.permissioned) return true;

    if (props.isVaultDepositorLoaded && !props.vaultDepositorAccountData) {
      return false;
    }

    return true;
  }

  function getCurrentUserVaultBalance() {
    if (
      !props.vaultAccountData ||
      !props.vaultDepositorAccountData ||
      !vaultStats
    ) {
      return BigNum.from(0, depositAssetConfig.precisionExp);
    }

    return getVaultDepositorBalance(
      props.vaultDepositorAccountData,
      props.vaultAccountData,
      vaultStats.tvlBase,
      depositAssetConfig.precisionExp,
      true,
    );
  }

  function getMaxAmount() {
    if (isDeposit) {
      if (!props.vaultAccountData || !vaultStats)
        return BigNum.from(0, depositAssetConfig.precisionExp);

      // 99.99% of the capacity to allow for tvlBase fluctuations - for UX improvements where user can fail regularly when attempting to deposit the exact leftover amount
      const bufferedCapacity = props.vaultAccountData.maxTokens
        .muln(9999)
        .divn(10000);

      const capacityLeftover = BN.max(
        bufferedCapacity.sub(vaultStats.tvlBase.val),
        ZERO,
      );

      const maxAmount = BN.min(
        capacityLeftover,
        BigNum.fromPrint(
          depositAssetWalletBalance.toString(),
          depositAssetConfig.precisionExp,
        ).val,
      );
      const safeMaxAmount = BN.max(maxAmount, ZERO);

      return BigNum.from(safeMaxAmount, depositAssetConfig.precisionExp);
    } else {
      return currentUserVaultBaseBalanceAfterFees;
    }
  }

  function getAfterInputAmountUserVaultBalance() {
    const inputAmountBigNum = BigNum.fromPrint(
      inputAmount,
      depositAssetConfig.precisionExp,
    );

    if (isDeposit) {
      return currentUserVaultBaseBalanceAfterFees.add(inputAmountBigNum);
    } else {
      return currentUserVaultBaseBalanceAfterFees.sub(inputAmountBigNum);
    }
  }

  function getWithdrawalFormState() {
    if (withdrawalState === WithdrawalState.UnRequested) {
      return {
        text: "Request Withdrawal",
        className: "",
        displayInput: true,
      };
    } else if (withdrawalState === WithdrawalState.Requested) {
      return {
        text: "Cancel Request",
        className: "",
        displayInput: false,
      };
    } else {
      return {
        text: "Confirm Withdrawal",
        className: "",
        displayInput: false,
      };
    }
  }

  /**
   * The amount of base value that can be withdrawn is the smaller of the current base value of the request
   * or the base value of the withdrawal at the time of the request.
   */
  function getWithdrawalBaseAmount() {
    const zeroBaseBigNum = BigNum.from(0, depositAssetConfig.precisionExp);

    if (withdrawalState === WithdrawalState.UnRequested) {
      return zeroBaseBigNum;
    } else {
      if (
        !props.vaultAccountData ||
        !vaultStats ||
        !props.vaultDepositorAccountData
      ) {
        return zeroBaseBigNum;
      }

      const totalShares = props.vaultAccountData.totalShares;
      const currentBaseValueOfRequest =
        props.vaultDepositorAccountData.lastWithdrawRequest.shares
          .mul(vaultStats.tvlBase.val)
          .div(totalShares);

      const baseValueOfWithdrawalAtRequestTime = new BN(
        props.vaultDepositorAccountData.lastWithdrawRequest.value,
      );

      const smallerValue = BN.min(
        baseValueOfWithdrawalAtRequestTime,
        currentBaseValueOfRequest,
      );

      return BigNum.from(smallerValue, depositAssetConfig.precisionExp);
    }
  }

  function getTsUntilWithdrawal() {
    const withdrawalAvailableTs =
      (props.vaultDepositorAccountData?.lastWithdrawRequest.ts.toNumber() ??
        0) +
      (props.vaultAccountData?.redeemPeriod.toNumber() ?? 0) -
      dayjs().unix();
    return withdrawalAvailableTs;
  }

  function getIsCtaDisabled() {
    if (!props.isVaultDepositorLoaded) return true;

    if (!isVaultDepositorWhitelisted) return true;

    if (
      withdrawalState === WithdrawalState.UnRequested &&
      formType === "deposit" &&
      isInputAmountLessThanMinDepositAmount
    ) {
      return true;
    }

    if (
      withdrawalState === WithdrawalState.Requested ||
      withdrawalState === WithdrawalState.AvailableForWithdrawal
    )
      return false;

    if (+inputAmount === 0) return true;

    return false;
  }

  function getAlertDetails(): {
    message: string;
  } | null {
    if (!isVaultDepositorWhitelisted && props.isVaultDepositorLoaded) {
      return {
        message: "You are not whitelisted for this vault",
      };
    }

    if (isDeposit) {
      if (withdrawalState !== WithdrawalState.UnRequested) {
        return {
          message: `Deposit are disabled while a withdrawal request is in progress`,
        };
      }

      if (isInputAmountLessThanMinDepositAmount && props.vaultAccountData) {
        return {
          message: `The minimum deposit amount is ${BigNum.from(
            props.vaultAccountData.minDepositAmount,
            depositAssetConfig.precisionExp,
          ).prettyPrint()} ${depositAssetConfig.symbol}`,
        };
      }
    } else {
      if (withdrawalState === WithdrawalState.Requested) {
        return {
          message: `${withdrawalBaseAmount.prettyPrint()} ${
            depositAssetConfig.symbol
          } is available to withdraw in ${redeemPeriodToString(
            tsUntilWithdrawal,
          )}.`,
        };
      } else if (withdrawalState === WithdrawalState.AvailableForWithdrawal) {
        return {
          message: `${withdrawalBaseAmount.prettyPrint()} ${
            depositAssetConfig.symbol
          } is available for withdrawal`,
        };
      }
    }

    return null;
  }

  const handleOnValueChange = COMMON_UI_UTILS.formatTokenInputCurried(
    setInputAmount,
    depositAssetConfig,
  );

  const handleOnSubmit = async () => {
    if (isCtaDisabled) return;

    const actionCallback = async () => {
      if (!driftClient || !props.vaultAccountData || !vaultClient) return;

      if (isDeposit) {
        await depositVault(
          driftClient,
          props.vaultAccountData,
          vaultClient,
          BigNum.fromPrint(inputAmount, depositAssetConfig.precisionExp).val,
          props.vaultDepositorAccountData,
        );
      } else {
        if (!props.vaultDepositorAccountData) return;

        if (withdrawalState === WithdrawalState.UnRequested) {
          const inputAmountBN = BigNum.fromPrint(
            inputAmount,
            depositAssetConfig.precisionExp,
          );
          const isMaxWithdrawal = inputAmountBN.eq(
            currentUserVaultBaseBalanceAfterFees,
          );
          const pctOfSharesToWithdraw = isMaxWithdrawal
            ? PERCENTAGE_PRECISION
            : inputAmountBN
                .shift(PERCENTAGE_PRECISION_EXP)
                .div(currentUserVaultBaseBalanceAfterFees).val;

          await requestVaultWithdrawal(
            props.vaultDepositorAccountData.pubkey,
            pctOfSharesToWithdraw,
            vaultClient,
          );
        } else if (withdrawalState === WithdrawalState.Requested) {
          await cancelVaultWithdrawalRequest(
            props.vaultDepositorAccountData.pubkey,
            vaultClient,
          );
        } else {
          await withdrawFromVault(props.vaultDepositorAccountData, vaultClient);
        }
      }

      setInputAmount("");

      // allow time for action to be processed on the blockchain
      setTimeout(() => {
        syncVaultStats();
      }, 200);
    };

    actionCallback();
  };

  return (
    <div className="flex flex-col w-full p-4 rounded-[3px] bg-container-bg grow sm:grow-0 max-w-[400px] border ">
      <div className="flex gap-1 items-center">
        <Button
          onClick={() => setFormType("deposit")}
          className={twMerge(
            "flex-1",
            formType !== "deposit" && "text-black bg-transparent",
          )}
        >
          Deposit
        </Button>
        <Button
          onClick={() => setFormType("withdraw")}
          className={twMerge(
            "flex-1",
            formType !== "withdraw" && "text-black bg-transparent",
          )}
        >
          Withdraw
        </Button>
      </div>

      <div className="flex flex-col gap-4 mt-4">
        <Typo.B5 className="text-text-secondary">
          {isDeposit ? (
            <>
              Deposited funds are subject to a{" "}
              {redeemPeriodToString(redemptionPeriod?.toNumber())} redemption
              period.
            </>
          ) : (
            <>
              After the {redeemPeriodToString(redemptionPeriod?.toNumber())}{" "}
              redemption period, your funds can be withdrawn to your wallet.
              <br />
              <br />
              The maximum withdrawal amount is based on share value at request
              time, though the final amount may be lower.
            </>
          )}
        </Typo.B5>

        {(isDeposit || withdrawalCtaState.displayInput) && (
          <div className="flex flex-col gap-2">
            <div
              className="flex justify-between items-center w-full"
              onClick={() => {
                handleOnValueChange(maxAmount.toNum().toString());
              }}
            >
              <Typo.T5 className="text-text-label">Amount</Typo.T5>

              {isWalletConnected && (
                <div className="flex gap-1 items-center bg-gray-200 rounded-sm">
                  {/* The maximum amount is after fees, while the final amount received may differ from the amount requested. */}
                  <Typo.T5 className="flex gap-1 items-center px-1 rounded-sm cursor-pointer bg-button-secondary-bg text-text-secondary">
                    <span>Max:</span>
                    <span>
                      {maxAmount.prettyPrint()} {depositAssetConfig.symbol}
                    </span>
                  </Typo.T5>
                </div>
              )}
            </div>

            <div className="flex gap-2 items-center w-full bg-input-bg">
              {/** Collateral Selector */}
              <div className="flex gap-2 items-center w-full">
                <div className="flex gap-1 items-center shrink-0">
                  <MarketIcon
                    marketSymbol={depositAssetConfig.symbol}
                    className="w-4 h-4"
                  />
                  <Typo.T4>{depositAssetConfig.symbol}</Typo.T4>
                </div>

                <Input
                  type="number"
                  className="w-full max-w-full text-right bg-transparent typo-t1"
                  placeholder="0.0"
                  value={inputAmount}
                  onChange={(e) => handleOnValueChange(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4 mt-1">
          <div className="flex gap-1 items-center">
            <div className="flex gap-1 justify-between items-center w-full">
              <span>Balance</span>

              <div className="flex gap-1 items-center">
                <MarketIcon
                  marketSymbol={depositAssetConfig.symbol}
                  className="w-4 h-4"
                />
                <span>
                  {currentUserVaultBaseBalanceAfterFees.prettyPrint()}
                  {" -> "}
                  {afterInputAmountUserVaultBalance.prettyPrint()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/** Alerts */}
      <div className="grow h-[100px] w-full mt-2 mb-5 sm:grow-0 flex items-end">
        {alertDetails && (
          <Alert className="w-full rounded typo-t5 text-text-default">
            {alertDetails.message}
          </Alert>
        )}
      </div>

      {isWalletConnected ? (
        <Button
          className={twMerge(
            "w-full normal-case",
            !isDeposit && withdrawalCtaState.className,
          )}
          onClick={handleOnSubmit}
          disabled={isCtaDisabled}
        >
          {isDeposit ? "Confirm Deposit" : withdrawalCtaState.text}
        </Button>
      ) : (
        <div className="flex justify-center items-center w-full">
          Connect Wallet
        </div>
      )}
    </div>
  );
};
