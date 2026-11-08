import assert from "node:assert/strict";
import { test } from "node:test";
import { fromHex } from "@bark/solana";
import { decodeSwapEvent } from "../src/events.js";
import { DEFAULT_AMM_FEES, effectiveQuote, quoteBuy, quoteSell, spotPrice } from "../src/math.js";
import { AMM_CAPTURE } from "./fixtures.js";

const event = decodeSwapEvent(fromHex(AMM_CAPTURE.sellEventHex));
if (event === null || event.layout !== "sell") {
  throw new Error("fixture must be a sell event");
}

/** The event reports the pool's reserves BEFORE the swap. */
const preReserves = {
  base: event.poolBaseTokenReserves,
  quote: event.poolQuoteTokenReserves,
  virtualQuote: event.virtualQuoteReserves,
};

test("reproduces the captured sell to the lamport", () => {
  const quote = quoteSell(preReserves, event.baseAmountIn);

  assert.equal(quote.reservesAfter.base, event.poolBaseTokenReserves + event.baseAmountIn);
  assert.ok(
    absDiff(quote.grossQuote, event.quoteAmountOut) <= 1n,
    "gross drifted: " + quote.grossQuote.toString() + " vs " + event.quoteAmountOut.toString(),
  );
});

test("virtual reserves are a large part of the effective depth", () => {
  const eff = effectiveQuote(preReserves);
  assert.equal(eff, event.poolQuoteTokenReserves + event.virtualQuoteReserves);
  const share = Number(event.virtualQuoteReserves) / Number(eff);
  assert.ok(share > 0.02, "virtual depth should be a material share, got " + share);
});

test("ignoring virtual depth would distort the quote badly", () => {
  const withVirtual = quoteSell(preReserves, event.baseAmountIn).grossQuote;
  const withoutVirtual = quoteSell({ ...preReserves, virtualQuote: 0n }, event.baseAmountIn).grossQuote;
  const error = Number(absDiff(withVirtual, withoutVirtual)) / Number(withVirtual);
  assert.ok(error > 0.02, "expected a material error without virtual depth, got " + error);
});

test("selling moves price down and reports negative impact", () => {
  const quote = quoteSell(preReserves, event.baseAmountIn);
  assert.ok(quote.priceAfter < quote.priceBefore);
  assert.ok(quote.priceImpact < 0);
});

test("a buy followed by a sell never returns the input", () => {
  const buy = quoteBuy(preReserves, 1_000_000_000n);
  const sell = quoteSell(buy.reservesAfter, buy.baseOut);
  assert.ok(sell.netQuote < 1_000_000_000n, "round trip must lose money");
  assert.ok(sell.netQuote > 900_000_000n, "round trip should not lose a tenth");
});

test("fees keep the LP share in the pool and skim the rest", () => {
  const buy = quoteBuy(preReserves, 1_000_000_000n, DEFAULT_AMM_FEES);
  assert.equal(buy.quoteIntoPool, buy.netQuote + buy.fees.lp);
  assert.ok(buy.baseOut > 0n);
  assert.equal(buy.reservesAfter.quote, preReserves.quote + buy.quoteIntoPool);
  assert.equal(buy.reservesAfter.virtualQuote, preReserves.virtualQuote - buy.fees.lp);
  // effective depth advances by exactly the amount the curve priced against
  assert.equal(
    effectiveQuote(buy.reservesAfter),
    effectiveQuote(preReserves) + buy.netQuote,
  );
});

test("spot price divides effective depth by base", () => {
  assert.equal(spotPrice(preReserves), Number(effectiveQuote(preReserves)) / Number(preReserves.base));
  assert.equal(spotPrice({ base: 0n, quote: 1n, virtualQuote: 0n }), 0);
});

function absDiff(a: bigint, b: bigint): bigint {
  return a > b ? a - b : b - a;
}
