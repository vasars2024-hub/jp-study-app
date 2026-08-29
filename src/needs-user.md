# needs-user.md — work that no agent may or can do

Created 2026-08-24 by an interactive session. **This file was referenced by six places in
four plan docs and did not exist** (`ANKI_DECK_WORKBENCH_PLAN.md:270,309`,
`LIQUID_UI_RUBRIC.md:173`, `LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md:425`,
`MAIN_V1_COMPLETION_PLAN.md:752,881`), so the external blockers it is supposed to hold had
no home. Content below is consolidated from `MAIN_V1_COMPLETION_PLAN.md` Phase 9.3 and its
2026-08-19 gate-14 measurement. **Workers: keep this file current — it is the canonical
place, and an entry here is what makes a unit "complete-except-external" for ladder
purposes.**

Status as of 2026-08-24: main-v1 is at 61 of 80 track-bullet units. Of the 19 open,
11 are plan (3) liquid's own work and **7 are the items below**. There is **zero remaining
agent work on main-v1 itself** — these seven are the only thing standing between main-v1 and
done, apart from liquid.

---

## 1. qBittorrent WebUI credential — gate 7

Blocks gate 7 directly, and blocks gate 14 transitively (see below). Until it is
supplied, the nyaa provider stays **default-disabled**.

**What is needed from the user:** the WebUI credential for their own running qBittorrent
client. An agent may not create it, guess it, or read it from a keychain.

## 2. WebUI disabled on the running client — gate 10

Gate 10 asserts the product's behaviour when the qBittorrent WebUI is *disabled*. That is a
setting on the user's own live client, which an agent must not change.

**What is needed:** the user disables the WebUI on their running client, and says so, so the
gate can be driven once against that state.

## 3–7. The attended acquisition gates — 11, 12, 13, 14, 15

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

1. **Item 1** (WebUI credential) — cheapest, and it unblocks gate 14 as well as gate 7.
2. **Item 2** (WebUI disabled) — a setting toggle plus one driven gate.
3. **Items 11, 12, 13, 15** — attended acquisition runs, sat with while they download.
4. **Item 14** — once item 1 has made a non-`jp-study-subtitles` torrent stageable.

## What agents must NOT do with these

Do not run 11–15 unattended or inside a suite. Do not supply, guess or synthesise the
credential. Do not change settings on the user's live qBittorrent client. Do not substitute a
fixture for the real pre-existing torrent in gate 14 — the gate's whole content is that it is
real. Recording a blocker here is the correct outcome; quietly working around one is not.
