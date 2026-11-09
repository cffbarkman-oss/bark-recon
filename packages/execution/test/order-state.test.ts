import assert from "node:assert/strict";
import { test } from "node:test";
import { OrderReconciler, OrderStateError, isTerminal } from "../src/order-state.js";

const EXPIRY = 445_072_052n;

function quoted(reconciler: OrderReconciler, requestId = "req-1"): void {
  reconciler.register({ requestId, lastValidBlockHeight: EXPIRY, now: 1_000 });
}

test("an order starts quoted and reaches landed through the happy path", () => {
  const reconciler = new OrderReconciler();
  quoted(reconciler);

  assert.equal(reconciler.get("req-1")?.state, "quoted");
  reconciler.markSigned("req-1", "sig-abc", 1_100);
  assert.equal(reconciler.get("req-1")?.state, "signed");
  reconciler.markSubmitted("req-1", 1_200);
  assert.equal(reconciler.get("req-1")?.state, "submitted");

  const landed = reconciler.applyChainStatus(
    "req-1",
    { slot: 445_000_000, err: null, confirmationStatus: "confirmed" },
    EXPIRY,
    1_300,
  );
  assert.equal(landed.state, "landed");
  assert.equal(landed.slot, 445_000_000);
  assert.equal(isTerminal(landed.state), true);
});

test("a reverted transaction is failed, not landed", () => {
  const reconciler = new OrderReconciler();
  quoted(reconciler);
  reconciler.markSigned("req-1", "sig", 1_100);
  reconciler.markSubmitted("req-1", 1_200);

  const failed = reconciler.applyChainStatus(
    "req-1",
    { slot: 445_000_001, err: { InstructionError: [0, "x"] }, confirmationStatus: "confirmed" },
    EXPIRY,
    1_300,
  );
  assert.equal(failed.state, "failed");
  assert.deepEqual(failed.error, { InstructionError: [0, "x"] });
});

test("not found is pending before expiry and expired after it", () => {
  const reconciler = new OrderReconciler();
  quoted(reconciler);
  reconciler.markSigned("req-1", "sig", 1_100);
  reconciler.markSubmitted("req-1", 1_200);

  const pending = reconciler.applyChainStatus("req-1", null, EXPIRY - 1n, 1_300);
  assert.equal(pending.state, "pending");
  assert.equal(isTerminal(pending.state), false);

  const expired = reconciler.applyChainStatus("req-1", null, EXPIRY + 1n, 1_400);
  assert.equal(expired.state, "expired");
});

test("processed but unconfirmed is pending, not landed", () => {
  const reconciler = new OrderReconciler();
  quoted(reconciler);
  reconciler.markSigned("req-1", "sig", 1_100);
  reconciler.markSubmitted("req-1", 1_200);

  const result = reconciler.applyChainStatus(
    "req-1",
    { slot: 445_000_000, err: null, confirmationStatus: "processed" },
    EXPIRY,
    1_300,
  );
  assert.equal(result.state, "pending");
  assert.equal(result.slot, 445_000_000);
});

test("expireStale closes only orders past their block height", () => {
  const reconciler = new OrderReconciler();
  reconciler.register({ requestId: "old", lastValidBlockHeight: 100n, now: 1 });
  reconciler.register({ requestId: "new", lastValidBlockHeight: 200n, now: 2 });
  reconciler.markSigned("old", "sig-old", 3);

  const expired = reconciler.expireStale(150n, 4);
  assert.equal(expired.length, 1);
  assert.equal(expired[0]?.requestId, "old");
  assert.equal(expired[0]?.state, "expired");
  assert.equal(reconciler.get("new")?.state, "quoted");
});

test("a terminal order cannot be moved again", () => {
  const reconciler = new OrderReconciler();
  quoted(reconciler);
  reconciler.markSigned("req-1", "sig", 1_100);
  reconciler.markSubmitted("req-1", 1_200);
  reconciler.applyChainStatus("req-1", { slot: 1, err: "boom", confirmationStatus: "confirmed" }, EXPIRY, 1_300);

  assert.throws(() => reconciler.markRejected("req-1", "late"), OrderStateError);
  // re-reading a terminal order is idempotent, not an error
  const again = reconciler.applyChainStatus("req-1", null, EXPIRY + 5n, 1_400);
  assert.equal(again.state, "failed");
});

test("state order is enforced", () => {
  const reconciler = new OrderReconciler();
  quoted(reconciler);
  assert.throws(() => reconciler.markSubmitted("req-1"), /Can only submit a signed order/);
  reconciler.markSigned("req-1", "sig", 1_100);
  assert.throws(() => reconciler.markSigned("req-1", "sig2", 1_200), /Can only sign a quoted order/);
  assert.throws(() => reconciler.register({ requestId: "req-1", lastValidBlockHeight: 1n }), /already registered/);
  assert.throws(() => reconciler.markSigned("nope", "sig"), OrderStateError);
});

test("history records every transition with a timestamp", () => {
  const reconciler = new OrderReconciler();
  quoted(reconciler);
  reconciler.markSigned("req-1", "sig", 1_100);
  reconciler.markSubmitted("req-1", 1_200);
  const record = reconciler.applyChainStatus(
    "req-1",
    { slot: 9, err: null, confirmationStatus: "finalized" },
    EXPIRY,
    1_300,
  );
  assert.deepEqual(
    record.history.map((entry) => entry.state),
    ["quoted", "signed", "submitted", "landed"],
  );
  assert.equal(record.history[3]?.at, 1_300);
});

test("inFlight lists only orders still awaiting chain", () => {
  const reconciler = new OrderReconciler();
  reconciler.register({ requestId: "a", lastValidBlockHeight: 10n, now: 1 });
  reconciler.register({ requestId: "b", lastValidBlockHeight: 10n, now: 2 });
  reconciler.markSigned("b", "sig-b", 3);
  reconciler.markSubmitted("b", 4);
  assert.deepEqual(reconciler.inFlight().map((order) => order.requestId), ["b"]);
});
