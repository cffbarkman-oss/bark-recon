import assert from "node:assert/strict";
import { test } from "node:test";
import { buildHolderSnapshot, toHolderBalances } from "../src/snapshot.js";
import { analyseConcentration } from "../src/holders.js";

test("merges multiple token accounts owned by the same wallet", () => {
  const balances = toHolderBalances([
    { address: "ata-a", owner: "wallet-1", amount: 100n },
    { address: "ata-b", owner: "wallet-1", amount: 50n },
    { address: "ata-c", owner: "wallet-2", amount: 200n },
  ]);
  assert.equal(balances.length, 2);
  assert.equal(balances[0]?.owner, "wallet-2");
  assert.equal(balances[1]?.amount, 150n);
});

test("falls back to the account address when the owner is unknown", () => {
  const balances = toHolderBalances([{ address: "ata-a", amount: 10n }]);
  assert.equal(balances[0]?.owner, "ata-a");
});

test("drops zero balances and sorts descending", () => {
  const balances = toHolderBalances([
    { address: "a", amount: 0n },
    { address: "b", amount: 5n },
    { address: "c", amount: 9n },
  ]);
  assert.deepEqual(balances.map((b) => b.owner), ["c", "b"]);
});

test("flags a snapshot as truncated at the RPC cap", () => {
  const accounts = Array.from({ length: 20 }, (_, i) => ({
    address: "ata-" + i,
    amount: BigInt(20 - i),
  }));
  const snapshot = buildHolderSnapshot(accounts);
  assert.equal(snapshot.truncated, true);
  assert.equal(snapshot.coveredAccounts, 20);

  const small = buildHolderSnapshot(accounts.slice(0, 3));
  assert.equal(small.truncated, false);
});

test("feeds concentration with a real denominator", () => {
  const snapshot = buildHolderSnapshot([
    { address: "a", amount: 500n },
    { address: "b", amount: 300n },
    { address: "c", amount: 200n },
  ]);
  const report = analyseConcentration(snapshot.balances, 2_000n);
  assert.equal(report.holderCount, 3);
  assert.equal(report.topShares["10"], 0.5);
  // 0.25^2 + 0.15^2 + 0.10^2 = 0.095; effective holders ~10.5
  assert.ok(Math.abs(report.hhi - 0.095) < 1e-9);
  assert.ok(report.effectiveHolders > 10 && report.effectiveHolders < 11);
});
