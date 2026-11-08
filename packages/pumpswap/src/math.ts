import { BPS_DENOMINATOR, mulDivCeil, mulDivFloor } from "@bark/solana";

/**
 * PumpSwap pricing.
 *
 * Same constant product as the bonding curve, with a three-way fee split.
 *
 * What is verified, exactly:
 *   - every fee is ceil(gross x bps / 10,000);
 *   - the three fees sum to gross minus the user's proceeds, to the lamport;
 *   - a sell moves base up and quote down, and a buy does the reverse.
 *
 * What is NOT verified, and is stated here so nobody ships it as if it were:
 * recomputing a trade from the pool's *post-trade* reserves does not reproduce
 * the trade's size. Feeding the captured sell's own post-state back into
 * quoteSell gives a gross 2.8% below what the chain paid, even though the
 * constant product of those reserves is only 0.026% off. Small trades amplify
 * a small reserve error enormously, because output is a difference of large
 * numbers.
 *
 * The likely cause is that reported reserves carry accrued fees the curve does
 * not price against, and that virtual_quote_reserves may participate in the
 * effective depth (including it moves the error from 2.8% to 1.8%, still not
 * exact). Treat these functions as a display-grade estimate and use the
 * program's own pre-trade state - or simulate - before executing.
 *
 * Sell side is observed. Buy side follows the BuyEvent schema
 * (quote_amount_in_with_lp_fee exists, so the LP fee stays in the pool) and is
 * flagged as inferred.
 */

export interface PoolReserves {
  base: bigint;
  quote: bigint;
}

export interface AmmFeeConfig {
  lpFeeBps: number;
  protocolFeeBps: number;
  coinCreatorFeeBps: number;
}

export const DEFAULT_AMM_FEES: AmmFeeConfig = {
  lpFeeBps: 20,
  protocolFeeBps: 5,
  coinCreatorFeeBps: 75,
};

export interface AmmFees {
  lp: bigint;
  protocol: bigint;
  coinCreator: bigint;
  total: bigint;
}

/**
 * Fees charged on a gross amount - the SELL side.
 *
 * Verified: on the captured sell each fee is ceil(gross x bps / 10,000).
 */
export function splitAmmFees(amount: bigint, fees: AmmFeeConfig): AmmFees {
  const lp = mulDivCeil(amount, BigInt(fees.lpFeeBps), BPS_DENOMINATOR);
  const protocol = mulDivCeil(amount, BigInt(fees.protocolFeeBps), BPS_DENOMINATOR);
  const coinCreator = mulDivCeil(amount, BigInt(fees.coinCreatorFeeBps), BPS_DENOMINATOR);
  return { lp, protocol, coinCreator, total: lp + protocol + coinCreator };
}

export interface GrossSplit {
  /** Amount that reaches the pool, before the LP fee is added back. */
  net: bigint;
  fees: AmmFees;
  /** net + lp fee: what the pool actually absorbs. */
  intoPool: bigint;
}

/**
 * Splits a BUY payment into fees and the amount that enters the pool.
 *
 * The buy side charges fees on the NET amount, not on what the user spends.
 * Verified on a live buy: the user paid 37,575,185,568 lamports and the
 * protocol fee was ceil(37,462,797,176 x 5 bps) = 18,731,399 - computed on the
 * net 37,462,797,176, not on the gross. Computing on the gross is off by 56k
 * lamports on that single trade.
 *
 * That is the asymmetry worth remembering: sells charge fees on the gross
 * output, buys charge them on the net input.
 */
export function splitFromGross(gross: bigint, fees: AmmFeeConfig): GrossSplit {
  const totalBps = BigInt(fees.lpFeeBps + fees.protocolFeeBps + fees.coinCreatorFeeBps);
  const denominator = BPS_DENOMINATOR + totalBps;
  let net = mulDivFloor(gross, BPS_DENOMINATOR, denominator);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const split = splitAmmFees(net, fees);
    const diff = gross - (net + split.total);
    if (diff === 0n) {
      return { net, fees: split, intoPool: net + split.lp };
    }
    net += diff;
  }

  const split = splitAmmFees(net, fees);
  return { net, fees: split, intoPool: net + split.lp };
}

export interface AmmSellQuote {
  baseIn: bigint;
  /** Quote removed from the pool, before fees. */
  grossQuote: bigint;
  fees: AmmFees;
  /** What the seller receives. */
  netQuote: bigint;
  reservesAfter: PoolReserves;
  priceBefore: number;
  priceAfter: number;
  priceImpact: number;
}

export interface AmmBuyQuote {
  /** What the buyer pays, fees included. */
  userQuoteIn: bigint;
  /** Quote added to the pool; includes the LP fee, excludes protocol/creator. */
  quoteIntoPool: bigint;
  /** Amount the fees were charged on; quoteIntoPool minus the LP fee. */
  netQuote: bigint;
  fees: AmmFees;
  baseOut: bigint;
  reservesAfter: PoolReserves;
  priceBefore: number;
  priceAfter: number;
  priceImpact: number;
}

export function spotPrice(reserves: PoolReserves): number {
  if (reserves.base === 0n) {
    return 0;
  }
  return Number(reserves.quote) / Number(reserves.base);
}

/** Quote reserves needed to buy the entire base side - a sanity bound. */
export function poolDepthQuote(reserves: PoolReserves): bigint {
  return reserves.quote;
}

export function quoteSell(
  reserves: PoolReserves,
  baseIn: bigint,
  fees: AmmFeeConfig = DEFAULT_AMM_FEES,
): AmmSellQuote {
  if (baseIn < 0n) {
    throw new RangeError("baseIn must be non-negative");
  }
  const k = reserves.base * reserves.quote;
  const newBase = reserves.base + baseIn;
  const newQuote = k / newBase;
  const grossQuote = reserves.quote - newQuote;
  const split = splitAmmFees(grossQuote, fees);

  const reservesAfter: PoolReserves = { base: newBase, quote: newQuote };
  const priceBefore = spotPrice(reserves);
  const priceAfter = spotPrice(reservesAfter);

  return {
    baseIn,
    grossQuote,
    fees: split,
    netQuote: grossQuote - split.total,
    reservesAfter,
    priceBefore,
    priceAfter,
    priceImpact: priceBefore === 0 ? 0 : priceAfter / priceBefore - 1,
  };
}

export function quoteBuy(
  reserves: PoolReserves,
  userQuoteIn: bigint,
  fees: AmmFeeConfig = DEFAULT_AMM_FEES,
): AmmBuyQuote {
  if (userQuoteIn < 0n) {
    throw new RangeError("userQuoteIn must be non-negative");
  }
  const grossSplit = splitFromGross(userQuoteIn, fees);
  const split = grossSplit.fees;
  const quoteIntoPool = grossSplit.intoPool;
  const k = reserves.base * reserves.quote;
  const newQuote = reserves.quote + quoteIntoPool;
  const newBase = k / newQuote;
  const baseOut = reserves.base - newBase;

  const reservesAfter: PoolReserves = { base: newBase, quote: newQuote };
  const priceBefore = spotPrice(reserves);
  const priceAfter = spotPrice(reservesAfter);

  return {
    userQuoteIn,
    quoteIntoPool,
    fees: split,
    netQuote: grossSplit.net,
    baseOut,
    reservesAfter,
    priceBefore,
    priceAfter,
    priceImpact: priceBefore === 0 ? 0 : priceAfter / priceBefore - 1,
  };
}

/** Quote required to buy an exact base amount. */
export function quoteBuyForBase(
  reserves: PoolReserves,
  baseOut: bigint,
  fees: AmmFeeConfig = DEFAULT_AMM_FEES,
): bigint {
  const k = reserves.base * reserves.quote;
  const newBase = reserves.base - baseOut;
  if (newBase <= 0n) {
    throw new RangeError("Cannot buy the entire pool");
  }
  const intoPool = k / newBase + 1n - reserves.quote;
  const feeBps = BigInt(fees.protocolFeeBps + fees.coinCreatorFeeBps);
  return mulDivFloor(intoPool, BPS_DENOMINATOR, BPS_DENOMINATOR - feeBps) + 1n;
}
