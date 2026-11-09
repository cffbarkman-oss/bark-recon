# Execution: from quote to settled trade

The report's recommendation was to "reconcile signing and settlement before chasing speed". This
is that boundary, implemented as a network-free state machine so it can be reasoned about and
tested before it is trusted with money.

---

## Why one "failed" state is not enough

After a quote there are four different outcomes, and they need different actions:

| State | Meaning | What the user should do |
| --- | --- | --- |
| expired | the quote died before landing; nothing was attempted | re-quote |
| rejected | the cluster refused it outright; nothing is in flight | retry |
| failed | it landed and reverted; funds moved, the trade did not | inspect the error |
| landed | committed on chain | reconcile settlement |

The distinction that matters most is between **expired** and **failed**, and the only reliable
test is the block height. A quote is valid until lastValidBlockHeight, so "not found on chain"
means pending before that height and expired after it. A UI that calls both "failed" teaches
users to retry trades that already did nothing, and to distrust ones that actually landed.

---

## The lifecycle

~~~text
quoted -> signed -> submitted -> pending -> landed
                           |-> failed     (landed and reverted)
                           |-> expired    (never seen by the deadline)
              |-> rejected                (refused at submission)
~~~

Every transition is timestamped and kept in the record's history, because the useful production
question is "how long did it sit in pending" - which is a provider latency measurement disguised
as order state.

Two deliberate restrictions:

1. **Terminal states are final.** A landed or failed order cannot be re-marked. Reading a terminal
   order again is idempotent, so a poller can run without side effects.
2. **State order is enforced.** You cannot submit an unsigned order, and you cannot sign twice.
   Cheap checks now, expensive incidents later.

---

## Settlement

"Landed" is not "did what you were told". reconcileSwap(intent, observed) compares the intent
against balance deltas and returns one of:

- **filled** - output met the minimum
- **shortfall** - output below the minimum; a guarantee broken, never normal
- **partial** - less input consumed than requested
- **empty** - no balance movement in either mint

A shortfall is reported even though a successful transaction should make it impossible. Treating
"impossible" as silently fine is how a settlement bug survives to production.

The report also asks for realised slippage, so the result carries realisedFractionOfQuote when the
caller supplies the quoted output.

---

## What this does not do

- It does not poll. Callers feed it getSignatureStatuses results; that keeps the state machine
  usable in a browser, a worker, or a test, and lets Bark choose its own cadence.
- It does not hold keys. Signing happens in the wallet; this records that it happened.
- It does not claim settlement from a provider response. A Jupiter execute result is a status,
  not a fact about balances - which is exactly why reconciliation is separate.

---

## Next

The natural follow-on is persistence: an order table keyed by requestId, so lifecycle survives a
page reload and the terminal can show a trade as pending across sessions. That needs a database
decision - and the report defers ClickHouse to analytics, which is the right call, because this
wants an operational store, not a warehouse.
