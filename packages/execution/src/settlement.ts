/**
 * Settlement reconciliation.
 *
 * "Landed" is not "did what you were told". Once a transaction commits, the
 * only trustworthy statement about it is the balance delta it produced. This
 * module compares an intent against observed deltas and reports the difference
 * instead of assuming the quote was honoured.
 *
 * The three outcomes that matter:
 *
 *   filled     - output met the minimum and the input was consumed
 *   shortfall  - output below the minimum: a contract violation, never normal
 *   partial    - input consumed differs from what was asked for
 */

export interface SwapIntent {
  inputMint: string;
  outputMint: string;
  /** Base units the caller agreed to spend. */
  inAmount: bigint;
  /** Base units the caller will not accept less than. */
  minOut: bigint;
  /** The quote used for display, to compute realised slippage against. */
  quotedOut?: bigint;
}

export interface ObservedSwap {
  /** Signed change in the input mint, as observed on chain (negative = spent). */
  inputDelta: bigint;
  /** Signed change in the output mint (positive = received). */
  outputDelta: bigint;
}

export type SettlementStatus = "filled" | "shortfall" | "partial" | "empty";

export interface SettlementReport {
  status: SettlementStatus;
  /** Output actually received, in base units. */
  received: bigint;
  /** Output the caller was promised at minimum. */
  minimum: bigint;
  /** received - minimum; negative means the guarantee was broken. */
  surplusOverMinimum: bigint;
  /** Fraction of the quoted output that was actually received, when a quote exists. */
  realisedFractionOfQuote: number | null;
  /** Input actually consumed, as a positive number. */
  spent: bigint;
  /** True when less input was consumed than the intent asked for. */
  underSpent: boolean;
  explanation: string;
}

export class SettlementError extends Error {
  public override readonly name = "SettlementError";
}

/**
 * Reconciles an intent against observed balance deltas.
 *
 * Deliberately strict: an output below the minimum is reported as a shortfall
 * even though a successful transaction should make that impossible. Treating
 * "impossible" cases as silently fine is how a settlement bug survives to
 * production.
 */
export function reconcileSwap(intent: SwapIntent, observed: ObservedSwap): SettlementReport {
  const received = observed.outputDelta > 0n ? observed.outputDelta : 0n;
  const spent = observed.inputDelta < 0n ? -observed.inputDelta : 0n;

  if (received === 0n && spent === 0n) {
    return {
      status: "empty",
      received: 0n,
      minimum: intent.minOut,
      surplusOverMinimum: -intent.minOut,
      realisedFractionOfQuote: intent.quotedOut === undefined ? null : 0,
      spent: 0n,
      underSpent: spent < intent.inAmount,
      explanation: "no balance change observed in either mint",
    };
  }

  const shortfall = received < intent.minOut;
  if (shortfall) {
    return {
      status: "shortfall",
      received,
      minimum: intent.minOut,
      surplusOverMinimum: received - intent.minOut,
      realisedFractionOfQuote:
        intent.quotedOut === undefined || intent.quotedOut === 0n
          ? null
          : Number(received) / Number(intent.quotedOut),
      spent,
      underSpent: spent < intent.inAmount,
      explanation:
        "received " + received.toString() + " against a minimum of " +
        intent.minOut.toString() + " - the guarantee was not honoured",
    };
  }

  const underSpent = spent < intent.inAmount;
  const realised =
    intent.quotedOut === undefined || intent.quotedOut === 0n
      ? null
      : Number(received) / Number(intent.quotedOut);

  return {
    status: underSpent ? "partial" : "filled",
    received,
    minimum: intent.minOut,
    surplusOverMinimum: received - intent.minOut,
    realisedFractionOfQuote: realised,
    spent,
    underSpent,
    explanation: underSpent
      ? "consumed " + spent.toString() + " of " + intent.inAmount.toString() + " requested"
      : "filled at or above the minimum",
  };
}
