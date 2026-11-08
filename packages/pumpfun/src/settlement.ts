import type { RpcTransaction } from "@bark/solana";
import type { PumpTrade } from "./parse.js";

/**
 * Settlement reconciliation from native balance deltas.
 *
 * Events describe intent; balances describe what actually moved. The two do
 * not have to agree - fee sharing, cashback and buybacks route value to
 * accounts the event never names - so anything that has to be *correct* (fees
 * charged, proceeds received) should be derived here, not from event fields.
 */

export interface NativeFlow {
  address: string;
  /** Signed change in lamports across the transaction. */
  delta: bigint;
}

/**
 * Every account in the transaction, in balance-array order.
 *
 * Versioned transactions resolve most accounts through address lookup tables,
 * so message.accountKeys holds only the static prefix. The balance arrays cover
 * static keys, then loaded writable, then loaded readonly - in that order.
 * Indexing balances against message.accountKeys alone silently attributes one
 * account's lamports to another.
 */
export function accountKeyList(transaction: RpcTransaction): string[] {
  const keys = transaction.transaction.message.accountKeys.map((key) => key.pubkey);
  const loaded = transaction.meta?.loadedAddresses;
  if (loaded === undefined) {
    return keys;
  }
  return [...keys, ...(loaded.writable ?? []), ...(loaded.readonly ?? [])];
}

/** Native lamport deltas for every account touched by the transaction. */
export function nativeFlows(transaction: RpcTransaction): NativeFlow[] {
  const meta = transaction.meta;
  if (meta === null) {
    return [];
  }
  const keys = accountKeyList(transaction);
  const flows: NativeFlow[] = [];
  for (let i = 0; i < keys.length; i += 1) {
    const before = meta.preBalances[i];
    const after = meta.postBalances[i];
    if (before === undefined || after === undefined) {
      continue;
    }
    const delta = BigInt(after) - BigInt(before);
    if (delta !== 0n) {
      flows.push({ address: keys[i] as string, delta });
    }
  }
  return flows.sort((a, b) => (a.delta === b.delta ? 0 : a.delta > b.delta ? -1 : 1));
}

export interface TradeSettlement {
  signature: string;
  /** Quote the trade moved, as stated by the event. */
  grossQuote: bigint;
  /** What the trading user's balance actually changed by. */
  userDelta: bigint;
  /** Gross minus user delta: fees, rent and the network fee. */
  totalCosts: bigint;
  /** Accounts that gained lamports, excluding the user. */
  credits: NativeFlow[];
  /** Network fee paid by the fee payer. */
  networkFee: bigint | null;
}

/**
 * Reconciles one trade against the transaction's balance deltas.
 *
 * For a sell the user delta should be slightly below grossQuote; the gap is
 * the real cost of the trade and is the number a PnL view must use.
 */
export function reconcileTrade(trade: PumpTrade, transaction: RpcTransaction): TradeSettlement {
  const flows = nativeFlows(transaction);
  const userFlow = flows.find((flow) => flow.address === trade.user.toBase58());
  const userDelta = userFlow === undefined ? 0n : userFlow.delta;
  const credits = flows.filter(
    (flow) => flow.delta > 0n && flow.address !== trade.user.toBase58(),
  );
  const meta = transaction.meta;
  return {
    signature: trade.signature,
    grossQuote: trade.solAmount,
    userDelta,
    totalCosts: trade.solAmount - userDelta,
    credits,
    networkFee: meta === null ? null : BigInt(meta.fee),
  };
}
