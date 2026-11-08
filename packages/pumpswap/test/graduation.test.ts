import assert from "node:assert/strict";
import { test } from "node:test";
import { fromHex } from "@bark/solana";
import { decodeCreatePoolEvent } from "../src/events.js";
import { AMM_CREATE_POOL_CAPTURE } from "./fixtures.js";

const payload = fromHex(AMM_CREATE_POOL_CAPTURE.createPoolEventHex);

test("decodes a live pool creation to the last byte", () => {
  assert.equal(payload.length, 344);
  const event = decodeCreatePoolEvent(payload);
  assert.equal(event.trailing.length, 0);
  assert.equal(event.timestamp, 1_794_160_737);
  assert.equal(event.index, 0);
  assert.equal(event.poolBump, 254);
});

test("records the migration as a liquidity event", () => {
  const event = decodeCreatePoolEvent(payload);
  assert.equal(event.baseAmountIn, 209_900_000_000n);
  assert.equal(event.quoteAmountIn, 1_000_000_000_000_000n);
  assert.equal(event.poolBaseAmount, event.baseAmountIn);
  assert.equal(event.poolQuoteAmount, event.quoteAmountIn);
  assert.equal(event.minimumLiquidity, 100n);
  assert.ok(event.initialLiquidity > event.minimumLiquidity);
  assert.ok(event.lpTokenAmountOut > 0n);
});

test("this pool has SOL on the base side, not the quote side", () => {
  const event = decodeCreatePoolEvent(payload);
  const wrappedSol = "So11111111111111111111111111111111111111112";
  assert.equal(event.baseMint.toBase58(), wrappedSol);
  assert.notEqual(event.quoteMint.toBase58(), wrappedSol);
  assert.equal(event.baseMintDecimals, 9);
  assert.equal(event.quoteMintDecimals, 6);
});

test("creator and pool are distinct keys and the creator is the coin creator", () => {
  const event = decodeCreatePoolEvent(payload);
  assert.equal(event.creator.toBase58(), event.coinCreator.toBase58());
  assert.notEqual(event.pool.toBase58(), event.lpMint.toBase58());
  assert.equal(event.canEditCreatorFee, false);
  assert.equal(event.isHolderReward, false);
});
