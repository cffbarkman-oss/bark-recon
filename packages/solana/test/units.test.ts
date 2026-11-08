import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyBps,
  formatAmount,
  lamportsToSol,
  mulDivCeil,
  mulDivFloor,
  parseAmount,
  solToLamports,
} from "../src/units.js";

test("parses and formats decimal amounts exactly", () => {
  assert.equal(parseAmount("1.5", 6), 1_500_000n);
  assert.equal(parseAmount("0.000001", 6), 1n);
  assert.equal(parseAmount("-2.25", 2), -225n);
  assert.equal(formatAmount(1_500_000n, 6), "1.5");
  assert.equal(formatAmount(1n, 6), "0.000001");
  assert.equal(formatAmount(0n, 6), "0");
});

test("rejects precision the mint cannot represent", () => {
  assert.throws(() => parseAmount("0.0000001", 6), /more than 6 decimal places/);
  assert.throws(() => parseAmount("abc", 6), /Invalid decimal amount/);
});

test("converts SOL without floating point drift", () => {
  assert.equal(solToLamports(1.25), 1_250_000_000n);
  assert.equal(solToLamports("0.000000001"), 1n);
  assert.equal(lamportsToSol(2_500_000_000n), 2.5);
});

test("rounds integer division in both directions", () => {
  assert.equal(mulDivFloor(10n, 3n, 4n), 7n);
  assert.equal(mulDivCeil(10n, 3n, 4n), 8n);
  assert.equal(applyBps(1_000_000n, 100), 10_000n);
  assert.equal(applyBps(1n, 100, "ceil"), 1n);
});
