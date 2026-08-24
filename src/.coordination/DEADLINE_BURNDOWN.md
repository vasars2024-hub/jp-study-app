# Deadline burn-down — hard target 2026-09-01, full scope

One line per turn, appended, machine-countable. Shape:

    <ISO date> | <plan> | units done this turn: <n> | units left: <n> | basis: <the authority you counted> | projected finish: <ISO date or UNKNOWN>

`units left` counts against the plan's OWN authority — mal-pipeline: the gate table in
`src/MAL_ANIME_PIPELINE_PLAN.md`; liquid: the `Gate:` lines in section 11 of
`src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md`; main-v1: the last `##` section of
`src/MAIN_V1_EVIDENCE_LEDGER.md`. A number not re-counted this turn is written
`INHERITED <n>`, never as a measurement.

2026-08-24 | mal-pipeline | units done this turn: 0 | units left: 2 | basis: `src/MAL_ANIME_PIPELINE_PLAN.md` gate tables re-read — 34 numbered gates, open are 31 (attended Route A + cues rendering in the player) and 34 (the four full gates at the end); the plan's own last three entries agree at 32 of 34 | projected finish: UNKNOWN

Why UNKNOWN and not a date, 2026-08-24: gate 34 is one turn once 31 closes, so the whole
projection is gate 31, and gate 31 is not rate-limited — it is blocked on data outside this
repo. Two independent halves, both measured, neither an agent decision: (a) Route A's
subs-only pack — 1 candidate in 99 titles ascending, 8 of 60 descending, and every
seed-healthy one eliminated on language or fallen below `minSeeders`; (b) the render leg
needs an owned video for a title on the user's MAL completed list, and the census of
2026-08-24 shows the only anime series in the library, The Big O, appears **0 times** in
that 1,426-row list. Dividing 2 gates by a units-per-hour rate would produce a date that
means nothing. The turn's product rate, for whoever wants one: 2 commits, ~430 lines of
non-test product source, in ~50 minutes.


2026-08-24 | mal-pipeline | units done this turn: 0 | units left: 2 | basis: `src/MAL_ANIME_PIPELINE_PLAN.md` gate tables re-read this turn — 34 numbered gates, open are 31 and 34 | projected finish: UNKNOWN

2026-08-24 | main-v1 | units done this turn: 0 | units left: 35 | basis: RULE 1 re-count, per-track against each track's own authority (see below) | projected finish: 2026-11-28

**RULE 1 discharged — main-v1 re-counted, first time in days.** Unit = one bullet/gate/phase
against the track's own authority, not a keyword sweep. Last mention wins, as the ledger's own
method note requires.

| track | unit | total | closed | authority |
| --- | --- | --- | --- | --- |
| 1 credentials/provider | plan bullet | 5 | **5** | ledger 2026-08-20 split table + `687681bf` closing the health-read gap |
| 2 Lexicon Workbench | plan bullet | 15 | **UNMEASURED** | no turn has ever bullet-counted it; **zero** `Track 2` mentions in the ledger after line 26,000 (last is 2026-08-15) |
| 3 AI Agent | "Still required" bullet | 6 | **6** | ledger 2026-08-22 `1ac943ed` |
| 4 Reading workspace | plan bullet | 9 | **9** | split table (8) + 2026-08-20 detail-drawer partial |
| 5 ReadingLens | checkpoint bullet | 8 | **8** | ledger 2026-08-22 status correction |
| 6 Media/Liquid pilot | plan bullet | 2 own + 5 delegated | **2** | split table + 2026-08-20 shell bullets; the 5 deferred ones ARE Track 8 and are not counted twice |
| 7 remaining | substantive bullet | 3 | **2** | plan's own "Done 2026-08-19"; open = the Anki Deck Workbench acceptance gates |
| 8 Liquid | phase L0–L12 | 13 | **1** | `Gate:` lines in section 11 of the Liquid plan |
| 9 qBittorrent | gate | 20 | **13** | ledger 2026-08-19 re-derivation: 13 of 15 non-attended; 7 and 10 need the user; 11–15 attended |

**46 of 66 measured units closed = 70%.** Track 2's 15 bullets are excluded from both sides
because they are unmeasured, not because they are done; counting them fully open gives **46 of
81 = 57%**. So the honest band is **57–70** and the entire width of it is Track 2. `pct` is set
to **57**, the reading that refuses to claim an unmeasured track — a 1-point downward correction
from the inherited 58, which turns out to have been close by luck rather than by counting.

**Ladder consequence, and it is the point of doing this.** Track 2 sits at position 2 in the
plan's own dependency order, ahead of 3–9. Every track after it has been re-derived and Track 2
has not. So main-v1's next depth-first slice is **measuring Track 2**, not more Track 8.

**Why 2026-11-28 and not the target.** Arithmetic, per Rule 0. 20 measured-open units, of which
**12 are Track 8's Liquid phases** and they dominate. Measured rate for that unit: liquid opened
2026-08-16 and holds **1 of 13** phases on 2026-08-24 — 1 phase / 8 days = 0.125/day. 12 phases
at the only rate ever observed for them is **96 days**, i.e. 2026-11-28. The other 8 units are
faster (Tracks 1/4/5/6 closed ~21 units in the 3 days to 2026-08-22, ≈7/day at three workers)
but they are not the constraint. Two caveats stated rather than used to shave the date: L0 was
the heaviest phase, and much of that window went to rubric scoring inside L1 rather than to
closing phases — so the rate may improve once L2 lands. It has not yet, and a projection may not
borrow from a rate nobody has measured. **This misses 2026-09-01 by roughly 12 weeks, and Track 8
is the whole reason.**

2026-08-24 | mal-pipeline | units done this turn: 0 | units left: 2 | basis: `src/MAL_ANIME_PIPELINE_PLAN.md` gate tables re-read this turn — 34 numbered gates, open are 31 and 34; two product commits (`09a31e5a`, `3bc796d1`) closed gate 31's stored-record-to-player-state leg but not the gate | projected finish: UNKNOWN

Gate 31's remaining work is now located, so the UNKNOWN is narrower than it was. Two things are
left in it and only one is agent work. (a) The painted overlay: this profile's Media Center video
stage reads `workspace`, mounts no `<video>`, and says so on screen, so the surface that must paint
cues is `src/media/`'s VideoCoreStudyOverlay — whose downloaded-track mount effect is still ~430
lines of uncommitted worktree state with no HEAD base. That is one slice, and it is the next one.
(b) An acquisition for a title that is **on the user's MAL completed list**: The Big O is not on it
(1,426 rows, 0 matches), so the render leg can be shown on owned media but gate 31's "from a MAL
page" clause cannot, and Route A has produced no usable candidate in 160 titles surveyed. (b) is
data-blocked, not effort-blocked, so no rate divides into it. mal-pipeline's finish is gated on (b)
and stays UNKNOWN rather than being given the date that would look best.

2026-08-24 | mal-pipeline | units done this turn: 0 | units left: 2 | basis: the gate tables in src/MAL_ANIME_PIPELINE_PLAN.md, re-counted this turn (open: 31, 34) | projected finish: UNKNOWN
Basis note. `566c6d97` closed gate 31's LAST engineering unit — the render seam. Measured, not
asserted: `externalStudyTrackSplit.test.ts` runs **3 failed / 6 passed at `5155de41`** and **9
passed at `566c6d97`** in a detached worktree, and `media:subtitleForPath` live returns 267 events
on track 1 for the user's own `The Big O - 01`. Gate 31 does not close because its remaining half
needs an acquisition for a title that is BOTH on the user's MAL completed list AND has a video they
own — The Big O is owned but absent from all 1,426 list rows, and Route A has found no seed-healthy
candidate in 160 titles. That is data-blocked; no engineering rate divides into it, so the projected
finish stays UNKNOWN rather than taking the date that would look best. Gate 34 (full gates once at
the end) is ~15 minutes whenever 31 resolves.

2026-08-24 | mal-pipeline | units done this turn: 0 | units left: 2 | basis: the gate tables in src/MAL_ANIME_PIPELINE_PLAN.md, re-counted this turn (open: 31, 34) | projected finish: UNKNOWN
Second line this turn, same count on purpose: `d16547cc` fixed a defect `566c6d97` introduced, so
no unit moved. The engineering half of gate 31 is now done twice over; the half that is left needs
an acquisition for a title BOTH on the user's MAL completed list AND with a video they own, which
no rate divides into. Recorded for gate 34: this branch is **3 tests red at HEAD** in a clean
worktree (another track's uncommitted i18n work), and the shared tree is **1 test red** for the
mirror reason. Gate 34 must name the tree it ran in.

2026-08-24 | mal-pipeline | units done this turn: 0 | units left: 2 | basis: the gate tables in src/MAL_ANIME_PIPELINE_PLAN.md, re-counted this turn (open: 31, 34) | projected finish: UNKNOWN
No unit moved, and the honest reason changed shape rather than shrinking. The previous four turns
recorded gate 31 as data-blocked; that was wrong. A MAL-listed video has been on disk since gate 33
(Date A Live II OVA, 109,855,988 B) and the matching pair for the acquired Route B cues is JoJo
Part 5 (MAL 37991, on the completed list, 39 episodes of .ass already fetched). What actually
blocks the attended run is that **qBittorrent is not running** — `unreachable`,
`connect ECONNREFUSED 127.0.0.1:8080`, 11 ms, measured through the product. That is machine state,
not engineering, so no rate divides into it and the projection stays UNKNOWN rather than taking a
flattering date. Gate 34 is ~15 minutes once 31 resolves. Product code landed: 9dc2b8ca.

2026-08-24 | mal-pipeline | units done this turn: 0 | units left: 2 | basis: the gate tables in src/MAL_ANIME_PIPELINE_PLAN.md, re-counted this turn (open: 31, 34) | projected finish: UNKNOWN
No gate closed, and the reason is worth more than a unit. The last four turns treated gate 31 as
data-blocked, then as daemon-blocked. Both were wrong. qBittorrent was simply not started — started
it, and the product answers `connected`, 5.2.3, 3 ms. What was actually missing was a PRODUCT STEP:
the acquisition pipeline had no route from a finished transfer into the media library, so no
acquired episode could ever carry a SubtitleRecord and gate 31's render clause was unreachable by
construction, not by data. Landed as `45442f2f` (media:addAcquired + Add to library), verified live
with three refusing negative controls and an idempotence check; library 33 -> 34. Gate 31 still
needs its pair: the OVA is MAL's own "Date A Live II Episode 11" and jimaku 2823 carries E01-E10
only, so JoJo Part 5 (39 .ass on disk) is the pair and it needs one episode's VIDEO. That is one
named, sized transfer over a public swarm whose duration no rate divides into, so the projection
stays UNKNOWN rather than taking a flattering date. Gate 34 is ~15 min once 31 resolves.

2026-08-24 | mal-pipeline | units done this turn: 0 | units left: 2 | basis: the gate tables in src/MAL_ANIME_PIPELINE_PLAN.md, re-counted this turn (open: 31, 34; gate 29's HALF OPEN table row is stale prose — its own 2026-08-16 "GATE 29 CLOSES" entry closes it) | projected finish: 2026-08-25
No gate closed, and for the first time the reason is a stopwatch rather than an unknown. Gate 31's
transfer is NAMED, SIZED and RUNNING: [Anime Land] JoJo no Kimyou na Bouken - Ougon no Kaze 38
(WEBRip 720p Hi444PP AAC) RAW [A95B628C].mp4, 541,379,789 B, 13 seeders, the smallest of 11 rows
(the other four candidates are 12-64 GB batches). scraperQbitSend -> sent 1 / skipped 0 / failed 0.
At turn end 8.9%, 2 of 13 seeds connected, ETA ~85 min; qBittorrent keeps downloading between
turns, so this costs wall clock and not agent hours. Product code landed: 27564082, and it is the
reason this turn was not wasted waiting. parseMediaFileName read that exact release as
episode: null with 38 welded onto the title, so planSubtitleAttach would have skipped the
harvested episode-38 cues as no-match -- the pipeline would have downloaded an episode it could
not pair. Fixed and measured live: 0 pairs -> 1 pair. Also measured, on the file the player will
actually mount rather than on episode 01: 36,543 raw cues -> 712 kept, JOJO5_textch gone,
JOJO5_textjp kept, 99.2% of the kana retained, 1 cue on screen at t=667.59 s instead of 2.
Rate for the projection: this plan has closed 32 gates since 2026-08-15 across ~9 productive days
at 2 workers, i.e. ~3.6 gates/day, but the two that remain are not average gates -- 31 is one
swarm plus ~15 agent-minutes and 34 is ~15 agent-minutes. 2 / 3.6 = under a day, so the field above
is 2026-08-25 -- that is the arithmetic and it is not padded. The risk it does NOT price, stated
here rather than hidden in the number: gate 31 has been re-opened five times by candidates that
did not deliver, and if this swarm stalls the same way, the projection moves out by however long
the next candidate takes. That would be a slip to report, not a date to pre-book now.

2026-08-24 | mal-pipeline | units done this turn: 0 | units left: 2 | basis: the gate tables in src/MAL_ANIME_PIPELINE_PLAN.md, re-counted this turn (open: 31, 34) | projected finish: 2026-08-25
Supersedes the line above it, same turn, after the fallback transfer completed. Still 0 units, and
the honesty matters more than the round number: gate 31 wants Route A AND Route B, and what ran end
to end today is ROUTE B. Route A -- a standalone sub-pack whose cues are Japanese -- is untouched
and is the whole remaining leg. But this is the first acquired-to-screen run the plan has ever had:
library 34 -> 35 via media:addAcquired, 39 harvested files planned to 1 pair / 38 honest no-match,
attach ok, and media:open's OWN pickPlaybackSubtitle choosing the attached .tc_jp.ass so the player
mounts 675 of 36,427 cues with exactly one on screen at t=667.59 s -- JOJO5_textjp, 7 kana, not the
Chinese track. Product code: 27564082 and 9b0245a5, both the same defect class caught before its
bytes landed rather than after. The first transfer (episode 38, the smallest row) stalled at 9.86%
on 0 B/s; the next-smallest (episode 39-END, 574,095,360 B, 14 seeders) was named, sized, sent and
ran at 2.29 MB/s. Projection unchanged at 2026-08-25 by the same arithmetic -- 2 units at ~3.6
gates/day -- and it is now better supported than when it was written, because everything gate 31
needs except a Japanese sub-pack has been exercised live in one process.

2026-08-24 | mal-pipeline | units done this turn: 0 | units left: 2 | basis: the gate tables in src/MAL_ANIME_PIPELINE_PLAN.md, re-counted this turn (open: 31, 34) | projected finish: UNKNOWN
Worker `backup`. Zero units, and the projection is deliberately UNKNOWN rather than the 2026-08-25
the last two lines carried. That date divided 2 remaining gates by this plan's lifetime average of
~3.6 gates/day. Gate 31 is not an average gate and the arithmetic has now been wrong for two
turns: its Route A leg needs a *standalone Japanese subtitle pack with live seeders* to exist on
nyaa for a title in this user's library, and that is not a rate this relay controls. Measured
against it today: 984 previously-surveyed sidecar rows re-read under a widened ceiling produced
**0** new candidates (only 9 of 984 are under 150 MB at all); a fresh band of 24 titles produced
**A:0** on every one; and the one row the earlier survey did record at 3 seeders (Maison Ikkoku,
0.7 MB) is no longer on the live index at that seeder floor. Gate 34 is ~15 min once 31 closes.
So the honest statement is: gate 34 is a day's work and gate 31 is blocked on external swarm data
that six turns of hunting have not turned up. If the next two bands (84-120, ~36 titles) also
return A:0, this plan should say so as a *finding* — the pipeline works and this library has no
Route A release — rather than keep pre-booking a date. Product code landed either way, which is
what makes the turn not a waste: 15b82df8 (a season pack of subtitles could not be classified as
a pack, measured on the 87.80 MB pack the plan itself renders from) and b74925a8 (two real
subs-only releases the name reader could not see, both from the user's own completed list).

2026-08-24 | mal-pipeline | units done this turn: 0 | units left: INHERITED 2 | basis: last turn's count of the gate tables in src/MAL_ANIME_PIPELINE_PLAN.md (open: 31, 34); this turn re-derived only that 31 is open, from its wording at line 413 | projected finish: UNKNOWN
Worker `primary`. Zero gates, two product defects, and the projection stays UNKNOWN for the same
reason it was set there last turn: gate 31 Route A waits on a standalone Japanese subtitle pack
with live seeders existing on nyaa for a title in this library, which is not a rate this relay
controls. What changed today is *why* that is not yet a data-blocked finding. Pointing the manual
dialog at the item this plan itself created found the surface asking the wrong question twice:
a stored episode range narrowed the query to one release (1 -> 9 releases matched after
`b7207748`), and the dialog searched a single name while the harvest panel has walked four since
February (1 -> 4 names after `ad142237`, measured on MAL 22961; still 1 on an item with no MAL
row, the control). The interrupted survey band did finish -- titles 84-91, A:1, and that one hit
is a *movie's* storyboard subtitles for a work this library owns no video of, so the usable total
across every surveyed title is still 0. The next slice is product code, not a seventh band:
`media:addAcquired` writes `malId: null`, so the alias walk just built cannot reach the JoJo
`黄金之风` pack -- the one Japanese sub-pack this library is known to have. Fixing that is a
cheaper shot at Route A than surveying 36 more titles, and it is worth exactly one turn before
this plan writes Route A up as data-blocked.

2026-08-24 | mal-pipeline | units done this turn: 0 | units left: INHERITED 2 | basis: last turn's count of the gate tables in src/MAL_ANIME_PIPELINE_PLAN.md (open: 31, 34) | projected finish: UNKNOWN
Worker `primary`, same turn, superseding the line above with what the third slice measured. Three
commits, one defect class, three sites: the provider searches (`b7207748`), the alias reach
(`ad142237`) and the metadata lookup that writes `malId` (`f7c118c1`). The chain is what matters
-- a file this app downloads itself was `metadataSource: unmatched`, so it had no `malId`, so it
had no aliases, so its listing asked one narrowed question and returned nothing. After: matched 1,
malId 37991, 4 altTitles, and `listNyaaSubtitles` on that item goes **0 -> 4 candidates**. Route A
is still open and still has **0 sub-packs**; the projection stays UNKNOWN for the same honest
reason as the last three lines. What changed is that "no Route A candidate exists" is now a
statement about the index rather than about three defects in the surface asking it, which is the
precondition for ever writing Route A up as data-blocked.

2026-08-24 | mal-pipeline | units done this turn: 0 | units left: 2 | basis: RE-COUNTED this turn from the gate tables in src/MAL_ANIME_PIPELINE_PLAN.md (open: 31, 34) | projected finish: UNKNOWN
Worker `primary`. Two product commits (`f009c2cb`, `6ced09cc`) and a retraction. Neither gate
closed, and the honest reason is worth more than the zero: **gate 31 Route A is blocked by the
public index, not by this codebase.** The last three entries chased "the standalone 87.80 MB
sub-pack"; asked directly, `JOJO 黄金之风 外挂字幕` returns 2 rows, both multi-gigabyte batches —
the 87.80 MB is a subfolder INSIDE the DBD-Raws batch, which is why 2026-08-18 is recorded as Route
B. The asymmetry that was supposed to reveal it is now closed and both surfaces return byte-
identical listings (4 candidates, all `batch-sidecar`, top row 46,899.2 MB / 11 seeders / score 41).
Across ~160 surveyed titles plus three untargeted index queries there are 2 `sub-pack` hits total,
one Arabic and one a movie's storyboards; the only real Japanese sub sources on the index are
Kitsunekko whole-site archives at 4,403.2 MB / 2 seeders and 5,836.8 MB / 8 seeders, 29-39x the
150 MB pack ceiling. `projected finish: UNKNOWN` is arithmetic, not pessimism: 1 of the 2 open
units has no agent-reachable rate at all, because no amount of agent time makes a torrent exist.
Gate 34 (the four full gates) is the other open unit and is a one-turn close the moment the shared
tree's inherited red clears — see the handoff.
