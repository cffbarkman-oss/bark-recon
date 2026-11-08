/**
 * Base58 codec using the Bitcoin / Solana alphabet.
 *
 * Contract:
 *   decodeBase58(encodeBase58(x)) deep-equals x for every byte string.
 *   Leading zero bytes round-trip as leading "1" characters.
 *
 * Implemented with BigInt: correct for any input length, tuned for the 32-byte
 * keys that dominate Solana traffic (no table-based fast path needed).
 */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE = 58n;

const INDEX: Record<string, number> = Object.create(null);
for (let i = 0; i < ALPHABET.length; i += 1) {
  INDEX[ALPHABET[i] as string] = i;
}

export class Base58Error extends Error {
  public override readonly name = "Base58Error";
  public readonly input: string;

  constructor(message: string, input: string) {
    super(message);
    this.input = input;
  }
}

export function encodeBase58(bytes: Uint8Array): string {
  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) {
    leadingZeros += 1;
  }

  let value = 0n;
  for (let i = leadingZeros; i < bytes.length; i += 1) {
    value = (value << 8n) | BigInt(bytes[i] as number);
  }

  let encoded = "";
  while (value > 0n) {
    const remainder = Number(value % BASE);
    encoded = (ALPHABET[remainder] as string) + encoded;
    value /= BASE;
  }

  return "1".repeat(leadingZeros) + encoded;
}

export function decodeBase58(value: string): Uint8Array {
  if (value.length === 0) {
    return new Uint8Array(0);
  }

  let leadingZeros = 0;
  while (leadingZeros < value.length && value[leadingZeros] === "1") {
    leadingZeros += 1;
  }

  let decoded = 0n;
  for (let i = leadingZeros; i < value.length; i += 1) {
    const char = value[i] as string;
    const digit = INDEX[char];
    if (digit === undefined) {
      throw new Base58Error("Invalid base58 character: " + char, value);
    }
    decoded = decoded * BASE + BigInt(digit);
  }

  let hex = decoded === 0n ? "" : decoded.toString(16);
  if (hex.length % 2 === 1) {
    hex = "0" + hex;
  }

  const body = new Uint8Array(hex.length / 2);
  for (let i = 0; i < body.length; i += 1) {
    body[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  const out = new Uint8Array(leadingZeros + body.length);
  out.set(body, leadingZeros);
  return out;
}

export function isBase58(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  for (const char of value) {
    if (INDEX[char] === undefined) {
      return false;
    }
  }
  return true;
}
