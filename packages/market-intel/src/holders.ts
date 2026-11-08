/**
 * Holder concentration.
 *
 * Every metric here is computed from balances, never from a provider's
 * pre-computed "score". That matters for Bark: the terminal can show the same
 * distribution to a user that the risk model reasoned over.
 */

export interface HolderBalance {
  owner: string;
  amount: bigint;
}

export interface ConcentrationOptions {
  /** Owners excluded from concentration math (pools, burn addresses, the curve). */
  exclude?: string[];
  /** Requested percentile cuts, in percent of supply. Default [1, 5, 10, 20]. */
  topCuts?: number[];
  /** Share of supply that counts as a whale. Default 0.01 (1%). */
  whaleShare?: number;
}

export interface HolderShare {
  owner: string;
  amount: bigint;
  /** Fraction of circulating supply in [0, 1]. */
  share: number;
}

export interface ConcentrationReport {
  holderCount: number;
  /** Supply actually observed across holders (excluded owners removed). */
  observedSupply: bigint;
  /** Supply used as the denominator. */
  totalSupply: bigint;
  top: HolderShare[];
  /** Share of supply held by the top N holders, keyed by N. */
  topShares: Record<string, number>;
  /** Herfindahl-Hirschman index over holder shares, in [0, 1]. */
  hhi: number;
  /** 1 / hhi: how many equal-sized holders the distribution behaves like. */
  effectiveHolders: number;
  /** Gini coefficient over holder shares, in [0, 1]. */
  gini: number;
  whaleThreshold: bigint;
  whaleCount: number;
}

/**
 * Gini coefficient over positive balances.
 *
 * Non-positive balances are ignored, matching analyseConcentration: an account
 * holding nothing is not a holder and must not dilute the distribution.
 */

export function giniCoefficient(values: number[]): number {
  const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
  const count = sorted.length;
  if (count === 0) {
    return 0;
  }
  let total = 0;
  let weighted = 0;
  for (let i = 0; i < count; i += 1) {
    const value = sorted[i] as number;
    total += value;
    weighted += (i + 1) * value;
  }
  if (total === 0) {
    return 0;
  }
  return (2 * weighted) / (count * total) - (count + 1) / count;
}

/** Herfindahl-Hirschman index over shares that sum to ~1. */
export function herfindahlIndex(shares: number[]): number {
  let sum = 0;
  for (const share of shares) {
    sum += share * share;
  }
  return sum;
}

function mergeBalances(holders: HolderBalance[]): Map<string, bigint> {
  const merged = new Map<string, bigint>();
  for (const holder of holders) {
    const current = merged.get(holder.owner) ?? 0n;
    merged.set(holder.owner, current + holder.amount);
  }
  return merged;
}

/**
 * Produces a concentration report.
 *
 * Excluded owners (liquidity pools, the bonding curve account, burn addresses)
 * must be supplied by the caller: only it knows which accounts on a given mint
 * are infrastructure rather than people.
 */
export function analyseConcentration(
  holders: HolderBalance[],
  totalSupply: bigint,
  options: ConcentrationOptions = {},
): ConcentrationReport {
  const exclude = new Set(options.exclude ?? []);
  const cuts = options.topCuts ?? [1, 5, 10, 20];
  const whaleShare = options.whaleShare ?? 0.01;

  const merged = mergeBalances(holders);
  const entries: HolderBalance[] = [];
  for (const [owner, amount] of merged) {
    if (exclude.has(owner) || amount <= 0n) {
      continue;
    }
    entries.push({ owner, amount });
  }
  entries.sort((a, b) => (a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1));

  let observed = 0n;
  for (const entry of entries) {
    observed += entry.amount;
  }

  const denominator = totalSupply > 0n ? totalSupply : observed;
  const divisor = denominator > 0n ? Number(denominator) : 0;

  const shares: HolderShare[] = entries.map((entry) => ({
    owner: entry.owner,
    amount: entry.amount,
    share: divisor === 0 ? 0 : Number(entry.amount) / divisor,
  }));

  const topShares: Record<string, number> = {};
  for (const cut of cuts) {
    let sum = 0;
    for (let i = 0; i < Math.min(cut, shares.length); i += 1) {
      sum += (shares[i] as HolderShare).share;
    }
    topShares[String(cut)] = sum;
  }

  const shareValues = shares.map((entry) => entry.share);
  const hhi = herfindahlIndex(shareValues);
  const whaleThreshold = BigInt(Math.floor(whaleShare * divisor));

  let whaleCount = 0;
  for (const entry of entries) {
    if (entry.amount >= whaleThreshold && whaleThreshold > 0n) {
      whaleCount += 1;
    }
  }

  return {
    holderCount: entries.length,
    observedSupply: observed,
    totalSupply: denominator,
    top: shares.slice(0, 50),
    topShares,
    hhi,
    effectiveHolders: hhi === 0 ? 0 : 1 / hhi,
    gini: giniCoefficient(shareValues),
    whaleThreshold,
    whaleCount,
  };
}
