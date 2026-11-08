# Competitive landscape: what other terminals run on

Observed **2026-11-08** from this workspace. Same rule as everywhere else in this repo: only what
was actually seen, with the refusal recorded when a service said no.

Useful for Bark for one reason: it separates "what a competitor's marketing page claims" from
"what their stack actually is". The second one tells you where the defensible ground is.

---

## Summary

| Target | Reachable | Auth | What it actually is |
| --- | --- | --- | --- |
| pump.fun | API gated (403) | yes | curve program + router + fee program, fully decodable on chain |
| Axiom | no (403) | yes | unknown; no surface observed |
| fomo.family | data API 401 | yes | EVM-first multi-chain consumer app, not a Solana terminal |
| bags.fm | yes | yes | own Solana swap programs (two generations) + Express API + SIWS auth |
| Moonshot | yes | ? | SPA shell inspected; app chunks lazy-loaded |
| Jupiter | yes | no key | routing + token data |
| DexScreener | yes | no key | per-pair market data |

---

## bags.fm

**Positioning** (their own page title): "launch a coin, get paid on every trade".

That is a creator-revenue launchpad, which is the closest thing in this market to the model Bark
is building. Worth understanding properly.

### Frontend

Next.js app served from bags.fm, 79 chunks / 6.9 MB of JavaScript downloaded and searched.

### API

- Host: **api2.bags.fm**, base path **/api/v1**.
- It is an Express service, not a Cloudflare challenge: unknown routes return an HTML
  "Cannot GET /api/v1/..." page rather than a managed challenge. That means the host is
  reachable; only specific routes are unknown to us.
- Endpoints observed in the bundle, all session-scoped:
  /api/v1/users/me, /api/v1/sessions, /api/v1/wallets/revoke, /api/v1/telegram/{link,unlink,authenticate},
  /api/v1/siws/{init,authenticate,link,unlink}, /api/v1/siwe/{init,authenticate,link,link_smart_wallet},
  /api/v1/recovery/oauth/{init,init_icloud,authenticate}.

### Auth

Sign-In With Solana (SIWS) and Sign-In With Ethereum (SIWE), plus Telegram linking and iCloud
recovery. Wallet infrastructure is Privy; fiat on-ramp is MoonPay.

Bark should note the SIWS pattern: signing a message with the wallet is a cleaner first-class
identity than email/OTP, and it is what an on-chain-native user expects.

### Chains

Solana is primary, but the bundle also references Hyperliquid EVM, Arbitrum, and "Gunz" chain
RPCs. This is a multi-chain product, not a Solana one.

### On-chain

Four program-like addresses were extracted from the bundle; only two are executable:

| Address | Executable | Instruction (from logs) | Discriminator | Data | Accounts |
| --- | --- | --- | --- | --- | --- |
| dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN | yes | Swap2 | 414b3f4ceb5b5b88 | 25 bytes | 15 |
| cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG | yes | Swap | f8c69e91e17587c8 | 24 bytes | 14 |
| FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM | no (system-owned, 68.8 SOL) | fee/vault account | - | - | - |
| HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC | no (system-owned, 179.8 SOL) | fee/vault account | - | - | - |

Two generations of the same swap program ("Swap" and "Swap2") is a strong signal: they have
already shipped one AMM design and replaced it. The second one adds an account and a byte of
data - most likely a flags or routing field.

**They emit no program events.** The transactions carry no "Program data:" lines, only
instruction logs. An indexer for this venue has to parse instruction data or reconcile token
balances. That is a materially harder integration than pump.fun, which tells you something about
where their priorities are.

### Instruction shapes, decoded

Four live swaps per program were decoded and correlated against token balance changes:

| Program | Data | Args | Tail |
| --- | --- | --- | --- |
| Swap | 24 or 25 bytes | (amountIn, minOut) as u64 LE | absent, or one flag byte (0x02 seen) |
| Swap2 | 25 bytes | (amountIn, minOut) as u64 LE | 0x00 in every sample |

Verified: the first u64 always equals the amount that left the user's account, exactly, and the
second is always a bound the actual output satisfied. Both programs take account 0 as a program
fee/vault account and repeat the program id inside the account list - an unusual pattern.

What remains unknown: the pool/state layout, the fee parameters, and the rule that picks Swap
versus Swap2. @bark/bags ships the decodable part and says so in its own documentation.

---

## Moonshot

**Positioning** (their page title): "Buy & Sell Memecoins, Stocks & Leverage".

That is notable on its own: tokenized equities plus leverage, which is exactly the kind of
expansion Bark's vision mentions as subject to separate regulatory evaluation. Someone is already
selling it.

The page is a Vite/Rolldown SPA. The shell and its eagerly-loaded chunks were inspected (324 KB);
they contain analytics and asset hosts but no API surface, so the data layer is lazily loaded.
No API claims are made here.

---

## pump.fun

Covered in depth in [pumpfun.md](pumpfun.md). For this document the relevant fact is the contrast:
their hosted API is gated behind a managed challenge, yet the entire protocol is publicly
decodable on chain and now also documented by their own MIT-licensed SDK.

A competitor can be closed at the edge and fully open underneath at the same time.

---

## Axiom and fomo

- **Axiom**: HTTP 403 on every request, no API surface observed. Recorded as unknown rather than
  guessed.
- **fomo.family**: marketing and app bundles are public; every data route on
  evm-data.prod-edge.fomo.family returns 401 no_auth_header, including /health. Also multi-chain
  (Base, Monad, Robinhood Chain, Arc), so not a direct Solana competitor.

---

## What this means for Bark

Three observations worth acting on:

1. **The moat is not the launch mechanism.** bags.fm already sells "get paid on every trade",
   pump.fun already has curves, and both are two years into iterating. A launchpad that only
   matches them competes on execution quality alone. The integrated terminal is the differentiator
   the vision already identifies - and nothing in this landscape does discovery, investigation,
   and action in one place well.

2. **On-chain transparency is a feature, not a given.** pump.fun emits events and publishes an
   SDK; bags does not emit events at all. When Bark says "this is verifiable", the verification
   path should be written down per integration, the way this repo does it.

3. **Wallet-native identity is table stakes.** SIWS is already how bags onboards. Bark's account
   model should start there rather than bolting it on later.

---

## Method notes

- Bundles were fetched over plain HTTP and searched statically. No auth was bypassed, no session
  was forged, and no challenge was solved.
- Program IDs came from string literals in the bundle, then were verified on chain: executable
  flag, owner, and the instruction name the program logs when invoked.
- Fee/vault accounts are identified by "system-owned with a large balance", which is evidence, not
  proof of role.
