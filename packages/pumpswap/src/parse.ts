import type { RpcInstruction, RpcTransaction } from "@bark/solana";
import { PublicKey } from "@bark/solana";
import { DISCRIMINATORS, PUMPSWAP_PROGRAM_ID } from "./programs.js";
import { decodeSwapEvent, type AmmSwapEvent } from "./events.js";

/**
 * Transaction parsing for PumpSwap.
 *
 * Same approach as the bonding curve: decode events, not instruction
 * arguments. Events arrive as base64 log lines and again through emit_cpi;
 * logs are read first so a swap is never counted twice.
 */

export interface AmmSwap {
  signature: string;
  slot: number;
  blockTime: number | null;
  side: "buy" | "sell";
  pool: PublicKey;
  user: PublicKey;
  baseAmount: bigint;
  quoteAmount: bigint;
  userQuoteAmount: bigint;
  lpFee: bigint;
  protocolFee: bigint;
  coinCreatorFee: bigint;
  coinCreator: PublicKey;
  /** Pool base reserve before the swap - events report pre-trade state. */
  poolBaseReserves: bigint;
  /** Pool quote reserve before the swap. */
  poolQuoteReserves: bigint;
  /** Virtual quote depth the curve prices against. */
  poolVirtualQuoteReserves: bigint;
  timestamp: number;
}

export interface ParsedAmmTransaction {
  signature: string;
  slot: number;
  blockTime: number | null;
  failed: boolean;
  swaps: AmmSwap[];
}

function toSwap(event: AmmSwapEvent, context: { signature: string; slot: number; blockTime: number | null }): AmmSwap {
  const base = {
    signature: context.signature,
    slot: context.slot,
    blockTime: context.blockTime,
    pool: event.pool,
    user: event.user,
    coinCreator: event.coinCreator,
    lpFee: event.lpFee,
    protocolFee: event.protocolFee,
    coinCreatorFee: event.coinCreatorFee,
    poolBaseReserves: event.poolBaseTokenReserves,
    poolQuoteReserves: event.poolQuoteTokenReserves,
    poolVirtualQuoteReserves: event.virtualQuoteReserves,
    timestamp: event.timestamp,
  };

  if (event.layout === "sell") {
    return {
      ...base,
      side: "sell",
      baseAmount: event.baseAmountIn,
      quoteAmount: event.quoteAmountOut,
      userQuoteAmount: event.userQuoteAmountOut,
    };
  }
  return {
    ...base,
    side: "buy",
    baseAmount: event.baseAmountOut,
    quoteAmount: event.quoteAmountIn,
    userQuoteAmount: event.userQuoteAmountIn,
  };
}

function decodeBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

export function parseAmmTransaction(transaction: RpcTransaction): ParsedAmmTransaction {
  const signature = transaction.transaction.signatures[0] ?? "";
  const context = {
    signature,
    slot: transaction.slot,
    blockTime: transaction.blockTime ?? null,
  };
  const swaps: AmmSwap[] = [];
  const seen = new Set<string>();

  const ingest = (payload: Uint8Array): void => {
    let event: AmmSwapEvent | null;
    try {
      event = decodeSwapEvent(payload);
    } catch {
      return;
    }
    if (event === null) {
      return;
    }
    const swap = toSwap(event, context);
    const key =
      swap.pool.toBase58() + ":" + swap.user.toBase58() + ":" + swap.baseAmount.toString();
    if (!seen.has(key)) {
      seen.add(key);
      swaps.push(swap);
    }
  };

  for (const line of transaction.meta?.logMessages ?? []) {
    if (line.startsWith("Program data: ")) {
      try {
        ingest(decodeBase64(line.slice(14)));
      } catch {
        continue;
      }
    }
  }

  if (swaps.length === 0) {
    for (const group of transaction.meta?.innerInstructions ?? []) {
      for (const instruction of group.instructions ?? []) {
        const typed = instruction as RpcInstruction;
        if (typed.programId !== PUMPSWAP_PROGRAM_ID.toBase58() || typeof typed.data !== "string") {
          continue;
        }
        let payload: Uint8Array;
        try {
          payload = decodeBase64(typed.data);
        } catch {
          continue;
        }
        if (payload.length > 8 && DISCRIMINATORS.eventCpi === toHex(payload.subarray(0, 8))) {
          ingest(payload.subarray(8));
        }
      }
    }
  }

  return {
    signature,
    slot: transaction.slot,
    blockTime: transaction.blockTime ?? null,
    failed: transaction.meta?.err !== null && transaction.meta?.err !== undefined,
    swaps,
  };
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}
