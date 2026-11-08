import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePumpLogs } from "../src/parse.js";
import { CAPTURED } from "./fixtures.js";

test("extracts one sell from the captured log stream", () => {
  const trades = parsePumpLogs([...CAPTURED.logLines], {
    signature: CAPTURED.signature,
    slot: CAPTURED.slot,
    blockTime: CAPTURED.blockTime,
  });

  assert.equal(trades.length, 1);
  const trade = trades[0];
  assert.ok(trade !== undefined);
  assert.equal(trade.kind, "sell");
  assert.equal(trade.solAmount, 1_559_679_685n);
  assert.equal(trade.tokenAmount, 30_428_421_475_159n);
  assert.equal(trade.layout, "v2");
  assert.equal(trade.slot, CAPTURED.slot);
  assert.ok(trade.creator !== null, "v2 trades expose the creator");
});

test("ignores unrelated transactions", () => {
  const trades = parsePumpLogs(["Program log: Instruction: Transfer"], {
    signature: "sig",
    slot: 1,
  });
  assert.deepEqual(trades, []);
});

test("does not duplicate when the same event appears twice", () => {
  const doubled = [...CAPTURED.logLines, ...CAPTURED.logLines];
  const trades = parsePumpLogs(doubled, { signature: CAPTURED.signature, slot: CAPTURED.slot });
  assert.equal(trades.length, 1);
});
