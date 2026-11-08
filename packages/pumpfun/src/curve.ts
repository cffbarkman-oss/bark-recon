import { BPS_DENOMINATOR, mulDivCeil, mulDivFloor, ratio } from "@bark/solana";

/**
 * Bonding-curve pricing.
 *
 * pump.fun runs a constant-product curve over *virtual* reserves. Quote-side
 * amounts are lamports for SOL curves; base-side amounts are token base units.
 * Every division floors, matching the on-chain program.
 *
 * The rule that is easy to get wrong, and that this module is built around:
 *
 *   reserves move by the GROSS quote amount. Fees are never netted out of the
 *   curve - they are charged on top (buy) or taken out of the proceeds (sell),
 *   and they accrue inside the vault rather than being subtracted first.
 *
 * Verified against a launch captured on 2026-11-08. The creator's initial buy
 * moved virtual quote from exactly 30,000,000,000 to exactly 30,246,404,309,
 * i.e. the full sol_amount of 246,404,309 with no fee deduction, while emitting
 * 2,340,841 of protocol fee and 739,213 of creator fee alongside it.
 *
 * Netting the fee out first, as a conventional AMM client would, understates
 * every reserve, every price and every graduation percentage.
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
  /** Protocol fee in basis points, from the global account (95 observed). */
  protocolFeeBps: number;
  /**
   * Creator fee in basis points. Read it from the trade event: the captured
   * launch charged 30 bps while the curve account read 0 and the global
   * default was 5.
   */
  creatorFeeBps: number;
}

/** Launch parameters observed on mainnet (global account, 2026-11-08). */
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
}

/** Result of quoting a buy. */
export interface BuyQuote {
  /** Quote that enters the curve and moves both reserve pairs. */
  quoteIntoCurve: bigint;
  fees: FeeBreakdown;
  /** What the buyer actually pays: curve amount plus fees. */
  totalCost: bigint;
  tokensOut: bigint;
  state: CurveState;
  priceBefore: number;
  priceAfter: number;
  priceImpact: number;
}

/** Result of quoting a sell. */
export interface SellQuote {
  /** Quote that leaves the curve and moves both reserve pairs. */
  grossQuote: bigint;
  fees: FeeBreakdown;
  /** What the seller receives: gross minus fees. */
  netQuote: bigint;
  tokensIn: bigint;
  state: CurveState;
  priceBefore: number;
  priceAfter: number;
  priceImpact: number;
}

/**
 * Splits a quote-side amount into protocol and creator fees.
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
  return { total: protocol + creator, protocol, creator };
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

/** Spot price in whole quote units per whole token (SOL per token for SOL curves). */
export function spotPrice(state: CurveState, quoteDecimals = 9, tokenDecimals = 6): number {
  const quote = Number(state.virtualQuoteReserves) / 10 ** quoteDecimals;
  const tokens = Number(state.virtualTokenReserves) / 10 ** tokenDecimals;
  return tokens === 0 ? 0 : quote / tokens;
}

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
 * is 85,005,359,056 lamports - the familiar "85 SOL", plus 5,359,056 lamports
 * of integer dust that a hardcoded constant hides.
 */
export function completionQuoteReserves(params: CurveParams = DEFAULT_CURVE_PARAMS): bigint {
  const gap = params.initialVirtualTokenReserves - params.initialRealTokenReserves;
  if (gap <= 0n) {
    throw new RangeError("Initial real token reserves must be below virtual reserves");
  }
  const k = params.initialVirtualQuoteReserves * params.initialVirtualTokenReserves;
  return k / gap - params.initialVirtualQuoteReserves;
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

function applyBuy(
  state: CurveState,
  quoteIntoCurve: bigint,
  params: CurveParams,
  fees: FeeBreakdown,
): BuyQuote {
  const k = invariant(state);
  const newVirtualQuote = state.virtualQuoteReserves + quoteIntoCurve;
  const newVirtualTokens = k / newVirtualQuote;
  const tokensOut = state.virtualTokenReserves - newVirtualTokens;

  const nextState: CurveState = {
    ...state,
    virtualQuoteReserves: newVirtualQuote,
    virtualTokenReserves: newVirtualTokens,
    realQuoteReserves: state.realQuoteReserves + quoteIntoCurve,
    realTokenReserves: state.realTokenReserves - tokensOut,
  };

  const priceBefore = spotPrice(state);
  const priceAfter = spotPrice(nextState);
  return {
    quoteIntoCurve,
    fees,
    totalCost: quoteIntoCurve + fees.total,
    tokensOut,
    state: nextState,
    priceBefore,
    priceAfter,
    priceImpact: priceBefore === 0 ? 0 : priceAfter / priceBefore - 1,
  };
}

/**
 * Quotes a buy for a given amount *into the curve*.
 * Fees are charged on top, so the buyer pays more than this amount.
 */
export function quoteBuy(
  state: CurveState,
  quoteIntoCurve: bigint,
  params: CurveParams = DEFAULT_CURVE_PARAMS,
): BuyQuote {
  if (quoteIntoCurve < 0n) {
    throw new RangeError("quoteIntoCurve must be non-negative");
  }
  return applyBuy(state, quoteIntoCurve, params, feeBreakdown(quoteIntoCurve, params));
}

/**
 * Splits a total budget into the curve amount and its fees.
 *
 * A UI that says "spend 1 SOL" means total cost, not curve amount. Solved in
 * closed form and then nudged so that curve + ceil(fees) never exceeds budget.
 */
export function splitBudget(
  budget: bigint,
  params: Pick<CurveParams, "protocolFeeBps" | "creatorFeeBps">,
): { quoteIntoCurve: bigint; fees: FeeBreakdown } {
  if (budget < 0n) {
    throw new RangeError("budget must be non-negative");
  }
  const feeBps = BigInt(params.protocolFeeBps + params.creatorFeeBps);
  let quoteIntoCurve = mulDivFloor(budget, BPS_DENOMINATOR, BPS_DENOMINATOR + feeBps);
  let fees = feeBreakdown(quoteIntoCurve, params);
  while (quoteIntoCurve > 0n && quoteIntoCurve + fees.total > budget) {
    quoteIntoCurve -= 1n;
    fees = feeBreakdown(quoteIntoCurve, params);
  }
  return { quoteIntoCurve, fees };
}

/** Quotes a buy from a total budget that includes fees. */
export function quoteBuyWithBudget(
  state: CurveState,
  budget: bigint,
  params: CurveParams = DEFAULT_CURVE_PARAMS,
): BuyQuote {
  const split = splitBudget(budget, params);
  return applyBuy(state, split.quoteIntoCurve, params, split.fees);
}

/**
 * Quotes a sell.
 *
 * The curve releases the gross amount; fees come out of the seller's proceeds.
 * Both reserve pairs move by gross, which is why the curve's real quote
 * reserves never drift relative to virtual.
 */
export function quoteSell(
  state: CurveState,
  tokensIn: bigint,
  params: CurveParams = DEFAULT_CURVE_PARAMS,
): SellQuote {
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
    realQuoteReserves: state.realQuoteReserves - grossQuote,
    realTokenReserves: state.realTokenReserves + tokensIn,
  };

  const priceBefore = spotPrice(state);
  const priceAfter = spotPrice(nextState);
  return {
    grossQuote,
    fees,
    netQuote: grossQuote - fees.total,
    tokensIn,
    state: nextState,
    priceBefore,
    priceAfter,
    priceImpact: priceBefore === 0 ? 0 : priceAfter / priceBefore - 1,
  };
}

/** Quote that must enter the curve to buy exactly N tokens. */
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
  return k / newVirtualTokens + 1n - state.virtualQuoteReserves;
}

/** Total cost, fees included, to buy exactly N tokens. */
export function totalCostForTokens(
  state: CurveState,
  tokensOut: bigint,
  params: CurveParams = DEFAULT_CURVE_PARAMS,
): bigint {
  const quote = quoteBuyForTokens(state, tokensOut, params);
  return quote + feeBreakdown(quote, params).total;
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
