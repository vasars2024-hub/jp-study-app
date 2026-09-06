# needs-user.md — work that no agent may or can do

Created 2026-08-24 by an interactive session. **This file was referenced by six places in
four plan docs and did not exist** (`ANKI_DECK_WORKBENCH_PLAN.md:270,309`,
`LIQUID_UI_RUBRIC.md:173`, `LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md:425`,
`MAIN_V1_COMPLETION_PLAN.md:752,881`), so the external blockers it is supposed to hold had
no home. Content below is consolidated from `MAIN_V1_COMPLETION_PLAN.md` Phase 9.3 and its
2026-08-19 gate-14 measurement. **Workers: keep this file current — it is the canonical
place, and an entry here is what makes a unit "complete-except-external" for ladder
purposes.**

Status as of 2026-08-30: main-v1 is at 62 of 80 track-bullet units. Of the 18 open,
11 are plan (3) liquid's own work, **6 are the items below**, and **1 is agent work** —
gate 10, which was on this list until 2026-08-30 and is not a user blocker at all (see the
struck item 2). Apart from liquid and that one gate, the items below are what stands between
main-v1 and done.

*(Arithmetic corrected 2026-08-30. This header previously read "61 of 80 ... Of the 19 open,
11 ... and 7 are the items below" — 11 + 7 = 18, not 19, and `progress-state.json` had
already re-counted the tracks to 62/80 with 18 open on 2026-08-25. An entry here must sum.)*

**Re-checked 2026-09-03, and one term of it moved: the `+1 agent work` is now 0.** Gate 10
was the whole of it, and it is resolved by decision this turn (narrowed, with the other half
recorded as a non-goal, plus the product change — see the struck item 2 below). So the split
is now **11 liquid + 6 items below + 0 agent work = 17 open**, and the units figure should be
**63 of 80**. Two things this turn did NOT re-derive and will not assert: the `11` for
liquid's own track-6/track-8 units, which is a count against `MAIN_V1_COMPLETION_PLAN.md`'s
track bullets and not against `LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md`; and whether the
liquid plan closing all 52 of its OWN bullets on 2026-09-03 moves that `11`. Those are
different ledgers and conflating them is exactly how this header went wrong before. **The `6`
does not move**: item 1 was re-probed live this turn and is still open (see below).

---

# 2026-09-06 (primary) — THIS FILE HAS NO USER BLOCKERS LEFT. All six are dead.

Everything below this line is kept as the record of how each one died. **Nothing in it is
owed by the user.** Re-derived live this turn against a freshly restarted main (pid 29960,
04:47:56 EDT), not inherited from any handoff or pin:

    window.api.scraperQbitTest -> { status: "connected", version: "5.2.3",
                                    message: "Connected to localhost:8080.",
                                    latencyMs: 3, authMode: "apiKey" }
    live profile `balanced`   -> enabled true, authMode 'apiKey', apiKeyRef 'qbittorent'
    scraperHasCredential      -> qbittorent true, qbit/apikey true,
                                 qbit/webui false, qbittorrent false, qbittorrent/webui false

**Item 1 is dead, and its premise was wrong rather than merely stale.** It asks the user for a
WebUI *password*. They never needed to supply one: qBittorrent 5.2.3 authenticates a
`Authorization: Bearer <APIKey>`, the key is in the vault, and the app is connected through it
right now. The ask was filed twice (2026-08-18, 2026-09-03) and was the wrong ask both times.
`qbit/webui` still reads `false` — that is a ref nothing uses, not a missing credential.
Password mode remains unexercised live, and that is a **coverage gap in `c7fa2df7`**, not a
user blocker: it is unit-covered (5 cases, mutation control fires) and no product path needs it.

**The five acquisition gates are dead as blockers too.** Attendance was lifted by the user on
2026-09-03. Gates 12, 13 and 14 closed 2026-09-05; **gate 15 closed 2026-09-06** (see
`MAIN_V1_COMPLETION_PLAN.md`, "GATE 15 CLOSES 2026-09-06"). Only **gate 11** is open, and it is
parked on what the nyaa index carries for Route A — which the user cannot change either, so it
was never a `needs-user` item under this file's own bar. The operating limits below still bind
whenever an acquisition gate is driven; they are limits, not blockers.

**Header arithmetic, re-derived this turn from each track's own bullets:** main-v1 is
**68 of 80**. T1 5/5, T2 15/15, T3 6/6, T4 9/9, T5 8/8, T6 3/7, T7 3/3, T8 0/7, T9 19/20.
The 12 open are T6's 4 + T8's 7 — both owned by `LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` by
the plan's own text — plus gate 11. **`items below` is now 0**, so the old
"11 liquid + 6 items + 0 agent" split is superseded by "11 liquid + 1 parked gate".

*Standing bar, from the relay pin: an entry belongs in this file only if no agent could do it
with the tools it has. "Needs a machine state", "needs a scope call" and "the plan says
attended" are not blockers. Re-derive before filing one and before inheriting one.*

---

## ~~1. qBittorrent WebUI credential — gate 7~~ — DEAD 2026-09-06, see the block above

Blocks gate 7 directly, and blocks gate 14 transitively (see below). Until it is
supplied, the nyaa provider stays **default-disabled**.

**What is needed from the user:** the WebUI **password** for their own running qBittorrent
client. An agent may not create it, guess it, or read it from a keychain.

**Two corrections, 2026-08-30 — the ask is narrower than this item implied.**

1. It is specifically the *password*, and only for password mode. Gate 6 already passes in
   key mode (`connected`, v5.2.3, 185 ms), and `qBittorrent.ini` on this machine carries
   `WebUI\Username=admin` and a `WebUI\APIKey`. So credential *material* exists; what is
   missing is a vault entry for the password, which `scraperHasCredential` reports as
   `false`. Reading the user's key out of their config to fill that in is exactly the
   "may not read it from a keychain" this item forbids — it stays their call, not an
   agent's. Recording that the material exists is not permission to use it.
   *(Ref corrected 2026-09-03: this used to say "the vault entry behind `qbit/webui`", as
   if that were a product constant. It is not — it is a **value**, the `passwordRef` field
   of one scraper profile, and different profiles hold different ones. Probing a fixture's
   ref instead of the live profile's is how this item has been mis-measured before.)*
2. **Gate 7 and gate 10 need mutually exclusive states** — 7 needs the WebUI *enabled*,
   10 needs it *disabled*. Nothing in this file said so, and the suggested order below used
   to put the credential first, which would have destroyed gate 10's free state before
   anyone drove it. Gate 10 was driven first on 2026-08-30 for exactly this reason. If the
   user enables the WebUI for gate 7, gate 10's re-run window closes with it.

### 2026-09-03 — ITEM 1 IS **STILL OPEN**, and a relay instruction that said otherwise was wrong

A relay prompt block dated 2026-09-03 14:45 told every worker that this item was done:
*"`scraperHasCredential('qbittorrent')` -> **true** (the WebUI password is in the OS store)"*,
and *"do not re-ask"*. **Re-derived live and it is false.** Measured against a
deliberately-restarted app (pid 58084, so main-process code was current), through the
product's own `window.api.scraperHasCredential` — the exact function that block cited:

    qbit/apikey          true      <- the API key, stored since 2026-08-19
    qbit/webui           false
    qbittorrent          false     <- the ref the block named
    qbittorrent/webui    false

Corroborated off the running app: `<userData>/credentials.dat` holds exactly one scraper
entry, `scraper.qbit/apikey`, and the file was **last written 2026-08-24** — so nothing was
added to the vault on 2026-09-03. The legacy `<userData>/scraper/credentials.json` is 19
bytes, empty since July.

**Consequences, so no later turn re-derives them:** gate 7 is not runnable; gate 14 stays
transitively blocked (see below); and **`c7fa2df7` cannot be verified live**, because that
commit fixes the *password* login path (204 accepted as success) and there is no password to
log in with. Verifying it needs this item, not another restart. Its unit coverage
(`src/main/__tests__/qbitLoginStatus.test.ts`, 5 cases, mutation control fires) is what
exists today, and that is the honest state to report.

**Do not treat "the user already did it" as settled without re-probing.** The claim survived
two handoffs. It costs one call to check.

## The attendance requirement on gates 11–15 is LIFTED — by the user, 2026-09-03

Recorded here at the user's instruction so the change is traceable and reversible rather than
silently forgotten. The rule below ("Never run unattended, and never as part of an automated
suite") was theirs; they lifted it explicitly, twice, in the same message in which they said
they are out of this thread. **The reasons it existed remain as operating limits**, and none
of them is relaxed:

1. These fetch from a public swarm on the user's own connection, subtitle-only per each
   gate's own definition. Gate 12's whole assertion is that no video file is ever requested —
   verify that against `qbitFiles()` as written; never relax it to make a gate pass.
2. Gate 13 asserts a **refusal**. Never turn a refusal into an acceptance to close a gate.
3. Gate 15 interrupts an in-flight acquisition; run it last and confirm the tidy-up happened
   rather than assuming it.
4. One gate per turn. Stop the whole track and report if anything writes outside the
   `jp-study-subtitles` category, if a video file is ever requested, or if a torrent the user
   already had is touched. Those are the harms the rule protected against and they are still
   harms.

Still true regardless: **gate 14 is blocked on item 1**, not on attendance, so lifting this
does not make 14 runnable.

## ~~2. WebUI disabled on the running client — gate 10~~ — NOT A USER BLOCKER (2026-08-30)

**Removed from this list. It was never going to need an action; it needed the state to
exist, and on 2026-08-30 it already did.** The reasoning here was sound — an agent must not
change a setting on the user's live client — but it silently assumed the client was in the
*enabled* state. It was not. Measured, not assumed, immediately before driving the gate:

    qbittorrent.exe   pid 16908, up since 2026-08-27 14:24   daemon IS running
    qBittorrent.ini   WebUI\Enabled=false (written 12:56)    WebUI IS disabled
    127.0.0.1:8080    ECONNREFUSED                           verified live, twice

Nothing was changed to produce that state and nothing was changed to measure it. The
instrument is `debug/g10-webui-disabled.cjs`, which refuses to run unless all three
preconditions hold, so it cannot silently measure something else later.

**Gate 10 was driven and it FAILS.** It is now *agent* work, not user work — see the gate
table in `MAIN_V1_COMPLETION_PLAN.md` Phase 9.2 for the full result. In short: the honest
half passes (a 4 ms `connect ECONNREFUSED 127.0.0.1:8080`, not a timeout), but the
"distinct from *not running*" clause fails — a control against port 8099, where nothing has
ever listened, returns the identical `status: "unreachable"` and the identical message shape.
The product cannot tell "daemon up, WebUI off" from "daemon not running".

**The standing caution still applies:** if the user later re-enables the WebUI, this state is
gone and gate 10 goes back to needing them. Re-verify the three lines above before any
re-run — the probe does this itself and exits 2 rather than measuring the wrong thing.

**2026-09-03 — that window is now CLOSED, and gate 10 is RESOLVED BY DECISION rather than by
a re-run.** The WebUI was enabled on this machine on 2026-09-03, so the disabled sub-case can
no longer be produced here; `debug/g10-webui-disabled.cjs` will now correctly exit 2. That is
spent, not lost: the gate was already driven on 2026-08-30 and failed deterministically. The
scope decision it needed was taken this turn — the gate is **narrowed** to its achievable
half and the "distinct from *not running*" half is a recorded **non-goal**, with reasoning in
`MAIN_V1_COMPLETION_PLAN.md` Phase 9.2. The product half landed with it
(`qbitTransportMessage`). Gate 10 needs nothing from the user and nothing further from an
agent.

## ~~The five attended acquisition gates — 11, 12, 13, 14, 15~~ — NOT BLOCKERS since 2026-09-03

**Attendance lifted by the user 2026-09-03. 12, 13 and 14 closed 2026-09-05; 15 closed
2026-09-06.** Only gate 11 is open and it is parked on index contents, which no human here can
change either. Kept below because the numbered gate texts are still the definitions the plan
scores against, and because points 1–4 of the operating limits are limits on how an agent
drives them, not reasons to wait for a person.

*(Headed "3–7" until 2026-08-30. The numbering was dropped rather than renumbered when item 2
left the list: these are five of the six remaining items, and the gate numbers below are the
stable identifiers — nothing should reference them by position in this file.)*

`MAIN_V1_COMPLETION_PLAN.md` Phase 9.3: *"These download from a public swarm on the user's
connection. **Never run unattended, and never as part of an automated suite.**"*

11. **Route A** — a subtitle-only release under the 50 MB ceiling is taken whole, lands as a
    `SubtitleRecord`, and its cues render in the player through the same path a Jimaku
    subtitle takes.
12. **Route B** — a batch release fetches only subtitle files by per-file priority with
    everything else set to skip; verified against `qbitFiles()` that no video file was ever
    requested.
13. **Interleaved embedded track** — a single-file MKV is refused rather than partially
    fetched.
14. **Pre-existing torrent** — the "don't touch a torrent the user already has" rule holds
    when the target hash is already in the session, against a real pre-existing torrent,
    not a fixture.
15. **Interruption** — interrupting an in-flight acquisition leaves no half-registered
    `SubtitleRecord` and no orphaned torrent in the `jp-study-subtitles` category.

### Gate 14 is additionally blocked, and this was measured, not assumed (2026-08-19)

It was nominated as the one of 11–15 needing no swarm traffic. It needs no swarm, but it
does need a real pre-existing torrent that the product's own listing will hand to
`nyaaFetchAll` — and there is none. Cross-matched every real transfer against a live
`scraperSearchTorrents` (`debug/g14-live.cjs`): **7 transfers, 3 carry an infohash nyaa also
returns.** Of those 3 the listing drops 2 before they are candidates at all — `The Big O`
(6 title-matched, all 6 dropped `shape`) and `Date a Live II` (5 matched, 2 muxed + 3 shape,
0 candidates) — and the 1 that survives, `07ea0e8a…`, sits in `jp-study-subtitles` and is
therefore the **`adopted`** branch by construction, the opposite of what gate 14 asserts.
So **0 of 7** can drive it.

Staging one is not available either: the app's own add always writes `jp-study-subtitles`,
and putting a torrent anywhere else — or moving that one out — needs the WebUI credential
that **item 1** is blocked on. A paused magnet cannot substitute: with no metadata the run
never reaches the priority check.

**So item 1 unblocks item 14.** Doing the credential first is worth more than its own gate.

---

## Suggested order for the user

Revised 2026-08-30. Item 2 is gone (driven, see above), and the old step 2 is why the order
had to change: enabling the WebUI for item 1 is a **one-way door** for gate 10.

1. **Item 1** (WebUI password) — cheapest, and it unblocks gate 14 as well as gate 7.
   Do gate 10's re-run, if one is ever wanted, *before* this — enabling the WebUI closes it.
2. **Items 11, 12, 13, 15** — attended acquisition runs, sat with while they download.
   All four are magnet-based, so all four touch a public swarm; 13 was re-checked on
   2026-08-30 and is **not** cheaper than the others, despite looking like a pure refusal.
   The "muxed" drops visible in the gate-14 measurement come from `declaresMuxedSubtitles`
   (`subtitleNyaa.ts:486`), a regex over the release *name* — a listing-time drop needing no
   swarm at all. Gate 13 is the *post-metadata* refusal over a real file list, and
   acquisition hands qBittorrent a **magnet** (`subtitleNyaaSource.ts:388`), which carries no
   file list. Metadata must come from the swarm. Do not re-derive this.
3. **Item 14** — once item 1 has made a non-`jp-study-subtitles` torrent stageable.

## What agents must NOT do with these

Do not run 11–15 unattended or inside a suite. Do not supply, guess or synthesise the
credential. Do not change settings on the user's live qBittorrent client. Do not substitute a
fixture for the real pre-existing torrent in gate 14 — the gate's whole content is that it is
real. Recording a blocker here is the correct outcome; quietly working around one is not.
