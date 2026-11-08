import assert from "node:assert/strict";
import { test } from "node:test";
import { fromHex } from "@bark/solana";
import { decodeBondingCurve, decodeGlobalConfig } from "../src/accounts.js";
import { CAPTURED } from "./fixtures.js";

const curveData = fromHex(CAPTURED.bondingCurveHex);
const globalData = fromHex(CAPTURED.globalHex);

test("decodes the captured v2 bonding curve", () => {
  const curve = decodeBondingCurve("DGfgKzvaiBnU3nfPywB952u3QAeCBAsDySXtPDgMn5GB", curveData);

  assert.equal(curve.layout, "v2");
  assert.equal(curve.complete, false);
  assert.equal(curve.virtualSolReserves, 39_147_553_199n);
  assert.equal(curve.realSolReserves, 9_147_553_199n);
  assert.equal(curve.virtualTokenReserves, 822_273_624_860_714n);
  assert.equal(curve.realTokenReserves, 542_373_624_860_714n);
  assert.equal(curve.tokenTotalSupply, 1_000_000_000_000_000n);
  assert.equal(curve.trailing.length, 85);
});

test("virtual SOL is always exactly 30 SOL above real SOL", () => {
  const curve = decodeBondingCurve("DGfgKzvaiBnU3nfPywB952u3QAeCBAsDySXtPDgMn5GB", curveData);
  assert.equal(curve.virtualSolReserves - curve.realSolReserves, 30_000_000_000n);
});

test("v2 curve carries the creator key seen in the trade event", () => {
  const curve = decodeBondingCurve("DGfgKzvaiBnU3nfPywB952u3QAeCBAsDySXtPDgMn5GB", curveData);
  assert.ok(curve.creator !== null);
  assert.equal(
    Buffer.from(curve.creator.toBytes()).toString("hex"),
    "39a05a059db69c64cc3492dc4e6ad3c2686b5ba2a891115e10d376d73764f65f",
  );
});

test("a 49-byte account decodes as the v1 layout", () => {
  const curve = decodeBondingCurve("DGfgKzvaiBnU3nfPywB952u3QAeCBAsDySXtPDgMn5GB", curveData.slice(0, 49));
  assert.equal(curve.layout, "v1");
  assert.equal(curve.creator, null);
  assert.equal(curve.virtualSolReserves, 39_147_553_199n);
});

test("rejects accounts with a foreign discriminator", () => {
  assert.throws(() => decodeBondingCurve("DGfgKzvaiBnU3nfPywB952u3QAeCBAsDySXtPDgMn5GB", globalData), /unexpected discriminator/);
});

test("decodes the global config into the documented launch parameters", () => {
  const config = decodeGlobalConfig("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf", globalData);

  assert.equal(config.initialVirtualTokenReserves, 1_073_000_000_000_000n);
  assert.equal(config.initialVirtualSolReserves, 30_000_000_000n);
  assert.equal(config.initialRealTokenReserves, 793_100_000_000_000n);
  assert.equal(config.tokenTotalSupply, 1_000_000_000_000_000n);
  assert.equal(config.feeBasisPoints, 95);
  assert.equal(
    Buffer.from(config.feeRecipient.toBytes()).toString("hex"),
    "4ac2f8d0dd5cbc97e3289c197cb5062a54f3d956b9ce6e5115f96567aa5cb3e6",
  );
});
