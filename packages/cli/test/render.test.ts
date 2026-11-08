import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatPercent,
  formatSol,
  formatTokens,
  formatUsd,
  shortKey,
} from "../src/format.js";

test("formats lamports as SOL with fixed precision", () => {
  assert.equal(formatSol(1_500_000_000n), "1.500000");
  assert.equal(formatSol(1_559_679_685n), "1.559679");
  assert.equal(formatSol(0n), "0.000000");
  assert.equal(formatSol(-1_000_000_000n), "-1.000000");
  assert.equal(formatSol(1_500_000_000n, 2), "1.50");
});

test("formats token base units with grouping", () => {
  assert.equal(formatTokens(30_428_421_475_159n), "30,428,421.4751");
  assert.equal(formatTokens(1_000_000n, 6, 0), "1");
});

test("formats percentages and null-safe usd", () => {
  assert.equal(formatPercent(0.108), "10.80%");
  assert.equal(formatPercent(Number.NaN), "n/a");
  assert.equal(formatUsd(null), "n/a");
  assert.equal(formatUsd(243_652_745.93), "$243.65M");
  assert.equal(formatUsd(1_250), "$1.25K");
});

test("shortens addresses for display", () => {
  assert.equal(shortKey("DGfgKzvaiBnU3nfPywB952u3QAeCBAsDySXtPDgMn5GB", 4), "DGfg...n5GB");
  assert.equal(shortKey("short"), "short");
});
