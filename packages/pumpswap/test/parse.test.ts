import assert from "node:assert/strict";
import { test } from "node:test";
import { fromHex } from "@bark/solana";
import { decodeSwapEvent } from "../src/events.js";
import { parseAmmTransaction } from "../src/parse.js";
import { AMM_CAPTURE } from "./fixtures.js";

function logsFrom(hex: string): string[] {
  return [
    "Program log: Instruction: Sell",
    "Program data: " + Buffer.from(hex, "hex").toString("base64"),
  ];
}

test("parses the captured sell into one swap", () => {
  const parsed = parseAmmTransaction({
    slot: AMM_CAPTURE.slot,
    blockTime: AMM_CAPTURE.blockTime,
    meta: { err: null, fee: 5_000, preBalances: [], postBalances: [], logMessages: logsFrom(AMM_CAPTURE.sellEventHex) },
    transaction: { message: { accountKeys: [], instructions: [] }, signatures: [AMM_CAPTURE.signature] },
  });

  assert.equal(parsed.swaps.length, 1);
  const swap = parsed.swaps[0];
  assert.ok(swap !== undefined);
  assert.equal(swap.side, "sell");
  assert.equal(swap.baseAmount, 1_140_772_847_528n);
  assert.equal(swap.quoteAmount, 8_415_430_628n);
  assert.equal(swap.userQuoteAmount, 8_331_276_320n);
  const decoded = decodeSwapEvent(fromHex(AMM_CAPTURE.sellEventHex));
  assert.ok(decoded !== null && decoded.layout === "sell");
  assert.equal(swap.poolVirtualQuoteReserves, decoded.virtualQuoteReserves);
});

test("returns nothing for unrelated logs", () => {
  const parsed = parseAmmTransaction({
    slot: 1,
    blockTime: null,
    meta: { err: null, fee: 0, preBalances: [], postBalances: [], logMessages: ["Program log: hi"] },
    transaction: { message: { accountKeys: [], instructions: [] }, signatures: ["sig"] },
  });
  assert.deepEqual(parsed.swaps, []);
});
