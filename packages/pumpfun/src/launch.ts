import {
  completionQuoteReserves,
  feeBreakdown,
  initialCurveState,
  marketCapQuote,
  spotPrice,
  type CurveParams,
  type CurveState,
} from "./curve.js";

/**
 * Launch parameter preview.
 *
 * Bark's own launchpad will choose its own curve parameters. This module shows
 * what a given set of parameters actually implies before anyone deploys it:
 * where the curve finishes, what it costs to get there, how much the price
 * moves and how much fee the creator accrues.
 *
 * Everything is derived from the same functions that price trades, so a
 * preview cannot drift from execution.
 */

export interface LaunchEconomics {
  /** Quote reserve at which the curve completes. */
  completionQuote: bigint;
  /** Tokens that must be sold to reach completion. */
  completionTokens: bigint;
  /** State at completion, for inspection. */
  finalState: CurveState;
  priceInitial: number;
  priceAtCompletion: number;
  /** Multiple of the initial price reached at completion. */
  priceMultiple: number;
  marketCapInitial: bigint;
  marketCapAtCompletion: bigint;
  /** Fees accrued to the protocol and the creator over a full curve. */
  protocolFeesAtCompletion: bigint;
  creatorFeesAtCompletion: bigint;
  /** Share of raised quote that goes to fees, in [0, 1]. */
  feeShare: number;
}

export class LaunchParamsError extends Error {
  public override readonly name = "LaunchParamsError";
  public readonly problems: string[];

  constructor(message: string, problems: string[] = []) {
    super(message);
    this.problems = problems;
  }
}

/**
 * Checks the invariants a curve must satisfy.
 *
 * Returns human-readable problems rather than a boolean: a launchpad should be
 * able to explain why a parameter set is rejected.
 */
export function validateLaunchParams(params: CurveParams): string[] {
  const problems: string[] = [];

  if (params.initialVirtualQuoteReserves <= 0n) {
    problems.push("initialVirtualQuoteReserves must be positive");
  }
  if (params.initialVirtualTokenReserves <= 0n) {
    problems.push("initialVirtualTokenReserves must be positive");
  }
  if (params.initialRealTokenReserves >= params.initialVirtualTokenReserves) {
    problems.push("initialRealTokenReserves must be below initialVirtualTokenReserves");
  }
  if (params.initialRealTokenReserves <= 0n) {
    problems.push("initialRealTokenReserves must be positive, or the curve completes immediately");
  }
  // Note: virtual token reserves legitimately exceed the mint supply.
  // pump.fun seeds 1.073B virtual tokens against a 1B supply, and the curve
  // never sells the virtual portion. Do not "fix" that here.
  if (params.protocolFeeBps < 0 || params.creatorFeeBps < 0) {
    problems.push("fees cannot be negative");
  }
  if (params.protocolFeeBps + params.creatorFeeBps >= 10_000) {
    problems.push("combined fees must stay below 100%");
  }
  if (params.protocolFeeBps + params.creatorFeeBps >= 1_000) {
    problems.push("combined fees above 10% are almost certainly a mistake");
  }
  return problems;
}

/**
 * Computes the economics of a full curve run.
 *
 * Throws LaunchParamsError when the parameters are invalid, so a UI can show
 * every problem at once instead of the first one it trips over.
 */
export function previewLaunch(params: CurveParams): LaunchEconomics {
  const problems = validateLaunchParams(params);
  if (problems.length > 0) {
    throw new LaunchParamsError("Invalid launch parameters: " + problems.join("; "), problems);
  }

  const initial = initialCurveState(params);
  const completionQuote = completionQuoteReserves(params);
  const completionTokens = params.initialRealTokenReserves;

  // State at completion: real tokens exhausted, so virtual tokens equal the
  // initial virtual/real gap.
  const gap = params.initialVirtualTokenReserves - params.initialRealTokenReserves;
  const k = params.initialVirtualQuoteReserves * params.initialVirtualTokenReserves;
  const finalState: CurveState = {
    virtualTokenReserves: gap,
    virtualQuoteReserves: k / gap,
    realTokenReserves: 0n,
    realQuoteReserves: completionQuote,
    tokenTotalSupply: params.tokenTotalSupply,
    complete: true,
  };

  const priceInitial = spotPrice(initial);
  const priceAtCompletion = spotPrice(finalState);
  const fees = feeBreakdown(completionQuote, params);

  return {
    completionQuote,
    completionTokens,
    finalState,
    priceInitial,
    priceAtCompletion,
    priceMultiple: priceInitial === 0 ? 0 : priceAtCompletion / priceInitial,
    marketCapInitial: marketCapQuote(initial),
    marketCapAtCompletion: marketCapQuote(finalState),
    protocolFeesAtCompletion: fees.protocol,
    creatorFeesAtCompletion: fees.creator,
    feeShare: completionQuote === 0n ? 0 : Number(fees.total) / Number(completionQuote),
  };
}
