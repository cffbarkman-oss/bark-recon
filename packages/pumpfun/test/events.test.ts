import assert from "node:assert/strict";
import { test } from "node:test";
import { fromHex } from "@bark/solana";
import { decodeCreateEvent, decodePumpEvent, decodeTradeEvent } from "../src/events.js";
import { BPS_DENOMINATOR } from "@bark/solana";
import { LAUNCH_CAPTURE, TRADE_CAPTURE } from "./fixtures.js";

const sellPayload = fromHex(TRADE_CAPTURE.tradeEventHex);
const buyPayload = fromHex(LAUNCH_CAPTURE.buyEventHex);
const createPayload = fromHex(LAUNCH_CAPTURE.createEventHex);

function ceilBps(amount: bigint, bps: bigint): bigint {
  return (amount * bps + BPS_DENOMINATOR - 1n) / BPS_DENOMINATOR;
}

test("sell payload decodes to the last byte", () => {
  const event = decodeTradeEvent(sellPayload);
  assert.equal(event.layout, "v2");
  if (event.layout !== "v2") {
    assert.fail("expected v2");
  }
  assert.equal(event.trailing.length, 0);
  assert.equal(event.ixName, "sell");
  assert.equal(event.isBuy, false);
});

test("sell fields match the captured transaction", () => {
  const event = decodeTradeEvent(sellPayload);
  if (event.layout !== "v2") {
    assert.fail("expected v2");
  }
  assert.equal(event.solAmount, 1_559_679_685n);
  assert.equal(event.tokenAmount, 30_428_421_475_159n);
  assert.equal(event.timestamp, 1_794_147_029);
  assert.equal(event.virtualSolReserves, 39_847_511_445n);
  assert.equal(event.virtualTokenReserves, 807_829_630_484_498n);
  assert.equal(event.realSolReserves, 9_847_511_445n);
  assert.equal(event.realTokenReserves, 527_929_630_484_498n);
  assert.equal(event.feeBasisPoints, 95);
  assert.equal(event.fee, 14_816_958n);
  assert.equal(event.creatorFeeBasisPoints, 30);
  assert.equal(event.creatorFee, 4_679_040n);
  assert.equal(event.buybackFeeBasisPoints, 5000);
  assert.equal(event.buybackFee, 7_408_479n);
  assert.equal(event.creatorFeeUnclaimed, 81_217_357n);
  assert.equal(event.quoteMint, null);
  assert.equal(event.quoteAmount, event.solAmount);
  assert.equal(event.virtualQuoteReserves, event.virtualSolReserves);
  assert.equal(event.shareholders.length, 0);
});

test("fee fields equal ceil(amount x bps), for both sides", () => {
  for (const payload of [sellPayload, buyPayload]) {
    const event = decodeTradeEvent(payload);
    if (event.layout !== "v2") {
      assert.fail("expected v2");
    }
    assert.equal(event.fee, ceilBps(event.solAmount, BigInt(event.feeBasisPoints)));
    assert.equal(event.creatorFee, ceilBps(event.solAmount, BigInt(event.creatorFeeBasisPoints)));
  }
});

test("buy payload is one byte shorter than sell because of ixName", () => {
  const buy = decodeTradeEvent(buyPayload);
  assert.equal(buy.layout, "v2");
  if (buy.layout !== "v2") {
    assert.fail("expected v2");
  }
  assert.equal(buy.ixName, "buy");
  assert.equal(buy.isBuy, true);
  assert.equal(buyPayload.length, sellPayload.length - 1);
});

test("create event decodes fully and matches the launch", () => {
  const event = decodeCreateEvent(createPayload);
  assert.equal(event.name, "79");
  assert.equal(event.symbol, "79");
  assert.ok(event.uri.startsWith("https://ipfs.io/ipfs/"));
  assert.equal(
    Buffer.from(event.mint.toBytes()).toString("hex"),
    "e58b6e47cc0652c2b3ad517ab06313d9b6a81895d953efc6faded4e7cbe1c84f",
  );
  assert.equal(event.virtualTokenReserves, 1_073_000_000_000_000n);
  assert.equal(event.virtualSolReserves, 30_000_000_000n);
  assert.equal(event.realTokenReserves, 793_100_000_000_000n);
  assert.equal(event.tokenTotalSupply, 1_000_000_000_000_000n);
  assert.equal(event.isMayhemMode, true);
  assert.equal(event.isCashbackEnabled, false);
  assert.equal(event.quoteMint, null);
  assert.equal(event.creatorFeeBps, 0n);
  assert.equal(event.depth, 0);
  assert.equal(event.trailing.length, 0);
});

test("event dispatcher routes by discriminator", () => {
  assert.equal(decodePumpEvent(sellPayload).kind, "trade");
  assert.equal(decodePumpEvent(createPayload).kind, "create");
  const unknown = Uint8Array.from(sellPayload);
  unknown[0] = 0;
  assert.equal(decodePumpEvent(unknown).kind, "unknown");
});

test("rejects truncated payloads instead of guessing", () => {
  assert.throws(() => decodeTradeEvent(sellPayload.slice(0, 200)), /no known layout/);
  assert.throws(() => decodeCreateEvent(createPayload.slice(0, 40)), /underflow/i);
});
