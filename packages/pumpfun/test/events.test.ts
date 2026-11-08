import assert from "node:assert/strict";
import { test } from "node:test";
import { fromHex } from "@bark/solana";
import { decodeTradeEvent } from "../src/events.js";
import { CAPTURED } from "./fixtures.js";

const payload = fromHex(CAPTURED.tradeEventHex);

test("the captured payload is an extended TradeEvent", () => {
  assert.equal(payload.length, 391);
  const event = decodeTradeEvent(payload);
  assert.equal(event.layout, "v2");
});

test("decodes the verified fields of the captured trade", () => {
  const event = decodeTradeEvent(payload);
  if (event.layout !== "v2") {
    assert.fail("expected v2 layout");
  }

  assert.equal(event.solAmount, 1_559_679_685n);
  assert.equal(event.tokenAmount, 30_428_421_475_159n);
  assert.equal(event.isBuy, false);
  assert.equal(event.timestamp, 1_794_147_029);
  assert.equal(event.virtualSolReserves, 39_847_511_445n);
  assert.equal(event.virtualTokenReserves, 807_829_630_484_498n);
  assert.equal(event.realSolReserves, 9_847_511_445n);
  assert.equal(event.realTokenReserves, 527_929_630_484_498n);
});

test("keys match the addresses present in the transaction", () => {
  const event = decodeTradeEvent(payload);
  assert.equal(
    Buffer.from(event.mint.toBytes()).toString("hex"),
    "a4c5668e2bd2825e288013ead7cc1ca2ecbb163c61f5c5808eab65d1923f502f",
  );
  assert.equal(
    Buffer.from(event.user.toBytes()).toString("hex"),
    "f30a7e0b18f34a12802a81d9b6256ba94e38a5206c74528325af339da7fc59b5",
  );
  assert.equal(
    Buffer.from(event.feeRecipient.toBytes()).toString("hex"),
    "4ac2f8d0dd5cbc97e3289c197cb5062a54f3d956b9ce6e5115f96567aa5cb3e6",
  );
});

test("v2 reuses the fee slot for the creator fee rate", () => {
  const event = decodeTradeEvent(payload);
  if (event.layout !== "v2") {
    assert.fail("expected v2 layout");
  }
  // 95 bps of the 1.559679685 SOL trade = 14,816,958 lamports, matching the
  // creator fee the transaction actually moved.
  assert.equal(event.creatorFeeBps, 95);
  assert.equal(event.creatorFee, 14_816_958n);
});

test("rejects payloads from other programs", () => {
  const wrong = Uint8Array.from(payload);
  wrong[0] = 0;
  assert.throws(() => decodeTradeEvent(wrong), /Not a pump.fun TradeEvent/);
});

test("refuses to decode a truncated payload", () => {
  assert.throws(() => decodeTradeEvent(payload.slice(0, 60)), /underflow/i);
});
