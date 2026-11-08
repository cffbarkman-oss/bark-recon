import { ByteReader, PublicKey } from "@bark/solana";
import { DISCRIMINATORS, matchesDiscriminator } from "./programs.js";

/**
 * Anchor event decoders.
 *
 * Layouts come from the IDL and are confirmed byte for byte against captures:
 * a sell payload is 383 body bytes, a buy payload 382 (the only difference is
 * one character in ixName), and both consume exactly to the last byte.
 *
 * Two traps this module exists to avoid:
 *
 * 1. Offset 153 used to be a fee *amount*. It is now fee_basis_points. Code
 *    written from the old spec reports a 95-lamport fee on every trade.
 * 2. The event carries both SOL and quote reserve pairs. For a SOL-quoted
 *    curve they are equal; for a USDC-quoted curve they are not, and using the
 *    SOL pair would report the wrong price.
 */

export const TRADE_EVENT_V1_BODY_LENGTH = 161;
export const TRADE_EVENT_V2_MIN_BODY_LENGTH = 375;

export interface TradeEventBase {
  mint: PublicKey;
  /** Quote moved by the trade in lamports, before fees. */
  solAmount: bigint;
  /** Tokens moved by the trade in base units. */
  tokenAmount: bigint;
  isBuy: boolean;
  user: PublicKey;
  timestamp: number;
  virtualSolReserves: bigint;
  virtualTokenReserves: bigint;
  realSolReserves: bigint;
  realTokenReserves: bigint;
  feeRecipient: PublicKey;
}

/** Legacy 161-byte payload: everything after creatorFee did not exist yet. */
export interface TradeEventV1 extends TradeEventBase {
  layout: "v1";
  feeAmount: bigint;
  creatorFee: bigint;
}

export interface Shareholder {
  address: PublicKey;
  shareBps: number;
}

/** Current payload, decoded in full. */
export interface TradeEventV2 extends TradeEventBase {
  layout: "v2";
  feeBasisPoints: number;
  fee: bigint;
  creator: PublicKey;
  creatorFeeBasisPoints: number;
  creatorFee: bigint;
  trackVolume: boolean;
  totalUnclaimedTokens: bigint;
  totalClaimedTokens: bigint;
  currentSolVolume: bigint;
  lastUpdateTimestamp: number;
  /** "buy" or "sell" - the instruction that produced this event. */
  ixName: string;
  mayhemMode: boolean;
  cashbackFeeBasisPoints: number;
  cashback: bigint;
  buybackFeeBasisPoints: number;
  buybackFee: bigint;
  shareholders: Shareholder[];
  /** Zeroed for SOL-quoted curves. */
  quoteMint: PublicKey | null;
  quoteAmount: bigint;
  virtualQuoteReserves: bigint;
  realQuoteReserves: bigint;
  holderRewardsBps: number;
  holderRewards: bigint;
  creatorFeeUnclaimed: bigint;
  quoteTransferFee: bigint;
  /** Bytes beyond the known layout, kept for forward compatibility. */
  trailing: Uint8Array;
}

export type TradeEvent = TradeEventV1 | TradeEventV2;

export class EventDecodeError extends Error {
  public override readonly name = "EventDecodeError";
}

function readCommon(reader: ByteReader): TradeEventBase {
  return {
    mint: new PublicKey(reader.bytes(32)),
    solAmount: reader.u64(),
    tokenAmount: reader.u64(),
    isBuy: reader.bool(),
    user: new PublicKey(reader.bytes(32)),
    timestamp: Number(reader.i64()),
    virtualSolReserves: reader.u64(),
    virtualTokenReserves: reader.u64(),
    realSolReserves: reader.u64(),
    realTokenReserves: reader.u64(),
    feeRecipient: new PublicKey(reader.bytes(32)),
  };
}

function readString(reader: ByteReader): string {
  const length = reader.u32();
  return new TextDecoder().decode(reader.bytes(length));
}

function isZero(bytes: Uint8Array): boolean {
  for (const byte of bytes) {
    if (byte !== 0) {
      return false;
    }
  }
  return true;
}

/**
 * Decodes a TradeEvent payload including its 8-byte discriminator.
 *
 * Layout is selected from the payload length so historical and current
 * transactions decode through one call site.
 */
export function decodeTradeEvent(data: Uint8Array): TradeEvent {
  if (!matchesDiscriminator(data, DISCRIMINATORS.tradeEvent)) {
    throw new EventDecodeError("Not a pump.fun TradeEvent");
  }

  const reader = new ByteReader(data);
  reader.skip(8);
  const base = readCommon(reader);
  const bodyLength = data.length - 8;

  if (bodyLength === TRADE_EVENT_V1_BODY_LENGTH) {
    return { ...base, layout: "v1", feeAmount: reader.u64(), creatorFee: reader.u64() };
  }

  if (bodyLength < TRADE_EVENT_V2_MIN_BODY_LENGTH) {
    throw new EventDecodeError(
      "TradeEvent body length " + bodyLength + " matches no known layout",
    );
  }

  const feeBasisPoints = Number(reader.u64());
  const fee = reader.u64();
  const creator = new PublicKey(reader.bytes(32));
  const creatorFeeBasisPoints = Number(reader.u64());
  const creatorFee = reader.u64();
  const trackVolume = reader.bool();
  const totalUnclaimedTokens = reader.u64();
  const totalClaimedTokens = reader.u64();
  const currentSolVolume = reader.u64();
  const lastUpdateTimestamp = Number(reader.i64());
  const ixName = readString(reader);
  const mayhemMode = reader.bool();
  const cashbackFeeBasisPoints = Number(reader.u64());
  const cashback = reader.u64();
  const buybackFeeBasisPoints = Number(reader.u64());
  const buybackFee = reader.u64();

  const shareholderCount = reader.u32();
  const shareholders: Shareholder[] = [];
  for (let i = 0; i < shareholderCount; i += 1) {
    shareholders.push({
      address: new PublicKey(reader.bytes(32)),
      shareBps: reader.u16(),
    });
  }

  const quoteMintBytes = reader.bytes(32);
  const event: TradeEventV2 = {
    ...base,
    layout: "v2",
    feeBasisPoints,
    fee,
    creator,
    creatorFeeBasisPoints,
    creatorFee,
    trackVolume,
    totalUnclaimedTokens,
    totalClaimedTokens,
    currentSolVolume,
    lastUpdateTimestamp,
    ixName,
    mayhemMode,
    cashbackFeeBasisPoints,
    cashback,
    buybackFeeBasisPoints,
    buybackFee,
    shareholders,
    quoteMint: isZero(quoteMintBytes) ? null : new PublicKey(quoteMintBytes),
    quoteAmount: reader.u64(),
    virtualQuoteReserves: reader.u64(),
    realQuoteReserves: reader.u64(),
    holderRewardsBps: Number(reader.u64()),
    holderRewards: reader.u64(),
    creatorFeeUnclaimed: reader.u64(),
    quoteTransferFee: reader.u64(),
    trailing: new Uint8Array(0),
  };

  event.trailing = reader.rest();
  return event;
}

/** Emitted once when a curve is created. */
export interface CreateEvent {
  name: string;
  symbol: string;
  uri: string;
  mint: PublicKey;
  bondingCurve: PublicKey;
  user: PublicKey;
  creator: PublicKey;
  timestamp: number;
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  tokenTotalSupply: bigint;
  tokenProgram: PublicKey;
  isMayhemMode: boolean;
  isCashbackEnabled: boolean;
  quoteMint: PublicKey | null;
  virtualQuoteReserves: bigint;
  creatorFeeBps: bigint;
  isHolderReward: boolean;
  depth: number;
  trailing: Uint8Array;
}

/** Emitted when a curve graduates and liquidity migrates. */
export interface CompleteEvent {
  user: PublicKey;
  mint: PublicKey;
  bondingCurve: PublicKey;
  timestamp: number;
  quoteMint: PublicKey | null;
  trailing: Uint8Array;
}

export function decodeCreateEvent(data: Uint8Array): CreateEvent {
  if (!matchesDiscriminator(data, DISCRIMINATORS.createEvent)) {
    throw new EventDecodeError("Not a pump.fun CreateEvent");
  }
  const reader = new ByteReader(data);
  reader.skip(8);

  const name = readString(reader);
  const symbol = readString(reader);
  const uri = readString(reader);
  const mint = new PublicKey(reader.bytes(32));
  const bondingCurve = new PublicKey(reader.bytes(32));
  const user = new PublicKey(reader.bytes(32));
  const creator = new PublicKey(reader.bytes(32));
  const timestamp = Number(reader.i64());
  const virtualTokenReserves = reader.u64();
  const virtualSolReserves = reader.u64();
  const realTokenReserves = reader.u64();
  const tokenTotalSupply = reader.u64();
  const tokenProgram = new PublicKey(reader.bytes(32));
  const isMayhemMode = reader.bool();
  const isCashbackEnabled = reader.bool();
  const quoteMintBytes = reader.bytes(32);
  const virtualQuoteReserves = reader.u64();
  const creatorFeeBps = reader.u64();
  const isHolderReward = reader.bool();
  const depth = reader.u8();

  return {
    name,
    symbol,
    uri,
    mint,
    bondingCurve,
    user,
    creator,
    timestamp,
    virtualTokenReserves,
    virtualSolReserves,
    realTokenReserves,
    tokenTotalSupply,
    tokenProgram,
    isMayhemMode,
    isCashbackEnabled,
    quoteMint: isZero(quoteMintBytes) ? null : new PublicKey(quoteMintBytes),
    virtualQuoteReserves,
    creatorFeeBps,
    isHolderReward,
    depth,
    trailing: reader.rest(),
  };
}

export function decodeCompleteEvent(data: Uint8Array): CompleteEvent {
  if (!matchesDiscriminator(data, DISCRIMINATORS.completeEvent)) {
    throw new EventDecodeError("Not a pump.fun CompleteEvent");
  }
  const reader = new ByteReader(data);
  reader.skip(8);
  const user = new PublicKey(reader.bytes(32));
  const mint = new PublicKey(reader.bytes(32));
  const bondingCurve = new PublicKey(reader.bytes(32));
  const timestamp = Number(reader.i64());
  const quoteMintBytes = reader.bytes(32);
  return {
    user,
    mint,
    bondingCurve,
    timestamp,
    quoteMint: isZero(quoteMintBytes) ? null : new PublicKey(quoteMintBytes),
    trailing: reader.rest(),
  };
}

export type PumpEvent =
  | { kind: "trade"; event: TradeEvent }
  | { kind: "create"; event: CreateEvent }
  | { kind: "complete"; event: CompleteEvent }
  | { kind: "unknown"; discriminator: string };

/** Dispatches a raw event payload to the right decoder. */
export function decodePumpEvent(data: Uint8Array): PumpEvent {
  if (matchesDiscriminator(data, DISCRIMINATORS.tradeEvent)) {
    return { kind: "trade", event: decodeTradeEvent(data) };
  }
  if (matchesDiscriminator(data, DISCRIMINATORS.createEvent)) {
    return { kind: "create", event: decodeCreateEvent(data) };
  }
  if (matchesDiscriminator(data, DISCRIMINATORS.completeEvent)) {
    return { kind: "complete", event: decodeCompleteEvent(data) };
  }
  let hex = "";
  for (let i = 0; i < Math.min(8, data.length); i += 1) {
    hex += (data[i] as number).toString(16).padStart(2, "0");
  }
  return { kind: "unknown", discriminator: hex };
}
