import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_CURVE_PARAMS,
  graduationProgress,
  initialCurveState,
  invariant,
  marketCapLamports,
  maximumIn,
  minimumOut,
  quoteBuy,
  quoteBuyForTokens,
  quoteSell,
} from "../src/curve.js";

const SOL = 1_000_000_000n;

test("a fresh curve starts at the documented virtual reserves", () => {
  const state = initialCurveState();
  assert.equal(state.virtualSolReserves, 30n * SOL);
  assert.equal(state.virtualTokenReserves, 1_073_000_000_000_000n);
  assert.equal(state.realSolReserves, 0n);
  assert.equal(state.complete, false);
  assert.equal(graduationProgress(state), 0);
});

test("a buy preserves the constant product to within one division unit", () => {
  const state = initialCurveState();
  const quote = quoteBuy(state, 1n * SOL);
  assert.ok(quote.tokens > 0n);
  const before = invariant(state);
  const after = invariant(quote.state);
  assert.ok(after <= before, "integer division may only shrink k");
  assert.ok(before - after < quote.state.virtualSolReserves, "loss stays below one unit");
  assert.equal(quote.state.realSolReserves, state.realSolReserves + quote.fees.net);
  assert.ok(quote.priceAfter > quote.priceBefore);
});

test("buying then selling the same tokens never returns the input", () => {
  const state = initialCurveState();
  const buy = quoteBuy(state, 5n * SOL);
  const sell = quoteSell(buy.state, buy.tokens);
  assert.ok(sell.grossSol <= 5n * SOL, "round trip must not be profitable");
  assert.ok(sell.grossSol > 4n * SOL, "round trip should not lose everything");
});

test("fees are split between protocol and creator", () => {
  const quote = quoteBuy(initialCurveState(), 10n * SOL);
  assert.equal(quote.fees.protocol, 100_000_000n);
  assert.equal(quote.fees.creator, 95_000_000n);
  assert.equal(quote.fees.net, 10n * SOL - quote.fees.total);
});

test("quoteBuyForTokens inverts quoteBuy within one lamport", () => {
  const state = initialCurveState();
  const target = 1_000_000_000_000n;
  const required = quoteBuyForTokens(state, target);
  const quote = quoteBuy(state, required);
  assert.ok(quote.tokens >= target);
  const cheaper = quoteBuy(state, required - 1_000n);
  assert.ok(cheaper.tokens < target);
});

test("market cap uses virtual reserves rather than real deposits", () => {
  const state = initialCurveState();
  assert.equal(marketCapLamports(state), 30n * SOL * 1_000_000_000_000_000n / 1_073_000_000_000_000n);
});

test("slippage helpers bound the trade", () => {
  assert.equal(minimumOut(1_000_000n, 100), 990_000n);
  assert.equal(maximumIn(1_000_000n, 100), 1_010_000n);
  assert.throws(() => minimumOut(1n, -1), RangeError);
});

test("graduation progress tracks real SOL and clamps at one", () => {
  const state = { ...initialCurveState(), realSolReserves: DEFAULT_CURVE_PARAMS.graduationSolReserves };
  assert.equal(graduationProgress(state), 1);
  const over = { ...state, realSolReserves: DEFAULT_CURVE_PARAMS.graduationSolReserves * 2n };
  assert.equal(graduationProgress(over), 1);
});
