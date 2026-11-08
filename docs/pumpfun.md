# pump.fun: protocol findings

Captured **2026-11-08** against mainnet-beta. Two transactions, two accounts, plus a live
log subscription that caught a launch in progress.

Evidence: [mainnet-2026-11-08.json](evidence/mainnet-2026-11-08.json) - raw bytes, log lines and
account data for a sell on an established curve and for a full create-and-buy launch.

Field names come from the Anchor IDL published in **@pump-fun/pump-sdk 4.3.1** (MIT). That IDL
is a specification, not proof, so every offset below was re-derived from the captured bytes:

- BondingCurve decodes to exactly 166 bytes with nothing left over.
- Global decodes to exactly 1088 bytes with nothing left over.
- TradeEvent decodes to exactly 383 body bytes for a sell and 382 for a buy.
- CreateEvent decodes to exactly 335 body bytes.
- Every fee field equals ceil(amount x basis points), to the lamport.

When a decode consumes its input exactly, the field order is right. That is the check that
makes these tables trustworthy rather than plausible.

---

## Program map

| Role | Address | Evidence |
| --- | --- | --- |
| Bonding curve program | 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P | owner of curve accounts, emits events |
| Router (current frontend path) | m9obQHAPyZeZ88w7XUY8Te6a8rBmhXsfKco7u8G8tnB | top-level instruction, CPIs into 6EF8 |
| Fee program | pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ | inner instruction on every trade |
| Token program | TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb | mints and accounts are Token-2022 |
| Global config | 4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf | 1088 bytes, owner 6EF8 |

The frontend does **not** call the bonding-curve program directly. It calls the router, which
CPIs into 6EF8 and the fee program. Any integration that assumes "instruction 0 is a pump buy"
breaks silently.

---

## Hazard: transactions are now version 1

The launch captured here is a **version-1 transaction**. A client pinned to
maxSupportedTransactionVersion 0 is rejected by the RPC with error -32015 - it does not return
null, it errors.

An indexer that keeps running while swallowing that error will miss launches and look perfectly
healthy. @bark/solana now requests version 1 by default.

---

## Launch flow

A current launch is a single version-1 transaction with two pump instructions:

| # | Program | Instruction | Discriminator | Accounts |
| --- | --- | --- | --- | --- |
| 1 | 6EF8 | create_v2 | d6904cec5f8b31b4 | 16 |
| 2 | AToken | create idempotent ATA | - | - |
| 3 | 6EF8 | buy_v2 | b817ee6167c5d33d | 27 |

Instruction 1 creates the mint and the curve; instruction 3 is the creator's own initial buy in
the same transaction. This is why "first buyers in the same slot" heuristics need care: the
creator is structurally one of them.

Accounts touched: 36. The create call CPIs into Token-2022 (InitializeMint2, metadata, mint to
curve), and one inner CPI targets an external program (MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e)
that is not part of the pump IDL.

---

## CreateEvent

343 bytes total, discriminator 1b72a94ddeeb6376.

| Offset | Size | Field | Captured value |
| --- | --- | --- | --- |
| 0 | 4+2 | name (string) | "79" |
| 6 | 4+2 | symbol (string) | "79" |
| 12 | 4+61 | uri (string) | ipfs link, 61 chars |
| 73 | 32 | mint | e58b6e47...c84f |
| 105 | 32 | bonding_curve | 85c823fb...e375 |
| 137 | 32 | user | e4a850e0...df52 |
| 169 | 32 | creator | e4a850e0...df52 |
| 201 | 8 | timestamp | 1,794,150,373 |
| 209 | 8 | virtual_token_reserves | 1,073,000,000,000,000 |
| 217 | 8 | virtual_sol_reserves | 30,000,000,000 |
| 225 | 8 | real_token_reserves | 793,100,000,000,000 |
| 233 | 8 | token_total_supply | 1,000,000,000,000,000 |
| 241 | 32 | token_program | Token-2022 |
| 273 | 1 | is_mayhem_mode | true |
| 274 | 1 | is_cashback_enabled | false |
| 275 | 32 | quote_mint | zeroed |
| 307 | 8 | virtual_quote_reserves | 30,000,000,000 |
| 315 | 8 | creator_fee_bps | 0 |
| 323 | 1 | is_holder_reward | false |
| 324 | 1 | depth | 0 |

Variable-length strings mean a decoder cannot index this payload; it has to walk it.
That is exactly how a fixed-offset parser ends up reading "79" as a pubkey.

---

## BondingCurve account

Current launches: **166 bytes**, discriminator 17b7f83760d8ac60.
Legacy launches: **49 bytes**, same discriminator, body stops after *complete*.

| Offset | Size | Field | Captured value |
| --- | --- | --- | --- |
| 0 | 8 | discriminator | 17b7f83760d8ac60 |
| 8 | 8 | virtual_token_reserves | 822,273,624,860,714 |
| 16 | 8 | virtual_quote_reserves | 39,147,553,199 |
| 24 | 8 | real_token_reserves | 542,373,624,860,714 |
| 32 | 8 | real_quote_reserves | 9,147,553,199 |
| 40 | 8 | token_total_supply | 1,000,000,000,000,000 |
| 48 | 1 | complete | false |
| 49 | 32 | creator | 39a05a05...4f65f |
| 81 | 1 | is_mayhem_mode | false |
| 82 | 1 | is_cashback_coin | false |
| 83 | 32 | quote_mint | zeroed (SOL) |
| 115 | 8 | creator_fee_bps | 0 |
| 123 | 1 | can_edit_creator_fee | false |
| 124 | 1 | is_holder_reward | false |
| 125 | 8 | creator_fee (accrued) | 110,997,350 |
| 133 | 8 | protocol_fees (accrued) | 440,300,832 |
| 141 | 1 | depth | 0 |
| 142 | 8 | initial_virtual_quote_reserves | 30,000,000,000 |
| 150 | 8 | post_complete_base_out | 0 |
| 158 | 8 | post_complete_quote_in | 0 |

Verified invariant: **virtual_quote_reserves - real_quote_reserves = 30,000,000,000 exactly.**

Two timing caveats on the numbers above. The account was read later than the trade, so its
reserves are already lower than the event's (39.14 vs 39.85 SOL) - expected, and the reason an
indexer must trust the event for trade-time state. Second, the creator field is **mutable**:
re-reading the same account hours later showed a different creator
(4sx4Acnb...5ob3p2), consistent with set_creator / admin_cto reassignment. Creator identity is
not an immutable key - dev-history features must follow the reassignment, not cache the first
value.

The token side is *not* exact: 822,273,624,860,714 - 542,373,624,860,714 = 279,900,000,000,000,
which is 100,000,000,000 below the 280,000,000,000,000 seeding gap. Integer division floors on
every trade and the drift accumulates. Code that assumes both sides hold a constant will be
wrong on one of them.

---

## Global account

1088 bytes, discriminator a7e8e8b1c86c727f.

| Offset | Size | Field | Captured value |
| --- | --- | --- | --- |
| 8 | 1 | initialized | true |
| 9 | 32 | authority | d3bb8cab...02aa |
| 41 | 32 | fee_recipient | 4ac2f8d0...b3e6 |
| 73 | 8 | initial_virtual_token_reserves | 1,073,000,000,000,000 |
| 81 | 8 | initial_virtual_sol_reserves | 30,000,000,000 |
| 89 | 8 | initial_real_token_reserves | 793,100,000,000,000 |
| 97 | 8 | token_total_supply | 1,000,000,000,000,000 |
| 105 | 8 | fee_basis_points | **95** |
| 113 | 32 | withdraw_authority | ... |
| 145 | 1 | enable_migrate | true |
| 146 | 8 | pool_migration_fee | 15,000,001 |
| 154 | 8 | creator_fee_basis_points | **5** |
| 162 | 7x32 | fee_recipients | 7 keys |
| 386 | 32 | set_creator_authority | ... |
| 418 | 32 | admin_set_creator_authority | ... |
| 450 | 1 | create_v2_enabled | true |
| 451 | 32 | whitelist_pda | ... |
| 483 | 32 | reserved_fee_recipient | ... |
| 515 | 1 | mayhem_mode_enabled | true |
| 516 | 7x32 | reserved_fee_recipients | 7 keys |
| 740 | 1 | is_cashback_enabled | true |
| 741 | 8x32 | buyback_fee_recipients | 8 keys |
| 997 | 8 | buyback_basis_points | **5000** |
| 1005 | 8 | initial_virtual_quote_reserves | 4,292,000,000 |
| 1013 | 32 | whitelisted_quote_mints | 1 key |
| 1045 | 1 | creator_fee_configurable | true |
| 1046 | 8 | max_configurable_creator_fee_bps | **300** |
| 1054 | 32 | holder_reward_claim_authority | ... |
| 1086 | 1 | is_holder_reward_enabled | true |
| 1087 | 1 | max_curve_depth | 2 |

**Multi-quote support exists.** A curve can be quoted in something other than SOL
(quote_mint is zeroed for SOL). Whitelisted quote mints live in the global account. Any Bark code
that hardcodes lamports-only pricing will eventually misprice a USDC curve.

---

## TradeEvent

**391 bytes** for a sell, **390** for a buy. Discriminator bddb7fd34ee661ee. The one-byte
difference is ix_name: "sell" is one character longer than "buy".

That single byte is a gift: it proves the payload ends with a variable-length field and that a
fixed-size struct assumption is wrong.

| Offset | Size | Field | Captured (sell) |
| --- | --- | --- | --- |
| 0 | 32 | mint | C6CSnQ...pump |
| 32 | 8 | sol_amount | 1,559,679,685 |
| 40 | 8 | token_amount | 30,428,421,475,159 |
| 48 | 1 | is_buy | false |
| 49 | 32 | user | HMjMJZsQ...W4ag |
| 81 | 8 | timestamp | 1,794,147,029 |
| 89 | 8 | virtual_sol_reserves | 39,847,511,445 |
| 97 | 8 | virtual_token_reserves | 807,829,630,484,498 |
| 105 | 8 | real_sol_reserves | 9,847,511,445 |
| 113 | 8 | real_token_reserves | 527,929,630,484,498 |
| 121 | 32 | fee_recipient | 62qc2CNX...fNgV |
| 153 | 8 | **fee_basis_points** | **95** |
| 161 | 8 | fee | 14,816,958 |
| 169 | 32 | creator | 39a05a05...4f65f |
| 201 | 8 | creator_fee_basis_points | 30 |
| 209 | 8 | creator_fee | 4,679,040 |
| 217 | 1 | track_volume | false |
| 218 | 8 | total_unclaimed_tokens | 0 |
| 226 | 8 | total_claimed_tokens | 0 |
| 234 | 8 | current_sol_volume | 0 |
| 242 | 8 | last_update_timestamp | 0 |
| 250 | 4+4 | ix_name (string) | "sell" |
| 258 | 1 | mayhem_mode | false |
| 259 | 8 | cashback_fee_basis_points | 0 |
| 267 | 8 | cashback | 0 |
| 275 | 8 | buyback_fee_basis_points | 5000 |
| 283 | 8 | buyback_fee | 7,408,479 |
| 291 | 4 | shareholders (vec length) | 0 |
| 295 | 32 | quote_mint | zeroed |
| 327 | 8 | quote_amount | 1,559,679,685 |
| 335 | 8 | virtual_quote_reserves | 39,847,511,445 |
| 343 | 8 | real_quote_reserves | 9,847,511,445 |
| 351 | 8 | holder_rewards_bps | 0 |
| 359 | 8 | holder_rewards | 0 |
| 367 | 8 | creator_fee_unclaimed | 81,217,357 |
| 375 | 8 | quote_transfer_fee | 0 |

Shareholders are (pubkey, u16 share_bps) pairs - 34 bytes each - so the tail after them is not
at a fixed offset once shareholders exist.

### The fee slot that changed meaning

In the old documented layout, offset 153 was the fee **amount**. It is now fee **basis points**.

A decoder written from the old spec reads 95 where it expects fourteen million, reports a
95-lamport fee on a 1.5 SOL trade, and every downstream PnL number inherits the error. The
failure is silent: nothing throws, the number is just wrong by five orders of magnitude.

This is the single strongest argument for pinning decoders to real bytes with tests.

---

## Fee model, measured

From the captured sell of 1,559,679,685 lamports:

| Component | Rate | Amount | Where it went |
| --- | --- | --- | --- |
| protocol fee | 95 bps | 14,816,958 | recipient 5LAtLnKd...ANDG actually received 15,401,836 |
| creator fee | 30 bps | 4,679,040 | accrued on the curve (creatorFeeUnclaimed grew) |
| buyback | 50 bps | 7,408,479 | buyback recipients |
| user received | - | 1,523,511,448 | trader wallet |
| network fee | - | 5,000 | validator |

Rounding is **ceil**, not floor:

~~~text
1,559,679,685 x 95 / 10,000 = 14,816,957.0075 -> 14,816,958
1,559,679,685 x 30 / 10,000 =  4,679,039.055  ->  4,679,040
~~~

### Three sources disagree about the creator rate

| Source | creator fee |
| --- | --- |
| global account | 5 bps |
| curve account | 0 bps |
| trade event | **30 bps** (and the amount charged matches 30 exactly) |

Do not build fee accounting on any single one of these. Reconcile against what actually moved:

~~~ts
const settlement = reconcileTrade(trade, transaction);
settlement.userDelta;     // what the trader really received
settlement.totalCosts;    // gross - received: fees, rent and network fee
settlement.credits;       // every account that gained lamports
~~~

On the captured trade, totalCosts is 36,168,237 lamports while the named fees sum to
35,897,834. The 265,403 difference is account rent, not a fee. A PnL view that models
"gross minus protocol minus creator" would be wrong by exactly that much on every trade.

### Balance arrays include lookup-table accounts

This is the trap that makes naive reconciliation silently wrong. Versioned transactions resolve
most accounts through address lookup tables, so message.accountKeys holds only the static
prefix. The balance arrays cover static keys, then loaded writable, then loaded readonly.

Indexing balances against message.accountKeys alone does not merely drop accounts - it shifts
every value after the boundary onto the wrong address. The captured trade has 24 static keys and
more loaded ones; reading only the static prefix reported three credits where the full set is
five. accountKeyList() in settlement.ts builds the correct order.

---

## Curve math

Constant product over virtual reserves, floored on output:

~~~text
buy:   newVQ  = vQuote + quoteIn
       tokens = vTokens - (vQuote * vTokens) / newVQ
       cost   = quoteIn + ceil(fees)

sell:  newVT  = vTokens + tokensIn
       gross  = vQuote - (vQuote * vTokens) / newVT
       payout = gross - ceil(fees)
~~~

**Reserves move by the gross amount. Fees are never netted out of the curve.**

That is the single most important line in this document, and it is the opposite
of what a conventional AMM client would assume. It was established from the
launch capture, where the creator's first buy moved virtual quote from exactly
30,000,000,000 to exactly 30,246,404,309 - the full sol_amount - while charging
2,340,841 of protocol fee and 739,213 of creator fee beside it.

Netting the fee out first shifts every reserve, price and graduation percentage
downward, and the error compounds across a token's life. On the sell side the
same rule shows up as: the curve releases gross, and the seller receives gross
minus the fees.

Graduation is **derived, not hardcoded**. The curve completes when real token reserves reach
zero, so:

~~~text
gap       = 1,073,000,000,000,000 - 793,100,000,000,000 = 279,900,000,000,000
k         = 30,000,000,000 x 1,073,000,000,000,000
vQuoteF   = k / gap = 115,005,359,056
threshold = vQuoteF - 30,000,000,000 = 85,005,359,056
~~~

So "85 SOL" is 5,359,056 lamports short of the real completion point. Small, but it is the kind
of constant that silently becomes wrong the moment launch parameters change. Compute it.

---

## Instruction discriminators

| Instruction | Discriminator | Verified |
| --- | --- | --- |
| create | 181ec828051c0777 | IDL |
| create_v2 | d6904cec5f8b31b4 | mainnet |
| buy | 66063d1201daebea | IDL |
| buy_v2 | b817ee6167c5d33d | mainnet |
| buy_exact_sol_in | 38fc74089edfcd5f | IDL |
| sell | 33e685a4017f83ad | mainnet |
| sell_v2 | 5df6823ce7e940b2 | IDL |
| migrate | 9beae792ec9ea21e | IDL |
| migrate_v2 | bbcb121fceedfe29 | IDL |
| collect_creator_fee | 1416567bc61cdb84 | IDL |
| emit_cpi envelope | e445a52e51cb9a1d | mainnet |

The router has its own discriminators (e0c76373cce112b2 on the observed sell path). Do not key
off the router; it is the most volatile layer in the stack.

---

## Correction log

What the first pass got wrong, and why it matters:

| First conclusion | Actual |
| --- | --- |
| offset 153 was feeAmount, repurposed to creator fee bps | it is fee_basis_points; the amount is at 161 |
| the 391-byte payload had ~180 unmapped trailing bytes | all 383 body bytes are named fields |
| the 49-byte curve layout was current | current curves are 166 bytes with creator, quote mint and fee bookkeeping |
| graduation is 85 SOL | derived threshold is 85,005,359,056 lamports |
| account vs event reserve order differs arbitrarily | the account tracks (token, quote) pairs, the event tracks (sol, token) pairs; both are correct, the naming differs |

Each of these was caught by decoding captured bytes and checking that the result consumes the
input exactly. That check should be in every decoder that touches money.

---

## The fee program

Every trade CPIs into **pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ**, which is not part of the
pump IDL and publishes no account schema. Recorded here so the next pass has a starting point:

| Observation | Value |
| --- | --- |
| fee instruction discriminator | 9aed8a5ca202a2bb |
| instruction data length | 57 bytes (1-byte tag + u64 + zero padding) |
| accounts passed | 2 |
| program-owned account A | 208 bytes, discriminator 99a64790b3bd89fb |
| program-owned account B | 4097 bytes (1 + 4096 - a bitset-shaped allocation) |

The fee program is where the real protocol/creator split is computed, so decoding it would
settle the "three sources disagree on the creator rate" question permanently. That needs either
a second account observation at a different state or a sample of several fee instructions; one
sample is not enough to claim a layout.

---

## Open questions

1. The buy-side token output is 1.6 parts per billion lower on chain than the
   constant-product formula predicts from identical inputs (8,741,264,595,445
   recorded vs 8,741,264,609,703 computed). The quote side matches exactly, so
   this is a rounding or adjustment inside one intermediate step. It is
   operationally irrelevant at 0.00000016% but it is not explained, and the test
   asserts the bound rather than hiding it.
2. Why does the curve account report creator_fee_bps = 0 while the trade charges 30 bps?
3. Why does the router log fee_bps = 100 when the protocol fee is 95 bps?
4. Derivation is settled for current launches and not for older ones. Seeds
   ("bonding-curve", mint) under 6EF8 reproduce the launch captured here exactly (bump 255),
   and @bark/pumpfun ships that derivation. But the 166-byte curve DGfgKzva...Mn5GB sampled
   from a sell that same day is not derivable from its mint under this seed set, nor under 384
   other seed/provider combinations tested. Treat derivation as an optimisation for new
   launches and always confirm the account exists - index addresses seen in transactions.
5. Shareholder-vector events have not been observed yet; the decoder handles them but the
   offsets are untested against a live sample.
