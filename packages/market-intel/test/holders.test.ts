import assert from "node:assert/strict";
import { test } from "node:test";
import { analyseConcentration, giniCoefficient, herfindahlIndex } from "../src/holders.js";

const HOLDERS = [
  { owner: "whale", amount: 500n },
  { owner: "large", amount: 300n },
  { owner: "mid", amount: 150n },
  { owner: "small", amount: 50n },
];

test("computes top-N shares against total supply", () => {
  const report = analyseConcentration(HOLDERS, 2_000n);
  assert.equal(report.holderCount, 4);
  assert.equal(report.topShares["1"], 0.25);
  assert.equal(report.topShares["10"], 0.5);
});

test("excludes infrastructure accounts from the distribution", () => {
  const report = analyseConcentration(
    [...HOLDERS, { owner: "liquidity-pool", amount: 1_000n }],
    2_000n,
    { exclude: ["liquidity-pool"] },
  );
  assert.equal(report.holderCount, 4);
  assert.equal(report.topShares["10"], 0.5);
});

test("merges duplicate balances for the same owner", () => {
  const report = analyseConcentration(
    [
      { owner: "a", amount: 100n },
      { owner: "a", amount: 400n },
      { owner: "b", amount: 600n },
    ],
    1_000n,
  );
  assert.equal(report.holderCount, 2);
  assert.equal(report.top[0]?.owner, "b");
  assert.equal(report.top[1]?.amount, 500n);
});

test("hhi and effective holders move in opposite directions", () => {
  const concentrated = analyseConcentration([{ owner: "a", amount: 1_000n }], 1_000n);
  const spread = analyseConcentration(
    Array.from({ length: 10 }, (_, i) => ({ owner: "w" + i, amount: 100n })),
    1_000n,
  );
  assert.equal(concentrated.hhi, 1);
  assert.equal(concentrated.effectiveHolders, 1);
  assert.ok(spread.hhi < concentrated.hhi);
  assert.equal(Math.round(spread.effectiveHolders), 10);
});

test("gini is zero for perfect equality and approaches one for capture", () => {
  assert.equal(giniCoefficient([1, 1, 1, 1]), 0);
  assert.ok(giniCoefficient([1, 1, 1, 97]) > 0.7);
  assert.equal(giniCoefficient([0, 0, 0, 100]), 0, "zero balances are not holders");
  assert.equal(giniCoefficient([]), 0);
});

test("herfindahl index sums squared shares", () => {
  assert.equal(herfindahlIndex([0.5, 0.5]), 0.5);
  assert.equal(herfindahlIndex([]), 0);
});

test("counts whales above the configured share", () => {
  const report = analyseConcentration(HOLDERS, 2_000n, { whaleShare: 0.1 });
  assert.equal(report.whaleCount, 2);
});
