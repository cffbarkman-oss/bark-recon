import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePumpLogs } from "../src/parse.js";
import { LAUNCH_CAPTURE, TRADE_CAPTURE } from "./fixtures.js";

function dataLine(hex: string): string {
  return "Program data: " + Buffer.from(hex, "hex").toString("base64");
}

const SELL_LOGS = [...TRADE_CAPTURE.logLines];

const LAUNCH_LOGS = [
  "Program log: Instruction: CreateV2",
  dataLine(LAUNCH_CAPTURE.createEventHex),
  "Program log: Instruction: BuyV2",
  dataLine(LAUNCH_CAPTURE.buyEventHex),
];

test("extracts one sell from the captured log stream", () => {
  const parsed = parsePumpLogs(SELL_LOGS, {
    signature: TRADE_CAPTURE.signature,
    slot: TRADE_CAPTURE.slot,
    blockTime: TRADE_CAPTURE.blockTime,
  });

  assert.equal(parsed.trades.length, 1);
  const trade = parsed.trades[0];
  assert.ok(trade !== undefined);
  assert.equal(trade.kind, "sell");
  assert.equal(trade.solAmount, 1_559_679_685n);
  assert.equal(trade.feeBasisPoints, 95);
  assert.equal(trade.fee, 14_816_958n);
  assert.equal(trade.creatorFeeBasisPoints, 30);
  assert.equal(trade.creatorFee, 4_679_040n);
  assert.equal(trade.ixName, "sell");
  assert.ok(trade.creator !== null);
  assert.equal(parsed.creates.length, 0);
});

test("extracts a launch and its follow-on buy", () => {
  const parsed = parsePumpLogs(LAUNCH_LOGS, {
    signature: LAUNCH_CAPTURE.signature,
    slot: LAUNCH_CAPTURE.slot,
  });

  assert.equal(parsed.creates.length, 1);
  const create = parsed.creates[0];
  assert.ok(create !== undefined);
  assert.equal(create.name, "79");
  assert.equal(create.symbol, "79");
  assert.equal(create.isMayhemMode, true);
  assert.equal(create.bondingCurve.toBase58().length > 0, true);

  assert.equal(parsed.trades.length, 1);
  const buy = parsed.trades[0];
  assert.ok(buy !== undefined);
  assert.equal(buy.kind, "buy");
  assert.equal(buy.mint.toBase58(), create.mint.toBase58());
});

test("ignores unrelated transactions", () => {
  const parsed = parsePumpLogs(["Program log: Instruction: Transfer"], {
    signature: "sig",
    slot: 1,
  });
  assert.deepEqual(parsed.trades, []);
  assert.deepEqual(parsed.creates, []);
});

test("does not double count when an event is logged twice", () => {
  const parsed = parsePumpLogs([...SELL_LOGS, ...SELL_LOGS], {
    signature: TRADE_CAPTURE.signature,
    slot: TRADE_CAPTURE.slot,
  });
  assert.equal(parsed.trades.length, 1);
});
