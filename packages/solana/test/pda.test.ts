import assert from "node:assert/strict";
import { test } from "node:test";
import { findAssociatedTokenAddress } from "../src/pda.js";
import { PublicKey, TOKEN_2022_PROGRAM } from "../src/public-key.js";

/**
 * Ground truth captured from mainnet: this Token-2022 associated account was
 * present in a live pump.fun transaction alongside its owner and mint.
 */
const WALLET = new PublicKey("HMjMJZsQp6ykQyNSk8ZdmcJnNg5w9tRdU3q1DG3sW4ag");
const MINT = new PublicKey("C6CSnQBoSQG8ShsHjAuVHFK7DusAfA4iJbKLJeMbpump");
const EXPECTED_ATA = "5m2VhMMi7i15ReNSVs9PfK44YbV46jLp5Gku2eEsf2bM";

test("derives the observed Token-2022 associated token account", () => {
  const derived = findAssociatedTokenAddress(WALLET, MINT, TOKEN_2022_PROGRAM);
  assert.equal(derived.address.toBase58(), EXPECTED_ATA);
  assert.equal(derived.bump, 255);
});

test("derivation is deterministic", () => {
  const first = findAssociatedTokenAddress(WALLET, MINT, TOKEN_2022_PROGRAM);
  const second = findAssociatedTokenAddress(WALLET, MINT, TOKEN_2022_PROGRAM);
  assert.equal(first.address.toBase58(), second.address.toBase58());
});

test("public keys compare by value, not identity", () => {
  assert.ok(new PublicKey(EXPECTED_ATA).equals(EXPECTED_ATA));
  assert.equal(new PublicKey(WALLET.toBytes()).equals(WALLET), true);
  assert.equal(WALLET.equals(MINT), false);
  assert.equal(WALLET.toBytes().length, 32);
});
