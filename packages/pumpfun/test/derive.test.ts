import assert from "node:assert/strict";
import { test } from "node:test";
import { PublicKey, fromHex } from "@bark/solana";
import { deriveBondingCurveAddress } from "../src/derive.js";
import { decodeCreateEvent } from "../src/events.js";
import { LAUNCH_CAPTURE } from "./fixtures.js";

const create = decodeCreateEvent(fromHex(LAUNCH_CAPTURE.createEventHex));

test("derives the curve address seen in the launch event", () => {
  const derived = deriveBondingCurveAddress(create.mint);
  assert.equal(derived.address.toBase58(), create.bondingCurve.toBase58());
  assert.equal(derived.bump, 255);
});

test("accepts a base58 string as well as a PublicKey", () => {
  const fromString = deriveBondingCurveAddress(create.mint.toBase58());
  const fromKey = deriveBondingCurveAddress(new PublicKey(create.mint.toBase58()));
  assert.equal(fromString.address.toBase58(), fromKey.address.toBase58());
});

test("derivation is deterministic and mint-specific", () => {
  const a = deriveBondingCurveAddress(create.mint);
  const b = deriveBondingCurveAddress(create.mint);
  assert.equal(a.address.toBase58(), b.address.toBase58());

  const other = deriveBondingCurveAddress("C6CSnQBoSQG8ShsHjAuVHFK7DusAfA4iJbKLJeMbpump");
  assert.notEqual(other.address.toBase58(), a.address.toBase58());
});
