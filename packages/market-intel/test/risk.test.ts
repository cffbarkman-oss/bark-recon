import assert from "node:assert/strict";
import { test } from "node:test";
import { assessRisk } from "../src/risk.js";
import { analyseConcentration } from "../src/holders.js";
import { detectBundles } from "../src/bundles.js";
import { buildDevProfile } from "../src/dev.js";

test("returns low risk for a healthy distribution", () => {
  const assessment = assessRisk({
    concentration: analyseConcentration(
      Array.from({ length: 500 }, (_, i) => ({ owner: "w" + i, amount: 2n })),
      1_000n,
    ),
    liquidityUsd: 5_000_000,
    holderCount: 5_000,
    ageMinutes: 60 * 24,
  });
  assert.equal(assessment.level, "low");
  assert.ok(assessment.score < 25);
});

test("returns critical risk when everything is bad", () => {
  const concentration = analyseConcentration(
    [
      { owner: "insider-1", amount: 400n },
      { owner: "insider-2", amount: 300n },
      { owner: "retail", amount: 300n },
    ],
    1_000n,
  );
  const bundles = detectBundles([
    { wallet: "insider-1", slot: 1, txIndex: 1, tokens: 800n, sol: 1n, funder: "f" },
    { wallet: "insider-2", slot: 1, txIndex: 2, tokens: 200n, sol: 1n, funder: "f" },
  ]);
  const dev = buildDevProfile(
    "creator",
    Array.from({ length: 5 }, (_, i) => ({
      mint: "mint" + i,
      createdAt: 0,
      peakMarketCap: 1_000_000n,
      currentMarketCap: 1n,
    })),
  );

  const assessment = assessRisk({
    concentration,
    bundles,
    dev,
    liquidityUsd: 500,
    holderCount: 12,
    ageMinutes: 2,
  });

  assert.equal(assessment.level, "critical");
  assert.ok(assessment.score >= 75);
  assert.ok(assessment.factors.length >= 5);
});

test("every factor carries an explanation", () => {
  const assessment = assessRisk({ holderCount: 50, liquidityUsd: 1_000 });
  for (const factor of assessment.factors) {
    assert.ok(factor.detail.length > 0);
    assert.ok(factor.severity >= 0 && factor.severity <= 1);
  }
});

test("handles an empty input", () => {
  assert.deepEqual(assessRisk({}), { score: 0, level: "low", factors: [] });
});
