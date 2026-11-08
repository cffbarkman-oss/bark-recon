import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_CURVE_PARAMS,
  completionQuoteReserves,
  feeBreakdown,
  graduationProgress,
  initialCurveState,
  invariant,
  marketCapQuote,
  maximumIn,
  minimumOut,
  quoteBuy,
  quoteBuyForTokens,
  quoteSell,
  spotPrice,
} from "../src/curve.js";

const SOL = 1_000_000_000n;

test("a fresh curve starts at the observed launch parameters", () => {
  const state = initialCurveState();
  assert.equal(state.virtualQuoteReserves, 30n * SOL);
  assert.equal(state.virtualTokenReserves, 1_073_000_000_000_000n);
  assert.equal(state.realTokenReserves, 793_100_000_000_000n);
  assert.equal(state.realQuoteReserves, 0n);
  assert.equal(state.complete, false);
});

test("spot price matches 30 SOL over the virtual token supply", () => {
  const price = spotPrice(initialCurveState());
  assert.ok(Math.abs(price - 30 / 1.073e9) < 1e-20, "unexpected spot price: " + price);
});

test("fees round up, matching on-chain arithmetic", () => {
  const fees = feeBreakdown(1_559_679_685n, DEFAULT_CURVE_PARAMS);
  assert.equal(fees.protocol, 14_816_958n);
  assert.equal(fees.creator, 4_679_040n);
  assert.equal(fees.total, 19_495_998n);
  assert.equal(fees.net, 1_559_679_685n - 19_495_998n);
});

test("a buy preserves the constant product to within one division unit", () => {
  const state = initialCurveState();
  const quote = quoteBuy(state, SOL);
  assert.ok(quote.tokens > 0n);
  const before = invariant(state);
  const after = invariant(quote.state);
  assert.ok(after <= before, "integer division may only shrink k");
  assert.ok(before - after < quote.state.virtualQuoteReserves);
  assert.equal(quote.state.realQuoteReserves, quote.fees.net);
  assert.ok(quote.priceAfter > quote.priceBefore);
});

test("buying then selling the same tokens never returns the input", () => {
  const state = initialCurveState();
  const buy = quoteBuy(state, 5n * SOL);
  const sell = quoteSell(buy.state, buy.tokens);
  assert.ok(sell.grossQuote <= 5n * SOL, "round trip must not be profitable");
  assert.ok(sell.grossQuote > 4n * SOL, "round trip should not lose everything");
});

test("quoteBuyForTokens inverts quoteBuy", () => {
  const state = initialCurveState();
  const target = 1_000_000_000_000n;
  const required = quoteBuyForTokens(state, target);
  const quote = quoteBuy(state, required);
  assert.ok(quote.tokens >= target);
  const cheaper = quoteBuy(state, required - 1_000n);
  assert.ok(cheaper.tokens < target);
});

test("completion threshold is derived and lands on the familiar 85 SOL", () => {
  const threshold = completionQuoteReserves();
  assert.equal(threshold, 85_005_359_056n);
  const state = { ...initialCurveState(), realQuoteReserves: threshold };
  assert.equal(graduationProgress(state), 1);
});

test("market cap uses virtual reserves, not deposits", () => {
  const state = initialCurveState();
  assert.equal(
    marketCapQuote(state),
    (30n * SOL * 1_000_000_000_000_000n) / 1_073_000_000_000_000n,
  );
});

test("slippage helpers bound the trade", () => {
  assert.equal(minimumOut(1_000_000n, 100), 990_000n);
  assert.equal(maximumIn(1_000_000n, 100), 1_010_000n);
  assert.throws(() => minimumOut(1n, -1), RangeError);
});
