/**
 * Minimal ed25519 helpers needed for on-chain address derivation.
 *
 * A program-derived address is only valid when the hashed candidate is NOT a
 * point on the ed25519 curve. That single check is why PDA derivation cannot
 * be done with a hash alone, and why every PDA implementation carries a curve
 * test. This module implements exactly that test - nothing else - using
 * BigInt math over the field p = 2^255 - 19.
 */

const P = 2n ** 255n - 19n;

function mod(value: bigint, modulus: bigint): bigint {
  const result = value % modulus;
  return result >= 0n ? result : result + modulus;
}

function modInverse(value: bigint, modulus: bigint): bigint {
  let oldR = mod(value, modulus);
  let r = modulus;
  let oldS = 1n;
  let s = 0n;

  while (r !== 0n) {
    const quotient = oldR / r;
    const nextR = oldR - quotient * r;
    oldR = r;
    r = nextR;
    const nextS = oldS - quotient * s;
    oldS = s;
    s = nextS;
  }

  if (oldR !== 1n) {
    throw new Error("Value is not invertible modulo the ed25519 field");
  }
  return mod(oldS, modulus);
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let b = mod(base, modulus);
  let e = exponent;
  while (e > 0n) {
    if ((e & 1n) === 1n) {
      result = (result * b) % modulus;
    }
    b = (b * b) % modulus;
    e >>= 1n;
  }
  return result;
}

/** Edwards curve constant d = -121665/121666 mod p. */
const D = mod(-121665n * modInverse(121666n, P), P);

/**
 * Read the compressed point's y-coordinate (little endian, top bit dropped).
 */
function decompressY(bytes: Uint8Array): bigint {
  let y = 0n;
  for (let i = 31; i >= 0; i -= 1) {
    const byte = i === 31 ? (bytes[31] as number) & 0x7f : (bytes[i] as number);
    y = (y << 8n) | BigInt(byte);
  }
  return y;
}

/**
 * Returns true when the 32 bytes decode to a point on ed25519.
 *
 * Solves x^2 = (y^2 - 1) / (d * y^2 + 1) and applies Euler's criterion to
 * decide whether x^2 is a quadratic residue.
 */
export function isOnCurve(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) {
    return false;
  }

  const y = decompressY(bytes);
  if (y >= P) {
    return false;
  }

  const ySquared = (y * y) % P;
  const u = mod(ySquared - 1n, P);
  const v = mod(D * ySquared + 1n, P);
  const xSquared = (u * modInverse(v, P)) % P;

  if (xSquared === 0n) {
    return true;
  }

  return modPow(xSquared, (P - 1n) / 2n, P) === 1n;
}
