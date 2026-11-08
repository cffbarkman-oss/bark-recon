# pump.fun: protocol findings

Captured **2026-11-08** against mainnet-beta at slot **466,943,651**.

Evidence: [mainnet-2026-11-08.json](evidence/mainnet-2026-11-08.json) (raw bytes for one
transaction, one bonding-curve account and the global config account).

Everything below is **observed** unless marked otherwise.

---

## Program map

| Role | Address | Evidence |
| --- | --- | --- |
| Bonding curve program | 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P | owner of the 166-byte curve account |
| Router (current frontend path) | m9obQHAPyZeZ88w7XUY8Te6a8rBmhXsfKco7u8G8tnB | top-level instruction, CPIs into 6EF8 |
| Fee program | pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ | inner instruction on every trade |
| Token program | TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb | mint + token accounts are Token-2022 |
| Global config | 4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf | 1088 bytes, owner 6EF8 |

The important structural finding: **the frontend no longer calls the bonding-curve program
directly.** It calls a router, which CPIs into 6EF8 and the fee program. Any integration that
hard-codes "instruction 0 is a pump buy" will silently stop working.

---

## Global configuration

1088 bytes, discriminator a7e8e8b1c86c727f.

| Offset | Size | Field | Observed value |
| --- | --- | --- | --- |
| 0 | 8 | discriminator | a7e8e8b1c86c727f |
| 8 | 1 | initialised | 1 |
| 9 | 32 | authority | d3bb8cab...02aa |
| 41 | 32 | fee recipient | 4ac2f8d0...b3e6 |
| 73 | 8 | initial virtual token reserves | 1,073,000,000,000,000 |
| 81 | 8 | initial virtual SOL reserves | 30,000,000,000 lamports |
| 89 | 8 | initial real token reserves | 793,100,000,000,000 |
| 97 | 8 | token total supply | 1,000,000,000,000,000 |
| 105 | 8 | fee basis points | **95** |
| 113 | 1 | bump (unconfirmed) | 0x1f |

Two cross-checks make this layout trustworthy:

1. The fee recipient at offset 41 is byte-identical to the feeRecipient inside the live
   TradeEvent, and that account received lamports in the same transaction.
2. The three reserve constants are exactly the long-standing pump.fun launch parameters
   (1.073B virtual, 793.1M real, 30 SOL virtual, 1B supply).

The 95 bps value is worth flagging: the transaction log says **fee_bps=100** while the global
account says **95**, and the event carries **95** in the slot the old layout called feeAmount.
Treat 95 as a creator-fee rate and 100 as the protocol rate until someone reconciles them.

---

## Bonding curve account

Current launches: **166 bytes**, discriminator 17b7f83760d8ac60.
Legacy launches: **49 bytes**, same discriminator, same body, no creator and no tail.

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 8 | discriminator 17b7f83760d8ac60 |
| 8 | 8 | virtualTokenReserves |
| 16 | 8 | virtualSolReserves |
| 24 | 8 | realTokenReserves |
| 32 | 8 | realSolReserves |
| 40 | 8 | tokenTotalSupply |
| 48 | 1 | complete |
| 49 | 32 | creator (v2 only) |
| 81 | 85 | unmapped tail (v2 only) |

Verified invariant on the captured account:

~~~text
virtualSolReserves - realSolReserves = 30,000,000,000  (exactly 30 SOL)
virtualTokenReserves - realTokenReserves = 279,900,000,000,000
~~~

The token difference is *not* exactly the 280M virtual seed. Integer division floors on every
trade, so the pair drifts apart by a few hundredths of a percent over the life of a curve. Code
that assumes "virtual = real + constant" for tokens will be wrong; for SOL it holds exactly.

**Layout order differs between the account and the event.** The account is
(virtualToken, virtualSol, realToken, realSol). The event is
(virtualSol, virtualToken, realSol, realToken). Copying one order into the other silently
swaps two numbers, and a single test against real bytes is what catches it.

---

## TradeEvent

**391 bytes including the discriminator** (bddb7fd34ee661ee). The same payload appears twice:
once as a base64 "Program data:" log line, and once inside an emit_cpi instruction whose
discriminator is e445a52e51cb9a1d.

| Offset | Size | Field | Captured value |
| --- | --- | --- | --- |
| 0 | 32 | mint | C6CSnQ...pump |
| 32 | 8 | solAmount (gross lamports) | 1,559,679,685 |
| 40 | 8 | tokenAmount (base units) | 30,428,421,475,159 |
| 48 | 1 | isBuy | 0 (sell) |
| 49 | 32 | user | HMjM...W4ag |
| 81 | 8 | timestamp (unix seconds) | 1,794,147,029 |
| 89 | 8 | virtualSolReserves | 39,847,511,445 |
| 97 | 8 | virtualTokenReserves | 807,829,630,484,498 |
| 105 | 8 | realSolReserves | 9,847,511,445 |
| 113 | 8 | realTokenReserves | 527,929,630,484,498 |
| 121 | 32 | feeRecipient | 62qc2CNX...fNgV |
| 153 | 8 | **v1: feeAmount / v2: creator fee bps** | 95 |
| 161 | 8 | creator fee | 14,816,958 |
| 169 | 32 | creator | 39a05a05...4f65f |
| 201 | 182 | unmapped | contains a length-prefixed "sell" string near offset 245 |

### The fee-slot change

This is the finding that would have shipped a bug.

In the documented v1 layout, offset 153 is the protocol fee in lamports. In the v2 payload it
holds **95** - and 95 bps of 1.559679685 SOL is exactly **14,816,958 lamports**, which is the
value at offset 161 and exactly what the creator was credited.

So the field moved meaning without moving position, and the discriminator stayed the same.
A decoder written from the old spec would report a 95-lamport protocol fee on every trade.

**Guidance for Bark:** do not compute fees from the event. Reconcile them from native balance
deltas (they always balance) or from the fee program's own accounts. Use the event for trade
direction, size and reserve state, which are unambiguous.

### Unmapped tail

Bytes 201..391 contain a u64 (30 in this capture), a value equal to a balance change in the same
transaction, a run of zeros, and what reads as a Borsh string: 04 00 00 00 followed by "sell".

It is not decoded here on purpose. Guessing at it would put an untested field into a trading
surface. The decoder surfaces it as **trailing** so a later pass can finish the job against more
samples.

---

## Instruction discriminators

| Instruction | Discriminator | Confidence |
| --- | --- | --- |
| sell | 33e685a4017f83ad | observed (24-byte data: amount + min_out) |
| buy | 66063d1201daebea | documented, not re-verified |
| create | 181ec828051c0777 | documented, not re-verified |
| emit_cpi envelope | e445a52e51cb9a1d | observed |

The router's own instructions carry different discriminators (e0c76373cce112b2 for the sell
path observed in this capture). Do not key off the router: its surface is the most volatile part
of the stack.

---

## PDA derivation

The classic curve address is derived from seeds ( "bonding-curve", mint ) under 6EF8.
The implementation in this repo is validated end-to-end against a real associated token account
(same ed25519 off-curve test, same hash layout), because a wrong curve check fails silently and
produces addresses that simply never resolve.

One caveat worth carrying forward: the captured 166-byte curve account
(DGfgKzva...Mn5GB) is **not** reproducible from the classic seed set or from any obvious
(mint, creator) variant tried here. Either the v2 router derives it under a different seed
namespace, or the account belongs to an earlier curve generation. Index curve accounts from
transactions rather than deriving them, until that is settled.

---

## What a Bark launchpad should copy, and what it should not

Copy:

- Constant-product over virtual reserves, with the virtual/real split made visible in the UI.
- Creator fee quoted separately from protocol fee, in basis points, before the curve math.
- A graduation threshold expressed in **real SOL**, checked against the same reserve the curve uses.
- Token-2022 from day one, with the mint authority and freeze authority both revoked at creation.

Do not copy:

- Reusing a discriminator for a payload whose semantics changed. Version the event.
- Putting fee values in a field that used to mean something else.
- Emitting the same event twice (log + emit_cpi) without a sequence number to de-duplicate on.

---

## Open questions

1. What are bytes 201..391 of the TradeEvent?
2. How is the v2 curve account derived?
3. Why does Global report 95 bps while the trade log reports fee_bps=100?
4. Is there a formal migration event, or does the curve simply flip **complete** to 1?
