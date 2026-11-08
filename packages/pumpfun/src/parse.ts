import { PublicKey, type RpcInstruction, type RpcTransaction } from "@bark/solana";
import { DISCRIMINATORS, PUMP_PROGRAM_ID, PUMP_ROUTER_PROGRAM_ID } from "./programs.js";
import { decodeTradeEvent, type TradeEvent } from "./events.js";

/**
 * Transaction parsing.
 *
 * Strategy: decode the program's own events, never its instruction arguments.
 * The instruction surface changes between program versions (and now goes
 * through a router), while the TradeEvent payload stays decodable.
 *
 * Events arrive twice in current transactions: as a base64 "Program data:" log
 * line, and inside an emit_cpi instruction. Logs are read first and inner
 * instructions are only consulted when no log event exists, so a trade is
 * never counted twice.
 */

const PROGRAM_DATA_PREFIX = "Program data: ";

export interface PumpTrade {
  signature: string;
  slot: number;
  blockTime: number | null;
  kind: "buy" | "sell";
  mint: PublicKey;
  user: PublicKey;
  solAmount: bigint;
  tokenAmount: bigint;
  feeRecipient: PublicKey;
  creator: PublicKey | null;
  virtualSolReserves: bigint;
  virtualTokenReserves: bigint;
  realSolReserves: bigint;
  realTokenReserves: bigint;
  timestamp: number;
  layout: "v1" | "v2";
}

export interface ParsedPumpTransaction {
  signature: string;
  slot: number;
  blockTime: number | null;
  failed: boolean;
  computeUnits: number | null;
  trades: PumpTrade[];
}

function tradeKey(trade: { mint: PublicKey; user: PublicKey; solAmount: bigint }): string {
  return trade.mint.toBase58() + ":" + trade.user.toBase58() + ":" + trade.solAmount.toString();
}

function toPumpTrade(
  event: TradeEvent,
  context: { signature: string; slot: number; blockTime: number | null },
): PumpTrade {
  const kind = event.isBuy ? "buy" : "sell";
  return {
    signature: context.signature,
    slot: context.slot,
    blockTime: context.blockTime,
    kind,
    mint: event.mint,
    user: event.user,
    solAmount: event.solAmount,
    tokenAmount: event.tokenAmount,
    feeRecipient: event.feeRecipient,
    creator: event.layout === "v2" ? event.creator : null,
    virtualSolReserves: event.virtualSolReserves,
    virtualTokenReserves: event.virtualTokenReserves,
    realSolReserves: event.realSolReserves,
    realTokenReserves: event.realTokenReserves,
    timestamp: event.timestamp,
    layout: event.layout,
  };
}

function decodeBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

export interface ParseOptions {
  /** Override for tests; defaults to the known pump.fun program ids. */
  programIds?: PublicKey[];
}

/**
 * Parses a confirmed transaction into trades.
 *
 * Returns an empty list for unrelated transactions rather than throwing -
 * callers routinely stream every transaction of a wallet and only care about
 * the ones that touched a curve.
 */
export function parsePumpTransaction(
  transaction: RpcTransaction,
  options: ParseOptions = {},
): ParsedPumpTransaction {
  const signature = transaction.transaction.signatures[0] ?? "";
  const slot = transaction.slot;
  const blockTime = transaction.blockTime ?? null;
  const meta = transaction.meta;
  const logs = meta?.logMessages ?? [];

  const trades: PumpTrade[] = [];
  const seen = new Set<string>();

  for (const line of logs) {
    if (!line.startsWith(PROGRAM_DATA_PREFIX)) {
      continue;
    }
    let payload: Uint8Array;
    try {
      payload = decodeBase64(line.slice(PROGRAM_DATA_PREFIX.length));
    } catch {
      continue;
    }
    if (payload.length < 8) {
      continue;
    }
    let isTrade = true;
    for (let i = 0; i < 8; i += 1) {
      if (payload[i] !== Number.parseInt(DISCRIMINATORS.tradeEvent.slice(i * 2, i * 2 + 2), 16)) {
        isTrade = false;
        break;
      }
    }
    if (!isTrade) {
      continue;
    }
    try {
      const event = decodeTradeEvent(payload);
      const trade = toPumpTrade(event, { signature, slot, blockTime });
      const key = tradeKey(trade);
      if (!seen.has(key)) {
        seen.add(key);
        trades.push(trade);
      }
    } catch {
      continue;
    }
  }

  if (trades.length === 0) {
    collectFromInnerInstructions(transaction, options, trades, seen);
  }

  return {
    signature,
    slot,
    blockTime,
    failed: meta?.err !== null && meta?.err !== undefined,
    computeUnits: meta?.computeUnitsConsumed ?? null,
    trades,
  };
}

function collectFromInnerInstructions(
  transaction: RpcTransaction,
  options: ParseOptions,
  trades: PumpTrade[],
  seen: Set<string>,
): void {
  const accepted = options.programIds ?? [PUMP_PROGRAM_ID, PUMP_ROUTER_PROGRAM_ID];
  const groups = transaction.meta?.innerInstructions ?? [];
  const context = {
    signature: transaction.transaction.signatures[0] ?? "",
    slot: transaction.slot,
    blockTime: transaction.blockTime ?? null,
  };

  for (const group of groups) {
    for (const instruction of group.instructions ?? []) {
      const programId = (instruction as RpcInstruction).programId;
      if (programId === undefined) {
        continue;
      }
      let allowed = false;
      for (const candidate of accepted) {
        if (candidate.toBase58() === programId) {
          allowed = true;
          break;
        }
      }
      if (!allowed || typeof instruction.data !== "string") {
        continue;
      }
      let payload: Uint8Array;
      try {
        payload = decodeBase64(instruction.data);
      } catch {
        continue;
      }
      if (payload.length <= 8) {
        continue;
      }
      const isEventCpi = DISCRIMINATORS.eventCpi;
      let matches = true;
      for (let i = 0; i < 8; i += 1) {
        if (payload[i] !== Number.parseInt(isEventCpi.slice(i * 2, i * 2 + 2), 16)) {
          matches = false;
          break;
        }
      }
      if (!matches) {
        continue;
      }
      try {
        const event = decodeTradeEvent(payload.slice(8));
        const trade = toPumpTrade(event, context);
        const key = tradeKey(trade);
        if (!seen.has(key)) {
          seen.add(key);
          trades.push(trade);
        }
      } catch {
        continue;
      }
    }
  }
}

/** Convenience wrapper for callers that only have the raw log array. */
export function parsePumpLogs(
  logs: string[],
  context: { signature: string; slot: number; blockTime?: number | null },
): PumpTrade[] {
  return parsePumpTransaction({
    slot: context.slot,
    blockTime: context.blockTime ?? null,
    meta: { err: null, fee: 0, preBalances: [], postBalances: [], logMessages: logs },
    transaction: { message: { accountKeys: [], instructions: [] }, signatures: [context.signature] },
  }).trades;
}
