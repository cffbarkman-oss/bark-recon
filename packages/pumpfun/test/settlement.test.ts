import assert from "node:assert/strict";
import { test } from "node:test";
import type { RpcTransaction } from "@bark/solana";
import { accountKeyList, nativeFlows, reconcileTrade } from "../src/settlement.js";
import { parsePumpLogs } from "../src/parse.js";
import { TRADE_CAPTURE } from "./fixtures.js";

const USER = "HMjMJZsQp6ykQyNSk8ZdmcJnNg5w9tRdU3q1DG3sW4ag";
const CURVE = "DGfgKzvaiBnU3nfPywB952u3QAeCBAsDySXtPDgMn5GB";
const FEE_RECIPIENT = "62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV";

// Balance deltas taken from the captured transaction.
const KEYS = [USER, CURVE, FEE_RECIPIENT];
const PRE = [1_000_000_000, 5_000_000_000, 10_000_000];
const POST = [1_000_000_000 + 1_523_511_448, 5_000_000_000 - 1_559_679_685, 10_000_000 + 7_408_479];

function transaction(): RpcTransaction {
  return {
    slot: TRADE_CAPTURE.slot,
    blockTime: TRADE_CAPTURE.blockTime,
    meta: {
      err: null,
      fee: 5_000,
      preBalances: PRE,
      postBalances: POST,
      logMessages: [...TRADE_CAPTURE.logLines],
    },
    transaction: {
      message: {
        accountKeys: KEYS.map((pubkey) => ({ pubkey })),
        instructions: [],
      },
      signatures: [TRADE_CAPTURE.signature],
    },
  };
}

test("native flows report signed deltas, largest first", () => {
  const flows = nativeFlows(transaction());
  assert.equal(flows.length, 3);
  assert.equal(flows[0]?.delta, 1_523_511_448n);
  assert.equal(flows[1]?.delta, 7_408_479n);
  assert.equal(flows[2]?.delta, -1_559_679_685n);
});

test("includes address-lookup-table keys in balance order", () => {
  const tx = transaction();
  tx.transaction.message.accountKeys = [{ pubkey: USER }];
  tx.meta!.loadedAddresses = { writable: [CURVE], readonly: [FEE_RECIPIENT] };
  tx.meta!.preBalances = [1_000_000_000, 5_000_000_000, 10_000_000];
  tx.meta!.postBalances = [
    1_000_000_000 + 1_523_511_448,
    5_000_000_000 - 1_559_679_685,
    10_000_000 + 7_408_479,
  ];

  assert.deepEqual(accountKeyList(tx), [USER, CURVE, FEE_RECIPIENT]);
  const flows = nativeFlows(tx);
  assert.equal(flows.length, 3);
  assert.equal(flows.find((f) => f.address === CURVE)?.delta, -1_559_679_685n);
});

test("reconciles a sell against what the user actually received", () => {
  const parsed = parsePumpLogs([...TRADE_CAPTURE.logLines], {
    signature: TRADE_CAPTURE.signature,
    slot: TRADE_CAPTURE.slot,
    blockTime: TRADE_CAPTURE.blockTime,
  });
  const trade = parsed.trades[0];
  assert.ok(trade !== undefined);

  const settlement = reconcileTrade(trade, transaction());
  assert.equal(settlement.grossQuote, 1_559_679_685n);
  assert.equal(settlement.userDelta, 1_523_511_448n);
  assert.equal(settlement.totalCosts, 36_168_237n);
  assert.equal(settlement.networkFee, 5_000n);
  assert.equal(settlement.credits.length, 1);
  assert.equal(settlement.credits[0]?.address, FEE_RECIPIENT);
});

test("missing user account yields a zero delta instead of throwing", () => {
  const tx = transaction();
  tx.transaction.message.accountKeys = [{ pubkey: CURVE }];
  tx.meta!.preBalances = [5_000_000_000];
  tx.meta!.postBalances = [5_000_000_000 - 1_559_679_685];

  const parsed = parsePumpLogs([...TRADE_CAPTURE.logLines], {
    signature: TRADE_CAPTURE.signature,
    slot: TRADE_CAPTURE.slot,
  });
  const settlement = reconcileTrade(parsed.trades[0]!, tx);
  assert.equal(settlement.userDelta, 0n);
});
