import assert from "node:assert/strict";
import { test } from "node:test";
import { JupiterSwapV2Venue, isExpired, parseOrder } from "../src/jupiter-swap-v2.js";
import { GoPlusVenue, securityFactors } from "../src/goplus.js";
import { PythVenue, isStale } from "../src/pyth.js";
import { BirdeyeVenue } from "../src/birdeye.js";
import { HeliusVenue } from "../src/helius.js";
import { VenueAuthRequiredError } from "../src/types.js";
import { GOPLUS_TOKEN_SECURITY, JUPITER_V2_ORDER, PYTH_FEEDS } from "./fixtures-providers.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

// ---------------------------------------------------------------- Jupiter V2

test("parses a live V2 order with fees and expiry", () => {
  const order = parseOrder(JUPITER_V2_ORDER);
  assert.equal(order.inAmount, 1_000_000n);
  assert.ok(order.outAmount > 0n);
  assert.ok(order.otherAmountThreshold < order.outAmount, "slippage bound must be below quote");
  assert.equal(order.router, "metis");
  assert.equal(order.mode, "ultra");
  assert.equal(order.feeBps, 10);
  assert.equal(order.routePlan.length, 3);
  assert.ok(order.lastValidBlockHeight > 0n);
  assert.equal(order.totalLamportCost, order.signatureFeeLamports + order.prioritizationFeeLamports + order.rentFeeLamports);
});

test("expiry is decided by block height, not wall clock", () => {
  const order = parseOrder(JUPITER_V2_ORDER);
  assert.equal(isExpired(order, order.lastValidBlockHeight - 1n), false);
  assert.equal(isExpired(order, order.lastValidBlockHeight + 1n), true);
});

test("orders are requested with the taker and slippage the caller asked for", async () => {
  let url = "";
  const venue = new JupiterSwapV2Venue({
    fetch: async (input) => {
      url = input;
      return jsonResponse(JUPITER_V2_ORDER);
    },
  });
  await venue.order({
    inputMint: "So11111111111111111111111111111111111111112",
    outputMint: BONK,
    amount: 1_000_000n,
    taker: "HMjMJZsQp6ykQyNSk8ZdmcJnNg5w9tRdU3q1DG3sW4ag",
    slippageBps: 120,
  });
  assert.match(url, /swap\/v2\/order/);
  assert.match(url, /slippageBps=120/);
  assert.match(url, /taker=HMjMJZsQp6ykQyNSk8ZdmcJnNg5w9tRdU3q1DG3sW4ag/);
});

test("execute reports status without claiming settlement", async () => {
  const venue = new JupiterSwapV2Venue({
    fetch: async () => jsonResponse({ status: "Success", signature: "sig-1", code: 0 }),
  });
  const result = await venue.execute("signed-base64", "req-1");
  assert.equal(result.status, "Success");
  assert.equal(result.signature, "sig-1");
  assert.equal(result.error, null);
});

// ------------------------------------------------------------------- GoPlus

test("normalises GoPlus token security", async () => {
  const venue = new GoPlusVenue({
    fetch: async () => jsonResponse(GOPLUS_TOKEN_SECURITY),
  });
  const security = await venue.tokenSecurity(BONK);
  assert.ok(security !== null);
  assert.equal(security.mint, BONK);
  assert.equal(security.symbol, "Bonk");
  assert.equal(security.holderCount, 1_020_153);
  assert.equal(security.mintable.status, "0");
  assert.equal(security.freezable.status, "0");
  assert.equal(security.trusted, false);
});

test("returns null for an unknown mint instead of throwing", async () => {
  const venue = new GoPlusVenue({ fetch: async () => jsonResponse({ code: 1, result: {} }) });
  assert.equal(await venue.tokenSecurity("unknown"), null);
});

test("security factors name each authority separately", async () => {
  const venue = new GoPlusVenue({ fetch: async () => jsonResponse(GOPLUS_TOKEN_SECURITY) });
  const security = await venue.tokenSecurity(BONK);
  const factors = securityFactors(security!);
  const mint = factors.find((factor) => factor.id === "mint-authority");
  assert.ok(mint !== undefined);
  assert.equal(mint.severity, 0);
  assert.match(mint.detail, /revoked/);
  assert.ok(factors.some((factor) => factor.id === "provider-trust"));
});

test("a live mint authority is a maximal-severity factor with its address", () => {
  const factors = securityFactors({
    mint: "m",
    name: null,
    symbol: null,
    totalSupply: null,
    holderCount: null,
    mintable: { status: "1", authority: ["AuthorityAddr111"] },
    freezable: { status: "0", authority: [] },
    closable: { status: "0", authority: [] },
    balanceMutable: { status: "0", authority: [] },
    metadataMutable: { status: "0", authority: [] },
    transferFee: {},
    transferHook: [],
    trusted: true,
    raw: {},
  });
  const mint = factors.find((factor) => factor.id === "mint-authority");
  assert.equal(mint?.severity, 1);
  assert.match(mint?.detail ?? "", /AuthorityAddr111/);
});

// --------------------------------------------------------------------- Pyth

test("parses feed metadata", async () => {
  const venue = new PythVenue({ fetch: async () => jsonResponse(PYTH_FEEDS) });
  const feeds = await venue.feeds("SOL");
  assert.ok(feeds.length > 0);
  assert.equal(feeds[0]?.assetType, "Crypto");
  assert.ok((feeds[0]?.id ?? "").length > 0);
});

test("scales parsed prices by the exponent and flags staleness", async () => {
  const venue = new PythVenue({
    fetch: async () =>
      jsonResponse({
        parsed: [
          { id: "abc", price: { price: "12345", conf: "10", expo: -2, publish_time: 1_000 } },
        ],
      }),
  });
  const prices = await venue.latestPrices(["abc"]);
  assert.equal(prices.length, 1);
  assert.equal(prices[0]?.price, 123.45);
  assert.equal(prices[0]?.confidence, 0.1);
  assert.equal(isStale(prices[0]!, 60, 1_030), false);
  assert.equal(isStale(prices[0]!, 60, 1_120), true);
});

// -------------------------------------------------- key-gated providers

test("Birdeye refuses to fabricate data without a key", async () => {
  const venue = new BirdeyeVenue();
  await assert.rejects(() => venue.price(BONK), VenueAuthRequiredError);
  await assert.rejects(() => venue.getToken(BONK), VenueAuthRequiredError);
});

test("Birdeye sends its key and chain headers", async () => {
  let headers: Headers | null = null;
  const venue = new BirdeyeVenue({
    apiKey: "test-key",
    fetch: async (_input, init) => {
      headers = new Headers(init?.headers);
      return jsonResponse({ data: { value: 0.0000027 } });
    },
  });
  assert.equal(await venue.price(BONK), 0.0000027);
  assert.equal(headers!.get("x-api-key"), "test-key");
  assert.equal(headers!.get("x-chain"), "solana");
});

test("Helius requires a key and exposes an RPC client when given one", () => {
  assert.throws(() => new HeliusVenue(), VenueAuthRequiredError);
  const venue = new HeliusVenue({ apiKey: "test-key", fetch: async () => jsonResponse({ result: [] }) });
  assert.equal(venue.id, "helius");
  assert.equal(venue.rpc.endpoint.includes("api-key=test-key"), true);
});
