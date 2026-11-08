import { ByteReader, PublicKey } from "@bark/solana";
import { DISCRIMINATORS, matchesDiscriminator } from "./programs.js";

/**
 * Swap events.
 *
 * SellEvent decodes in full and the captured payload consumes exactly its 441
 * body bytes. BuyEvent uses the same shape plus three fields the sell path does
 * not carry (min_base_amount_out, quote_amount_in_with_lp_fee, user_quote_amount_in)
 * and has not been observed in this capture - it is decoded from the IDL and
 * marked as such.
 *
 * The relevant fee arithmetic, verified on the sell:
 *
 *   1,140,772,847,528 base in
 *   gross out            8,415,430,628
 *   lp fee   20 bps         16,830,862
 *   protocol  5 bps          4,207,716
 *   creator  75 bps         63,115,730
 *   user received        8,331,276,320
 *
 * Every fee is ceil(gross x bps / 10,000), and the three sum to exactly 1% of
 * gross. The pool's quote reserve falls by gross, not by the user's proceeds.
 */

export interface AmmSellEvent {
  layout: "sell";
  timestamp: number;
  baseAmountIn: bigint;
  minQuoteAmountOut: bigint;
  userBaseTokenReserves: bigint;
  userQuoteTokenReserves: bigint;
  poolBaseTokenReserves: bigint;
  poolQuoteTokenReserves: bigint;
  quoteAmountOut: bigint;
  lpFeeBasisPoints: number;
  lpFee: bigint;
  protocolFeeBasisPoints: number;
  protocolFee: bigint;
  quoteAmountOutWithoutLpFee: bigint;
  userQuoteAmountOut: bigint;
  pool: PublicKey;
  user: PublicKey;
  userBaseTokenAccount: PublicKey;
  userQuoteTokenAccount: PublicKey;
  protocolFeeRecipient: PublicKey;
  protocolFeeRecipientTokenAccount: PublicKey;
  coinCreator: PublicKey;
  coinCreatorFeeBasisPoints: number;
  coinCreatorFee: bigint;
  cashbackFeeBasisPoints: number;
  cashback: bigint;
  buybackFeeBasisPoints: number;
  buybackFee: bigint;
  virtualQuoteReserves: bigint;
  canBoost: boolean;
  baseSupply: bigint;
  holderRewardsBps: number;
  holderRewards: bigint;
  creatorFeeUnclaimed: bigint;
  quoteTransferFee: bigint;
  trailing: Uint8Array;
}

export interface AmmBuyEvent {
  layout: "buy";
  timestamp: number;
  baseAmountOut: bigint;
  maxQuoteAmountIn: bigint;
  userBaseTokenReserves: bigint;
  userQuoteTokenReserves: bigint;
  poolBaseTokenReserves: bigint;
  poolQuoteTokenReserves: bigint;
  quoteAmountIn: bigint;
  lpFeeBasisPoints: number;
  lpFee: bigint;
  protocolFeeBasisPoints: number;
  protocolFee: bigint;
  quoteAmountInWithLpFee: bigint;
  userQuoteAmountIn: bigint;
  pool: PublicKey;
  user: PublicKey;
  userBaseTokenAccount: PublicKey;
  userQuoteTokenAccount: PublicKey;
  protocolFeeRecipient: PublicKey;
  protocolFeeRecipientTokenAccount: PublicKey;
  coinCreator: PublicKey;
  coinCreatorFeeBasisPoints: number;
  coinCreatorFee: bigint;
  trackVolume: boolean;
  totalUnclaimedTokens: bigint;
  totalClaimedTokens: bigint;
  currentSolVolume: bigint;
  lastUpdateTimestamp: number;
  minBaseAmountOut: bigint;
  ixName: string;
  cashbackFeeBasisPoints: number;
  cashback: bigint;
  buybackFeeBasisPoints: number;
  buybackFee: bigint;
  virtualQuoteReserves: bigint;
  canBoost: boolean;
  baseSupply: bigint;
  holderRewardsBps: number;
  holderRewards: bigint;
  creatorFeeUnclaimed: bigint;
  quoteTransferFee: bigint;
  trailing: Uint8Array;
  /** True when decoded from the IDL without a live sample. */
  unverified: boolean;
}

export type AmmSwapEvent = AmmSellEvent | AmmBuyEvent;

export class EventDecodeError extends Error {
  public override readonly name = "EventDecodeError";
}

function readString(reader: ByteReader): string {
  const length = reader.u32();
  return new TextDecoder().decode(reader.bytes(length));
}

export function decodeSellEvent(data: Uint8Array): AmmSellEvent {
  if (!matchesDiscriminator(data, DISCRIMINATORS.sellEvent)) {
    throw new EventDecodeError("Not a PumpSwap SellEvent");
  }
  const r = new ByteReader(data);
  r.skip(8);
  const event: AmmSellEvent = {
    layout: "sell",
    timestamp: Number(r.i64()),
    baseAmountIn: r.u64(),
    minQuoteAmountOut: r.u64(),
    userBaseTokenReserves: r.u64(),
    userQuoteTokenReserves: r.u64(),
    poolBaseTokenReserves: r.u64(),
    poolQuoteTokenReserves: r.u64(),
    quoteAmountOut: r.u64(),
    lpFeeBasisPoints: Number(r.u64()),
    lpFee: r.u64(),
    protocolFeeBasisPoints: Number(r.u64()),
    protocolFee: r.u64(),
    quoteAmountOutWithoutLpFee: r.u64(),
    userQuoteAmountOut: r.u64(),
    pool: new PublicKey(r.bytes(32)),
    user: new PublicKey(r.bytes(32)),
    userBaseTokenAccount: new PublicKey(r.bytes(32)),
    userQuoteTokenAccount: new PublicKey(r.bytes(32)),
    protocolFeeRecipient: new PublicKey(r.bytes(32)),
    protocolFeeRecipientTokenAccount: new PublicKey(r.bytes(32)),
    coinCreator: new PublicKey(r.bytes(32)),
    coinCreatorFeeBasisPoints: Number(r.u64()),
    coinCreatorFee: r.u64(),
    cashbackFeeBasisPoints: Number(r.u64()),
    cashback: r.u64(),
    buybackFeeBasisPoints: Number(r.u64()),
    buybackFee: r.u64(),
    virtualQuoteReserves: 0n,
    canBoost: false,
    baseSupply: 0n,
    holderRewardsBps: 0,
    holderRewards: 0n,
    creatorFeeUnclaimed: 0n,
    quoteTransferFee: 0n,
    trailing: new Uint8Array(0),
  };
  event.virtualQuoteReserves = r.i128();
  event.canBoost = r.bool();
  event.baseSupply = r.u64();
  event.holderRewardsBps = Number(r.u64());
  event.holderRewards = r.u64();
  event.creatorFeeUnclaimed = r.u64();
  event.quoteTransferFee = r.u64();
  event.trailing = r.rest();
  return event;
}

export function decodeBuyEvent(data: Uint8Array): AmmBuyEvent {
  if (!matchesDiscriminator(data, DISCRIMINATORS.buyEvent)) {
    throw new EventDecodeError("Not a PumpSwap BuyEvent");
  }
  const r = new ByteReader(data);
  r.skip(8);
  const event: AmmBuyEvent = {
    layout: "buy",
    timestamp: Number(r.i64()),
    baseAmountOut: r.u64(),
    maxQuoteAmountIn: r.u64(),
    userBaseTokenReserves: r.u64(),
    userQuoteTokenReserves: r.u64(),
    poolBaseTokenReserves: r.u64(),
    poolQuoteTokenReserves: r.u64(),
    quoteAmountIn: r.u64(),
    lpFeeBasisPoints: Number(r.u64()),
    lpFee: r.u64(),
    protocolFeeBasisPoints: Number(r.u64()),
    protocolFee: r.u64(),
    quoteAmountInWithLpFee: r.u64(),
    userQuoteAmountIn: r.u64(),
    pool: new PublicKey(r.bytes(32)),
    user: new PublicKey(r.bytes(32)),
    userBaseTokenAccount: new PublicKey(r.bytes(32)),
    userQuoteTokenAccount: new PublicKey(r.bytes(32)),
    protocolFeeRecipient: new PublicKey(r.bytes(32)),
    protocolFeeRecipientTokenAccount: new PublicKey(r.bytes(32)),
    coinCreator: new PublicKey(r.bytes(32)),
    coinCreatorFeeBasisPoints: Number(r.u64()),
    coinCreatorFee: r.u64(),
    trackVolume: r.bool(),
    totalUnclaimedTokens: r.u64(),
    totalClaimedTokens: r.u64(),
    currentSolVolume: r.u64(),
    lastUpdateTimestamp: Number(r.i64()),
    minBaseAmountOut: r.u64(),
    ixName: readString(r),
    cashbackFeeBasisPoints: Number(r.u64()),
    cashback: r.u64(),
    buybackFeeBasisPoints: Number(r.u64()),
    buybackFee: r.u64(),
    virtualQuoteReserves: 0n,
    canBoost: false,
    baseSupply: 0n,
    holderRewardsBps: 0,
    holderRewards: 0n,
    creatorFeeUnclaimed: 0n,
    quoteTransferFee: 0n,
    trailing: new Uint8Array(0),
    unverified: true,
  };
  event.virtualQuoteReserves = r.i128();
  event.canBoost = r.bool();
  event.baseSupply = r.u64();
  event.holderRewardsBps = Number(r.u64());
  event.holderRewards = r.u64();
  event.creatorFeeUnclaimed = r.u64();
  event.quoteTransferFee = r.u64();
  event.trailing = r.rest();
  return event;
}

export function decodeSwapEvent(data: Uint8Array): AmmSwapEvent | null {
  if (matchesDiscriminator(data, DISCRIMINATORS.sellEvent)) {
    return decodeSellEvent(data);
  }
  if (matchesDiscriminator(data, DISCRIMINATORS.buyEvent)) {
    return decodeBuyEvent(data);
  }
  return null;
}
