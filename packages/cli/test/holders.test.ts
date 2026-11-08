import assert from "node:assert/strict";
import { test } from "node:test";
import { analyseConcentration, buildHolderSnapshot } from "@bark/market-intel";
import { renderHolders } from "../src/holders.js";

test("renders concentration with a truncation warning", () => {
  const snapshot = buildHolderSnapshot([
    { address: "ata-1", amount: 600n },
    { address: "ata-2", amount: 400n },
  ]);
  const report = analyseConcentration(snapshot.balances, 1_000n);
  const text = renderHolders("Mint111", snapshot, report, 6);

  assert.match(text, /mint {7}Mint111/);
  assert.match(text, /top1 {7}60\.00%/);
  assert.match(text, /top10 {6}100\.00%/);
  assert.match(text, /effective 1\.9/);
  assert.match(text, /measured per token account/);
});

test("flags when the snapshot hits the RPC cap", () => {
  const accounts = Array.from({ length: 20 }, (_, i) => ({
    address: "ata-" + i,
    amount: BigInt(20 - i) * 1_000_000n,
  }));
  const snapshot = buildHolderSnapshot(accounts);
  const report = analyseConcentration(snapshot.balances, 1_000_000_000n);
  const text = renderHolders("Mint111", snapshot, report, 6);
  assert.match(text, /capped at 20 by the RPC/);
});
