import assert from "node:assert/strict";
import { test } from "node:test";
import { fromHex } from "@bark/solana";
import { POOL_OBSERVED_LENGTH, decodePool } from "../src/pool.js";
import { AMM_CAPTURE } from "./fixtures.js";

const data = fromHex(AMM_CAPTURE.poolHex);

test("decodes a live pool and leaves only the unmapped tail", () => {
  const pool = decodePool(AMM_CAPTURE.pool, data);

  assert.equal(data.length, POOL_OBSERVED_LENGTH);
  assert.equal(pool.poolBump, 254);
  assert.equal(pool.index, 0);
  assert.equal(pool.lpSupply, 10_345_702_509_847n);
  assert.equal(pool.isMayhemMode, false);
  assert.equal(pool.isCashbackCoin, false);
  assert.equal(pool.canEditCreatorFee, false);
  assert.equal(pool.isHolderReward, false);
  assert.equal(pool.trailing.length, POOL_OBSERVED_LENGTH - 287);
});

test("this pool is quoted in wrapped SOL, like the curve it graduated from", () => {
  const pool = decodePool(AMM_CAPTURE.pool, data);
  assert.equal(pool.quoteMint.toBase58(), "So11111111111111111111111111111111111111112");
  assert.notEqual(pool.baseMint.toBase58(), pool.quoteMint.toBase58());
});

test("rejects accounts that are not pools", () => {
  const wrong = Uint8Array.from(data);
  wrong[0] = 0;
  assert.throws(() => decodePool(AMM_CAPTURE.pool, wrong), /Not a PumpSwap pool/);
});
