/**
 * Developer / creator history.
 *
 * "Collapsed" is deliberately simple and auditable: a launch whose current
 * market cap fell to a small fraction of its peak. No hidden model, no
 * provider-specific score - so the terminal can explain every number.
 */

export interface LaunchRecord {
  mint: string;
  /** Unix milliseconds. */
  createdAt: number;
  peakMarketCap: bigint;
  currentMarketCap: bigint;
  graduated?: boolean;
  liquidityUsd?: number;
}

export interface DevProfileOptions {
  /** Fraction of peak below which a launch counts as collapsed. Default 0.05. */
  collapseRatio?: number;
  /** Ignore launches whose peak was too small to be meaningful. */
  minPeakMarketCap?: bigint;
}

export interface DevProfile {
  creator: string;
  launches: number;
  graduated: number;
  collapsed: number;
  collapseRate: number;
  medianPeakMarketCap: number | null;
  flags: string[];
}

export class DevHistoryError extends Error {
  public override readonly name = "DevHistoryError";
}

export function isCollapsed(launch: LaunchRecord, options: DevProfileOptions = {}): boolean {
  const ratio = options.collapseRatio ?? 0.05;
  if (launch.peakMarketCap <= 0n) {
    return false;
  }
  const floor = (launch.peakMarketCap * BigInt(Math.round(ratio * 10_000))) / 10_000n;
  return launch.currentMarketCap <= floor;
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] as number;
  }
  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

export function buildDevProfile(
  creator: string,
  launches: LaunchRecord[],
  options: DevProfileOptions = {},
): DevProfile {
  const minPeak = options.minPeakMarketCap ?? 0n;
  const relevant = launches.filter((launch) => launch.peakMarketCap >= minPeak);

  let graduated = 0;
  let collapsed = 0;
  const peaks: number[] = [];
  for (const launch of relevant) {
    if (launch.graduated === true) {
      graduated += 1;
    }
    if (isCollapsed(launch, options)) {
      collapsed += 1;
    }
    peaks.push(Number(launch.peakMarketCap));
  }

  const rate = relevant.length === 0 ? 0 : collapsed / relevant.length;
  const flags: string[] = [];
  if (relevant.length >= 5) {
    flags.push("serial-launcher");
  }
  if (relevant.length >= 2 && rate >= 0.5) {
    flags.push("high-collapse-rate");
  }
  if (relevant.length >= 3 && graduated === 0) {
    flags.push("no-graduations");
  }
  if (relevant.length === 1 && collapsed === 1) {
    flags.push("single-collapsed-launch");
  }

  return {
    creator,
    launches: relevant.length,
    graduated,
    collapsed,
    collapseRate: rate,
    medianPeakMarketCap: median(peaks),
    flags,
  };
}
