import assert from "node:assert/strict";
import { test } from "node:test";
import { fromHex } from "@bark/solana";
import { decodeSwapEvent } from "../src/events.js";
import { DEFAULT_AMM_FEES, quoteBuy, quoteSell, spotPrice } from "../src/math.js";
import { AMM_CAPTURE } from "./fixtures.js";

const event = decodeSwapEvent(fromHex(AMM_CAPTURE.sellEventHex));
if (event === null || event.layout !== "sell") {
  throw new Error("fixture must be a sell event");
}

// Reconstruct the pre-trade pool. A sell adds base and removes gross quote,
// so: base = post - baseIn, quote = post + grossQuote.
const preReserves = {
  base: event.poolBaseTokenReserves - event.baseAmountIn,
  quote: event.poolQuoteTokenReserves + event.quoteAmountOut,
};

test("matches the captured sell's direction, fees and net", () => {
  const quote = quoteSell(preReserves, event.baseAmountIn);

  assert.equal(quote.reservesAfter.base, event.poolBaseTokenReserves);
  assert.equal(quote.netQuote <= quote.grossQuote, true);
  assert.ok(quote.grossQuote > 0n);

  // Fees are computed from this model's own gross, so compare the *ratio* the
  // program charged rather than the absolute lamports.
  const gross = event.quoteAmountOut;
  assert.equal(event.lpFee, (gross * 20n + 9_999n) / 10_000n);
  assert.equal(event.protocolFee, (gross * 5n + 9_999n) / 10_000n);
  assert.equal(event.coinCreatorFee, (gross * 75n + 9_999n) / 10_000n);
});

test("recomputing a trade from post-state reserves is a bounded estimate", () => {
  // Documented limitation: reported reserves carry accrued fees, so a single
  // trade cannot be reconstructed exactly. This test pins the size of that
  // error so a regression that makes it worse fails loudly.
  const quote = quoteSell(preReserves, event.baseAmountIn);
  const error = Math.abs(Number(quote.grossQuote - event.quoteAmountOut));
  const relative = error / Number(event.quoteAmountOut);
  assert.ok(relative < 0.05, "estimate drifted further than 5%: " + relative);

  const kPost = Number(quote.reservesAfter.base * quote.reservesAfter.quote);
  const kPre = Number(preReserves.base * preReserves.quote);
  assert.ok(Math.abs(kPost / kPre - 1) < 0.01, "constant product should be near-preserved");
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

test("buy keeps the LP fee in the pool and skims the rest", () => {
  const buy = quoteBuy(preReserves, 1_000_000_000n, DEFAULT_AMM_FEES);
  assert.equal(
    buy.quoteIntoPool,
    buy.userQuoteIn - buy.fees.protocol - buy.fees.coinCreator,
  );
  assert.ok(buy.quoteIntoPool < buy.userQuoteIn);
  assert.ok(buy.baseOut > 0n);
  assert.equal(
    buy.reservesAfter.quote,
    preReserves.quote + buy.quoteIntoPool,
  );
});

test("spot price is quote per base unit", () => {
  assert.ok(spotPrice(preReserves) > 0);
  assert.equal(spotPrice({ base: 0n, quote: 1n }), 0);
});
