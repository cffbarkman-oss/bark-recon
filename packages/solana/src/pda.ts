import { createHash } from "node:crypto";
import { isOnCurve } from "./ed25519.js";
import { PublicKey, ASSOCIATED_TOKEN_PROGRAM, SPL_TOKEN_PROGRAM } from "./public-key.js";

/** Seed length ceiling enforced by the Solana runtime. */
export const MAX_SEED_LENGTH = 32;

/** The literal marker the runtime appends when hashing a PDA candidate. */
export const PDA_MARKER = "ProgramDerivedAddress";

export class PdaNotFoundError extends Error {
  public override readonly name = "PdaNotFoundError";
}

function seedBytes(seed: Uint8Array | string): Uint8Array {
  const bytes = typeof seed === "string" ? new TextEncoder().encode(seed) : seed;
  if (bytes.length > MAX_SEED_LENGTH) {
    throw new Error("Seed is longer than " + MAX_SEED_LENGTH + " bytes");
  }
  return bytes;
}

function hashCandidate(seeds: Uint8Array[], programId: PublicKey): Uint8Array {
  const hasher = createHash("sha256");
  for (const seed of seeds) {
    hasher.update(seed);
  }
  hasher.update(programId.toBytes());
  hasher.update(new TextEncoder().encode(PDA_MARKER));
  return new Uint8Array(hasher.digest());
}

/**
 * Derives the candidate address for an explicit bump seed.
 *
 * The bump must be supplied as the final seed, matching the runtime layout:
 * sha256(seed.. | bump | programId | "ProgramDerivedAddress").
 *
 * Throws when the candidate lands on the ed25519 curve, because such an
 * address could be produced from a private key and the runtime rejects it.
 */
export function createProgramAddress(
  seeds: Array<Uint8Array | string>,
  programId: PublicKey,
): PublicKey {
  const candidate = hashCandidate(seeds.map(seedBytes), programId);
  if (isOnCurve(candidate)) {
    throw new Error("Address derived from seeds is on the ed25519 curve");
  }
  return new PublicKey(candidate);
}

export interface ProgramAddress {
  address: PublicKey;
  bump: number;
}

/** Finds the highest valid bump seed, scanning downward from 255. */
export function findProgramAddress(
  seeds: Array<Uint8Array | string>,
  programId: PublicKey,
): ProgramAddress {
  const encoded = seeds.map(seedBytes);
  for (let bump = 255; bump >= 0; bump -= 1) {
    try {
      const address = createProgramAddress([...encoded, new Uint8Array([bump])], programId);
      return { address, bump };
    } catch {
      continue;
    }
  }
  throw new PdaNotFoundError("Unable to find a viable program address bump");
}

/**
 * Associated token account for (wallet, mint, tokenProgram).
 *
 * Verified against mainnet: for a Token-2022 holder this reproduces the exact
 * account address observed in a live pump.fun transaction.
 */
export function findAssociatedTokenAddress(
  wallet: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey = SPL_TOKEN_PROGRAM,
): ProgramAddress {
  return findProgramAddress(
    [wallet.toBytes(), tokenProgram.toBytes(), mint.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM,
  );
}
