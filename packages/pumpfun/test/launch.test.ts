import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_CURVE_PARAMS } from "../src/curve.js";
import { LaunchParamsError, previewLaunch, validateLaunchParams } from "../src/launch.js";

test("the observed mainnet parameters preview to known values", () => {
  const preview = previewLaunch(DEFAULT_CURVE_PARAMS);
  assert.equal(preview.completionQuote, 85_005_359_056n);
  assert.equal(preview.completionTokens, 793_100_000_000_000n);
  assert.equal(preview.finalState.realTokenReserves, 0n);
  assert.equal(preview.finalState.complete, true);
  // initial ~2.7959e-8 SOL per token, final ~4.11e-7: roughly a 14.7x move
  assert.ok(preview.priceMultiple > 14 && preview.priceMultiple < 15);
  assert.ok(preview.feeShare > 0.01 && preview.feeShare < 0.02);
});

test("fees accrue against the raised quote, not the token supply", () => {
  const preview = previewLaunch(DEFAULT_CURVE_PARAMS);
  const gross = preview.completionQuote;
  const ceilDiv = (amount: bigint, bps: bigint): bigint =>
    (amount * bps + 9_999n) / 10_000n;
  assert.equal(preview.protocolFeesAtCompletion, ceilDiv(gross, 95n));
  assert.equal(preview.creatorFeesAtCompletion, ceilDiv(gross, 30n));
});

test("valid parameters produce no problems", () => {
  assert.deepEqual(validateLaunchParams(DEFAULT_CURVE_PARAMS), []);
});

test("invalid parameters are explained, not just rejected", () => {
  const problems = validateLaunchParams({
    ...DEFAULT_CURVE_PARAMS,
    initialRealTokenReserves: DEFAULT_CURVE_PARAMS.initialVirtualTokenReserves,
    protocolFeeBps: 600,
    creatorFeeBps: 600,
  });
  assert.ok(problems.some((p) => p.includes("must be below")));
  assert.ok(problems.some((p) => p.includes("above 10%")));
  assert.throws(() => previewLaunch({ ...DEFAULT_CURVE_PARAMS, protocolFeeBps: 20_000 }), LaunchParamsError);
});

test("a steeper curve moves price further", () => {
  const shallow = previewLaunch({
    ...DEFAULT_CURVE_PARAMS,
    initialRealTokenReserves: 500_000_000_000_000n,
  });
  const steep = previewLaunch({
    ...DEFAULT_CURVE_PARAMS,
    initialRealTokenReserves: 900_000_000_000_000n,
  });
  assert.ok(
    steep.priceMultiple > shallow.priceMultiple,
    "selling fewer tokens over the same virtual gap should move price further",
  );
});
