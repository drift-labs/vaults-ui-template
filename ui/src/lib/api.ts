import {
  BigNum,
  BN,
  BulkAccountLoader,
  DRIFT_PROGRAM_ID,
  DriftClient,
  DriftClientConfig,
  getMarketsAndOraclesForSubscription,
  getOracleClient,
  PRICE_PRECISION,
  PRICE_PRECISION_EXP,
  PublicKey,
  SpotMarkets,
} from "@drift-labs/sdk";
import { Connection } from "@solana/web3.js";
import { COMMON_UI_UTILS, USDC_SPOT_MARKET_INDEX } from "@drift/common";
import { getVaultClient } from "@drift-labs/vaults-sdk";
import axios, { AxiosResponse } from "axios";

const CLUSTER = "mainnet-beta";

/**
 * Sets up mainnet DriftClient and VaultClient for use in API routes.
 */
export const setupClients = (authority?: PublicKey) => {
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_OVERRIDE;

  if (!rpcUrl) {
    throw new Error("NEXT_PUBLIC_RPC_OVERRIDE is not set");
  }

  const connection = new Connection(rpcUrl, "finalized");
  const dummyWallet = COMMON_UI_UTILS.createPlaceholderIWallet(authority);

  const accountLoader = new BulkAccountLoader(connection, "finalized", 0); // we don't want to poll for updates

  const { oracleInfos, perpMarketIndexes, spotMarketIndexes } =
    getMarketsAndOraclesForSubscription(CLUSTER);
  const vaultDriftClientConfig: DriftClientConfig = {
    connection: connection,
    wallet: dummyWallet,
    programID: new PublicKey(DRIFT_PROGRAM_ID),
    env: CLUSTER,
    txVersion: 0,
    userStats: false,
    perpMarketIndexes: perpMarketIndexes,
    spotMarketIndexes: spotMarketIndexes,
    oracleInfos: oracleInfos,
    accountSubscription: {
      type: "polling",
      accountLoader: accountLoader,
    },
  };

  const driftClient = new DriftClient(vaultDriftClientConfig);

  const vaultClient = getVaultClient(connection, dummyWallet, driftClient);

  return {
    driftClient,
    vaultClient,
    connection,
    accountLoader,
  };
};

export const getSpotMarketConfig = (spotMarketIndex: number) => {
  const spotMarket = SpotMarkets[CLUSTER].find(
    (market) => market.marketIndex === spotMarketIndex,
  );

  if (!spotMarket)
    throw new Error(
      "Spot market not found for market index " + spotMarketIndex,
    );

  return spotMarket;
};

export const getHistoricalPriceFromPyth = async (
  timestamp: number,
  marketIndex: number,
): Promise<BigNum> => {
  if (marketIndex === 0) return BigNum.fromPrint("1", PRICE_PRECISION_EXP); // if market is USDC, return $1

  const MISSING_ORACLE_PRICE = BigNum.zero(PRICE_PRECISION_EXP);

  const priceFeedId = getSpotMarketConfig(marketIndex).pythFeedId;

  if (!priceFeedId) {
    console.error("Price feed ID not found for market index " + marketIndex);
    return MISSING_ORACLE_PRICE;
  }

  const fetchPythBenchmarkPrice = async (ts: number) => {
    return await axios.get(
      `https://benchmarks.pyth.network/v1/updates/price/${ts}?${new URLSearchParams(
        {
          ids: priceFeedId,
        },
      )}`,
    );
  };

  let res: AxiosResponse<any, any> | undefined = undefined;

  try {
    res = await fetchPythBenchmarkPrice(timestamp);
  } catch (err) {
    if ((err as any).response?.status === 404) {
      // attempt once more with a 30 second delay in timestamp provided
      console.log("attempting to fetch price with 30 second timestamp delay");
      res = await fetchPythBenchmarkPrice(timestamp + 30);
    } else if ((err as any).response?.status === 429) {
      console.log("hit Pyth rate limits");
      const retryAfter = (err as any).response.headers["retry-after"];
      await new Promise((resolve) =>
        setTimeout(resolve, retryAfter * 1000 + 1000),
      );

      res = await fetchPythBenchmarkPrice(timestamp);
    }
  }

  if (!res) {
    console.error("Failed to fetch price from Pyth");
    return MISSING_ORACLE_PRICE;
  }

  const exponent = Math.abs(res.data.parsed[0].price.expo) as number;

  return BigNum.from(
    new BN(res.data.parsed[0].price.price as string),
    exponent,
  );
};

export const getOraclePrice = async (
  spotMarketIndex: number,
  connection: Connection,
  program: DriftClient["program"],
): Promise<BN> => {
  if (spotMarketIndex === USDC_SPOT_MARKET_INDEX) {
    return PRICE_PRECISION; // $1
  }

  const spotMarketConfig = SpotMarkets["mainnet-beta"][spotMarketIndex];
  const oracleClient = getOracleClient(
    spotMarketConfig.oracleSource,
    connection,
    program,
  );

  const oraclePriceData = await oracleClient.getOraclePriceData(
    spotMarketConfig.oracle,
  );

  return oraclePriceData.price;
};
