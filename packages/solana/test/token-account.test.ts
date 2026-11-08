import assert from "node:assert/strict";
import { test } from "node:test";
import { PublicKey } from "../src/public-key.js";
import { decodeTokenAccount } from "../src/token-account.js";

const MINT = "BQn2Wz514RzRoMSg32wAa8YZa4xDvNSzh127SmYYpump";
const OWNER = "DKgffUE4JVaGnqxaA44Y6ZHyqaujL7yBUJNV8w84tAqY";

function account(amount: bigint): Uint8Array {
  const data = new Uint8Array(165);
  data.set(new PublicKey(MINT).toBytes(), 0);
  data.set(new PublicKey(OWNER).toBytes(), 32);
  let value = amount;
  for (let i = 0; i < 8; i += 1) {
    data[64 + i] = Number(value & 0xffn);
    value >>= 8n;
  }
  data[108] = 1; // initialized
  return data;
}

test("reads mint, owner and amount from a token account", () => {
  const decoded = decodeTokenAccount("ata", account(704_144_990_476_900n));
  assert.equal(decoded.mint.toBase58(), MINT);
  assert.equal(decoded.owner.toBase58(), OWNER);
  assert.equal(decoded.amount, 704_144_990_476_900n);
});

test("handles zero and maximum amounts", () => {
  assert.equal(decodeTokenAccount("ata", account(0n)).amount, 0n);
  assert.equal(decodeTokenAccount("ata", account(2n ** 64n - 1n)).amount, 2n ** 64n - 1n);
});

test("rejects truncated accounts", () => {
  assert.throws(() => decodeTokenAccount("ata", new Uint8Array(100)), /too short/);
});
