# Venue capture: what is integrable today

Captured **2026-11-08**. This is the record of what each venue actually returned, including the
ones that refused. Refusals are findings too: they tell Bark where a partnership is required
instead of an afternoon of reverse engineering.

---

## Summary

| Venue | Endpoint | Result | Auth | Integrable now |
| --- | --- | --- | --- | --- |
| Jupiter | lite-api.jup.ag | 200, full token payload | none | yes |
| DexScreener | api.dexscreener.com | 200, per-pair rows | none | yes |
| pump.fun | frontend-api.pump.fun | 403 managed challenge | required | no |
| fomo.family | evm-data.prod-edge.fomo.family | 401 no_auth_header | required | no |
| Axiom | axiom.trade | 403 managed challenge | required | no |

---

## Jupiter (open)

~~~text
GET https://lite-api.jup.ag/tokens/v2/search?query=<mint or text>
~~~

Returns an array of token records. Fields Bark can use immediately:

| Field | Example | Why it matters |
| --- | --- | --- |
| holderCount | 1,027,409 | holder-base factor for risk |
| organicScore | 79.76 | provider's own bot-vs-human signal |
| isVerified | true | trust badge |
| audit.mintAuthorityDisabled | bool | rug surface |
| audit.freezeAuthorityDisabled | bool | rug surface |
| audit.topHoldersPercentage | number | independent concentration check |
| usdPrice, mcap, fdv, liquidity | numbers | market snapshot |

That is a rare combination: identity, distribution and safety flags in one unauthenticated call.
It should back the first version of the terminal rather than waiting for a bespoke indexer.

---

## Jupiter routing (open)

~~~text
GET https://lite-api.jup.ag/swap/v1/quote?inputMint=..&outputMint=..&amount=..&slippageBps=..
~~~

Verified working, no key. A 1 SOL -> BONK quote returned three hops: Kipseli (SOL -> USDC),
JupLend AMM (USDC -> USDT), Scorch (USDT -> BONK), with priceImpactPct, otherAmountThreshold and
swapUsdValue.

This is the cheapest credible route display a terminal can ship: the user sees SOL -> USDC ->
BONK and which venues carried it, rather than one opaque price. Execution needs a signer and is
out of scope for this repository.

---

## DexScreener (open)

~~~text
GET https://api.dexscreener.com/latest/dex/tokens/<mint>
GET https://api.dexscreener.com/latest/dex/search?q=<text>
~~~

Returns every pair for a token, one row each. Useful fields: liquidity.usd, volume.h24,
priceChange.h24, fdv, marketCap, pairCreatedAt.

The adapter picks the **deepest Solana pair** rather than summing or averaging. Averaging
liquidity across venues produces a number that no trader can act on.

---

## pump.fun hosted API (gated)

Observed:

~~~text
GET https://pump.fun/                          -> connection closed (000)
GET https://frontend-api.pump.fun/coins/for-you -> 403, "Just a moment..."
GET https://frontend-api-v3.pump.fun/...       -> 403, same challenge
~~~

The host answers with a Cloudflare managed challenge before any JSON. This is anti-bot
protection on a public-facing API, not a bug to route around.

What Bark needs instead: the on-chain program (which is fully public and fully documented in
[pumpfun.md](pumpfun.md)) plus a licensed indexer. Everything the UI needs about a pump token -
price, reserves, graduation progress, trade history - is derivable from the chain without this
API.

---

## fomo.family (gated, multi-chain)

The marketing frontend is public and was read in full: a Remix app, 56 KB of HTML and 66 JS
assets (1.6 MB).

Routes observed in the bundle:

~~~text
/coin  /token  /prices  /new  /top-movers  /top-losers
/user  /login  /answers  /blog  /crypto  /affiliates  /release-notes
~~~

Hosts observed:

| Host | Role |
| --- | --- |
| evm-data.prod-edge.fomo.family | all data requests |
| rpc.monad.xyz, rpc1.monad.xyz | Monad RPC |
| mainnet.base.org | Base RPC |
| rpc.mainnet.chain.robinhood.com | Robinhood Chain RPC |
| robinhoodchain.blockscout.com | Robinhood Chain explorer |
| explorer.arc.io | Arc explorer |
| statsigapi.net, app.posthog.com, sentry.io | feature flags, analytics, errors |

So fomo is an **EVM-first, multi-chain consumer app** (Base, Monad, Robinhood Chain, Arc), not a
Solana terminal. Any assumption that fomo is a pump.fun competitor on Solana is wrong.

Data access:

~~~text
GET https://evm-data.prod-edge.fomo.family/         -> 401 {"error":"unauthorized","message":"no_auth_header"}
GET https://evm-data.prod-edge.fomo.family/health   -> 401, same body
~~~

Every route, including health, requires an authorization header minted by an app session. There
is no unauthenticated surface to map, and no bypass is shipped here by design.

Observed constants (identity not confirmed, kept for later comparison):

~~~text
0xca11bde05977b3631167028862be2a173976ca11   multicall3
0x833589fcd6edb6e08f4c7c32d4f71b54bda02913   USDC on Base
0x3600000000000000000000000000000000000000   native-asset sentinel
0xeeeeeeee14d718c2b47d9923deab1335e144eeee   native-asset sentinel
~~~

---

## Axiom (gated)

~~~text
GET https://axiom.trade/        -> 403
GET https://api.axiom.trade/    -> no response
~~~

No API surface was observed, so none is documented. The adapter exists only to declare the
capability honestly: markets false, holders false, trading false.

If Bark wants Axiom-grade data, the realistic paths are (a) a commercial agreement, (b) building
the equivalent from chain data, or (c) licensing an aggregator that already has it.

---

## Rules this repository follows

1. **No credential theft, no session hijacking, no challenge solving.** If a service says no,
   the answer is no.
2. **No invented endpoints.** If it was not observed, it is not in the code.
3. **Typed refusals.** A gated venue throws VenueAuthRequiredError or VenueUnavailableError so
   the product can render "not connected" instead of an empty list that looks like "no data".
4. **Provenance on every number.** MarketSnapshot carries a source field.

---

## What to review before integrating any third party

- Terms of service: rate limits, redistribution, caching, attribution.
- Data licensing: can the numbers be shown to end users? Can they be stored?
- Uptime and rate limits: public endpoints are best-effort and will throttle under load.
- Failure semantics: what does the product show when a venue is down?
