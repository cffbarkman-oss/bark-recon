/** Pure formatting helpers shared by the CLI commands and their tests. */

export function formatSol(lamports: bigint, digits = 6): string {
  const negative = lamports < 0n;
  const absolute = negative ? -lamports : lamports;
  const whole = absolute / 1_000_000_000n;
  const fraction = (absolute % 1_000_000_000n).toString().padStart(9, "0").slice(0, digits);
  const body = digits === 0 ? whole.toString() : whole.toString() + "." + fraction;
  return negative ? "-" + body : body;
}

export function formatTokens(baseUnits: bigint, decimals = 6, digits = 4): string {
  const negative = baseUnits < 0n;
  const absolute = negative ? -baseUnits : baseUnits;
  const divisor = 10n ** BigInt(decimals);
  const whole = (absolute / divisor).toLocaleString("en-US");
  const fraction = (absolute % divisor).toString().padStart(decimals, "0").slice(0, digits);
  const body = digits === 0 ? whole : whole + "." + fraction;
  return negative ? "-" + body : body;
}

export function formatPercent(fraction: number, digits = 2): string {
  if (!Number.isFinite(fraction)) {
    return "n/a";
  }
  return (fraction * 100).toFixed(digits) + "%";
}

/** Truncates an address for display: 4 leading and 4 trailing characters. */
export function shortKey(value: string, size = 4): string {
  if (value.length <= size * 2 + 3) {
    return value;
  }
  return value.slice(0, size) + "..." + value.slice(-size);
}

export function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }
  if (value >= 1_000_000) {
    return "$" + (value / 1_000_000).toFixed(2) + "M";
  }
  if (value >= 1_000) {
    return "$" + (value / 1_000).toFixed(2) + "K";
  }
  return "$" + value.toFixed(2);
}
