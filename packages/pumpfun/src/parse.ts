import { PublicKey, type RpcInstruction, type RpcTransaction } from "@bark/solana";
import { DISCRIMINATORS, PUMP_PROGRAM_ID, PUMP_ROUTER_PROGRAM_ID } from "./programs.js";
import {
  decodePumpEvent,
  type CreateEvent,
  type Shareholder,
  type TradeEvent,
} from "./events.js";

/**
 * Transaction parsing.
 *
 * Strategy: decode the program's own events, never its instruction arguments.
 * The instruction surface changes between versions and now routes through a
 * second program; the event payload stays decodable.
 *
 * Current transactions carry each event twice - once as a base64
 * "Program data:" log line, once inside an emit_cpi instruction. Logs win, and
 * inner instructions are only consulted when no log event exists, so nothing
 * is counted twice.
 */

const PROGRAM_DATA_PREFIX = "Program data: ";

export interface PumpTrade {
  signature: string;
  slot: number;
  blockTime: number | null;
  kind: "buy" | "sell";
  mint: PublicKey;
  user: PublicKey;
  creator: PublicKey | null;
  feeRecipient: PublicKey;
  solAmount: bigint;
  tokenAmount: bigint;
  feeBasisPoints: number;
  fee: bigint;
  creatorFeeBasisPoints: number;
  creatorFee: bigint;
  quoteMint: PublicKey | null;
  quoteAmount: bigint;
  virtualSolReserves: bigint;
  virtualTokenReserves: bigint;
  realSolReserves: bigint;
  realTokenReserves: bigint;
  virtualQuoteReserves: bigint;
  realQuoteReserves: bigint;
  timestamp: number;
  ixName: string;
  mayhemMode: boolean;
  cashback: bigint;
  buybackFee: bigint;
  shareholders: Shareholder[];
  layout: "v1" | "v2";
}

export interface PumpCreate {
  signature: string;
  slot: number;
  blockTime: number | null;
  name: string;
  symbol: string;
  uri: string;
  mint: PublicKey;
  bondingCurve: PublicKey;
  user: PublicKey;
  creator: PublicKey;
  tokenProgram: PublicKey;
  timestamp: number;
  virtualQuoteReserves: bigint;
  virtualTokenReserves: bigint;
  realTokenReserves: bigint;
  tokenTotalSupply: bigint;
  quoteMint: PublicKey | null;
  creatorFeeBps: bigint;
  isMayhemMode: boolean;
  isCashbackEnabled: boolean;
  isHolderReward: boolean;
  depth: number;
}

export interface PumpCompletion {
  signature: string;
  slot: number;
  blockTime: number | null;
  mint: PublicKey;
  bondingCurve: PublicKey;
  user: PublicKey;
  timestamp: number;
  quoteMint: PublicKey | null;
}

export interface ParsedPumpTransaction {
  signature: string;
  slot: number;
  blockTime: number | null;
  failed: boolean;
  computeUnits: number | null;
  trades: PumpTrade[];
  creates: PumpCreate[];
  completions: PumpCompletion[];
}

interface Context {
  signature: string;
  slot: number;
  blockTime: number | null;
}

function toTrade(event: TradeEvent, context: Context): PumpTrade {
  const base = {
    signature: context.signature,
    slot: context.slot,
    blockTime: context.blockTime,
    kind: (event.isBuy ? "buy" : "sell") as "buy" | "sell",
    mint: event.mint,
    user: event.user,
    feeRecipient: event.feeRecipient,
    solAmount: event.solAmount,
    tokenAmount: event.tokenAmount,
    virtualSolReserves: event.virtualSolReserves,
    virtualTokenReserves: event.virtualTokenReserves,
    realSolReserves: event.realSolReserves,
    realTokenReserves: event.realTokenReserves,
    timestamp: event.timestamp,
    layout: event.layout,
  };

  if (event.layout === "v1") {
    return {
      ...base,
      creator: null,
      feeBasisPoints: 0,
      fee: event.feeAmount,
      creatorFeeBasisPoints: 0,
      creatorFee: event.creatorFee,
      quoteMint: null,
      quoteAmount: event.solAmount,
      virtualQuoteReserves: event.virtualSolReserves,
      realQuoteReserves: event.realSolReserves,
      ixName: event.isBuy ? "buy" : "sell",
      mayhemMode: false,
      cashback: 0n,
      buybackFee: 0n,
      shareholders: [],
    };
  }

  return {
    ...base,
    creator: event.creator,
    feeBasisPoints: event.feeBasisPoints,
    fee: event.fee,
    creatorFeeBasisPoints: event.creatorFeeBasisPoints,
    creatorFee: event.creatorFee,
    quoteMint: event.quoteMint,
    quoteAmount: event.quoteAmount,
    virtualQuoteReserves: event.virtualQuoteReserves,
    realQuoteReserves: event.realQuoteReserves,
    ixName: event.ixName,
    mayhemMode: event.mayhemMode,
    cashback: event.cashback,
    buybackFee: event.buybackFee,
    shareholders: event.shareholders,
  };
}

/** Builds the public launch record from a CreateEvent. */
export function toCreate(event: CreateEvent, context: Context): PumpCreate {
  return {
    signature: context.signature,
    slot: context.slot,
    blockTime: context.blockTime,
    name: event.name,
    symbol: event.symbol,
    uri: event.uri,
    mint: event.mint,
    bondingCurve: event.bondingCurve,
    user: event.user,
    creator: event.creator,
    tokenProgram: event.tokenProgram,
    timestamp: event.timestamp,
    virtualQuoteReserves: event.virtualQuoteReserves,
    virtualTokenReserves: event.virtualTokenReserves,
    realTokenReserves: event.realTokenReserves,
    tokenTotalSupply: event.tokenTotalSupply,
    quoteMint: event.quoteMint,
    creatorFeeBps: event.creatorFeeBps,
    isMayhemMode: event.isMayhemMode,
    isCashbackEnabled: event.isCashbackEnabled,
    isHolderReward: event.isHolderReward,
    depth: event.depth,
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
 * Parses a confirmed transaction into typed pump.fun activity.
 *
 * Returns empty arrays for unrelated transactions rather than throwing -
 * callers routinely stream every transaction of a wallet or block.
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
  const context: Context = { signature, slot, blockTime };

  const trades: PumpTrade[] = [];
  const creates: PumpCreate[] = [];
  const completions: PumpCompletion[] = [];
  const seenTrades = new Set<string>();

  const ingest = (payload: Uint8Array): void => {
    let decoded: ReturnType<typeof decodePumpEvent>;
    try {
      decoded = decodePumpEvent(payload);
    } catch {
      return;
    }
    if (decoded.kind === "trade") {
      const trade = toTrade(decoded.event, context);
      const key = trade.mint.toBase58() + ":" + trade.user.toBase58() + ":" + trade.solAmount.toString();
      if (!seenTrades.has(key)) {
        seenTrades.add(key);
        trades.push(trade);
      }
      return;
    }
    if (decoded.kind === "create") {
      creates.push(toCreate(decoded.event, context));
      return;
    }
    if (decoded.kind === "complete") {
      completions.push({
        signature,
        slot,
        blockTime,
        mint: decoded.event.mint,
        bondingCurve: decoded.event.bondingCurve,
        user: decoded.event.user,
        timestamp: decoded.event.timestamp,
        quoteMint: decoded.event.quoteMint,
      });
    }
  };

  for (const line of logs) {
    if (!line.startsWith(PROGRAM_DATA_PREFIX)) {
      continue;
    }
    try {
      ingest(decodeBase64(line.slice(PROGRAM_DATA_PREFIX.length)));
    } catch {
      continue;
    }
  }

  if (trades.length === 0 && creates.length === 0) {
    collectFromInnerInstructions(transaction, options, ingest);
  }

  return {
    signature,
    slot,
    blockTime,
    failed: meta?.err !== null && meta?.err !== undefined,
    computeUnits: meta?.computeUnitsConsumed ?? null,
    trades,
    creates,
    completions,
  };
}

function collectFromInnerInstructions(
  transaction: RpcTransaction,
  options: ParseOptions,
  ingest: (payload: Uint8Array) => void,
): void {
  const accepted = (options.programIds ?? [PUMP_PROGRAM_ID, PUMP_ROUTER_PROGRAM_ID]).map((id) =>
    id.toBase58(),
  );
  const groups = transaction.meta?.innerInstructions ?? [];
  for (const group of groups) {
    for (const instruction of group.instructions ?? []) {
      const typed = instruction as RpcInstruction;
      if (typed.programId === undefined || !accepted.includes(typed.programId)) {
        continue;
      }
      if (typeof typed.data !== "string") {
        continue;
      }
      let payload: Uint8Array;
      try {
        payload = decodeBase64(typed.data);
      } catch {
        continue;
      }
      if (payload.length <= 8) {
        continue;
      }
      let matches = true;
      for (let i = 0; i < 8; i += 1) {
        if (payload[i] !== Number.parseInt(DISCRIMINATORS.eventCpi.slice(i * 2, i * 2 + 2), 16)) {
          matches = false;
          break;
        }
      }
      if (matches) {
        ingest(payload.slice(8));
      }
    }
  }
}

/** Convenience wrapper for callers that only have the raw log array. */
export function parsePumpLogs(
  logs: string[],
  context: { signature: string; slot: number; blockTime?: number | null },
): ParsedPumpTransaction {
  return parsePumpTransaction({
    slot: context.slot,
    blockTime: context.blockTime ?? null,
    meta: { err: null, fee: 0, preBalances: [], postBalances: [], logMessages: logs },
    transaction: {
      message: { accountKeys: [], instructions: [] },
      signatures: [context.signature],
    },
  });
}
