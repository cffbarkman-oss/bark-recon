import assert from "node:assert/strict";
import { test } from "node:test";
import { fromHex } from "@bark/solana";
import { decodeBuyEvent } from "../src/events.js";
import { quoteBuy, splitFromGross } from "../src/math.js";
import { AMM_BUY_CAPTURE } from "./fixtures.js";

const payload = fromHex(AMM_BUY_CAPTURE.buyEventHex);
const event = decodeBuyEvent(payload);

const preReserves = {
  base: event.poolBaseTokenReserves,
  quote: event.poolQuoteTokenReserves,
  virtualQuote: event.virtualQuoteReserves,
};

const fees = {
  lpFeeBps: event.lpFeeBasisPoints,
  protocolFeeBps: event.protocolFeeBasisPoints,
  coinCreatorFeeBps: event.coinCreatorFeeBasisPoints,
};

test("decodes a live buy event", () => {
  assert.equal(payload.length, 515);
  assert.equal(event.layout, "buy");
  assert.equal(event.quoteAmountIn, 37_575_185_568n);
  assert.equal(event.userQuoteAmountIn, 37_462_797_176n);
  assert.equal(event.lpFee, 93_656_993n);
  assert.equal(event.protocolFee, 18_731_399n);
  assert.equal(event.quoteAmountInWithLpFee, 37_556_454_169n);
});

test("the buy fee base is the net amount, not the gross", () => {
  const gross = event.quoteAmountIn;
  const net = event.userQuoteAmountIn;
  const onGross = (gross * 5n + 9_999n) / 10_000n;
  assert.notEqual(onGross, event.protocolFee);
  assert.equal((net * 5n + 9_999n) / 10_000n, event.protocolFee);
  assert.equal((net * 25n + 9_999n) / 10_000n, event.lpFee);
});

test("splitFromGross reproduces the program's split", () => {
  const split = splitFromGross(event.quoteAmountIn, fees);
  assert.equal(split.net, event.userQuoteAmountIn);
  assert.equal(split.fees.lp, event.lpFee);
  assert.equal(split.fees.protocol, event.protocolFee);
  assert.equal(split.intoPool, event.quoteAmountInWithLpFee);
});

test("reproduces the captured buy including its output", () => {
  const quote = quoteBuy(preReserves, event.quoteAmountIn, fees);
  assert.equal(quote.quoteIntoPool, event.quoteAmountInWithLpFee);
  assert.equal(quote.netQuote, event.userQuoteAmountIn);
  assert.equal(quote.fees.lp, event.lpFee);
  assert.equal(quote.fees.protocol, event.protocolFee);

  const diff = quote.baseOut > event.baseAmountOut
    ? quote.baseOut - event.baseAmountOut
    : event.baseAmountOut - quote.baseOut;
  assert.ok(diff <= 1n, "base out drifted by " + diff.toString());

  // the curve priced on net, the pool absorbed net + LP fee
  assert.equal(quote.netQuote + quote.fees.lp, quote.quoteIntoPool);
  assert.ok(quote.netQuote < quote.quoteIntoPool);
});
