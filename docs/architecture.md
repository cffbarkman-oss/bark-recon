# Shipping this into Bark

## The short version

Vendor the four packages into Bark's monorepo, keep the package boundaries, and keep the rule
that only one layer talks to the network.

~~~text
            Bark UI / API
                 |
        @bark/market-intel      judgment, pure functions
                 |
           @bark/pumpfun        protocol truth, pure functions
                 |
           @bark/solana         bytes, addresses, money, RPC
                 |
        @bark/venues  ->  external HTTP
                 |
         @bark/cli           operator tooling over all of it
~~~

Two rules make the layering worth having:

1. **Pure layers stay pure.** @bark/pumpfun and @bark/market-intel never open a socket. That is
   what makes them testable against committed fixtures and safe to call from a request handler.
2. **Networks are injected.** Every client accepts a fetch implementation. Bark can route through
   its own proxy, add tracing, or replay captured traffic in tests without touching domain code.

---

## Why zero dependencies

The solana package has no runtime dependencies at all; the rest depend only on each other.

- No supply-chain surface in the hottest path of the product.
- No version skew with whatever web3.js Bark ends up on.
- Byte-level control: this code decodes accounts that a generic SDK does not model.

The cost is that Bark still needs a signer and transaction builder elsewhere. That is fine -
those belong to the execution layer, not to the decoding layer.

---

## The explainability contract

This is a product requirement expressed as an API shape.

~~~ts
const risk = assessRisk({ concentration, bundles, dev, liquidityUsd, holderCount });
~~~

Every assessment returns:

~~~ts
{
  score: 78,
  level: "critical",
  factors: [
    { id: "holder-concentration", weight: 0.25, severity: 0.93, detail: "Top 10 wallets hold 76.2% of supply" },
    { id: "bundled-entry", weight: 0.25, severity: 0.88, detail: "6 wallets bundled for 44.1% of observed tokens" }
  ]
}
~~~

Bark's stated standard is that AI-generated explanation must distinguish verified information
from estimates and speculation. The same standard should apply to numbers the product itself
computes. A score with no factors is a vendor opinion wearing a percentage sign.

---

## Where each package plugs in

**Launchpad service**

- quoteBuy / quoteSell for pricing previews and slippage bounds
- initialCurveState + DEFAULT_CURVE_PARAMS as the specification for Bark's own curve
- decodeBondingCurve for reconciliation jobs that verify on-chain state against the database

**Indexer**

- parsePumpTransaction for every signature touching a tracked mint
- decodeTradeEvent when replaying historical logs
- reconcile fees from balance deltas, never from the event's fee field

**Terminal API**

- analyseConcentration behind the holders panel
- WalletClusterer behind "related wallets"
- detectBundles + assessRisk behind the risk badge, with factors exposed in the same response

**Venue layer**

- Jupiter and DexScreener for bootstrap data
- capability flags drive which panels render at all

---

## Testing strategy

The suite is offline and deterministic: **121 tests, no network**.

Three tiers:

1. **Property tests** - base58 round-trips, curve invariants, PDA derivation against a known
   account.
2. **Golden fixtures** - a real mainnet transaction, a real curve account and the real global
   account, committed as hex and asserted field by field.
3. **Behaviour tests** - retry semantics with an injected fetch, bundle detection on synthetic
   buy sets, risk scoring on constructed extremes.

When the protocol changes, tier 2 fails first. That is the point.

---

## Suggested next steps

1. **Model rent in PnL.** Fees and rent are both deducted from a trader's balance; on the
   captured trade rent was 265,403 lamports against 35,897,834 of fees. Reconcile from balance
   deltas rather than summing fee fields.
2. **Version the decoders.** TradeEvent now ends in a variable-length ix_name and can carry a
   shareholder vector, so offsets are not stable past a point. Keep the length-keyed dispatch.
3. **Settle v2 curve derivation.** Either find the seed namespace or make curve discovery
   event-driven everywhere.
4. **Build a reconciler.** For every tracked mint, compare indexer state to on-chain reserves on
   a schedule. Divergence is the earliest signal of a decoder bug.
5. **Replace public RPC.** Everything here works against it, but the product should not.
