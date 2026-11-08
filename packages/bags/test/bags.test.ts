import assert from "node:assert/strict";
import { test } from "node:test";
import { fromHex } from "@bark/solana";
import {
  BAGS_ACCOUNT_COUNTS,
  BAGS_SWAP_PROGRAM_ID,
  BAGS_SWAP_V2_PROGRAM_ID,
  decodeBagsSwap,
  identifyBagsInstruction,
} from "../src/index.js";

// Captured live: bags "Swap" (cpamdp...), a buy of tokens for 247,163,478 lamports.
const SWAP_DATA = fromHex("f8c69e91e17587c8566abb0e0000000014b8375a03000000");
// Captured live: bags "Swap2", a sell of 74,178,188,931 base units.
const SWAP_V2_DATA = fromHex("414b3f4ceb5b5b8883565d4511000000149d31010000000000");

/** Builds instruction data the way the program encodes it. */
function buildData(
  program: "swap" | "swap-v2",
  amountIn: bigint,
  minOut: bigint,
  flag?: number,
): Uint8Array {
  const disc = program === "swap" ? "f8c69e91e17587c8" : "414b3f4ceb5b5b88";
  const bytes: number[] = [];
  for (let i = 0; i < 8; i += 1) bytes.push(Number.parseInt(disc.slice(i * 2, i * 2 + 2), 16));
  for (const value of [amountIn, minOut]) {
    let v = value;
    for (let i = 0; i < 8; i += 1) {
      bytes.push(Number(v & 0xffn));
      v >>= 8n;
    }
  }
  if (flag !== undefined) bytes.push(flag);
  return Uint8Array.from(bytes);
}

// Captured live: "Swap" carrying the trailing flag byte 0x02.
const SWAP_FLAGGED = buildData("swap", 56_343_332_528n, 67_558_702n, 2);

test("identifies both programs by discriminator", () => {
  assert.equal(identifyBagsInstruction(SWAP_DATA), "swap");
  assert.equal(identifyBagsInstruction(SWAP_V2_DATA), "swap-v2");
  assert.equal(identifyBagsInstruction(fromHex("000000000000000000000000")), null);
});

test("decodes the captured Swap arguments", () => {
  const args = decodeBagsSwap(SWAP_DATA);
  assert.equal(args.program, "swap");
  assert.equal(args.amountIn, 247_163_478n);
  assert.equal(args.minOut, 14_398_502_932n);
  assert.equal(args.flag, null);
});

test("decodes the flagged Swap variant", () => {
  const args = decodeBagsSwap(SWAP_FLAGGED);
  assert.equal(args.flag, 2);
});

test("decodes the captured Swap2 argument, which matches the tokens that moved", () => {
  const args = decodeBagsSwap(SWAP_V2_DATA);
  assert.equal(args.program, "swap-v2");
  assert.equal(args.amountIn, 74_178_188_931n);
  assert.equal(args.minOut, 20_028_692n);
  assert.equal(args.flag, 0);
});

test("rejects foreign or truncated instructions", () => {
  assert.throws(() => decodeBagsSwap(fromHex("1111111111111111")), /Not a bags swap/);
  assert.throws(() => decodeBagsSwap(fromHex("f8c69e91e17587c8")), /truncated/);
});

test("program ids and account counts are pinned", () => {
  assert.equal(BAGS_SWAP_PROGRAM_ID.toBase58(), "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG");
  assert.equal(BAGS_SWAP_V2_PROGRAM_ID.toBase58(), "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");
  assert.equal(BAGS_ACCOUNT_COUNTS.swap, 14);
  assert.equal(BAGS_ACCOUNT_COUNTS["swap-v2"], 15);
});
