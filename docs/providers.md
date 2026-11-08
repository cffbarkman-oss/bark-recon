# Providers: what the managed slice actually costs to adopt

Response to research **BR-2026-11-08-002**, which recommends evaluating Birdeye + Helius + Jupiter
Swap V2 behind adapters before building anything self-hosted.

This document is the engineering counterpart: what was reachable from an unauthenticated network
on 2026-11-08, what is now implemented, and where the provider boundary sits.

---

## Verification status

| Provider | Probe | Result | Adapter |
| --- | --- | --- | --- |
| Jupiter Swap V2 | GET /swap/v2/order | **200, no key** | `jupiter-swap-v2.ts` |
| GoPlus | GET /api/v1/solana/token_security | **200, no key** | `goplus.ts` |
| Pyth Hermes | GET /v2/price_feeds | **200, no key** | `pyth.ts` |
| Birdeye | GET /defi/price | **401 Unauthorized** | `birdeye.ts` (key-gated) |
| Helius | POST /?api-key= | **401 Unauthorized** | `helius.ts` (key-gated) |

Two of the three providers in the recommended slice are key-gated. That does not block the slice -
it blocks *execution of the slice*; the adapters, types and failure behaviour are written and
tested, so supplying a key is a configuration change rather than an integration project.

No credentials were used, requested, or fabricated. The key-gated adapters throw
`VenueAuthRequiredError` and never return placeholder data.

---

## Jupiter Swap V2: the execution boundary

Verified shape of a live order (1,000,000 lamports SOL to BONK):

| Field | Value | Why it matters |
| --- | --- | --- |
| outAmount | 3,219,646,412 | the quote |
| otherAmountThreshold | 3,203,548,179 | worst acceptable fill after slippage |
| priceImpact | -0.00076 | as a fraction, not a percentage string |
| routePlan | 3 steps (Whirlpool first) | shows *who* is filling the order |
| feeBps / feeMint | 10 / SOL | platform fee, visible before signing |
| signatureFeeLamports | 5,000 | network fee |
| prioritizationFeeLamports | 185 | priority fee |
| rentFeeLamports | 2,976,880 | ATA rent the taker must cover |
| totalLamportCost | 2,982,065 | **the number a balance check must use** |
| transaction | base64, unsigned | ready to sign; this library never holds a key |
| lastValidBlockHeight | 445,065,477 | **the expiry** |

Three things the adapter deliberately exposes because trading UIs usually hide them:

1. **Total cost, not just the swap amount.** `totalLamportCost` is signature + priority + rent.
   A wallet check against `inAmount` alone fails on exactly the accounts that need funding.
2. **Expiry is a block height.** `isExpired(order, currentHeight)` is the correct test; a wall
   clock cannot know when the quote dies. "Failed" trades are usually expired orders.
3. **Execute is not settlement.** `execute()` returns a status and a signature. The report says
   reconcile signing and settlement before chasing speed, and this API reflects that: nothing in
   this repository treats an execute response as proof of landing.

The report's note that older Ultra tutorials are out of date holds: the order payload here returns
`mode: "ultra"` and `router: "metis"` together, which the older flow did not expose.

---

## GoPlus: explainable risk, not a score

GoPlus returns each Solana authority separately. The adapter keeps that shape and
`securityFactors()` emits one factor per authority:

- mint authority (severity 1 when live)
- freeze authority (0.9)
- account close authority (0.8)
- balance mutation authority (0.95)
- transfer fee present (0.5) - surfaced as raw structure, **no unit is asserted**, because the
  report notes GoPlus documentation disagrees on units and a wrong unit becomes a wrong number
- transfer hook present (0.7)
- provider trust flag absent (0.3)

This matches the report's "flag each token-authority risk separately" better than a single score
would, and it plugs into the same factor shape `@bark/market-intel` already uses.

---

## Pyth: a second opinion, never a quote

Hermes serves feed metadata and parsed prices without a key. The adapter returns the price, the
confidence interval and the publish time, plus `isStale()`.

The distinction the report makes is the one enforced here: a Pyth aggregate is a reference price
across venues, not an executable DEX quote. Using it to size a trade produces slippage the user
cannot explain.

---

## What this slice means for the roadmap

The recommendation to start with a managed slice is right for a reason the probe makes concrete:
the three pieces that do not need procurement (Jupiter routing, GoPlus risk, Pyth reference) are
already enough to build discover to quote to risk to sign, with the signer as the only missing
piece - and that belongs to the user's wallet, not to Bark.

Self-run Yellowstone streaming, a ClickHouse cluster, and a chart-library replacement all remain
deferrable until load numbers exist. Nothing in this repository depends on any of them.

---

## Still unverified, matching the report

- Birdeye and Helius quotas, cost, data freshness and real latency (no key was used).
- Wallet compatibility for the V2 order flow across Wallet Standard wallets.
- PnL accounting across providers where timestamps and rounding differ.
- Retry policy under real 429 pressure; the clients back off but have not been load-tested.
- Nansen, Bubblemaps, TradingView, AG Grid, Playwright, Sentry, OpenTelemetry, Blockaid, Privy,
  ClickHouse, Jito and Solana Kit: reviewed in the report, not implemented here.
