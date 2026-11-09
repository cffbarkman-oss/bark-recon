# bark-recon

Reverse-engineered building blocks for **Bark**.

This repository is a working lab, not a product. Every package here is written to be lifted
into Bark's real codebase with minimal change: zero runtime dependencies, strict TypeScript,
exact integer money math, and tests pinned to **real mainnet data**.

The work was done with the [REA](https://github.com/morluto/rea) reverse-engineering workflow,
which asks for shipped artifacts or runtime evidence before a claim is made. That discipline is
the main thing this repo tries to preserve: every constant says how confident we are in it.

---

## Why this exists

Bark's first two products need two very different kinds of knowledge:

1. **The launchpad** needs to understand a bonding curve to the lamport - pricing, fees,
   graduation, and what a user will actually receive.
2. **The terminal** needs to turn raw chain activity into judgment - concentration, bundles,
   creator history, risk - without handing that judgment to a vendor.

Both are things you can only get right by reading the protocol and the network directly.
So that is what this repo does, and then packages the result as reusable code.

---

## Packages

| Package | What it gives Bark | Runtime deps |
| --- | --- | --- |
| [@bark/solana](packages/solana) | base58, addresses, PDAs, exact amount math, resilient JSON-RPC | none |
| [@bark/pumpfun](packages/pumpfun) | curve math, account + event decoders, transaction parser | @bark/solana |
| [@bark/market-intel](packages/market-intel) | concentration, wallet clustering, bundle detection, dev history, explainable risk | @bark/solana |
| [@bark/venues](packages/venues) | one adapter interface over Jupiter, DexScreener, pump.fun, fomo, Axiom | @bark/solana |
| [@bark/pumpswap](packages/pumpswap) | the AMM graduated tokens trade on: pool + swap + graduation decoding, exact pricing | @bark/solana |
| [@bark/bags](packages/bags) | bags.fm swap instruction shapes, the part they make decodable | @bark/solana |
| [@bark/execution](packages/execution) | order lifecycle (quoted to landed) and settlement reconciliation | @bark/solana |
| [@bark/cli](packages/cli) | `bark-recon capture` / `curve` / `holders` for live debugging | all of the above |

Also in the repo: a [competitive landscape](docs/competitors.md) built from the same observation
rules - what bags.fm, Moonshot, Axiom and fomo actually run on, and what that implies for Bark -
and a [launchpad landscape](docs/launchpad-landscape.md) covering 28 launchpad projects, of which
four have a reachable product and the rest leave no trace.

Provider adoption is tracked in [docs/providers.md](docs/providers.md): which of the recommended
managed providers answer without a key, which need one, and where the execution boundary sits.

---

## Evidence over assertion

Every fact in this repository carries one of three labels:

- **observed** - read from mainnet in this workspace, with the raw bytes committed under
  [docs/evidence](docs/evidence).
- **documented** - taken from a public spec or docs, not reproduced here.
- **unknown** - explicitly not claimed, and usually surfaced as raw bytes for a later pass.

The pump.fun decoders are wired to two captured transactions
([evidence](docs/evidence/mainnet-2026-11-08.json)) - a sell on an established curve and a
complete launch - so that a wrong offset breaks a test rather than a launch.

Field names are cross-checked against the Anchor IDL published in `@pump-fun/pump-sdk` 4.3.1
(MIT), then re-derived from the bytes: every account and event decode consumes its input
exactly, and every fee field equals ceil(amount x bps) to the lamport.

---

## Quick start

~~~bash
npm install
npm run build
npm test
~~~

All 183 tests run offline. No API keys, no RPC endpoint, no network.

Then, against a live endpoint:

~~~bash
export SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
npm run recon -- curve DGfgKzvaiBnU3nfPywB952u3QAeCBAsDySXtPDgMn5GB
npm run recon -- capture <signature> --json
npm run recon -- holders <mint>
npm run recon -- pool DKgffUE4JVaGnqxaA44Y6ZHyqaujL7yBUJNV8w84tAqY
npm run recon -- watch --seconds 45
~~~

The capture command prints decoded trades, fees, launches and the balance-delta settlement that
shows where the money actually went. The watch command is a live discovery feed: it subscribes to
the pump program over websocket and prints each launch as it lands (eight in a 50-second run).
The pool command reads a PumpSwap pool plus its token accounts and quotes a buy and a sell
against live reserves — including the virtual offset that makes the pricing correct. The holders command measures top-N concentration from
getTokenLargestAccounts - capped at 20 accounts by the RPC, and labelled as such in the output.

Public endpoints throttle these calls; point SOLANA_RPC_URL at your own node for real use.

---

## What the code looks like

Reading a curve and quoting a buy:

~~~ts
import { SolanaRpc, fromHex } from "@bark/solana";
import { decodeBondingCurve, quoteBuy, formatAmount } from "@bark/pumpfun";

const rpc = new SolanaRpc({ endpoint: process.env.SOLANA_RPC_URL! });
const account = await rpc.getAccountInfo("DGfgKzvaiBnU3nfPywB952u3QAeCBAsDySXtPDgMn5GB");

const curve = decodeBondingCurve("DGfgKzvaiBnU3nfPywB952u3QAeCBAsDySXtPDgMn5GB", fromHex(account!.data[0]));
// 1 SOL of budget, fees included; the curve itself receives quoteIntoCurve
const quote = quoteBuyWithBudget(curve, 1_000_000_000n);

console.log(formatAmount(quote.tokensOut, 6), "tokens for 1 SOL");
console.log("fee", formatAmount(quote.fees.total, 9), "SOL");
console.log("price impact", (quote.priceImpact * 100).toFixed(2) + "%");
~~~

Turning a transaction into trades:

~~~ts
import { parsePumpTransaction } from "@bark/pumpfun";

const parsed = parsePumpTransaction(await rpc.getTransaction(signature));
for (const trade of parsed.trades) {
  console.log(trade.kind, trade.mint.toBase58(), trade.solAmount);
}
~~~

Scoring a token with reasons attached:

~~~ts
import { analyseConcentration, detectBundles, assessRisk } from "@bark/market-intel";

const concentration = analyseConcentration(holders, supply, { exclude: [poolAddress] });
const bundles = detectBundles(firstBuys);
const risk = assessRisk({ concentration, bundles, liquidityUsd, holderCount });

// risk.level: "low" | "medium" | "high" | "critical"
// risk.factors: every reason, with a weight and a sentence
~~~

---

## What Bark should take from this

**Launchpad**

- The curve is constant-product over **virtual** reserves; virtual SOL = real SOL + 30 SOL.
- Quote in integers and floor the output. Never quote one unit optimistically.
- Reserves move by the **gross** quote amount - fees are charged alongside the curve, never
  netted out of it - and they round **up**: protocol ceil(amount x 95 bps), creator
  ceil(amount x 30 bps).
- Graduation is a real-quote threshold, not a market-cap threshold - and it is derived from the
  reserve constants (85,005,359,056 lamports for the observed parameters), not hardcoded to 85.

**Terminal**

- A token stops being a curve when it graduates. PumpSwap is where the volume goes, and its
  discriminators collide with the curve program's - the owning program is the only disambiguator.
- Concentration must be computed from balances with infrastructure accounts excluded by the
  caller - the provider cannot know which account is the pool.
- Bundle detection needs a *reason* string, not just a boolean. Users do not trust unexplained flags.
- Impersonation is a daily event, not an edge case: during one 50-second monitoring session two
  different tokens launched with the same symbol and name. Lookalike detection belongs in the
  discovery feed, with the matching rule shown.
- Risk should be a transparent weighted sum of named factors. If the number cannot be explained,
  it does not belong in the product.

**Infrastructure**

- Public RPC endpoints fail by rate-limiting, not by lying. Retry with jitter and honour
  Retry-After; never retry a write.
- Decode by length and discriminator, and keep unknown bytes. Protocol upgrades are normal:
  `TradeEvent` kept its discriminator while offset 153 changed from a fee amount to fee bps.
- Request `maxSupportedTransactionVersion: 1`. Launches are now v1 transactions and a v0 client
  gets an error, not a null.

---

## Venue integration status

See [docs/venues.md](docs/venues.md) for the full capture.

| Venue | Reachable today | Auth | Notes |
| --- | --- | --- | --- |
| Jupiter | yes | no key | token identity, holder count, organic score, audit flags |
| DexScreener | yes | no key | per-pair liquidity, volume, price change |
| pump.fun hosted API | no | yes | HTTP 403, managed Cloudflare challenge |
| fomo.family | no | yes | HTTP 401, no_auth_header on every route |
| Axiom | no | yes | HTTP 403, no observed API surface |

The adapters for the three closed venues are deliberately thin: they implement the shared
interface, declare accurate capabilities, and throw a typed error instead of inventing data.

---

## Scope and conduct

This repository contains **protocol knowledge and interoperability code**, not credentials,
not session tokens, and not authentication bypasses. Where a service requires authorization,
the adapter refuses to work without it.

If you deploy any of this:

- Respect each venue's terms of service; a partnership is cheaper than a ban.
- Public RPC endpoints are not infrastructure. Run your own or pay for one.
- Nothing here is financial advice, and no output is a recommendation.

MIT licensed. Built to be absorbed into Bark and then abandoned.

---

## Layout

~~~
packages/
  solana/        zero-dependency primitives + RPC
  pumpfun/       bonding curve, accounts, events, parser
  market-intel/  holders, clusters, bundles, dev history, risk
  venues/        adapters and integration status
docs/
  pumpfun.md           protocol findings, field by field
  venues.md            endpoint capture and what each venue allows
  architecture.md      how to ship this into Bark
  evidence/            raw captured bytes
~~~
