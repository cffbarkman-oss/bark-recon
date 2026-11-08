import { ByteReader, PublicKey } from "@bark/solana";
import { DISCRIMINATORS, matchesDiscriminator } from "./programs.js";

/**
 * Anchor event decoders.
 *
 * The TradeEvent discriminator is stable, but the payload grew: v1 ended after
 * "creatorFee" (161 body bytes), while the current program appends a creator
 * pubkey, additional u64s and an opaque tail (383 body bytes).
 *
 * Verified against a live mainnet transaction. Offsets 0..161 line up exactly
 * with the documented v1 layout: mint, solAmount, tokenAmount, isBuy, user,
 * timestamp and the four reserve fields all matched the transaction's logs and
 * account state.
 *
 * One semantic caveat discovered during recon: in the v2 payload the u64 that
 * v1 called feeAmount holds 95 - the creator fee in basis points - not the
 * protocol fee amount. The v2 decoder therefore names it creatorFeeBps and
 * keeps feeAmount reserved for v1.
 */

export const TRADE_EVENT_V1_BODY_LENGTH = 161;
export const TRADE_EVENT_V2_BODY_LENGTH = 383;

export interface TradeEventBase {
  mint: PublicKey;
  /** Gross SOL moved by the trade, in lamports. */
  solAmount: bigint;
  /** Tokens moved by the trade, in base units. */
  tokenAmount: bigint;
  isBuy: boolean;
  user: PublicKey;
  /** Unix seconds as recorded by the program. */
  timestamp: number;
  virtualSolReserves: bigint;
  virtualTokenReserves: bigint;
  realSolReserves: bigint;
  realTokenReserves: bigint;
  feeRecipient: PublicKey;
}

export interface TradeEventV1 extends TradeEventBase {
  layout: "v1";
  feeAmount: bigint;
  creatorFee: bigint;
}

export interface TradeEventV2 extends TradeEventBase {
  layout: "v2";
  /** Creator fee rate in basis points (95 observed). */
  creatorFeeBps: number;
  /** Creator fee actually charged, in lamports. */
  creatorFee: bigint;
  creator: PublicKey;
  /** Unmapped remainder of the payload, preserved verbatim. */
  trailing: Uint8Array;
}

export type TradeEvent = TradeEventV1 | TradeEventV2;

export class EventDecodeError extends Error {
  public override readonly name = "EventDecodeError";
}

function readBase(reader: ByteReader): TradeEventBase {
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

/**
 * Decodes a TradeEvent payload, including its 8-byte discriminator.
 *
 * Layout is selected from the payload length so that historical transactions
 * and current ones decode with the same call site.
 */
export function decodeTradeEvent(data: Uint8Array): TradeEvent {
  if (!matchesDiscriminator(data, DISCRIMINATORS.tradeEvent)) {
    throw new EventDecodeError("Not a pump.fun TradeEvent");
  }

  const reader = new ByteReader(data);
  reader.skip(8);
  const base = readBase(reader);
  const bodyLength = data.length - 8;

  if (bodyLength <= TRADE_EVENT_V1_BODY_LENGTH) {
    return {
      ...base,
      layout: "v1",
      feeAmount: reader.u64(),
      creatorFee: reader.u64(),
    };
  }

  // v2: the slot that held feeAmount now carries the creator fee rate in bps.
  const creatorFeeBps = Number(reader.u64());
  const creatorFee = reader.u64();
  const creator = new PublicKey(reader.bytes(32));
  return {
    ...base,
    layout: "v2",
    creatorFeeBps,
    creatorFee,
    creator,
    trailing: reader.rest(),
  };
}

export interface CreateEvent {
  name: string;
  symbol: string;
  uri: string;
  mint: PublicKey;
  bondingCurve: PublicKey;
  user: PublicKey;
}

function readString(reader: ByteReader): string {
  const length = reader.u32();
  const bytes = reader.bytes(length);
  return new TextDecoder().decode(bytes);
}

/**
 * Decodes a CreateEvent payload.
 *
 * Layout follows the documented Anchor struct (three length-prefixed strings
 * followed by three keys). Not re-verified against a fresh creation in this
 * capture - treat as documented, not observed.
 */
export function decodeCreateEvent(data: Uint8Array): CreateEvent {
  if (!matchesDiscriminator(data, DISCRIMINATORS.createEvent)) {
    throw new EventDecodeError("Not a pump.fun CreateEvent");
  }
  const reader = new ByteReader(data);
  reader.skip(8);
  return {
    name: readString(reader),
    symbol: readString(reader),
    uri: readString(reader),
    mint: new PublicKey(reader.bytes(32)),
    bondingCurve: new PublicKey(reader.bytes(32)),
    user: new PublicKey(reader.bytes(32)),
  };
}
