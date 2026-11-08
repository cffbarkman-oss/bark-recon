/**
 * Small, allocation-explicit byte helpers. Everything here returns new
 * arrays rather than aliasing caller memory, which keeps decoder output
 * immutable from the caller's point of view.
 */

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) {
    total += part.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error("Hex string must have an even length");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    const byte = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error("Invalid hex string");
    }
    out[i] = byte;
  }
  return out;
}

/** UTF-8 encode without pulling in TextEncoder-dependent code paths. */
export function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/**
 * Bounds-checked sequential reader over a byte buffer.
 *
 * Decoders built on this throw a descriptive error instead of silently
 * reading past the end of a truncated account, which is the failure mode
 * that produces phantom tokens in naive indexers.
 */
export class ByteReader {
  private readonly data: Uint8Array;
  private offset: number;

  constructor(data: Uint8Array) {
    this.data = data;
    this.offset = 0;
  }

  get position(): number {
    return this.offset;
  }

  get remaining(): number {
    return this.data.length - this.offset;
  }

  private require(length: number): void {
    if (this.offset + length > this.data.length) {
      throw new RangeError(
        "Buffer underflow: need " + length + " byte(s) at offset " + this.offset +
          ", have " + (this.data.length - this.offset),
      );
    }
  }

  u8(): number {
    this.require(1);
    const value = this.data[this.offset] as number;
    this.offset += 1;
    return value;
  }

  bool(): boolean {
    return this.u8() !== 0;
  }

  u16(): number {
    this.require(2);
    const value = (this.data[this.offset] as number) | ((this.data[this.offset + 1] as number) << 8);
    this.offset += 2;
    return value;
  }

  u32(): number {
    this.require(4);
    let value = 0;
    for (let i = 0; i < 4; i += 1) {
      value += (this.data[this.offset + i] as number) * 2 ** (8 * i);
    }
    this.offset += 4;
    return value;
  }

  u64(): bigint {
    this.require(8);
    let value = 0n;
    for (let i = 7; i >= 0; i -= 1) {
      value = (value << 8n) | BigInt(this.data[this.offset + i] as number);
    }
    this.offset += 8;
    return value;
  }

  i64(): bigint {
    const value = this.u64();
    const signBit = 1n << 63n;
    return value >= signBit ? value - (1n << 64n) : value;
  }

  /** Signed 128-bit little-endian integer (used by AMM virtual reserves). */
  i128(): bigint {
    this.require(16);
    let value = 0n;
    for (let i = 15; i >= 0; i -= 1) {
      value = (value << 8n) | BigInt(this.data[this.offset + i] as number);
    }
    this.offset += 16;
    const signBit = 1n << 127n;
    return value >= signBit ? value - (1n << 128n) : value;
  }

  bytes(length: number): Uint8Array {
    this.require(length);
    const slice = this.data.slice(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  rest(): Uint8Array {
    const slice = this.data.slice(this.offset);
    this.offset = this.data.length;
    return slice;
  }

  skip(length: number): void {
    this.require(length);
    this.offset += length;
  }
}
