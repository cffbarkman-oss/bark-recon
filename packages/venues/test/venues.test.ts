import assert from "node:assert/strict";
import { test } from "node:test";
import { DexScreenerVenue } from "../src/dexscreener.js";
import { JupiterVenue } from "../src/jupiter.js";
import { VenueAuthRequiredError, VenueUnavailableError } from "../src/types.js";
import { AxiomVenue } from "../src/axiom.js";
import { FomoVenue } from "../src/fomo.js";
import { PumpFunVenue } from "../src/pumpfun.js";

const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const JUPITER_FIXTURE = [
  {
    id: BONK,
    name: "Bonk",
    symbol: "Bonk",
    decimals: 5,
    holderCount: 1_027_409,
    organicScore: 79.76,
    isVerified: true,
    usdPrice: 2.7689605277859273e-6,
    mcap: 243_652_745.93,
    liquidity: 5_896_757.83,
  },
];

const DEX_FIXTURE = {
  schemaVersion: "1.0.0",
  pairs: [
    {
      chainId: "solana",
      dexId: "orca",
      pairAddress: "pair-shallow",
      baseToken: { address: BONK, name: "Bonk", symbol: "Bonk" },
      quoteToken: { address: "So11111111111111111111111111111111111111112", name: "SOL", symbol: "SOL" },
      priceUsd: "0.000002770",
      marketCap: 243_757_412,
      fdv: 246_162_720,
      liquidity: { usd: 100 },
      volume: { h24: 71_494.16 },
      priceChange: { h24: -1.4 },
    },
    {
      chainId: "solana",
      dexId: "raydium",
      pairAddress: "pair-deep",
      baseToken: { address: BONK, name: "Bonk", symbol: "Bonk" },
      quoteToken: { address: "So11111111111111111111111111111111111111112", name: "SOL", symbol: "SOL" },
      priceUsd: "0.000002770",
      marketCap: 243_757_412,
      liquidity: { usd: 275_946.51 },
      volume: { h24: 71_494.16 },
      priceChange: { h24: -1.4 },
    },
  ],
};

test("jupiter maps its payload onto the shared identity", async () => {
  const venue = new JupiterVenue({
    fetch: async () => jsonResponse(JUPITER_FIXTURE),
  });
  const token = await venue.getToken(BONK);
  assert.equal(token?.symbol, "Bonk");
  assert.equal(token?.decimals, 5);
  assert.equal(token?.verified, true);

  const market = await venue.getMarket(BONK);
  assert.equal(market?.source, "jupiter");
  assert.equal(market?.marketCapUsd, 243_652_745.93);
});

test("jupiter returns null for unknown mints", async () => {
  const venue = new JupiterVenue({ fetch: async () => jsonResponse([]) });
  assert.equal(await venue.getToken("unknown"), null);
});

test("dexscreener picks the deepest solana pair", async () => {
  const venue = new DexScreenerVenue({ fetch: async () => jsonResponse(DEX_FIXTURE) });
  const market = await venue.getMarket(BONK);
  assert.equal(market?.liquidityUsd, 275_946.51);
  assert.equal(market?.volume24hUsd, 71_494.16);
});

test("dexscreener search de-duplicates by mint", async () => {
  const venue = new DexScreenerVenue({ fetch: async () => jsonResponse(DEX_FIXTURE) });
  const results = await venue.search("bonk");
  assert.equal(results.length, 1);
  assert.equal(results[0]?.mint, BONK);
});

test("gated venues refuse to fabricate data without credentials", async () => {
  const pump = new PumpFunVenue();
  const fomo = new FomoVenue();
  await assert.rejects(() => pump.getToken(BONK), VenueAuthRequiredError);
  await assert.rejects(() => fomo.search("bonk"), VenueAuthRequiredError);
});

test("axiom reports itself unavailable rather than empty", async () => {
  const axiom = new AxiomVenue();
  await assert.rejects(() => axiom.getToken(BONK), VenueUnavailableError);
  assert.equal(axiom.capabilities.markets, false);
});

test("every venue declares its capability surface", () => {
  const venues = [new JupiterVenue({}), new DexScreenerVenue({}), new PumpFunVenue(), new FomoVenue(), new AxiomVenue()];
  const ids = venues.map((venue) => venue.id);
  assert.equal(new Set(ids).size, venues.length);
  for (const venue of venues) {
    assert.equal(typeof venue.capabilities.markets, "boolean");
  }
});
