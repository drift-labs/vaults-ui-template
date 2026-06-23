import { eq, desc } from "drizzle-orm";
import { PeriodApys, ApyReturnsLookup } from "@/types/vaults";
import { db } from "@/db";
import { SerializedVaultSnapshot, vault_snapshots } from "@/db/schema";
import {
  BigNum,
  BN,
  PERCENTAGE_PRECISION,
  PRICE_PRECISION,
  PRICE_PRECISION_EXP,
  PublicKey,
  QUOTE_PRECISION_EXP,
} from "@velocity-exchange/sdk";
import { VAULTS, UiVaultConfig } from "@/constants/vaults";
import { NextRequest, NextResponse } from "next/server";
import { Vault, VAULT_SHARES_PRECISION_EXP } from "@velocity-exchange/vaults-sdk";
import { getOraclePrice, setupClients } from "@/lib/api";
import { REDIS_KEYS } from "@/constants/redis";
import { kv } from "@vercel/kv";
import { getMaxDailyDrawdownFromHistory } from "@/lib/utils";
import dayjs from "dayjs";

const ONE_DAY_SECONDS = 24 * 60 * 60;
const SEVEN_DAYS_SECONDS = ONE_DAY_SECONDS * 7;
const THIRTY_DAYS_SECONDS = ONE_DAY_SECONDS * 30;
const NINETY_DAYS_SECONDS = ONE_DAY_SECONDS * 90;

const { driftClient, vaultClient, connection } = setupClients();

const fetchVaultSnapshots = async (vaultPubKeyString: string) => {
  return await db
    .select()
    .from(vault_snapshots)
    .where(eq(vault_snapshots.vault, vaultPubKeyString))
    .orderBy(desc(vault_snapshots.ts));
};

function findClosestSnapshot(
  snapshots: Array<SerializedVaultSnapshot>,
  targetTs: number,
) {
  // find snapshot of exact date
  const dateOfTargetTs = dayjs.unix(targetTs);
  const exactDateSnapshot = snapshots.find((snapshot) =>
    dayjs.unix(+snapshot.ts).isSame(dateOfTargetTs, "day"),
  );

  if (exactDateSnapshot) {
    return exactDateSnapshot;
  }

  // if cannot find exact date's snapshot, find closest snapshot
  return snapshots.reduce((closest, current) => {
    const currentDiff = Math.abs(parseInt(current.ts) - targetTs);
    const closestDiff = closest
      ? Math.abs(parseInt(closest.ts) - targetTs)
      : Infinity;
    return currentDiff < closestDiff ? current : closest;
  }, snapshots[0]);
}

// APY is annualized return with compounding, net of performance fee
// APY = (1 + grossReturn * (1 - perfFeePct))^(365/days) - 1 for positive returns
function calculateApy(
  startValue: number,
  endValue: number,
  daysElapsed: number,
  perfFeePct: number,
): number {
  if (!startValue || !endValue) return 0;
  const grossReturn = (endValue - startValue) / startValue;
  const netReturn =
    grossReturn > 0 ? grossReturn * (1 - perfFeePct) : grossReturn;
  const annualizedReturn = Math.pow(1 + netReturn, 365 / daysElapsed) - 1;
  return annualizedReturn;
}

function calcValuePerShare(
  vaultTotalShares: string,
  totalAccountValue: string,
  precisionExp: BN,
) {
  return +vaultTotalShares === 0
    ? BigNum.from(0, precisionExp)
    : new BigNum(totalAccountValue, precisionExp)
        .shift(VAULT_SHARES_PRECISION_EXP)
        .div(new BigNum(vaultTotalShares, VAULT_SHARES_PRECISION_EXP));
}

function fetchCurrentBaseValuePerShare(
  basePrecisionExp: BN,
  vaultAccountData: Vault,
  vaultTvlBase: BigNum,
) {
  return calcValuePerShare(
    vaultAccountData.totalShares.toString(),
    vaultTvlBase.toString(),
    basePrecisionExp,
  );
}

function calcApyForPeriod(
  snapshots: SerializedVaultSnapshot[],
  precisionExp: BN,
  now: number,
  period: number,
  performanceFeePct: number,
  valueFor1ShareAtEnd: BigNum,
  valueField: "totalAccountBaseValue" | "totalAccountQuoteValue",
) {
  const firstSnapshotInPeriod = findClosestSnapshot(snapshots, now - period);

  const valueFor1ShareAtStart = calcValuePerShare(
    firstSnapshotInPeriod.totalShares,
    firstSnapshotInPeriod[valueField],
    precisionExp,
  );

  const periodDifferenceSeconds = now - +firstSnapshotInPeriod.ts;

  const apy = calculateApy(
    valueFor1ShareAtStart.toNum(),
    valueFor1ShareAtEnd.toNum(),
    periodDifferenceSeconds / ONE_DAY_SECONDS,
    performanceFeePct,
  );

  return apy * 100; // convert to percentage
}

const calcApysForVault = (
  uiVaultConfig: UiVaultConfig,
  snapshots: SerializedVaultSnapshot[],
  basePrecisionExp: BN,
  vaultAccountData: Vault,
  vaultTvlBase: BigNum,
  currentOraclePrice: BigNum,
): PeriodApys => {
  if (snapshots.length === 0) {
    console.warn(`Vault ${uiVaultConfig.vaultPubkeyString} has no snapshots`);
    return {
      "7d": 0,
      "30d": 0,
      "90d": 0,
    };
  }

  const now = new Date().getTime() / 1000;

  const perfFeePct =
    vaultAccountData.profitShare / PERCENTAGE_PRECISION.toNumber();
  const isNotionalGrowthStrategy = uiVaultConfig.isNotionalGrowthStrategy;

  const baseValueFor1ShareAtEnd = fetchCurrentBaseValuePerShare(
    basePrecisionExp,
    vaultAccountData,
    vaultTvlBase,
  );
  const notionalValueFor1ShareAtEnd = baseValueFor1ShareAtEnd
    .mul(currentOraclePrice)
    .shift(basePrecisionExp.neg());

  const valueField = isNotionalGrowthStrategy
    ? "totalAccountQuoteValue"
    : "totalAccountBaseValue";
  const precisionExp = isNotionalGrowthStrategy
    ? PRICE_PRECISION_EXP
    : basePrecisionExp;
  const valueFor1ShareAtEnd = isNotionalGrowthStrategy
    ? notionalValueFor1ShareAtEnd
    : baseValueFor1ShareAtEnd;

  const apy7d = calcApyForPeriod(
    snapshots,
    precisionExp,
    now,
    SEVEN_DAYS_SECONDS,
    perfFeePct,
    valueFor1ShareAtEnd,
    valueField,
  );
  const apy30d = calcApyForPeriod(
    snapshots,
    precisionExp,
    now,
    THIRTY_DAYS_SECONDS,
    perfFeePct,
    valueFor1ShareAtEnd,
    valueField,
  );
  const apy90d = calcApyForPeriod(
    snapshots,
    precisionExp,
    now,
    NINETY_DAYS_SECONDS,
    perfFeePct,
    valueFor1ShareAtEnd,
    valueField,
  );

  return {
    "7d": apy7d,
    "30d": apy30d,
    "90d": apy90d,
  };
};

const calcApyForAllVaults = async () => {
  const vaultApysLookup: ApyReturnsLookup = {};

  const vaultsToCalcApy = VAULTS;

  for (const uiVaultConfig of vaultsToCalcApy) {
    const basePrecisionExp = uiVaultConfig.market.precisionExp;
    const vaultPubKey = new PublicKey(uiVaultConfig.vaultPubkeyString);

    const [vaultSnapshots, vaultAccountData] = await Promise.all([
      fetchVaultSnapshots(uiVaultConfig.vaultPubkeyString),
      vaultClient.getVault(vaultPubKey),
    ]);

    const [tvlQuote, currentOraclePrice] = await Promise.all([
      vaultClient.calculateVaultEquity({
        vault: vaultAccountData,
      }),
      getOraclePrice(
        uiVaultConfig.market.marketIndex,
        connection,
        driftClient.program,
      ),
    ]);

    const vaultTvlBase = BigNum.from(tvlQuote, QUOTE_PRECISION_EXP)
      .mul(PRICE_PRECISION)
      .div(currentOraclePrice)
      .shiftTo(basePrecisionExp);

    const currentOraclePriceBigNum = BigNum.from(
      currentOraclePrice,
      PRICE_PRECISION_EXP,
    );

    const apys = calcApysForVault(
      uiVaultConfig,
      vaultSnapshots,
      basePrecisionExp,
      vaultAccountData,
      vaultTvlBase,
      currentOraclePriceBigNum,
    );
    const maxDrawdownPct = getMaxDailyDrawdownFromHistory(
      vaultSnapshots,
      uiVaultConfig.isNotionalGrowthStrategy
        ? "totalAccountQuoteValue"
        : "totalAccountBaseValue",
    );

    vaultApysLookup[uiVaultConfig.vaultPubkeyString] = {
      apys,
      maxDrawdownPct: maxDrawdownPct * 100, // convert to percentage
      numOfVaultSnapshots: vaultSnapshots.length,
    };
  }

  return vaultApysLookup;
};

export const GET = async (request: NextRequest) => {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", {
      status: 401,
    });
  }

  try {
    await driftClient.subscribe();

    const vaultApysLookup = await calcApyForAllVaults();

    const apyReturnsKey = REDIS_KEYS.periodApys;
    await kv.hset(apyReturnsKey, vaultApysLookup);

    return NextResponse.json({ data: vaultApysLookup });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err }, { status: 500 });
  }
};
