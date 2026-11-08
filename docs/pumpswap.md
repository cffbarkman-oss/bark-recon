# PumpSwap: the post-graduation AMM

Captured **2026-11-08** against mainnet-beta: one live sell, one live pool.

Program: **pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA**
Evidence: [amm-2026-11-08.json](evidence/amm-2026-11-08.json)

Field names come from the Anchor IDL in @pump-fun/pump-sdk 4.3.1 (pump_amm.json, MIT),
confirmed against the captured bytes.

---

## Why this matters for Bark

A token stops being a bonding curve the moment it graduates. Every unit of volume after that
happens here. A terminal that only understands curve tokens shows a dead token page for
everything that succeeded - which is precisely the set of assets users care most about.

---

## Discriminator collisions

PumpSwap and the bonding-curve program share discriminators:

| Name | Discriminator | Used by |
| --- | --- | --- |
| buy | 66063d1201daebea | both |
| sell | 33e685a4017f83ad | both |
| buy_v2 | b817ee6167c5d33d | both |
| sell_v2 | 5df6823ce7e940b2 | both |
| BondingCurve account | 17b7f83760d8ac60 | both |
| FeeConfig account | 8f3492bbdb7b4c9b | both |

Eight bytes cannot tell you which program you are looking at. The owning program is the only
disambiguator. An indexer that switches on the discriminator alone will happily parse an AMM
pool as a bonding curve and report nonsense reserves.

---

## Pool account

301 bytes observed, discriminator f19a6d0411b16dbc. The IDL fields consume 279; the remaining
14 bytes are unmapped and preserved verbatim.

| Offset | Size | Field | Captured |
| --- | --- | --- | --- |
| 0 | 8 | discriminator | f19a6d0411b16dbc |
| 8 | 1 | pool_bump | 254 |
| 9 | 2 | index | 0 |
| 11 | 32 | creator | 9f839ac7... |
| 43 | 32 | base_mint | 9aac239c... |
| 75 | 32 | quote_mint | So111...1112 (wrapped SOL) |
| 107 | 32 | lp_mint | 07084d10... |
| 139 | 32 | pool_base_token_account | 3f4e124c... |
| 171 | 32 | pool_quote_token_account | ae2a6f55... |
| 203 | 8 | lp_supply | 10,345,702,509,847 |
| 211 | 32 | coin_creator | 5727eb2b... |
| 243 | 1 | is_mayhem_mode | 0 |
| 244 | 1 | is_cashback_coin | 0 |
| 245 | 16 | virtual_quote_reserves (i128) | 43,158,767,980 |
| 261 | 8 | creator_fee_bps | 0 |
| 269 | 1 | can_edit_creator_fee | 0 |
| 270 | 1 | is_holder_reward | 0 |
| 271 | 8 | protocol_fees | 42,482,033 |
| 279 | 8 | creator_fees | 182,297,905 |
| 287 | 14 | unmapped | - |

**The pool does not store reserves.** Base and quote balances live in the two token accounts.
Any pricing code has to read those accounts separately.

---

## Sell event

449 bytes total (441 body), discriminator 3e2f370aa503dc2a, and it consumes to the last byte.

| Field | Captured |
| --- | --- |
| timestamp | 1,794,153,587 |
| base_amount_in | 1,140,772,847,528 |
| pool_base_token_reserves | 127,733,609,189,215 |
| pool_quote_token_reserves | 907,525,871,500 |
| quote_amount_out | 8,415,430,628 |
| lp_fee_basis_points / lp_fee | 20 / 16,830,862 |
| protocol_fee_basis_points / protocol_fee | 5 / 4,207,716 |
| coin_creator_fee_basis_points / coin_creator_fee | 75 / 63,115,730 |
| quote_amount_out_without_lp_fee | 8,398,599,766 |
| user_quote_amount_out | 8,331,276,320 |
| virtual_quote_reserves | 43,174,720,754 |
| base_supply | 900,238,567,252,614 |

Fee arithmetic, verified to the lamport:

~~~text
gross                    8,415,430,628
lp       ceil(gross x 20 bps)   16,830,862
protocol ceil(gross x  5 bps)    4,207,716
creator  ceil(gross x 75 bps)   63,115,730
                                 84,154,308  (1.0% of gross)
user receives                8,331,276,320
~~~

Three separate ceils land up to 2 lamports above a single 1% floor - worth knowing if you ever
reconcile fee totals against a percentage.

---

## Buy event, and the asymmetry that matters

A live buy was captured after the sell: **515 bytes**, same discriminator family, decoded in full.

| Field | Captured |
| --- | --- |
| quote_amount_in | 37,575,185,568 |
| user_quote_amount_in | 37,462,797,176 |
| lp_fee_basis_points / lp_fee | 25 / 93,656,993 |
| protocol_fee_basis_points / protocol_fee | 5 / 18,731,399 |
| coin_creator_fee | 0 |
| quote_amount_in_with_lp_fee | 37,556,454,169 |
| base_amount_out | 19,063,707 |

**Buys charge fees on the net amount; sells charge them on the gross.**

~~~text
sell:  fee = ceil(gross_output x bps / 10,000)
buy:   fee = ceil(net_input    x bps / 10,000)

buy, verified:  net 37,462,797,176 x 5 bps  = 18,731,399  (matches)
                gross 37,575,185,568 x 5 bps = 18,787,593  (56,194 too high)
~~~

Getting this backwards understates every buy fee by roughly the fee rate, which compounds into
every PnL number a terminal shows. The two identities that hold:

~~~text
gross = net + lp_fee + protocol_fee + creator_fee
quote_amount_in_with_lp_fee = gross - protocol_fee - creator_fee   (= net + lp_fee)
~~~

which is why the pool absorbs net plus the LP fee, and why the LP fee is the only fee that stays
inside it.

---

## Pricing: what is verified and what is not

Verified: the fee split on both sides (including the buy/sell fee-base asymmetry above), the
direction of movement, and that the pool's quote side falls by the gross on a sell.

**Not verified: exact pricing from post-state reserves.**

Feeding the captured sell's own post-state back through a constant-product quote produces a
gross **2.8% below** what the chain paid - even though the constant product of those reserves is
only **0.026%** off. Output size is a difference of large numbers, so a tiny reserve error
becomes a large trade error, and it gets worse the smaller the trade relative to pool depth.

Including the pool's virtual_quote_reserves in effective depth moves the error from 2.8% to 1.8%
- still not exact. The likely explanation is that reported reserves carry accrued fees the curve
does not price against, and that virtual reserves participate only partially.

Practical guidance for Bark:

1. Use token-account balances for display-grade estimates only.
2. Reconstruct pre-trade state from events (each event carries its pool reserves), or simulate.
3. Do not execute against a quote derived from balances alone.

---

## Open questions

1. What are the 14 trailing bytes of the Pool account?
2. Why does a 0.026% reserve error produce a 2.8% output error - which term is missing?
3. Does virtual_quote_reserves participate in pricing, and in which direction?
4. Whether the 2.8% reconstruction error also affects buys - the captured buy decodes exactly,
   but its pool state has not been replayed against a subsequent trade.
