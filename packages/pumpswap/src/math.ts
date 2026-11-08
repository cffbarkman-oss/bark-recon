import { BPS_DENOMINATOR, mulDivCeil, mulDivFloor } from "@bark/solana";

/**
 * PumpSwap pricing.
 *
 * Two facts make this different from a plain x*y=k pool, and getting either
 * wrong produces quotes that look plausible and are badly wrong.
 *
 * 1. **Effective depth includes a virtual quote reserve.** Pricing runs over
 *    base x (quote + virtual_quote_reserves). On the pool captured here the
 *    real quote reserve was 11.9 SOL against a virtual offset of 17.6 SOL -
 *    ignoring it prices the pool at 40% of its true depth.
 *
 * 2. **Event reserves are PRE-trade.** The pool fields in a swap event describe
 *    the state before the swap, not after. Reconstructing a trade from what
 *    looked like post-state reserves inverted the direction of every delta.
 *
 * With both in place the model reproduces captured trades to the lamport:
 * a 345,679,455 lamport sell is predicted as 345,679,456, and a buy's 19,063,707
 * base units are predicted as 19,063,708. The invariant
 * base x effectiveQuote holds across consecutive events to within 0.00024%
 * (the residue is LP fees accumulating in the pool).
 *
 * The virtual reserve is **signed**: the captured buy's pool runs at -9,398,851,
 * i.e. slightly less depth than its token account holds.
 *
 * Fee bases differ by side, and so do the amounts the curve prices against:
 *   sell: fee = ceil(gross_output x bps); curve input = gross_output
 *   buy:  fee = ceil(net_input x bps);    curve input = net_input
 * Feeding a buy's net+LP amount into the curve overstates its output by exactly
 * the LP fee rate - 0.25% on the captured trade.
 */

export interface PoolReserves {
  base: bigint;
  quote: bigint;
  /**
   * Virtual quote depth. Read it from the pool account or the swap event; a
   * value of zero is only correct for a pool that genuinely has none.
   */
  virtualQuote: bigint;
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

/** Quote depth the curve actually prices against. */
export function effectiveQuote(reserves: PoolReserves): bigint {
  return reserves.quote + reserves.virtualQuote;
}

export interface AmmFees {
  lp: bigint;
  protocol: bigint;
  coinCreator: bigint;
  total: bigint;
}

/** Fees charged on a gross amount - the SELL side. */
export function splitAmmFees(amount: bigint, fees: AmmFeeConfig): AmmFees {
  const lp = mulDivCeil(amount, BigInt(fees.lpFeeBps), BPS_DENOMINATOR);
  const protocol = mulDivCeil(amount, BigInt(fees.protocolFeeBps), BPS_DENOMINATOR);
  const coinCreator = mulDivCeil(amount, BigInt(fees.coinCreatorFeeBps), BPS_DENOMINATOR);
  return { lp, protocol, coinCreator, total: lp + protocol + coinCreator };
}

export interface GrossSplit {
  net: bigint;
  fees: AmmFees;
  intoPool: bigint;
}

/**
 * Splits a BUY payment into fees and the amount that enters the pool.
 *
 * The buy side charges fees on the net amount. Verified on a live buy: the
 * user paid 37,575,185,568 lamports and the protocol fee was
 * ceil(37,462,797,176 x 5 bps) = 18,731,399 - on the net, not the gross.
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
  /** Quote removed from the curve, before fees. */
  grossQuote: bigint;
  fees: AmmFees;
  netQuote: bigint;
  reservesAfter: PoolReserves;
  priceBefore: number;
  priceAfter: number;
  priceImpact: number;
}

export interface AmmBuyQuote {
  userQuoteIn: bigint;
  /** What the pool's quote balance absorbs: net + LP fee. */
  quoteIntoPool: bigint;
  /** What the curve priced against: net, after every fee. */
  netQuote: bigint;
  fees: AmmFees;
  baseOut: bigint;
  reservesAfter: PoolReserves;
  priceBefore: number;
  priceAfter: number;
  priceImpact: number;
}

/** Spot price in quote units per base unit, on effective depth. */
export function spotPrice(reserves: PoolReserves): number {
  if (reserves.base === 0n) {
    return 0;
  }
  return Number(effectiveQuote(reserves)) / Number(reserves.base);
}

export function quoteSell(
  reserves: PoolReserves,
  baseIn: bigint,
  fees: AmmFeeConfig = DEFAULT_AMM_FEES,
): AmmSellQuote {
  if (baseIn < 0n) {
    throw new RangeError("baseIn must be non-negative");
  }
  const effQuote = effectiveQuote(reserves);
  const k = reserves.base * effQuote;
  const newBase = reserves.base + baseIn;
  const newEffQuote = k / newBase;
  const grossQuote = effQuote - newEffQuote;
  const split = splitAmmFees(grossQuote, fees);

  const reservesAfter: PoolReserves = {
    base: newBase,
    quote: newEffQuote - reserves.virtualQuote,
    virtualQuote: reserves.virtualQuote,
  };
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

  // Pricing runs on the NET amount; the pool still absorbs net + LP fee.
  // Verified to one lamport on a captured buy: feeding the pre+LP amount
  // instead overstates the output by exactly the LP fee rate (0.25%).
  const effQuote = effectiveQuote(reserves);
  const k = reserves.base * effQuote;
  const newEffQuote = effQuote + grossSplit.net;
  const newBase = k / newEffQuote;
  const baseOut = reserves.base - newBase;

  // The pool absorbs net + LP fee, while the curve advanced by net. The
  // difference is booked against the virtual reserve, which is exactly how a
  // signed offset can carry retained fees.
  const reservesAfter: PoolReserves = {
    base: newBase,
    quote: reserves.quote + quoteIntoPool,
    virtualQuote: reserves.virtualQuote - split.lp,
  };
  const priceBefore = spotPrice(reserves);
  const priceAfter = spotPrice(reservesAfter);

  return {
    userQuoteIn,
    quoteIntoPool,
    netQuote: grossSplit.net,
    fees: split,
    baseOut,
    reservesAfter,
    priceBefore,
    priceAfter,
    priceImpact: priceBefore === 0 ? 0 : priceAfter / priceBefore - 1,
  };
}

/** Quote required to buy an exact base amount, fees included. */
export function quoteBuyForBase(
  reserves: PoolReserves,
  baseOut: bigint,
  fees: AmmFeeConfig = DEFAULT_AMM_FEES,
): bigint {
  const effQuote = effectiveQuote(reserves);
  const k = reserves.base * effQuote;
  const newBase = reserves.base - baseOut;
  if (newBase <= 0n) {
    throw new RangeError("Cannot buy the entire pool");
  }
  const intoPool = k / newBase + 1n - effQuote;
  const feeBps = BigInt(fees.protocolFeeBps + fees.coinCreatorFeeBps);
  return mulDivFloor(intoPool, BPS_DENOMINATOR, BPS_DENOMINATOR - feeBps) + 1n;
}
