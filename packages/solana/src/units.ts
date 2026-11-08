/**
 * Exact amount arithmetic.
 *
 * Token amounts are bigint base units and never pass through a float unless a
 * caller explicitly asks for a display number. This is the rule that keeps
 * launchpad pricing, fee splits and portfolio math from drifting by dust.
 */

export const LAMPORTS_PER_SOL = 1_000_000_000n;
export const BPS_DENOMINATOR = 10_000n;

export class AmountError extends Error {
  public override readonly name = "AmountError";
}

/**
 * Parses a human decimal string ("1.25") into base units for a given number of
 * decimals. Rejects values with more precision than the mint can represent
 * instead of silently truncating.
 */
export function parseAmount(value: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new AmountError("Decimals must be a non-negative integer");
  }
  const trimmed = value.trim();
  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(trimmed);
  if (trimmed.length === 0 || match === null) {
    throw new AmountError("Invalid decimal amount: " + JSON.stringify(value));
  }

  const sign = match[1] === "-" ? -1n : 1n;
  const whole = match[2] ?? "";
  const fraction = match[3] ?? "";

  if (whole.length === 0 && fraction.length === 0) {
    throw new AmountError("Invalid decimal amount: " + JSON.stringify(value));
  }
  if (fraction.length > decimals) {
    throw new AmountError(
      "Amount " + value + " has more than " + decimals + " decimal places",
    );
  }

  const padded = fraction.padEnd(decimals, "0");
  const combined = (whole.length > 0 ? whole : "0") + padded;
  return sign * BigInt(combined);
}

export interface FormatAmountOptions {
  /** Trim trailing zeros in the fractional part (default true). */
  trim?: boolean;
  /** Group the integer part with separators (default false). */
  grouping?: boolean;
}

/** Formats base units back into a decimal string. */
export function formatAmount(
  amount: bigint,
  decimals: number,
  options: FormatAmountOptions = {},
): string {
  const trim = options.trim ?? true;
  const grouping = options.grouping ?? false;

  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const divisor = 10n ** BigInt(decimals);
  const whole = absolute / divisor;
  let fraction = (absolute % divisor).toString().padStart(decimals, "0");

  if (trim) {
    fraction = fraction.replace(/0+$/, "");
  }

  let wholeText = whole.toString();
  if (grouping) {
    wholeText = wholeText.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  const body = fraction.length > 0 ? wholeText + "." + fraction : wholeText;
  return negative ? "-" + body : body;
}

export function solToLamports(sol: number | string): bigint {
  return parseAmount(typeof sol === "number" ? sol.toString() : sol, 9);
}

export function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / Number(LAMPORTS_PER_SOL);
}

/** Converts base units to a JS number. Lossy above 2^53 - use for display only. */
export function toNumber(amount: bigint, decimals: number): number {
  return Number(amount) / 10 ** decimals;
}

/** floor(a * b / c) for non-negative operands; throws on division by zero. */
export function mulDivFloor(a: bigint, b: bigint, c: bigint): bigint {
  if (c === 0n) {
    throw new AmountError("Division by zero");
  }
  return (a * b) / c;
}

/** ceil(a * b / c) for non-negative operands; throws on division by zero. */
export function mulDivCeil(a: bigint, b: bigint, c: bigint): bigint {
  if (c === 0n) {
    throw new AmountError("Division by zero");
  }
  const product = a * b;
  const quotient = product / c;
  return product % c === 0n ? quotient : quotient + 1n;
}

export type RoundingMode = "floor" | "ceil";

/** Applies a basis-point rate (1 bps = 0.01%). */
export function applyBps(
  amount: bigint,
  bps: number | bigint,
  rounding: RoundingMode = "floor",
): bigint {
  const rate = BigInt(bps);
  if (rate < 0n) {
    throw new AmountError("Basis points must be non-negative");
  }
  return rounding === "ceil"
    ? mulDivCeil(amount, rate, BPS_DENOMINATOR)
    : mulDivFloor(amount, rate, BPS_DENOMINATOR);
}

/** part / whole as a 0..1 float. Returns 0 for an empty denominator. */
export function ratio(part: bigint | number, whole: bigint | number): number {
  const denominator = Number(whole);
  if (denominator === 0) {
    return 0;
  }
  return Number(part) / denominator;
}
