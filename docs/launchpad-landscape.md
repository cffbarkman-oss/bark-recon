# Launchpad landscape: what is actually there

A teardown of 28 projects handed over as a target list, on 2026-11-08.

The rule is the same one used everywhere in this repository: a project is only described from
something that was actually observed. For most of this list that means "no resolvable presence",
which is itself the finding.

---

## Method

1. Resolve each X handle to a domain: base form, underscore-stripped form, and "dot" expansion
   (akadotfun to aka.fun, citadeldotxyz to citadel.xyz, and so on), each across six TLDs.
2. Fetch every candidate and fingerprint it: title, script hosts, API paths, chain references,
   0x addresses, base58 keys.
3. Where a product exists, fetch its app bundle and probe its API.
4. Reject false positives explicitly - a parked domain, a registrar redirect, or an unrelated
   company with the same name is not a launchpad.

228 domain candidates were probed. **Four** resolved to a real product surface.

---

## What is actually live

### Aka - aka.fun (akadotfun.com)

**"RWA-Powered Launchpad on Arc".** Next.js on Arc, wallet stack is wagmi/Reown.

This is the most sophisticated thing in the list, and its listing API is **open**:

~~~text
GET https://akadotfun.com/api/tokens/             -> 12 live tokens, full market data
GET https://akadotfun.com/api/tokens/featured/    -> featured subset
GET https://akadotfun.com/api/rwa-pools/          -> empty
GET https://akadotfun.com/api/rwa-pools/approved/ -> empty
~~~

The token record has 42 fields. The parts that matter for product design:

| Field | Example | Why it matters |
| --- | --- | --- |
| tokenAddress | 0x2a7a8c69... | the launched asset |
| hookAddress | null | Uniswap-v4 style hooks; null on the sample |
| poolId | 0x960cd015... | pool identity separate from the token |
| reservePercent | 65 | supply is reserved, not sold |
| reserveAmount | 650000000000000000000000000 | 65% of supply held back |
| dropAddress / dropBalanceNative | 0x18c6... / 81.75 | a staged drop with its own balance |
| dropNextRoundMinTimestamp | 2026-09-28 | drops are round-based, not one-shot |
| agentType | 0 | AI-agent launches are a first-class field |
| isOg / isFake | true / false | platform-maintained authenticity flags |
| totalTrades / totalBuyVolume / totalSellVolume | 2,495 / 195,417 / 185,158 | full market stats, no third party needed |

Two design ideas here that Bark should take seriously:

1. **Reserved supply with staged drops.** 65% of supply is held back with a next-round time,
   not dumped at launch. That is a credible anti-dump mechanic, and it is visible in the data
   model rather than buried in a docs page.
2. **Authenticity is a platform field.** isOg and isFake exist because someone has to answer
   "is this the real one" - the same problem @bark/market-intel's lookalike detector addresses
   from the outside.

Caveat: this is one snapshot of an open endpoint. The RWA module itself is empty, so the
"RWA-powered" part is announced, not running.

### Ascend - ascendlaunch.fun

**"Independent launchpad / Solana".** And it is genuinely tiny.

The page loads /solana-launch.js (8 KB), which imports Solana web3 primitives and builds a mint
**entirely client-side**: SystemProgram, MINT_SIZE, createInitializeMint2Instruction,
createAssociatedTokenAccountInstruction, createMintToInstruction, createSetAuthorityInstruction
(revoking mint and freeze authority).

Launches are stored in **localStorage** under the key ascend:solana:launches. There is no program
id, no API, no curve, no fee logic and no indexing - the review screen and the "my launches" list
are browser state.

So: a mint wizard. It is the floor of what "launchpad" can mean, and worth knowing precisely
because it shows how little is required to ship the word.

### Oxley - oxley.fun, app.oxley.fun

**"Deal Markets on Elysium."** Next.js on Vercel, with auctions and DEALS throughout the app
shell (14 mentions of auctions on the discover page).

Deal markets are a different shape from a launchpad: a venue for structured deals rather than a
curve. The app is client-rendered and its /api routes 404 for unauthenticated guesses, so nothing
about the mechanics is verified beyond the vocabulary.

### Torus - torus.finance

114 bytes. A redirect stub. Nothing to see.

---

## What is dead or unrelated (verified)

| Project | What the domain is |
| --- | --- |
| apogeeID | apogeeid.com is for sale at Spaceship |
| kilnpad | kilnpad.com redirects to a parked lander |
| citadel | citadel.xyz.com is a registrar redirect |
| TheKleos | thekleos.app is a GoDaddy park; thekleos.com is an unrelated hospitality company |
| updraft | updraft.app is a registrar holding page; updraft.com is a credit-card-debt fintech |

None of these are launchpads today.

---

## What has no resolvable presence

The remaining 22 handles produced no live product site under any obvious domain:
Bunnypad, CorePad, Montra, Neuriio, Stockium, StonksPad, Boxa, ElysiumPump, perpmefun,
ChainzyLabs, Valhalla, asphodellaunch, arkhampad, sasapad, obol, Volta, quoted, navo, Elysianpad.

That is not a claim they do not exist. It is a claim that, from an unauthenticated network, they
leave no trace - which means X-only operation, an app on a domain I could not guess, or a product
that has not shipped. X API access is the one thing that would change this, and this environment
does not have it.

---

## The mechanism taxonomy

These are the ideas the market is actually trying, taken from how each project describes itself.
Everything in this table is a **claim** - unverified, because for 22 of them there is nothing to
verify against. It is still the most useful page in this document: it is the competitive set of
launch mechanics, and Bark's launchpad will be judged against them.

| Mechanism | Who | What it does | Bark verdict |
| --- | --- | --- | --- |
| Anti-snipe curve rules | kilnpad | constrains the first blocks of buying | **Build.** Bark's launchpad needs sniper resistance; the curve has to be public and the rule explainable. |
| Milestone-based creator fee share | arkhampad | creator earns more as the token hits milestones | **Build.** Aligns creator incentives with outcomes rather than with launching. |
| Creator + optional holder fee routes | Montra, Volta, Kleos | fees split between creator and holders | **Build.** Directly matches Bark's "creator distributions" requirement. |
| Reserved supply + staged drops | Aka (verified) | 65% held back, released in rounds | **Build.** Strongest anti-dump mechanic seen, and it is observable in their data model. |
| Fee-funded staking | Aka | trading fees fund a staking yield | **Consider.** Same shape as holder rewards; needs accounting that survives audit. |
| USDC / pooled launch buys | updraft, sasapad | buyers contribute from a pooled quote balance | **Consider.** Removes SOL friction, adds custody surface. |
| HYPE / stock-quoted launches | citadel, StonksPad, Stockium, quoted | curve or pool quoted in a non-SOL asset | **Consider later.** Bark's curve is quote-agnostic already; the risk is regulatory, not technical. |
| Graduation into an external DEX | navo (hybra pools) | curve completes into a named venue | **Build the interface, not the dependency.** |
| Verified X ownership | Neuriio | token linked to a verified X account | **Build, differently.** Do it as signed claim + verification, not as a vendor. |
| NFT + token launches together | Valhalla | paired asset issuance | **Defer.** Real demand, wrong sequencing. |
| Deal markets / auctions | Oxley | structured deals rather than curves | **Watch.** Different product, possible later module. |
| 6% reserved for early users | CorePad | supply allocated to first-30-day users | **Avoid.** Indistinguishable from a loyalty program nobody can audit. |
| No separate platform token | Ascend | explicitly none | **Note.** Confirms a platform token is a choice, not a requirement. |

---

## What this means for Bark

**Three mechanisms are worth prototyping now**, because they are differentiated, verifiable and
do not need a licence:

1. **Reserved supply with staged release.** Aka's data model already expresses it (reservePercent,
   dropNextRoundMinTimestamp, dropBalanceNative). It is the cleanest answer to "why should a
   holder trust the launch" and it is computable in the same integer arithmetic the curve already
   uses.
2. **Milestone-based creator fees.** Turns the creator fee from a rent into a performance
   instrument, and it is checkable on chain: a milestone is just a threshold on reserve state.
3. **Creator + holder fee routes.** Montra, Volta and Kleos all ship a version of it. Bark's
   existing fee split already has the hook points; the work is accounting, not mechanism.

**Two things to avoid** on this evidence: reserved allocations for a founding cohort (CorePad),
because they cannot be audited by a user, and non-SOL quote assets before the legal position on
tokenized stocks is settled - two projects in this list already sell stock-quoted launches, and
that is exactly the ground Bark's own vision says requires separate evaluation.

**One structural observation.** Of 28 projects, two have a product a user can actually reach and
one of those is a mint wizard with no on-chain program. The launchpad market is crowded with
announcements, thin on shipped mechanism. That is opportunity for a team that ships the curve,
the fees and the accounting correctly - which is what this repository exists to make possible.

---

## What would unblock the rest

| Blocker | Unlocks |
| --- | --- |
| X API access (or an export of the accounts' pinned links) | domain resolution for the 22 that leave no trace |
| Arc RPC + Aka contract addresses | their hook and drop mechanics, on chain |
| Elysium chain details | Oxley's deal-market mechanics |
| Credentials for Axiom and fomo | the two terminals this repo already has shells for |

Until then this document is the honest state: four products observed, one mechanism taxonomy, and
a clear statement of what is claim versus evidence.
