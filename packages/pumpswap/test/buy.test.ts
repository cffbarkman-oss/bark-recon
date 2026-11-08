import assert from "node:assert/strict";
import { test } from "node:test";
import { fromHex } from "@bark/solana";
import { decodeBuyEvent } from "../src/events.js";
import { quoteBuy, splitFromGross } from "../src/math.js";
import { AMM_BUY_CAPTURE } from "./fixtures.js";

const payload = fromHex(AMM_BUY_CAPTURE.buyEventHex);
const event = decodeBuyEvent(payload);

test("decodes a live buy event", () => {
  assert.equal(payload.length, 515);
  assert.equal(event.layout, "buy");
  assert.equal(event.quoteAmountIn, 37_575_185_568n);
  assert.equal(event.userQuoteAmountIn, 37_462_797_176n);
  assert.equal(event.lpFee, 93_656_993n);
  assert.equal(event.protocolFee, 18_731_399n);
  assert.equal(event.quoteAmountInWithLpFee, 37_556_454_169n);
  assert.equal(event.lpFeeBasisPoints, 25);
  assert.equal(event.protocolFeeBasisPoints, 5);
});

test("the buy fee base is the net amount, not the gross", () => {
  const gross = event.quoteAmountIn;
  const net = event.userQuoteAmountIn;

  // computed on the gross it would be wrong by ~56k lamports
  const onGross = (gross * 5n + 9_999n) / 10_000n;
  assert.notEqual(onGross, event.protocolFee);

  // computed on the net it matches exactly
  assert.equal((net * 5n + 9_999n) / 10_000n, event.protocolFee);
  assert.equal((net * 25n + 9_999n) / 10_000n, event.lpFee);
});

test("gross = net + fees, and the pool absorbs net + lp fee", () => {
  assert.equal(
    event.userQuoteAmountIn + event.lpFee + event.protocolFee + event.coinCreatorFee,
    event.quoteAmountIn,
  );
  assert.equal(
    event.quoteAmountIn - event.protocolFee - event.coinCreatorFee,
    event.quoteAmountInWithLpFee,
  );
});

test("splitFromGross reproduces the program's split", () => {
  const split = splitFromGross(event.quoteAmountIn, {
    lpFeeBps: event.lpFeeBasisPoints,
    protocolFeeBps: event.protocolFeeBasisPoints,
    coinCreatorFeeBps: event.coinCreatorFeeBasisPoints,
  });

  assert.equal(split.net, event.userQuoteAmountIn);
  assert.equal(split.fees.lp, event.lpFee);
  assert.equal(split.fees.protocol, event.protocolFee);
  assert.equal(split.fees.coinCreator, event.coinCreatorFee);
  assert.equal(split.intoPool, event.quoteAmountInWithLpFee);
});

test("quoteBuy puts exactly the event's amount into the pool", () => {
  const reserves = {
    base: event.poolBaseTokenReserves + event.baseAmountOut,
    quote: event.poolQuoteTokenReserves,
  };
  const quote = quoteBuy(reserves, event.quoteAmountIn, {
    lpFeeBps: event.lpFeeBasisPoints,
    protocolFeeBps: event.protocolFeeBasisPoints,
    coinCreatorFeeBps: event.coinCreatorFeeBasisPoints,
  });

  assert.equal(quote.quoteIntoPool, event.quoteAmountInWithLpFee);
  assert.equal(quote.netQuote, event.userQuoteAmountIn);
  assert.equal(quote.fees.lp, event.lpFee);
  assert.equal(quote.fees.protocol, event.protocolFee);
});
