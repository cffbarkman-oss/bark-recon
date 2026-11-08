import type { ConcentrationReport } from "./holders.js";
import type { BundleReport } from "./bundles.js";
import type { DevProfile } from "./dev.js";

/**
 * Transparent risk scoring.
 *
 * The score is a weighted average of named factors, each contributing a
 * severity in [0, 1] plus a human-readable detail string. Nothing is derived
 * from an opaque third-party rating: if the terminal shows "high risk", it can
 * show exactly which factors produced it.
 */

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskFactor {
  id: string;
  label: string;
  /** Contribution weight; weights are normalised across present factors. */
  weight: number;
  /** 0 (benign) .. 1 (maximal concern). */
  severity: number;
  detail: string;
}

export interface RiskInput {
  concentration?: ConcentrationReport;
  bundles?: BundleReport;
  dev?: DevProfile;
  liquidityUsd?: number;
  ageMinutes?: number;
  holderCount?: number;
}

export interface RiskAssessment {
  /** 0..100. */
  score: number;
  level: RiskLevel;
  factors: RiskFactor[];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function levelOf(score: number): RiskLevel {
  if (score < 25) {
    return "low";
  }
  if (score < 50) {
    return "medium";
  }
  if (score < 75) {
    return "high";
  }
  return "critical";
}

function percent(value: number): string {
  return (value * 100).toFixed(1) + "%";
}

export function assessRisk(input: RiskInput): RiskAssessment {
  const factors: RiskFactor[] = [];

  if (input.concentration !== undefined) {
    const top10 = input.concentration.topShares["10"] ?? 0;
    factors.push({
      id: "holder-concentration",
      label: "Top-10 holder concentration",
      weight: 0.25,
      severity: clamp01((top10 - 0.2) / 0.6),
      detail: "Top 10 wallets hold " + percent(top10) + " of supply",
    });
  }

  if (input.bundles !== undefined) {
    factors.push({
      id: "bundled-entry",
      label: "Bundled entry",
      weight: 0.25,
      severity: clamp01(input.bundles.bundledTokenShare / 0.5),
      detail:
        input.bundles.bundledWallets +
        " wallets bundled for " +
        percent(input.bundles.bundledTokenShare) +
        " of observed tokens",
    });
  }

  if (input.dev !== undefined) {
    factors.push({
      id: "creator-history",
      label: "Creator history",
      weight: 0.2,
      severity: clamp01(input.dev.collapseRate),
      detail:
        input.dev.collapsed +
        " of " +
        input.dev.launches +
        " prior launches collapsed",
    });
  }

  if (input.liquidityUsd !== undefined) {
    const liquidity = input.liquidityUsd;
    factors.push({
      id: "liquidity",
      label: "Liquidity depth",
      weight: 0.15,
      severity: clamp01(1 - liquidity / 25_000),
      detail: "Liquidity is $" + Math.round(liquidity).toLocaleString("en-US"),
    });
  }

  const holders = input.holderCount ?? input.concentration?.holderCount;
  if (holders !== undefined) {
    factors.push({
      id: "holder-base",
      label: "Holder base",
      weight: 0.1,
      severity: clamp01(1 - holders / 200),
      detail: holders + " holders",
    });
  }

  if (input.ageMinutes !== undefined) {
    factors.push({
      id: "age",
      label: "Token age",
      weight: 0.05,
      severity: clamp01(1 - input.ageMinutes / 60),
      detail: "Launched " + Math.round(input.ageMinutes) + " minutes ago",
    });
  }

  if (factors.length === 0) {
    return { score: 0, level: "low", factors: [] };
  }

  let weighted = 0;
  let totalWeight = 0;
  for (const factor of factors) {
    weighted += factor.severity * factor.weight;
    totalWeight += factor.weight;
  }
  const score = totalWeight === 0 ? 0 : Math.round((weighted / totalWeight) * 100);

  return { score, level: levelOf(score), factors };
}
