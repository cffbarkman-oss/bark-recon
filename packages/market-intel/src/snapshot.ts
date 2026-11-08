import type { HolderBalance } from "./holders.js";

/**
 * Adapters from RPC snapshots to the concentration model.
 *
 * getTokenLargestAccounts returns at most 20 accounts. That is a real limit,
 * not a bug to paper over: a report built from it is a *top-N* concentration
 * measurement, and callers must not present it as a full distribution.
 */

export interface LargestAccount {
  address: string;
  /** Base units, as returned by the RPC. */
  amount: bigint;
  /** Owner wallet, when the caller resolved it. */
  owner?: string;
}

export interface HolderSnapshot {
  balances: HolderBalance[];
  /** How many accounts the snapshot actually covers. */
  coveredAccounts: number;
  /** True when the source was capped (for example the 20-account RPC cap). */
  truncated: boolean;
}

/**
 * Builds holder balances from largest-account rows.
 *
 * Ownership matters: several token accounts can belong to one wallet, and
 * concentration measured per *account* overstates distribution while
 * concentration measured per *owner* is what a trader cares about. When an
 * owner is known it is used as the balance key, so duplicates merge.
 */
export function toHolderBalances(accounts: LargestAccount[]): HolderBalance[] {
  const merged = new Map<string, bigint>();
  for (const account of accounts) {
    if (account.amount <= 0n) {
      continue;
    }
    const key = account.owner ?? account.address;
    merged.set(key, (merged.get(key) ?? 0n) + account.amount);
  }
  const balances: HolderBalance[] = [];
  for (const [owner, amount] of merged) {
    balances.push({ owner, amount });
  }
  return balances.sort((a, b) => (a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1));
}

export function buildHolderSnapshot(
  accounts: LargestAccount[],
  options: { truncated?: boolean } = {},
): HolderSnapshot {
  return {
    balances: toHolderBalances(accounts),
    coveredAccounts: accounts.length,
    truncated: options.truncated ?? accounts.length >= 20,
  };
}
