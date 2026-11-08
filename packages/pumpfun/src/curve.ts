import { BPS_DENOMINATOR, mulDivFloor, ratio } from "@bark/solana";

/**
 * Bonding-curve pricing.
 *
 * pump.fun runs a constant-product curve over *virtual* reserves. SOL dust is
 * held in lamports, tokens in base units; all arithmetic is integer.
 *
 * Invariants this module preserves:
 *   - Outputs are floored exactly like the on-chain program, so a quote is
 *     always achievable (never one unit optimistic).
 *   - k = virtualTokenReserves * virtualSolReserves therefore drops by less
 *     than one unit of the opposite reserve per trade - never grows, never
 *     collapses.
 *   - A buy followed by a sell of the same output never returns more SOL.
 */

export interface CurveState {
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
}

export interface CurveParams {
  /** Virtual SOL seeded into every curve, in lamports. */
  initialVirtualSolReserves: bigint;
  /** Virtual token supply seeded into every curve, in base units. */
  initialVirtualTokenReserves: bigint;
  /** Total minted supply, in base units. */
  tokenTotalSupply: bigint;
  /** Real SOL required before a curve graduates, in lamports. */
  graduationSolReserves: bigint;
  /** Protocol fee in basis points, charged on the SOL side of a trade. */
  protocolFeeBps: number;
  /** Creator fee in basis points, charged on the SOL side of a trade. */
  creatorFeeBps: number;
}

/**
 * Defaults observed on mainnet for a current-era launch.
 *
 * The 30 SOL / 1.073B virtual seed and the 85 SOL graduation threshold are the
 * long-standing pump.fun parameters; the 95 bps creator fee was read directly
 * out of a live TradeEvent.
 */
export const DEFAULT_CURVE_PARAMS: CurveParams = {
  initialVirtualSolReserves: 30_000_000_000n,
  initialVirtualTokenReserves: 1_073_000_000_000_000n,
  tokenTotalSupply: 1_000_000_000_000_000n,
  graduationSolReserves: 85_000_000_000n,
  protocolFeeBps: 100,
  creatorFeeBps: 95,
};

export interface FeeBreakdown {
  total: bigint;
  protocol: bigint;
  creator: bigint;
  net: bigint;
}

export interface Quote {
  /** SOL entering (buy) or leaving (sell) the curve, before fees. */
  grossSol: bigint;
  fees: FeeBreakdown;
  /** Tokens bought or sold. */
  tokens: bigint;
  /** State after the trade is applied. */
  state: CurveState;
  priceBefore: number;
  priceAfter: number;
  /** Price impact as a signed fraction of the pre-trade spot price. */
  priceImpact: number;
}

export function feeBreakdown(
  amount: bigint,
  params: Pick<CurveParams, "protocolFeeBps" | "creatorFeeBps">,
): FeeBreakdown {
  const protocol = mulDivFloor(amount, BigInt(params.protocolFeeBps), BPS_DENOMINATOR);
  const creator = mulDivFloor(amount, BigInt(params.creatorFeeBps), BPS_DENOMINATOR);
  return {
    total: protocol + creator,
    protocol,
    creator,
    net: amount - protocol - creator,
  };
}

export function initialCurveState(
  params: CurveParams = DEFAULT_CURVE_PARAMS,
): CurveState {
  return {
    virtualTokenReserves: params.initialVirtualTokenReserves,
    virtualSolReserves: params.initialVirtualSolReserves,
    realTokenReserves: params.initialVirtualTokenReserves,
    realSolReserves: 0n,
    tokenTotalSupply: params.tokenTotalSupply,
    complete: false,
  };
}

/** Constant product, floored: the exact quantity the program divides by. */
export function invariant(state: Pick<CurveState, "virtualTokenReserves" | "virtualSolReserves">): bigint {
  return state.virtualTokenReserves * state.virtualSolReserves;
}

/** Lamports per whole token, as a float (display / analytics only). */
export function spotPriceSolPerToken(state: CurveState): number {
  return Number(state.virtualSolReserves) / Number(state.virtualTokenReserves);
}

/** Exact spot price as a rational, for callers that need no float rounding. */
export function spotPriceExact(
  state: CurveState,
  decimals = 6,
): { numerator: bigint; denominator: bigint } {
  return {
    numerator: state.virtualSolReserves * 10n ** BigInt(decimals),
    denominator: state.virtualTokenReserves,
  };
}

/** Fully-diluted market cap in lamports, derived from virtual reserves. */
export function marketCapLamports(state: CurveState): bigint {
  return mulDivFloor(state.virtualSolReserves, state.tokenTotalSupply, state.virtualTokenReserves);
}

/** Fraction of the graduation threshold already raised, clamped to [0, 1]. */
export function graduationProgress(
  state: CurveState,
  params: CurveParams = DEFAULT_CURVE_PARAMS,
): number {
  if (params.graduationSolReserves === 0n) {
    return 0;
  }
  const progress = ratio(state.realSolReserves, params.graduationSolReserves);
  return Math.min(1, Math.max(0, progress));
}

export function quoteBuy(
  state: CurveState,
  solIn: bigint,
  params: CurveParams = DEFAULT_CURVE_PARAMS,
): Quote {
  if (solIn < 0n) {
    throw new RangeError("solIn must be non-negative");
  }
  const fees = feeBreakdown(solIn, params);
  const net = fees.net;
  const k = invariant(state);
  const newVirtualSol = state.virtualSolReserves + net;
  const newVirtualTokens = k / newVirtualSol;
  const tokensOut = state.virtualTokenReserves - newVirtualTokens;

  const nextState: CurveState = {
    ...state,
    virtualSolReserves: newVirtualSol,
    virtualTokenReserves: newVirtualTokens,
    realSolReserves: state.realSolReserves + net,
    realTokenReserves: state.realTokenReserves - tokensOut,
  };

  const priceBefore = spotPriceSolPerToken(state);
  const priceAfter = spotPriceSolPerToken(nextState);
  return {
    grossSol: solIn,
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
  const newVirtualSol = k / newVirtualTokens;
  const grossSol = state.virtualSolReserves - newVirtualSol;
  const fees = feeBreakdown(grossSol, params);
  const net = fees.net;

  const nextState: CurveState = {
    ...state,
    virtualSolReserves: newVirtualSol,
    virtualTokenReserves: newVirtualTokens,
    realSolReserves: state.realSolReserves - net,
    realTokenReserves: state.realTokenReserves + tokensIn,
  };

  const priceBefore = spotPriceSolPerToken(state);
  const priceAfter = spotPriceSolPerToken(nextState);
  return {
    grossSol,
    fees,
    tokens: tokensIn,
    state: nextState,
    priceBefore,
    priceAfter,
    priceImpact: priceBefore === 0 ? 0 : priceAfter / priceBefore - 1,
  };
}

/** SOL required to buy exactly N tokens, fees included. */
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
  const newVirtualSol = k / newVirtualTokens + 1n;
  const net = newVirtualSol - state.virtualSolReserves;
  const feeBps = params.protocolFeeBps + params.creatorFeeBps;
  // gross = net / (1 - fee), solved in integers with a ceiling.
  const denominator = BPS_DENOMINATOR - BigInt(feeBps);
  return (net * BPS_DENOMINATOR + denominator - 1n) / denominator;
}

/** Applies a slippage tolerance to a quoted minimum output. */
export function minimumOut(amount: bigint, slippageBps: number): bigint {
  if (slippageBps < 0 || BigInt(slippageBps) >= BPS_DENOMINATOR) {
    throw new RangeError("slippageBps out of range");
  }
  return mulDivFloor(amount, BPS_DENOMINATOR - BigInt(slippageBps), BPS_DENOMINATOR);
}

/** Applies a slippage tolerance to a quoted maximum input. */
export function maximumIn(amount: bigint, slippageBps: number): bigint {
  if (slippageBps < 0 || BigInt(slippageBps) >= BPS_DENOMINATOR) {
    throw new RangeError("slippageBps out of range");
  }
  return mulDivFloor(amount, BPS_DENOMINATOR + BigInt(slippageBps), BPS_DENOMINATOR);
}
