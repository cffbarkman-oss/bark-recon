import assert from "node:assert/strict";
import { test } from "node:test";
import { PublicKey, fromHex } from "@bark/solana";
import { decodeBondingCurve, type ParsedPumpTransaction, type PumpTrade } from "@bark/pumpfun";
import { renderCurve, renderTransaction } from "../src/render.js";

const CURVE_HEX =
  "17b7f83760d8ac602a68517fdaeb0200af41601d090000002ad03e3349ed0100af953c21020000000080c6a47e8d03000039a05a059db69c64cc3492dc4e6ad3c2686b5ba2a891115e10d376d73764f65f000000000000000000000000000000000000000000000000000000000000000000000000000000000000000066af9d060000000020753e1a000000000000ac23fc0600000000000000000000000000000000000000";

const MINT = new PublicKey("C6CSnQBoSQG8ShsHjAuVHFK7DusAfA4iJbKLJeMbpump");
const USER = new PublicKey("HMjMJZsQp6ykQyNSk8ZdmcJnNg5w9tRdU3q1DG3sW4ag");


function trade(): PumpTrade {
  return {
    signature: "sig",
    slot: 466943651,
    blockTime: 1_794_147_030,
    kind: "sell",
    mint: MINT,
    user: USER,
    creator: null,
    feeRecipient: USER,
    solAmount: 1_559_679_685n,
    tokenAmount: 30_428_421_475_159n,
    feeBasisPoints: 95,
    fee: 14_816_958n,
    creatorFeeBasisPoints: 30,
    creatorFee: 4_679_040n,
    quoteMint: null,
    quoteAmount: 1_559_679_685n,
    virtualSolReserves: 39_847_511_445n,
    virtualTokenReserves: 807_829_630_484_498n,
    realSolReserves: 9_847_511_445n,
    realTokenReserves: 527_929_630_484_498n,
    virtualQuoteReserves: 39_847_511_445n,
    realQuoteReserves: 9_847_511_445n,
    timestamp: 1_794_147_029,
    ixName: "sell",
    mayhemMode: false,
    cashback: 0n,
    buybackFee: 7_408_479n,
    shareholders: [],
    layout: "v2",
  };
}

function parsed(): ParsedPumpTransaction {
  return {
    signature: "sig",
    slot: 466943651,
    blockTime: 1_794_147_030,
    failed: false,
    computeUnits: 217_960,
    trades: [trade()],
    creates: [],
    completions: [],
  };
}

test("renders a trade with its fee breakdown", () => {
  const text = renderTransaction(parsed());
  assert.match(text, /trades {5}1/);
  assert.match(text, /SELL/);
  assert.match(text, /1\.559679 SOL/);
  assert.match(text, /@95bps/);
  assert.match(text, /@30bps/);
  assert.match(text, /217,960 CU/);
});

test("renders settlement credits when provided", () => {
  const text = renderTransaction(parsed(), [
    {
      signature: "sig",
      grossQuote: 1_559_679_685n,
      userDelta: 1_523_511_448n,
      totalCosts: 36_168_237n,
      credits: [{ address: "62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV", delta: 7_408_479n }],
      networkFee: 5_000n,
    },
  ]);
  assert.match(text, /settled/);
  assert.match(text, /credit/);
});

test("renders a decoded curve", () => {
  const curve = decodeBondingCurve(
    "DGfgKzvaiBnU3nfPywB952u3QAeCBAsDySXtPDgMn5GB",
    fromHex(CURVE_HEX),
  );
  const text = renderCurve(curve);
  assert.match(text, /layout {5}v2/);
  assert.match(text, /progress/);
  assert.match(text, /39\.147553 SOL/);
  assert.equal(curve.creator !== null, true);
});
