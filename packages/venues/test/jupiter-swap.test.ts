import assert from "node:assert/strict";
import { test } from "node:test";
import { JupiterSwapVenue, describeRoute, parseQuote } from "../src/jupiter-swap.js";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

// Trimmed from a live lite-api.jup.ag response on 2026-11-08.
const LIVE_QUOTE = {
  inputMint: SOL,
  inAmount: "1000000000",
  outputMint: BONK,
  outAmount: "3211380000000",
  otherAmountThreshold: "3195323100000",
  swapMode: "ExactIn",
  slippageBps: 50,
  priceImpactPct: "0",
  swapUsdValue: "152.31",
  routePlan: [
    {
      swapInfo: {
        ammKey: "7yD7gfXv49SFxhx9uTc11dEd7Nj98rGWeYMdZJgheZbG",
        label: "Kipseli",
        inputMint: SOL,
        outputMint: USDC,
        inAmount: "1000000000",
        outAmount: "89605265",
        updateContextSlot: "466974104",
      },
      percent: 100,
    },
    {
      swapInfo: {
        ammKey: "FfEJYz4hLLFe4KyNyKYCjvfhMfbtpLH3CXpcPe8nhmfy",
        label: "JupLend AMM",
        inputMint: USDC,
        outputMint: USDT,
        inAmount: "89605265",
        outAmount: "89708538",
        updateContextSlot: "466974090",
      },
      percent: 100,
    },
    {
      swapInfo: {
        ammKey: "FcG27LiEyrtnUDg4FyXytcyFy2GwpDzN6AGcn16x9L84",
        label: "Scorch",
        inputMint: USDT,
        outputMint: BONK,
        inAmount: "89708538",
        outAmount: "3211380000000",
        updateContextSlot: "466974104",
      },
      percent: 100,
    },
  ],
  contextSlot: 466974104,
  timeTaken: 0.006,
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

test("parses a multi-hop quote into typed steps", () => {
  const quote = parseQuote(LIVE_QUOTE);
  assert.equal(quote.outAmount, 3_211_380_000_000n);
  assert.equal(quote.routePlan.length, 3);
  assert.equal(quote.routePlan[1]?.label, "JupLend AMM");
  assert.equal(quote.routePlan[2]?.outputMint, BONK);
  assert.equal(quote.priceImpactPct, 0);
  assert.equal(quote.slippageBps, 50);
});

test("describes the route for display", () => {
  const text = describeRoute(parseQuote(LIVE_QUOTE));
  assert.match(text, /So1111111.* -> EPjFWdd5.* -> Es9vMFrz.* -> DezXAZ8z/);
  assert.match(text, /Kipseli, JupLend AMM, Scorch/);
});

test("sends the expected request parameters", async () => {
  let url = "";
  const venue = new JupiterSwapVenue({
    fetch: async (input) => {
      url = input;
      return jsonResponse(LIVE_QUOTE);
    },
  });
  await venue.quoteSolFor(BONK, 1_000_000_000n, 100);
  assert.match(url, /inputMint=So11111111111111111111111111111111111111112/);
  assert.match(url, /outputMint=DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/);
  assert.match(url, /amount=1000000000/);
  assert.match(url, /slippageBps=100/);
});

test("handles an empty route without throwing", () => {
  const quote = parseQuote({ inputMint: SOL, outputMint: BONK, inAmount: "1", outAmount: "0" });
  assert.equal(quote.routePlan.length, 0);
  assert.equal(describeRoute(quote), "no route");
});
