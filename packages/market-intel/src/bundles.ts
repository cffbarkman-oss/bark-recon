/**
 * Bundle detection.
 *
 * A "bundle" here is a set of wallets that entered a token together: same
 * slot, near-adjacent transaction indexes, and/or a shared funding source.
 * The output always carries the reason it fired so that the UI can show
 * evidence instead of an unexplained flag.
 */

export interface WalletBuy {
  wallet: string;
  slot: number;
  /** Position of the transaction inside the block. */
  txIndex: number;
  tokens: bigint;
  sol: bigint;
  /** First funding source, when the caller has resolved one. */
  funder?: string;
}

export interface BundleOptions {
  /** Maximum transaction-index distance inside a slot. Default 5. */
  maxTxGap?: number;
  /** Slots a single bundle may span when wallets share a funder. Default 1. */
  funderSlotWindow?: number;
  /** Minimum wallets to report a bundle. Default 2. */
  minWallets?: number;
}

export type BundleConfidence = "high" | "medium" | "low";

export interface Bundle {
  wallets: string[];
  firstSlot: number;
  lastSlot: number;
  tokens: bigint;
  sol: bigint;
  confidence: BundleConfidence;
  reasons: string[];
}

export interface BundleReport {
  bundles: Bundle[];
  bundledWallets: number;
  /** Share of observed tokens bought by bundled wallets, in [0, 1]. */
  bundledTokenShare: number;
  largestBundle: number;
  /** 0..100 summary used by the risk model. */
  score: number;
}

function sortByEntry(a: WalletBuy, b: WalletBuy): number {
  return a.slot === b.slot ? a.txIndex - b.txIndex : a.slot - b.slot;
}

function confidenceOf(wallets: WalletBuy[], sharedFunder: boolean): BundleConfidence {
  const slots = new Set(wallets.map((buy) => buy.slot));
  if (sharedFunder && slots.size === 1) {
    return "high";
  }
  if (sharedFunder || slots.size === 1) {
    return "medium";
  }
  return "low";
}

function toBundle(wallets: WalletBuy[], sharedFunder: boolean): Bundle {
  const slots = wallets.map((buy) => buy.slot);
  let tokens = 0n;
  let sol = 0n;
  for (const buy of wallets) {
    tokens += buy.tokens;
    sol += buy.sol;
  }
  const reasons: string[] = [];
  if (sharedFunder) {
    reasons.push("shared funding source");
  }
  if (new Set(slots).size === 1) {
    reasons.push("same slot");
  } else {
    reasons.push("adjacent slots");
  }
  if (wallets.length > 2) {
    reasons.push(wallets.length + " wallets");
  }

  return {
    wallets: wallets.map((buy) => buy.wallet),
    firstSlot: Math.min(...slots),
    lastSlot: Math.max(...slots),
    tokens,
    sol,
    confidence: confidenceOf(wallets, sharedFunder),
    reasons,
  };
}

function totalTokens(buys: WalletBuy[]): bigint {
  let total = 0n;
  for (const buy of buys) {
    total += buy.tokens;
  }
  return total;
}

/**
 * Detects bundles in a token's early buy set.
 *
 * Pass the first buys of a mint (roughly the first block or two); the heuristic
 * is about entry timing, not lifetime accumulation.
 */
export function detectBundles(buys: WalletBuy[], options: BundleOptions = {}): BundleReport {
  const maxTxGap = options.maxTxGap ?? 5;
  const slotWindow = options.funderSlotWindow ?? 1;
  const minWallets = Math.max(2, options.minWallets ?? 2);

  const grouped = [...buys].sort(sortByEntry);
  const claimed = new Set<string>();
  const bundles: Bundle[] = [];

  const byFunder = new Map<string, WalletBuy[]>();
  for (const buy of grouped) {
    if (buy.funder === undefined) {
      continue;
    }
    const members = byFunder.get(buy.funder) ?? [];
    members.push(buy);
    byFunder.set(buy.funder, members);
  }

  for (const members of byFunder.values()) {
    const sorted = members.slice().sort(sortByEntry);
    let run: WalletBuy[] = [];
    for (const buy of sorted) {
      const previous = run[run.length - 1];
      const adjacent =
        previous !== undefined &&
        (buy.slot === previous.slot
          ? buy.txIndex - previous.txIndex <= maxTxGap
          : buy.slot - previous.slot <= slotWindow);
      if (previous !== undefined && adjacent && !claimed.has(buy.wallet)) {
        run.push(buy);
      } else {
        if (run.length >= minWallets) {
          bundles.push(toBundle(run, true));
        }
        run = claimed.has(buy.wallet) ? [] : [buy];
      }
    }
    if (run.length >= minWallets) {
      bundles.push(toBundle(run, true));
    }
    for (const bundle of bundles) {
      for (const wallet of bundle.wallets) {
        claimed.add(wallet);
      }
    }
  }

  const unclaimed = grouped.filter((buy) => !claimed.has(buy.wallet));
  let run: WalletBuy[] = [];
  const flush = (): void => {
    if (run.length >= minWallets) {
      bundles.push(toBundle(run, false));
    }
    run = [];
  };

  for (const buy of unclaimed) {
    const previous = run[run.length - 1];
    const adjacent =
      previous !== undefined &&
      previous.slot === buy.slot &&
      buy.txIndex - previous.txIndex <= maxTxGap;
    if (previous === undefined || adjacent) {
      run.push(buy);
    } else {
      flush();
      run = [buy];
    }
  }
  flush();

  const allTokens = totalTokens(grouped);
  let bundledTokens = 0n;
  const bundledWallets = new Set<string>();
  let largest = 0;
  for (const bundle of bundles) {
    bundledTokens += bundle.tokens;
    largest = Math.max(largest, bundle.wallets.length);
    for (const wallet of bundle.wallets) {
      bundledWallets.add(wallet);
    }
  }

  const share = allTokens === 0n ? 0 : Number(bundledTokens) / Number(allTokens);
  const sizeFactor = Math.min(1, largest / 10);
  const score = Math.round(100 * (0.7 * share + 0.3 * sizeFactor));

  return {
    bundles,
    bundledWallets: bundledWallets.size,
    bundledTokenShare: share,
    largestBundle: largest,
    score,
  };
}
