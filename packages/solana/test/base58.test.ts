import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeBase58, encodeBase58, isBase58 } from "../src/base58.js";

test("round-trips the system program id", () => {
  const value = "11111111111111111111111111111111";
  const bytes = decodeBase58(value);
  assert.equal(bytes.length, 32);
  assert.ok(bytes.every((byte) => byte === 0));
  assert.equal(encodeBase58(bytes), value);
});

test("round-trips arbitrary byte strings", () => {
  const cases = [
    new Uint8Array([]),
    new Uint8Array([0]),
    new Uint8Array([0, 0, 1, 2, 3]),
    new Uint8Array([255, 254, 253]),
    Uint8Array.from({ length: 64 }, (_, index) => (index * 37) % 256),
  ];
  for (const input of cases) {
    assert.deepEqual(decodeBase58(encodeBase58(input)), input);
  }
});

test("rejects characters outside the alphabet", () => {
  assert.throws(() => decodeBase58("0OIl"), /Invalid base58 character/);
});

test("validates base58 shape", () => {
  assert.equal(isBase58("11111111111111111111111111111111"), true);
  assert.equal(isBase58("not a key"), false);
  assert.equal(isBase58(""), false);
});
