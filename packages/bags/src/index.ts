import { PublicKey } from "@bark/solana";

/**
 * bags.fm on-chain surface.
 *
 * Scope is deliberately narrow: what was observed on mainnet, nothing inferred
 * past the evidence. bags publishes no IDL and emits no program events, so
 * every claim here came from decoding instruction data and correlating it with
 * token balance changes.
 *
 * What is solid:
 *   - two swap programs, one superseding the other ("Swap" and "Swap2")
 *   - instruction discriminators and encoded lengths
 *   - argument semantics: (amountIn, minOut) in the traded mints' own units
 *   - account 0 is a program fee/vault account; the program id appears twice in
 *     the account list, which is unusual and worth remembering
 *   - no events are emitted at all
 *
 * What is NOT known: the pool/state account layout, fee parameters, and the
 * exact routing rule that picks Swap vs Swap2. Do not model their AMM from this.
 */

export const BAGS_SWAP_PROGRAM_ID = new PublicKey("cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG");
export const BAGS_SWAP_V2_PROGRAM_ID = new PublicKey("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");

export const BAGS_DISCRIMINATORS = {
  swap: "f8c69e91e17587c8",
  swapV2: "414b3f4ceb5b5b88",
} as const;

export type BagsProgram = "swap" | "swap-v2";

export interface BagsSwapArgs {
  program: BagsProgram;
  /** Amount of the input mint, in that mint's base units. */
  amountIn: bigint;
  /** Lower bound on the output, in the output mint's base units. */
  minOut: bigint;
  /**
   * Trailing byte present on some Swap instructions and on every Swap2
   * instruction. Observed values: 0x02 on the swap variant, 0x00 on swap-v2.
   * Purpose unknown.
   */
  flag: number | null;
}

export class BagsDecodeError extends Error {
  public override readonly name = "BagsDecodeError";
}

/** Program a discriminator belongs to, or null. */
export function identifyBagsInstruction(data: Uint8Array): BagsProgram | null {
  if (data.length < 8) {
    return null;
  }
  let hex = "";
  for (let i = 0; i < 8; i += 1) {
    hex += (data[i] as number).toString(16).padStart(2, "0");
  }
  if (hex === BAGS_DISCRIMINATORS.swap) {
    return "swap";
  }
  if (hex === BAGS_DISCRIMINATORS.swapV2) {
    return "swap-v2";
  }
  return null;
}

/**
 * Decodes the arguments of a bags swap instruction.
 *
 * Both programs encode (amountIn, minOut) as two little-endian u64s after the
 * discriminator. Verified against live swaps: the first value always equals the
 * exact amount that moved out of the user's account, and the second is always a
 * bound the actual output satisfied.
 */
export function decodeBagsSwap(data: Uint8Array): BagsSwapArgs {
  const program = identifyBagsInstruction(data);
  if (program === null) {
    throw new BagsDecodeError("Not a bags swap instruction");
  }
  if (data.length < 24) {
    throw new BagsDecodeError("bags swap data is truncated: " + data.length + " bytes");
  }
  const readU64 = (offset: number): bigint => {
    let value = 0n;
    for (let i = 7; i >= 0; i -= 1) {
      value = (value << 8n) | BigInt(data[offset + i] as number);
    }
    return value;
  };
  return {
    program,
    amountIn: readU64(8),
    minOut: readU64(16),
    flag: data.length >= 25 ? (data[24] as number) : null,
  };
}

/**
 * Account-count signature for each program, as observed.
 *
 * Swap uses 14 accounts, Swap2 uses 15. Both place a fee/vault account first
 * and repeat the program id inside the account list.
 */
export const BAGS_ACCOUNT_COUNTS = {
  swap: 14,
  "swap-v2": 15,
} as const;
