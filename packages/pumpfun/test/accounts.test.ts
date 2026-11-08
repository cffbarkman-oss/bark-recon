import assert from "node:assert/strict";
import { test } from "node:test";
import { fromHex } from "@bark/solana";
import { decodeBondingCurve, decodeGlobalConfig } from "../src/accounts.js";
import { TRADE_CAPTURE } from "./fixtures.js";

const curveData = fromHex(TRADE_CAPTURE.bondingCurveHex);
const globalData = fromHex(TRADE_CAPTURE.globalHex);
const CURVE = "DGfgKzvaiBnU3nfPywB952u3QAeCBAsDySXtPDgMn5GB";

test("decodes the captured 166-byte bonding curve in full", () => {
  const curve = decodeBondingCurve(CURVE, curveData);
  assert.equal(curve.layout, "v2");
  assert.equal(curve.complete, false);
  assert.equal(curve.virtualTokenReserves, 822_273_624_860_714n);
  assert.equal(curve.virtualQuoteReserves, 39_147_553_199n);
  assert.equal(curve.realTokenReserves, 542_373_624_860_714n);
  assert.equal(curve.realQuoteReserves, 9_147_553_199n);
  assert.equal(curve.tokenTotalSupply, 1_000_000_000_000_000n);
});

test("virtual quote is exactly 30 SOL above real quote", () => {
  const curve = decodeBondingCurve(CURVE, curveData);
  assert.equal(curve.virtualQuoteReserves - curve.realQuoteReserves, 30_000_000_000n);
});

test("curve carries the creator and fee bookkeeping", () => {
  const curve = decodeBondingCurve(CURVE, curveData);
  assert.ok(curve.creator !== null);
  assert.equal(
    Buffer.from(curve.creator.toBytes()).toString("hex"),
    "39a05a059db69c64cc3492dc4e6ad3c2686b5ba2a891115e10d376d73764f65f",
  );
  assert.equal(curve.quoteMint, null, "SOL-quoted curves zero the quote mint");
  assert.equal(curve.creatorFeeBps, 0n);
  assert.equal(curve.canEditCreatorFee, false);
  assert.equal(curve.creatorFee, 110_997_350n);
  assert.equal(curve.protocolFees, 440_300_832n);
  assert.equal(curve.depth, 0);
  assert.equal(curve.initialVirtualQuoteReserves, 30_000_000_000n);
});

test("a 49-byte account decodes as the legacy layout", () => {
  const curve = decodeBondingCurve(CURVE, curveData.slice(0, 49));
  assert.equal(curve.layout, "v1");
  assert.equal(curve.creator, null);
  assert.equal(curve.virtualQuoteReserves, 39_147_553_199n);
});

test("rejects foreign discriminators and truncation", () => {
  assert.throws(() => decodeBondingCurve(CURVE, globalData), /unexpected discriminator/);
  assert.throws(() => decodeBondingCurve(CURVE, curveData.slice(0, 120)), /unexpected length/);
});

test("decodes the global config into the launch parameters", () => {
  const config = decodeGlobalConfig("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf", globalData);

  assert.equal(config.initialVirtualTokenReserves, 1_073_000_000_000_000n);
  assert.equal(config.initialVirtualSolReserves, 30_000_000_000n);
  assert.equal(config.initialRealTokenReserves, 793_100_000_000_000n);
  assert.equal(config.tokenTotalSupply, 1_000_000_000_000_000n);
  assert.equal(config.feeBasisPoints, 95);
  assert.equal(config.creatorFeeBasisPoints, 5);
  assert.equal(config.poolMigrationFee, 15_000_001n);
  assert.equal(config.buybackBasisPoints, 5000);
  assert.equal(config.maxConfigurableCreatorFeeBps, 300n);
  assert.equal(config.maxCurveDepth, 2);
  assert.equal(config.enableMigrate, true);
  assert.equal(config.createV2Enabled, true);
  assert.equal(config.mayhemModeEnabled, true);
  assert.equal(config.feeRecipients.length, 7);
  assert.equal(config.buybackFeeRecipients.length, 8);
  assert.equal(
    Buffer.from(config.feeRecipient.toBytes()).toString("hex"),
    "4ac2f8d0dd5cbc97e3289c197cb5062a54f3d956b9ce6e5115f96567aa5cb3e6",
  );
});
