import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcileSwap } from "../src/settlement.js";

const INTENT = {
  inputMint: "So11111111111111111111111111111111111111112",
  outputMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  inAmount: 1_000_000_000n,
  minOut: 3_190_000_000_000n,
  quotedOut: 3_219_646_412_000n,
};

test("a clean fill reports surplus over the minimum", () => {
  const report = reconcileSwap(INTENT, { inputDelta: -1_000_000_000n, outputDelta: 3_200_000_000_000n });
  assert.equal(report.status, "filled");
  assert.equal(report.received, 3_200_000_000_000n);
  assert.equal(report.surplusOverMinimum, 10_000_000_000n);
  assert.ok((report.realisedFractionOfQuote ?? 0) > 0.99);
});

test("output below the minimum is a shortfall, not a rounding issue", () => {
  const report = reconcileSwap(INTENT, { inputDelta: -1_000_000_000n, outputDelta: 3_000_000_000_000n });
  assert.equal(report.status, "shortfall");
  assert.ok(report.surplusOverMinimum < 0n);
  assert.match(report.explanation, /guarantee was not honoured/);
});

test("consuming less input than requested is a partial", () => {
  const report = reconcileSwap(INTENT, { inputDelta: -500_000_000n, outputDelta: 3_200_000_000_000n });
  assert.equal(report.status, "partial");
  assert.equal(report.spent, 500_000_000n);
  assert.equal(report.underSpent, true);
});

test("no movement at all is reported as empty", () => {
  const report = reconcileSwap(INTENT, { inputDelta: 0n, outputDelta: 0n });
  assert.equal(report.status, "empty");
  assert.equal(report.received, 0n);
});

test("realised fraction is null without a quote to compare against", () => {
  const report = reconcileSwap(
    { ...INTENT, quotedOut: undefined },
    { inputDelta: -1_000_000_000n, outputDelta: 3_200_000_000_000n },
  );
  assert.equal(report.realisedFractionOfQuote, null);
});

test("a refund in the input mint is not treated as spend", () => {
  const report = reconcileSwap(INTENT, { inputDelta: 5_000n, outputDelta: 3_200_000_000_000n });
  assert.equal(report.spent, 0n);
  assert.equal(report.status, "partial");
});
