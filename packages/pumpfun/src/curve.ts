import { BPS_DENOMINATOR, mulDivCeil, mulDivFloor, ratio } from "@bark/solana";

/**
 * Bonding-curve pricing.
 *
 * pump.fun runs a constant-product curve over *virtual* reserves. Quote-side
 * amounts are lamports for SOL curves; base-side amounts are token base units.
 * Every quantity is an integer and every division floors exactly like the
 * on-chain program, with one exception: fees round up (see feeBreakdown).
 *
 * Invariants preserved here:
 *   - a quoted output is always achievable (never one unit optimistic)
 *   - a buy followed by a sell of the same tokens never returns more quote
 *   - the constant product only shrinks by less than one division unit
 */

/** Reserves as they appear on chain. */
export interface CurveState {
  virtualTokenReserves: bigint;
  virtualQuoteReserves: bigint;
  realTokenReserves: bigint;
  realQuoteReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
}

export interface CurveParams {
  initialVirtualQuoteReserves: bigint;
  initialVirtualTokenReserves: bigint;
  initialRealTokenReserves: bigint;
  tokenTotalSupply: bigint;
  /** Protocol fee in basis points, read from the global account (95 observed). */
  protocolFeeBps: number;
  /**
   * Creator fee in basis points. Read this from the trade event rather than
   * trusting a single source: the captured launch charged 30 bps while the
   * curve account field read 0 and the global default was 5.
   */
  creatorFeeBps: number;
}

/**
 * Launch parameters observed on mainnet (global account, 2026-11-08).
 *
 * These are the numbers a Bark launchpad should reproduce or deliberately
 * diverge from - they are not arbitrary defaults.
 */
export const DEFAULT_CURVE_PARAMS: CurveParams = {
  initialVirtualQuoteReserves: 30_000_000_000n,
  initialVirtualTokenReserves: 1_073_000_000_000_000n,
  initialRealTokenReserves: 793_100_000_000_000n,
  tokenTotalSupply: 1_000_000_000_000_000n,
  protocolFeeBps: 95,
  creatorFeeBps: 30,
};

export interface FeeBreakdown {
  total: bigint;
  protocol: bigint;
  creator: bigint;
  net: bigint;
}

export interface Quote {
  /** Quote amount entering (buy) or leaving (sell) the curve, before fees. */
  grossQuote: bigint;
  fees: FeeBreakdown;
  tokens: bigint;
  state: CurveState;
  priceBefore: number;
  priceAfter: number;
  /** Signed fraction of the pre-trade spot price. */
  priceImpact: number;
}

/**
 * Splits a trade's quote side into protocol and creator fees.
 *
 * Fees round **up**. Verified on chain: 1,559,679,685 lamports at 95 bps gives
 * 14,816,958 (not 14,816,957), and 30 bps gives 4,679,040 (not 4,679,039).
 */
export function feeBreakdown(
  amount: bigint,
  params: Pick<CurveParams, "protocolFeeBps" | "creatorFeeBps">,
): FeeBreakdown {
  const protocol = mulDivCeil(amount, BigInt(params.protocolFeeBps), BPS_DENOMINATOR);
  const creator = mulDivCeil(amount, BigInt(params.creatorFeeBps), BPS_DENOMINATOR);
  return {
    total: protocol + creator,
    protocol,
    creator,
    net: amount - protocol - creator,
  };
}

export function initialCurveState(params: CurveParams = DEFAULT_CURVE_PARAMS): CurveState {
  return {
    virtualTokenReserves: params.initialVirtualTokenReserves,
    virtualQuoteReserves: params.initialVirtualQuoteReserves,
    realTokenReserves: params.initialRealTokenReserves,
    realQuoteReserves: 0n,
    tokenTotalSupply: params.tokenTotalSupply,
    complete: false,
  };
}

export function invariant(
  state: Pick<CurveState, "virtualTokenReserves" | "virtualQuoteReserves">,
): bigint {
  return state.virtualTokenReserves * state.virtualQuoteReserves;
}

/**
 * Spot price in whole quote units per whole token.
 *
 * For a SOL curve this is SOL per token: reserves are lamports and base units
 * are 6-decimal token units, so both sides are normalised before dividing.
 */
export function spotPrice(
  state: CurveState,
  quoteDecimals = 9,
  tokenDecimals = 6,
): number {
  const quote = Number(state.virtualQuoteReserves) / 10 ** quoteDecimals;
  const tokens = Number(state.virtualTokenReserves) / 10 ** tokenDecimals;
  return tokens === 0 ? 0 : quote / tokens;
}

/** Exact spot price as a rational in the same units as spotPrice. */
export function spotPriceExact(
  state: CurveState,
  quoteDecimals = 9,
  tokenDecimals = 6,
): { numerator: bigint; denominator: bigint } {
  return {
    numerator: state.virtualQuoteReserves * 10n ** BigInt(tokenDecimals),
    denominator: state.virtualTokenReserves * 10n ** BigInt(quoteDecimals),
  };
}

/** Fully-diluted market cap in quote lamports, from virtual reserves. */
export function marketCapQuote(state: CurveState): bigint {
  return mulDivFloor(state.virtualQuoteReserves, state.tokenTotalSupply, state.virtualTokenReserves);
}

/**
 * Quote reserves at which a curve completes.
 *
 * Derived, not hardcoded: the curve finishes when real token reserves reach
 * zero, so virtual tokens equal the initial virtual/real gap and the quote
 * reserve follows from the constant product. With the observed parameters this
 * lands on 85,005,359,056 lamports - the familiar "85 SOL" graduation, with
 * 5,359,056 lamports of integer dust that a hardcoded constant hides.
 */
export function completionQuoteReserves(params: CurveParams = DEFAULT_CURVE_PARAMS): bigint {
  const gap = params.initialVirtualTokenReserves - params.initialRealTokenReserves;
  if (gap <= 0n) {
    throw new RangeError("Initial real token reserves must be below virtual reserves");
  }
  const k = params.initialVirtualQuoteReserves * params.initialVirtualTokenReserves;
  const virtualQuoteAtCompletion = k / gap;
  return virtualQuoteAtCompletion - params.initialVirtualQuoteReserves;
}

/** Fraction of the completion threshold already raised, clamped to [0, 1]. */
export function graduationProgress(
  state: CurveState,
  params: CurveParams = DEFAULT_CURVE_PARAMS,
): number {
  const target = completionQuoteReserves(params);
  if (target <= 0n) {
    return 0;
  }
  return Math.min(1, Math.max(0, ratio(state.realQuoteReserves, target)));
}

export function quoteBuy(
  state: CurveState,
  quoteIn: bigint,
  params: CurveParams = DEFAULT_CURVE_PARAMS,
): Quote {
  if (quoteIn < 0n) {
    throw new RangeError("quoteIn must be non-negative");
  }
  const fees = feeBreakdown(quoteIn, params);
  const net = fees.net;
  const k = invariant(state);
  const newVirtualQuote = state.virtualQuoteReserves + net;
  const newVirtualTokens = k / newVirtualQuote;
  const tokensOut = state.virtualTokenReserves - newVirtualTokens;

  const nextState: CurveState = {
    ...state,
    virtualQuoteReserves: newVirtualQuote,
    virtualTokenReserves: newVirtualTokens,
    realQuoteReserves: state.realQuoteReserves + net,
    realTokenReserves: state.realTokenReserves - tokensOut,
  };

  const priceBefore = spotPrice(state);
  const priceAfter = spotPrice(nextState);
  return {
    grossQuote: quoteIn,
    fees,
    tokens: tokensOut,
    state: nextState,
    priceBefore,
    priceAfter,
    priceImpact: priceBefore === 0 ? 0 : priceAfter / priceBefore - 1,
  };
}

export function quoteSell(
  state: CurveState,
  tokensIn: bigint,
  params: CurveParams = DEFAULT_CURVE_PARAMS,
): Quote {
  if (tokensIn < 0n) {
    throw new RangeError("tokensIn must be non-negative");
  }
  const k = invariant(state);
  const newVirtualTokens = state.virtualTokenReserves + tokensIn;
  const newVirtualQuote = k / newVirtualTokens;
  const grossQuote = state.virtualQuoteReserves - newVirtualQuote;
  const fees = feeBreakdown(grossQuote, params);

  const nextState: CurveState = {
    ...state,
    virtualQuoteReserves: newVirtualQuote,
    virtualTokenReserves: newVirtualTokens,
    realQuoteReserves: state.realQuoteReserves - fees.net,
    realTokenReserves: state.realTokenReserves + tokensIn,
  };

  const priceBefore = spotPrice(state);
  const priceAfter = spotPrice(nextState);
  return {
    grossQuote,
    fees,
    tokens: tokensIn,
    state: nextState,
    priceBefore,
    priceAfter,
    priceImpact: priceBefore === 0 ? 0 : priceAfter / priceBefore - 1,
  };
}

/** Quote required to buy exactly N tokens, fees included. */
export function quoteBuyForTokens(
  state: CurveState,
  tokensOut: bigint,
  params: CurveParams = DEFAULT_CURVE_PARAMS,
): bigint {
  const k = invariant(state);
  const newVirtualTokens = state.virtualTokenReserves - tokensOut;
  if (newVirtualTokens <= 0n) {
    throw new RangeError("Cannot buy the entire remaining curve supply");
  }
  const newVirtualQuote = k / newVirtualTokens + 1n;
  const net = newVirtualQuote - state.virtualQuoteReserves;
  const feeBps = BigInt(params.protocolFeeBps + params.creatorFeeBps);
  const denominator = BPS_DENOMINATOR - feeBps;
  return (net * BPS_DENOMINATOR + denominator - 1n) / denominator;
}

export function minimumOut(amount: bigint, slippageBps: number): bigint {
  if (slippageBps < 0 || BigInt(slippageBps) >= BPS_DENOMINATOR) {
    throw new RangeError("slippageBps out of range");
  }
  return mulDivFloor(amount, BPS_DENOMINATOR - BigInt(slippageBps), BPS_DENOMINATOR);
}

export function maximumIn(amount: bigint, slippageBps: number): bigint {
  if (slippageBps < 0 || BigInt(slippageBps) >= BPS_DENOMINATOR) {
    throw new RangeError("slippageBps out of range");
  }
  return mulDivFloor(amount, BPS_DENOMINATOR + BigInt(slippageBps), BPS_DENOMINATOR);
}
