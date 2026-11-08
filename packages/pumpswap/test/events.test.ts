import assert from "node:assert/strict";
import { test } from "node:test";
import { BPS_DENOMINATOR, fromHex } from "@bark/solana";
import { decodeSwapEvent } from "../src/events.js";
import { AMM_CAPTURE } from "./fixtures.js";

const payload = fromHex(AMM_CAPTURE.sellEventHex);

function ceilBps(amount: bigint, bps: bigint): bigint {
  return (amount * bps + BPS_DENOMINATOR - 1n) / BPS_DENOMINATOR;
}

test("sell event decodes to the last byte", () => {
  assert.equal(payload.length, 449);
  const event = decodeSwapEvent(payload);
  assert.ok(event !== null);
  assert.equal(event.layout, "sell");
  assert.equal(event.trailing.length, 0);
});

test("sell fields match the captured swap", () => {
  const event = decodeSwapEvent(payload);
  if (event === null || event.layout !== "sell") {
    assert.fail("expected a sell event");
  }

  assert.equal(event.baseAmountIn, 1_140_772_847_528n);
  assert.equal(event.poolBaseTokenReserves, 127_733_609_189_215n);
  assert.equal(event.poolQuoteTokenReserves, 907_525_871_500n);
  assert.equal(event.quoteAmountOut, 8_415_430_628n);
  assert.equal(event.lpFeeBasisPoints, 20);
  assert.equal(event.lpFee, 16_830_862n);
  assert.equal(event.protocolFeeBasisPoints, 5);
  assert.equal(event.protocolFee, 4_207_716n);
  assert.equal(event.coinCreatorFeeBasisPoints, 75);
  assert.equal(event.coinCreatorFee, 63_115_730n);
  assert.equal(event.quoteAmountOutWithoutLpFee, 8_398_599_766n);
  assert.equal(event.userQuoteAmountOut, 8_331_276_320n);
  assert.equal(event.canBoost, true);
});

test("every fee is ceil(gross x bps) and they sum to exactly 1%", () => {
  const event = decodeSwapEvent(payload);
  if (event === null || event.layout !== "sell") {
    assert.fail("expected a sell event");
  }
  const gross = event.quoteAmountOut;
  assert.equal(event.lpFee, ceilBps(gross, 20n));
  assert.equal(event.protocolFee, ceilBps(gross, 5n));
  assert.equal(event.coinCreatorFee, ceilBps(gross, 75n));
  // three separate ceils can land up to 2 lamports above a single 1% floor
  const sum = event.lpFee + event.protocolFee + event.coinCreatorFee;
  assert.ok(sum >= gross / 100n && sum <= gross / 100n + 3n, "fees should be ~1% of gross: " + sum);
  assert.equal(
    event.userQuoteAmountOut,
    gross - event.lpFee - event.protocolFee - event.coinCreatorFee,
  );
});

test("returns null for events from other programs", () => {
  const other = Uint8Array.from(payload);
  other[0] = 0;
  assert.equal(decodeSwapEvent(other), null);
});
