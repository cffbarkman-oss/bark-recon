import assert from "node:assert/strict";
import { test } from "node:test";
import { detectBundles, type WalletBuy } from "../src/bundles.js";

function buy(wallet: string, slot: number, txIndex: number, tokens: bigint, funder?: string): WalletBuy {
  return { wallet, slot, txIndex, tokens, sol: tokens / 10n, ...(funder === undefined ? {} : { funder }) };
}

test("flags wallets that entered in the same slot from one funder", () => {
  const report = detectBundles([
    buy("a", 100, 1, 1_000n, "f"),
    buy("b", 100, 2, 1_000n, "f"),
    buy("c", 100, 3, 1_000n, "f"),
  ]);
  assert.equal(report.bundles.length, 1);
  assert.equal(report.bundles[0]?.confidence, "high");
  assert.equal(report.bundledWallets, 3);
  assert.equal(report.bundledTokenShare, 1);
  assert.ok(report.bundles[0]?.reasons.includes("shared funding source"));
});

test("does not flag wallets separated in time", () => {
  const report = detectBundles([
    buy("a", 100, 1, 1_000n),
    buy("b", 500, 1, 1_000n),
  ]);
  assert.equal(report.bundles.length, 0);
  assert.equal(report.score, 0);
});

test("reports same-slot adjacency even without funding evidence", () => {
  const report = detectBundles([
    buy("a", 100, 10, 500n),
    buy("b", 100, 12, 500n),
  ]);
  assert.equal(report.bundles.length, 1);
  assert.equal(report.bundles[0]?.confidence, "medium");
});

test("measures bundled share of total tokens", () => {
  const report = detectBundles([
    buy("a", 100, 1, 500n, "f"),
    buy("b", 100, 2, 500n, "f"),
    buy("c", 900, 1, 1_000n),
  ]);
  assert.equal(report.bundledWallets, 2);
  assert.equal(report.bundledTokenShare, 0.5);
  assert.ok(report.score > 0 && report.score <= 100);
});
