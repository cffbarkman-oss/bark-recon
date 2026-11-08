import assert from "node:assert/strict";
import { test } from "node:test";
import { WalletClusterer } from "../src/clusters.js";

test("merges wallets transitively through funding", () => {
  const clusterer = new WalletClusterer();
  clusterer.addFunding({ wallet: "a", funder: "f", lamports: 1_000n });
  clusterer.addFunding({ wallet: "b", funder: "f", lamports: 2_000n });
  clusterer.addFunding({ wallet: "c", funder: "a", lamports: 3_000n });

  const clusters = clusterer.clusters();
  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0]?.wallets, ["a", "b", "c", "f"]);
  assert.equal(clusters[0]?.totalLamports, 6_000n);
});

test("keeps unrelated wallets apart", () => {
  const clusterer = new WalletClusterer();
  clusterer.addFunding({ wallet: "a", funder: "f1" });
  clusterer.addFunding({ wallet: "b", funder: "f2" });
  assert.equal(clusterer.clusters().length, 2);
});

test("co-signers join the same cluster", () => {
  const clusterer = new WalletClusterer();
  clusterer.addCoSigners(["x", "y", "z"]);
  assert.equal(clusterer.clusterOf("x")?.wallets.length, 3);
});

test("cluster ids are stable and resolvable", () => {
  const clusterer = new WalletClusterer();
  clusterer.addFunding({ wallet: "a", funder: "f" });
  const root = clusterer.find("a");
  assert.equal(clusterer.find("f"), root);
  assert.equal(clusterer.clusterOf("a")?.id, root);
  assert.equal(clusterer.size, 2);
});
