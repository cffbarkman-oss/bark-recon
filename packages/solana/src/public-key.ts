import { decodeBase58, encodeBase58 } from "./base58.js";
import { bytesEqual } from "./bytes.js";

export const PUBLIC_KEY_LENGTH = 32;

/**
 * A 32-byte Solana address.
 *
 * Deliberately dependency-free: the whole class exists so that downstream
 * packages (decoders, adapters, intelligence) never need web3.js in the hot
 * path. Instances are immutable and compare by value.
 */
export class PublicKey {
  public static readonly LENGTH = PUBLIC_KEY_LENGTH;

  private readonly key: Uint8Array;

  constructor(value: PublicKey | Uint8Array | string) {
    if (value instanceof PublicKey) {
      this.key = value.toBytes();
      return;
    }
    if (typeof value === "string") {
      const decoded = decodeBase58(value);
      if (decoded.length !== PUBLIC_KEY_LENGTH) {
        throw new Error("Invalid public key: decoded to " + decoded.length + " bytes");
      }
      this.key = decoded;
      return;
    }
    if (value.length !== PUBLIC_KEY_LENGTH) {
      throw new Error("Invalid public key: expected 32 bytes, got " + value.length);
    }
    this.key = Uint8Array.from(value);
  }

  /** Returns a defensive copy of the raw key bytes. */
  toBytes(): Uint8Array {
    return Uint8Array.from(this.key);
  }

  toBase58(): string {
    return encodeBase58(this.key);
  }

  equals(other: PublicKey | Uint8Array | string): boolean {
    try {
      const target = other instanceof PublicKey ? other : new PublicKey(other);
      return bytesEqual(this.key, target.toBytes());
    } catch {
      return false;
    }
  }

  toString(): string {
    return this.toBase58();
  }

  toJSON(): string {
    return this.toBase58();
  }
}

const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const SPL_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export const SYSTEM_PROGRAM = new PublicKey(SYSTEM_PROGRAM_ID);
export const ASSOCIATED_TOKEN_PROGRAM = new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID);
export const SPL_TOKEN_PROGRAM = new PublicKey(SPL_TOKEN_PROGRAM_ID);
export const TOKEN_2022_PROGRAM = new PublicKey(TOKEN_2022_PROGRAM_ID);

export function isTokenProgram(address: PublicKey | string): boolean {
  return address instanceof PublicKey
    ? address.equals(SPL_TOKEN_PROGRAM) || address.equals(TOKEN_2022_PROGRAM)
    : address === SPL_TOKEN_PROGRAM_ID || address === TOKEN_2022_PROGRAM_ID;
}
