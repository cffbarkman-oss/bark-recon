import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareFingerprints,
  editDistance,
  findLookalikes,
  normalizeTokenText,
} from "../src/lookalike.js";

const ORIGINAL = { mint: "mint-original", symbol: "cnb", name: "coldest nigga breathing", creator: "creator-a" };

test("normalisation folds homoglyphs and decoration", () => {
  assert.equal(normalizeTokenText("B0NK"), "bonk");
  assert.equal(normalizeTokenText("$WIF"), "swif");
  assert.equal(normalizeTokenText("Coldest  Breathing"), "coldestbreathing");
  assert.equal(normalizeTokenText("моко"), "moko");
});

test("identical symbol and name is a strong match", () => {
  const clone = { mint: "mint-clone", symbol: "cnb", name: "coldest nigga breathing", creator: "creator-b" };
  const result = compareFingerprints(ORIGINAL, clone);
  assert.ok(result.score >= 0.9);
  assert.ok(result.reasons.includes("identical symbol"));
  assert.ok(result.reasons.includes("identical name"));
});

test("homoglyph substitution still matches", () => {
  const clone = { mint: "mint-clone", symbol: "cnb", name: "c0ldest nigga breathing", creator: "creator-b" };
  const result = compareFingerprints(ORIGINAL, clone);
  assert.ok(result.score >= 0.9, "score was " + result.score);
});

test("the same mint is never its own lookalike", () => {
  assert.deepEqual(compareFingerprints(ORIGINAL, ORIGINAL), { score: 0, reasons: [] });
});

test("unrelated tokens score low", () => {
  const other = { mint: "mint-other", symbol: "PLUTON", name: "Pluton", creator: "creator-c" };
  assert.equal(compareFingerprints(ORIGINAL, other).score, 0);
});

test("edit distance drives partial similarity", () => {
  assert.equal(editDistance("bonk", "bonk"), 0);
  assert.equal(editDistance("bonk", "bork"), 1);
  assert.equal(editDistance("", "abc"), 3);
  const near = { mint: "mint-x", symbol: "BONK", name: "Bonk Inu", creator: "c" };
  const target = { mint: "mint-y", symbol: "BONK", name: "Bonk", creator: "d" };
  assert.ok(compareFingerprints(target, near).score >= 0.6);
});

test("findLookalikes ranks and filters", () => {
  const candidates = [
    { mint: "mint-clone", symbol: "cnb", name: "coldest nigga breathing", creator: "creator-b" },
    { mint: "mint-near", symbol: "cnbb", name: "coldest nigga breathin", creator: "creator-b" },
    { mint: "mint-other", symbol: "DOGE", name: "Dogecoin", creator: "creator-b" },
  ];
  const matches = findLookalikes(ORIGINAL, candidates);
  assert.equal(matches.length, 2);
  assert.equal(matches[0]?.candidate.mint, "mint-clone");
  assert.ok((matches[0]?.score ?? 0) >= (matches[1]?.score ?? 0));
});

test("same creator can be filtered out", () => {
  const relaunch = { mint: "mint-relaunch", symbol: "cnb", name: "coldest nigga breathing", creator: "creator-a" };
  const matches = findLookalikes(ORIGINAL, [relaunch], { ignoreSameCreator: true });
  assert.equal(matches.length, 0);
});
