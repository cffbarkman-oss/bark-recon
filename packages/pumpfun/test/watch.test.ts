import assert from "node:assert/strict";
import { test } from "node:test";
import { PumpLaunchWatcher } from "../src/watch.js";
import { LAUNCH_CAPTURE } from "./fixtures.js";

const LOGS = [
  "Program log: Instruction: CreateV2",
  "Program data: " + Buffer.from(LAUNCH_CAPTURE.createEventHex, "hex").toString("base64"),
];

test("decodes a live launch from a log batch", () => {
  const launches: string[] = [];
  const watcher = new PumpLaunchWatcher({
    onLaunch: (launch) => launches.push(launch.symbol + ":" + launch.mint.toBase58()),
  });

  const launch = watcher.handle(LAUNCH_CAPTURE.signature, LOGS, null, LAUNCH_CAPTURE.slot);

  assert.ok(launch !== null);
  assert.equal(launch.symbol, "79");
  assert.equal(launch.slot, LAUNCH_CAPTURE.slot);
  assert.equal(launches.length, 1);
});

test("never reports the same signature twice", () => {
  let count = 0;
  const watcher = new PumpLaunchWatcher({
    onLaunch: () => {
      count += 1;
    },
  });

  assert.ok(watcher.handle("sig", LOGS) !== null);
  assert.equal(watcher.handle("sig", LOGS), null);
  assert.equal(count, 1);
});

test("ignores failed transactions and unrelated logs", () => {
  let count = 0;
  const watcher = new PumpLaunchWatcher({
    onLaunch: () => {
      count += 1;
    },
  });

  assert.equal(watcher.handle("sig-1", LOGS, { InstructionError: [0, "x"] }), null);
  assert.equal(watcher.handle("sig-2", ["Program log: Instruction: Sell"]), null);
  assert.equal(count, 0);
});
