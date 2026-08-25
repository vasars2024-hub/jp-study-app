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

2026-08-24 | mal-pipeline | units done this turn: 1 | units left: 1 | basis: RE-COUNTED this turn from the gate tables in src/MAL_ANIME_PIPELINE_PLAN.md (gate 34 closed this turn; open: 31 only) | projected finish: UNKNOWN
Worker `primary`. Commits `e4955e3d`, `f74e22e5`. **Gate 34 CLOSED**: the four gates run once at
committed HEAD `410d3376` in a detached worktree — vitest 769 files / 2 failed / 3 tests failed,
i18n EXIT 0 (10,620), architecture EXIT 0 "Nothing new", eslint over the 31 non-test paths any
mal-pipeline commit ever touched **2 errors → 0** after `e4955e3d`. All 3 vitest reds attributed and
none ours: 1 junction `fs.allow` artefact, 2 inherited i18n ratchets whose offender files were last
committed 2026-07-13 … 2026-08-11, before this plan existed.

Gate 31 is the last unit and its Route A leg **moved for the first time in seven turns**. The
recorded blocker — "whole-site archives … are not per-title", 39× the ceiling, ~5.8 GB — was two
inferences from a release NAME. A metadata handshake (10 s, **0 bytes downloaded**) says the
Kitsunekko archive is **28,748 files across 1,871 title folders**, and JoJo Part 5's folder is **39
files / 1.25 MB**. `f74e22e5` lands the `sub-archive` route that can address it.

`projected finish: UNKNOWN` stays honest but for a different reason than the last four lines: gate
31 is no longer "no amount of agent time makes a torrent exist". It is now one wiring slice (an
archive-scoped query in the harvest alias walk) plus one attended 1.25 MB acquisition. Two units of
measured work landed in ~75 min this turn, but a rate over a single turn is not a rate, and gate 31
still ends in an attended live transfer whose duration is a swarm's to decide. First real projection
belongs to the turn that runs it.
2026-08-24 | mal-pipeline | units done this turn: 1 | units left: 0 | basis: RE-COUNTED this turn from the gate tables in src/MAL_ANIME_PIPELINE_PLAN.md — gate 31 was the only one open after 23dc6980 closed 34; both its legs now render | projected finish: 2026-08-24 (DONE)
Worker `primary`. Commits `2e07b176`, `377ba15e`. **THE MAL PIPELINE PLAN IS FINISHED: 34 of 34
gates**, counted from this file's own gate tables and confirmed against the tree. Gate 31 needed
Route A *and* Route B ending in cues on screen; Route B closed earlier today at `9b0245a5`, and
Route A closed this turn out of the Kitsunekko archive — **39 of 28,748 files, 1.25 MiB, one
folder, 486 cues mounted, 1 cue on screen at t=727.393 s with 2 kana and 0 Han**.

Two product defects stood in the way and both were found by RUNNING the route, not by reading it:
a 4 MiB response cap that truncated the 5,375,038 B file list and reported it as malformed
(`2e07b176`), and a folder narrowing that kept the union of five JoJo folders and let a
format-majority vote across four different works discard the right one (`377ba15e`). The second
had already downloaded **48 files / 8.29 MiB of the wrong series**, numbered 1..48 and one attach
away from being rendered over Part 5. That is the exact shape this plan's standing constraints
call a rig, and it was caught because the run was measured file by file rather than counted.

**Rate, first real one for this plan.** 2 gates in ~2 productive hours across two turns today
(gate 34 last turn, gate 31 this turn), at 2 workers. mal-pipeline contributes **0** to the
remaining deadline load. What is left for 2026-09-01 is main-v1 (still INHERITED at 58 %, never
re-counted — RULE 1 remains overdue and is now the top of the ladder) and liquid. Neither has a
measured rate, so the whole-programme projection stays **UNKNOWN** and it would be dishonest to
write 2026-09-01 merely because it is the date that was asked for.

2026-08-24 | main-v1 | units done this turn: 1 | units left: 19 | basis: RE-COUNTED against the plan's own track bullets (T1 5/5, T2 15/15, T3 6/6, T4 9/9, T5 8/8, T6 3/7, T7 3/3, T8 0/7, T9 13/15 non-attended + 0/5 attended) = 80 units, 61 done, 76% | projected finish: 2026-08-24 for main-v1's own agent work

**The 58 % was wrong and the shape of what is left is the real news.** 76 %, not 58 % — but the
useful number is not the percentage. Of the **19 open units, exactly ZERO are now agent-work on
this plan**. They split three ways and none of them is main-v1's to do:

- **11 are plan (3)'s.** Track 6's four deferred Liquid-Video-pilot bullets and all seven of
  Track 8 are executed by `LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` and close there, by that
  plan's own text at Track 6's checkpoint and Track 8's heading.
- **7 are external-blocked.** Track 9's gates 7 and 10 need the user's WebUI password and their
  own client's WebUI disabled; gates 11–15 are the attended set. All already in `needs-user.md`;
  Track 9's own exit condition calls it complete-except-external.
- **1 was Track 2's find-in-the-wild**, and it closed this turn.

**So main-v1 is complete-except-external and complete-except-Liquid.** Under the ladder that means
the next turn opens on plan (3), liquid — not because main-v1 was abandoned, but because every
remaining unit of it is either the Liquid plan's own work or a human's.

**Rate.** 1 unit in ~1.6 productive hours, but that unit was a whole product slice (4 commits,
~880 lines, live-verified) plus the re-count itself, so it is not a rate to extrapolate from.
main-v1 contributes **0** to the remaining deadline load. What is left for 2026-09-01 is
**liquid alone**, which still has no measured rate — its own authority is the `Gate:` lines in
section 11 of its plan and nobody has counted them since the pin was written. **Projected finish
for the programme: UNKNOWN**, and it stays UNKNOWN until liquid is counted. Writing 2026-09-01
here would be the one forbidden outcome.

2026-08-24 | liquid | units done this turn: 0 | units left: 10 | basis: RE-COUNTED this turn — 13 `Gate:` lines in section 11 of src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md (L0–L12); CLOSED are L0 (baseline + parity ledger exist, its own progress note), L2 (primitives measured in isolation, L2_PRIMITIVES.md's two entries) and L3 (byte-for-byte round trip driven live, 79/79, L3_PRESENTATION.md); L1 and L4–L12 are open | projected finish: 2026-09-20

**RULE 1 for liquid is discharged: 3 of 13 gates, counted from the plan's own `Gate:` lines.**
The rate that projection uses, and it is arithmetic rather than ambition: all three closures
landed on **2026-08-17**, and the seven days since have closed **zero**. Over liquid's whole life
(2026-08-16 → 08-24, 8 days, 2 workers) that is **0.375 gates/day**; 10 gates ÷ 0.375 = **26.7
days → 2026-09-20**. Using only the last seven days' rate the projection is infinite, so 09-20 is
the generous reading, not the pessimistic one.

**Against the 2026-09-01 target that is a ~19-day slip, and the pin says to say so rather than
descope.** main-v1 contributes 0 (complete-except-external / complete-except-Liquid) and
mal-pipeline is 34 of 34, so **liquid alone is the programme's remaining load and 2026-09-20 is
the programme's projected finish.**

Why zero gates closed this turn despite three product commits: L1's gate is 80/80 on **two**
reference apps and the Dictionary surface's category 7 is capped by a real defect. This turn
halved that defect (D2: +2,433 handles/cycle → +1,212) rather than closing it, so the gate did
not move. Product landed: `fb4d59aa`, `1c874da9`, `ebc88b40`.

2026-08-24 | liquid | units done this turn: 0 | units left: INHERITED 10 | basis: the 13 `Gate:` lines in section 11 of src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md re-grepped this turn and still 13; WHICH three are closed (L0, L2, L3) is inherited from the 2026-08-24 backup turn and was NOT re-derived here | projected finish: 2026-09-23

**Zero gates again, and the honest reason.** L1's gate is 80/80 on Video *and* Dictionary, and
Dictionary is capped by category 7 leg 3. This turn landed four product commits at that cap
(`3729e45c`, `7af7f8db`, `b4e4113b`, `45cb990d`) and re-drove the measurement — and the headline
number **did not move**: cycle 2 cost +1,221 handles against the pre-fix +1,212. That is reported
as a non-improvement rather than dressed up. `L7_PERF_DICTIONARY.md` carries the arithmetic for
why (the probe's 390 s inter-cycle gap is longer than the 60 s base grace, so it measures the
unfixed path by construction) and the falsifiable prediction that cycle 3 costs ≈0.

**Rate, recomputed rather than carried.** Liquid's three closures all landed 2026-08-17. Over its
whole life — 2026-08-16 to 2026-08-24, 9 days, 2 workers — that is **3 gates, 0.333/day**. Ten
gates ÷ 0.333 = **30 days → 2026-09-23**, a one-day slip on the previous turn's 09-20 because
this turn added a day and no gate. main-v1 contributes 0 (complete-except-external /
complete-except-Liquid, re-counted 61 of 80 units at 15:52) and mal-pipeline is 34 of 34, so
**liquid alone is the programme's remaining load and 2026-09-23 is the programme's projected
finish** against the 2026-09-01 target — a **~22-day slip**. Stated, not descoped.

**The rate is being dragged by one structural fact worth naming for whoever reads this next:**
L1's gate needs 80/80 on *two* reference apps and only one has ever been scored, so the single
open gate nearest to closing is worth roughly two surfaces of work. Nothing here proposes cutting
it — but a burn-down that counts L1 as one unit is understating it, and that is why the projection
should be read as a floor.

2026-08-24 | liquid | units done this turn: 0 | units left: 10 | basis: the 13 `Gate:` lines in section 11 of src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md, re-counted this turn (`grep -c '^Gate:'` = 13, 3 closed 2026-08-17) | projected finish: 2026-09-23

**Re-counted, not inherited: 13 gates, 3 closed, 10 open.** No gate closed this turn, so the rate
is unchanged — 3 gates over 2026-08-16..2026-08-24 (9 days, 2 workers) = **0.333/day**, and
10 ÷ 0.333 = 30 days → **2026-09-23**, a **~22-day slip** against the 2026-09-01 target. main-v1
contributes 0 (complete-except-external, 61 of 80, last measured 2026-08-24 15:52) and
mal-pipeline is 34 of 34, so liquid alone remains the programme's load and its date is the
programme's date. Stated, not descoped.

**Why a turn with three landed commits moves the gate count by zero, since that reads oddly.**
Liquid's gates are per-PHASE, not per-defect: L1's requires 80/80 on two reference surfaces and
L4/L6/L7 each require a whole phase. Category-8 defect fixes are the work those gates are made
of, and this turn landed three of them (`201db2d2`, `6b53d0e`, `b6f1cd6b`), but a gate only turns
over when its last category does. The honest reading is that the 0.333/day rate already prices
this in — it was computed over nine days that also contained work like this.

2026-08-24 | liquid | units done this turn: 0 | units left: 10 | basis: the 13 `Gate:` lines in section 11 of src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md (`grep -c '^Gate:'` = 13), re-counted this turn AND each closure re-derived rather than inherited — L0 (plan line 464, "L0's gate having closed the same day"), L2 (`L2_PRIMITIVES.md:50`, "L2's gate is … which the above meets", plus its later "L2's primitive list closes"), L3 (`L3_PRESENTATION.md:61`, "L3's gate now PASSES on a real window") | projected finish: 2026-09-23

**Re-counted, and this turn the 3 closures were verified individually rather than carried.** 13
gates, 3 closed, 10 open — the same number as the previous turn, now with each closure's own
evidence line above. No gate closed this turn, so the rate is unchanged: 3 gates over
2026-08-16..2026-08-24 (9 days, 2 workers) = **0.333/day**, and 10 ÷ 0.333 = 30 days →
**2026-09-23**, a **~22-day slip** against the 2026-09-01 target. main-v1 contributes 0
(complete-except-external, 61 of 80, measured 2026-08-24 15:52) and mal-pipeline is 34 of 34, so
liquid alone remains the programme's load and its date is the programme's date. Stated, not
descoped.

**Why three product commits again move the count by zero, and what would move it.** L1's gate needs
80/80 on TWO reference surfaces and only Dictionary has ever been scored; Dictionary is blocked on
category 7, and category 7 was blocked on a memory defect that this turn measured down from
+612 handles / +1,298.5 MB per cycle to **+1.8 MB / −7 handles**. That is the last mechanical
blocker on the cheapest open gate. The honest reading is that L1 is now one instrument re-drive plus
categories 5, 8 and the category-2 sweep away from half of its gate — and still a whole unscored
Video surface away from the other half. The 0.333/day rate already prices turns like this one in.

2026-08-24 | liquid | units done this turn: 0 | units left: 10 | basis: the 13 `Gate:` lines in section 11 of src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md (`grep -c '^Gate:'` = 13 this turn), 3 closed (L0/L2/L3) re-derived last turn and unchanged in the tree since | projected finish: 2026-09-23

**Re-counted the denominator, inherited the three closures.** 13 gates, 3 closed, **10 open** — no
gate closed this turn, so the rate is unchanged at 3 gates over 2026-08-16..2026-08-24 (9 days,
2 workers) = **0.333/day**; 10 ÷ 0.333 = 30 days → **2026-09-23**, a **~22-day slip** against the
2026-09-01 target. main-v1 contributes 0 (complete-except-external, 61 of 80) and mal-pipeline is
34 of 34, so liquid alone is the programme's date. Stated, not descoped.

**Why the count did not move, and it is the honest answer rather than the flattering one.** L1's
gate needs 80/80 on TWO surfaces. Dictionary went from "5 categories stale, 1 failing" to
**6 of 8 at 10 on the current tree**, with category 2's outstanding number landed at 0 dead ends of
18. But category 7 was measured END TO END for the first time and it is a **measured NOT 10**:
1,081.0 MB / 4,410 handles settled against L0's 550–577 / ~1,055. That is progress in knowledge and
a product fix (`424eb46f`), and it is still zero gates. The remaining lever on category 7 is a
utility-process move for llama.cpp; until that lands, Dictionary cannot reach 80/80, and Video has
never been scored at all. The 0.333/day rate already prices turns like this one in.

2026-08-24 | liquid | units done this turn: 0 | units left: 10 | basis: the 13 `Gate:` lines in section 11 of src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md (`grep -c 'Gate:'` = 13 this turn), 3 closed (L0/L2/L3) re-derived last turn and unchanged in the tree since; L1's gate at line 461 is the one this turn worked and it is still open | projected finish: 2026-09-23

**Zero gates again, and the honest reading is that the rate is now three turns old rather than
wrong.** 0.333 gates/day over 2 workers, 10 left, is 30 days → **2026-09-23**, a ~22-day slip
against the 2026-09-01 target. Stated, not descoped. main-v1 contributes 0
(complete-except-external, 61 of 80) and mal-pipeline is 34 of 34, so liquid alone is the
programme's date.

**What moved inside gate 461.** Category 7's blocker is GONE as a product matter, not deferred:
llama.cpp now runs in a `jp-llama-host` utility process (`e0c47a1e`, `ff1c1fc4`), and a whole
load/unload cycle costs main **−5.2 MB and −2 handles** where leg 3 left **+534.6 MB / +3,349**.
Main sits at 423–425 MB across two complete cycles, BELOW the 550–577 MB L0 band, and answered
**38,234 `/health` probes during a 10.5 s GGUF load with a 24 ms longest gap** against a 500 ms
threshold — with a negative control (5 forced GCs → 216 ms) proving the sampler can see a stall.

**Why that is still 0 gates, and it is a real remainder rather than bookkeeping.** Category 7's 10
needs five numbers and this turn re-drove two. Drag frame stability, resize, theme-switch cost and
boot cost were NOT re-measured on this boot, so the category is scored on what was measured and no
more. Video has never been scored at all, and L1's gate needs both surfaces. The 0.333/day rate
already prices turns like this one.

2026-08-24 | liquid | units done this turn: 0 | units left: 10 | basis: the 13 `Gate:` lines in section 11 of src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md (`grep -c 'Gate:'` = 13, re-run this turn); 3 closed (L0 line 452 / L2 line 591 / L3 line 600), the other 10 open, and gate 461 (L1) is the one this turn worked | projected finish: 2026-09-23

**Fourth zero-gate turn, same arithmetic, and it is still the honest one.** 3 gates in the 9 days
since liquid opened (08-16) is 0.333/day across 2 workers; 10 left is 30 days → **2026-09-23**, a
~22-day slip against the 2026-09-01 target. main-v1 contributes 0 (complete-except-external, 61 of
80) and mal-pipeline is 34 of 34, so liquid alone is the programme's date. Stated, not descoped.

**What moved inside gate 461, and one of it is product.** `971987a9` fixes the L0 finding that a
resize ending where it started leaves the window the wrong size — `resizeStart`'s `up` cancelled the
pending rAF and left the DOM on the frame before the one being committed. Verified three ways on a
live boot: the probe's `closedLoop` for resize is **True** for the first time; the `.fwin` inline
style and its rect both read **1080x700** against `desktop-layout.json`'s `video 1080x700`; and the
same holds for all three windows once focused. `8b3bd5ea` repairs the Q7 control, which had been
painting its glass on a `display:none` window and certifying nothing.

**And category 7's last open claim is measured, not inferred.** `l1-deadend.js`'s 19-control burst
— the path that once took main 604.2 MB → 7,082.0 MB, and which the previous entry explicitly
refused to score from the cycle number — costs main **+6.8 MB and +11 handles** over 70 s
(582.3 → 589.1). The 2,942.2 MB it loads sits in a NodeService utility process forked mid-burst.

**Why that is still 0 gates.** Gate 461 needs 80/80 on Dictionary **and** Video. Five of Dictionary's
eight categories were re-driven on this boot (1, 2, 5, 7, and 6's live half); category 8's instrument
returned an empty-harness reading and is unscored; 3 and 4 were not re-driven; Video has never been
scored at all. The 0.333/day rate already prices turns that land real product fixes and no gate.

2026-08-24 | liquid | units done this turn: 0 | units left: 10 | basis: the 13 `Gate:` lines in section 11 of src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md (`grep -c 'Gate:'` = 13, re-run this turn); 3 closed (L0 / L2 / L3), 10 open, and gate 461 (L1) is again the one worked | projected finish: 2026-09-23

**This turn landed product code and it was the cause, not a side effect.** `6b490fc3` fixes a
persisted `section: 'media'` window — the Start menu's media CATEGORY id, never an app — that
restored on every boot as an 820×580 frame over a `.fwin-body` with **zero child nodes**. That
window is why `l8-honest-states.cjs` read `entries 0 / chars 10` and category 8 was VOID: three
probes had been reading the blank window as if it were the Dictionary. `23cc333f` points both L8
probes at the window by TITLE and re-drives all four states.

**Two categories moved, both with a control that fired.** Category 8 = **10/10** (empty names the
query; `Looking up…` captured in-page across a lookup returning 8 entries; AnkiConnect REFUSED
proven by node's own TCP with 5173 LISTENING as the control on the control; error carries the
provider's `authentication` code with `role=alert`, absent-before → named-after, answer unchanged).
Category 3 = **10/10** re-driven on THIS tree after driving the five reveal controls: `Work 7→12`,
`Liquid-eligible 9→4`, `denseWorkOnTranslucent` **0 of 12**, `liquidTreatedEligible` **4 of 4**;
control red at 0→1→3→0.

**Category 4 is PARKED, not dropped, and the blocker is exact.** Its default size re-measured
identical to the scored run (clipped 0, overlaps 0, h-scroll 0, hiddenOverflowX 0, dead 10.7% of
viewport, chrome 5.7%, canvas 32.3%). Its negative control returns **VOID**: nothing broke at
sub-minimum 200×130, and the probe's own comment says why — Dictionary puts everything in one
vertical scroller and by the `unreach` definition cannot clip at any size, so **Media is the
discriminating case** and the Media window would not open, because the only `media` row on this
desktop was the blank one. `6b490fc3` repairs that row to `player` on the next load. Category 4
stays an open unit until its control fails on a restarted app.

**Rate, unchanged and stated honestly.** 3 gates in 9 days at 2 workers = **0.333/day**;
10 ÷ 0.333 = 30 days → **2026-09-23**, which misses the 2026-09-01 target by 22 days. Dictionary
is **7 of 8** categories (1, 2, 3, 5, 7, 8 re-driven on this tree; 6's live half re-driven;
4 parked on its control). Gate 461 needs 80/80 on Dictionary **and** Video, and Video has still
never been scored.

## 2026-08-24 (night 2) · primary — 4 of 8 categories re-driven fresh, 2 product fixes, gate 461 still open

Four rubric categories re-measured on the current tree at pid 37540 with every negative control
firing in-session: **1 = 10/10**, **2 = 10/10**, **5 = 10/10**, **6 = 10/10**. Combined with 3, 4
and 8 (10/10 at `6b490fc3`, which IS this tree), that is **7 of 8 categories at 10 on one tree**.

**Category 7 is the only open one and it is a measured product number, not bookkeeping.** Three
instruments were resolving "the window under test" as the first/largest VISIBLE `.fwin`, which was
only ever correct while `l7d-setup.cjs` hid the other windows; on the real desktop the gesture probe
had been scoring **Video** as Dictionary. Repaired (`-Title`), re-driven, and drag misses the
0-frames-over-100 ms bar. Two product fixes this turn — a per-pointermove forced layout in
`deskDrag.ts` and a full re-render per pointerdown in `DesktopShell.focus()` — raise frames
delivered ~93 → ~101 and halve over-33, but one ~100.2 ms frame remains at `pointerup`.

**Root cause of the remaining frame, found and NOT yet fixed:** `FloatingWindow` is wrapped in
`memo()` (`DesktopShell.tsx:3191`) and the memo can never hit — the call site at `:2506` passes six
fresh inline arrows plus a fresh `children` tree on every render, so one `patch()` re-renders every
window and every `AppSection` beneath it. That is the next slice and it is a real refactor, named
rather than half-started at the end of a turn.

2026-08-24 | liquid | units done this turn: 0 | units left: 10 | basis: the 13 `Gate:` lines in section 11 of src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md (`grep -c '^Gate:'` = 13, re-run this turn); 3 closed (L0 line 452 / L2 line 591 / L3 line 600), 10 open; gate 461 (L1) is the one worked and is now 7 of 8 categories at 10 on one tree | projected finish: 2026-09-23

2026-08-25 | liquid | units done this turn: 0 | units left: 10 | basis: the 13 `Gate:` lines in section 11 of src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md (`grep -c '^Gate:'` = 13, re-run this turn); the 3 closed (L0 452 / L2 591 / L3 600) are INHERITED, but gate 461 was re-derived directly this turn and is OPEN on a measured number, not bookkeeping — Dictionary reached 8 of 8 categories (category 7 closed: drag now 0 frames over 100 ms at the 16.9 ms compositor ceiling, six runs after a real restart on a LOADED window) while Video, which gate 461 requires equally, scored for the FIRST time and FAILS category 1 with 17 of 34 controls below the 32 px hit floor and 3 hits stolen | projected finish: 2026-09-24

2026-08-25 | liquid | units done this turn: 0 | units left: 10 | basis: the 13 `Gate:` lines in src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md (`grep -c '^Gate:'` = 13, re-run this turn); the 3 closed (L0 452 / L2 591 / L3 600) are INHERITED, gate 461 was re-derived directly and is OPEN — it needs 80/80 on Video AND Dictionary, Dictionary holds 8 of 8, and Video moved from 0 scored categories to 1 (category 1 CLOSED at 10/10 this turn: 35 of 35 controls measured, 0 below the 32px pointer floor from 17, 0 stolen from 3, contrast min 5.13:1, keyboard 0 unreachable) while category 4 got its first number and FAILS (dead region 22.1% of viewport against a 15% bar) and category 8 is recorded UNSCORED | projected finish: 2026-09-27

Rate, arithmetic and not optimism: 3 of 13 gates closed in the 10 days since liquid opened
2026-08-16 = 0.30 gates/day at 2 workers; 10 ÷ 0.30 = 33 days → **2026-09-27**, missing the
2026-09-01 target by 26 days. The rate did not move this turn because no GATE closed — but
gate 461's Video half went from unmeasured to 1 of 8 categories at 10 with two more located, so
the number behind the gate moved even though the gate count did not.

2026-08-25 | liquid | units done this turn: 0 | units left: 10 | basis: the 13 `Gate:` lines in src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md (`grep -c '^Gate:'` = 13, re-run this turn); the 3 closed (L0 452 / L2 591 / L3 600) are INHERITED, gate 461 was re-derived directly and is OPEN — it needs 80/80 on Video AND Dictionary, Dictionary holds 8 of 8, and Video went from 1 category at 10 to 1 at 10 with category 4 measured at all THREE sizes for the first time and every number passing (default dead region 22.1% -> 9.7% of viewport; compact 260x170 clipped 30 -> 0 and h-scroll 1 -> 0; maximized 0/0/0/0) — but NOT scored 10, because the shrink control now returns VOID on a surface that no longer breaks below its minimum and the injected-box control has not been run | projected finish: 2026-09-28

Rate, arithmetic and not optimism: 3 of 13 gates closed in the 11 days since liquid opened
2026-08-16 = 0.27 gates/day at 2 workers; 10 ÷ 0.27 = 37 days → **2026-10-01**, missing the
2026-09-01 target by 30 days. Reported as 2026-09-28 above only if the 0.30 gates/day of the
previous three turns is restored; at this turn's measured rate it is 2026-10-01. No GATE closed
again — the honest statement is that gate 461 is one plan-authority unit that has absorbed five
turns, and that the unit is too coarse to show progress. Its INTERNAL count moved this turn:
Video 1 of 8 categories at 10, category 4 at 9 of its 10 requirements with only the control open,
categories 2/3/5/6/7 unmeasured on Video.

2026-08-25 | liquid | units done this turn: 0 | units left: 10 | basis: the 13 `Gate:` lines in src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md (`grep -c '^Gate:'` = 13, re-run this turn); the 3 closed (L0 452 / L2 591 / L3 600) are INHERITED, gate 461 was re-derived directly and is OPEN — it needs 80/80 on Video AND Dictionary, Dictionary holds 8 of 8, and Video moved from 1 category at 10 to 1 at 10 with TWO more parked at 9: category 4's maximized control now fires (clipped 0 -> 1 -> 0 on Video, Dictionary unchanged at 0) and exposes a real failing number, the maximized dead region at 284x602 = 16.5% of the viewport against a 15% bar; category 3 scored on Video for the first time at a walk depth that actually reaches its regions (12 regions, denseWorkOnTranslucent 0, liquidTreatedEligible 3 of 4) | projected finish: 2026-10-04

Rate, arithmetic and not optimism: 3 of 13 gates closed in the 12 days since liquid opened
2026-08-16 = 0.25 gates/day at 2 workers; 10 ÷ 0.25 = 40 days → **2026-10-04**, missing the
2026-09-01 target by 33 days. The rate fell again because no GATE closed for a sixth turn. The
honest reading has not changed and is getting louder: gate 461 is ONE plan-authority unit that has
now absorbed six turns, and the unit is too coarse to show progress — its internal count went
Video 1 of 8 categories at 10 plus 2 parked at 9 (4 and 3), 5 unmeasured (2/5/6/7/8).
main-v1: complete-except-external, unchanged. mal-pipeline: 34 of 34, closed.

2026-08-25 | liquid | units done this turn: 0 | units left: 10 | basis: the 13 `Gate:` lines in src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md (`grep -c '^Gate:'` = 13, re-run this turn); the 3 closed (L0 452 / L2 591 / L3 600) are INHERITED, gate 461 was re-derived directly and is OPEN — Dictionary holds 8 of 8, Video moved from 1 category at 10 (+2 parked at 9) to **2 at 10**: category 4 CLOSED this turn (maximized dead region 16.5% -> 7.8% of viewport, all four numbers pass at maximized/default/compact, control fails as required at sub-minimum) and category 5 scored on Video for the first time at 8 of its 10 questions with Q6 fixed and re-scored in its own commit; category 3 still parked at 9, categories 2/7/8 unmeasured on Video | projected finish: 2026-10-05

Rate, arithmetic and not optimism: 3 of 13 gates closed in the 13 days since liquid opened
2026-08-16 = 0.23 gates/day at 2 workers; 10 ÷ 0.23 = 43 days → **2026-10-05**, missing the
2026-09-01 target by 34 days. Seventh consecutive turn with no GATE closing, and the same honest
reading: gate 461 is ONE plan-authority unit that has absorbed seven turns. Its INTERNAL count
moved twice this turn, which is the fastest it has moved: Video 1 → 2 of 8 categories at 10.
Category 5's remaining unit is NOT a CSS fix and should not be estimated as one — Q4 needs 18 of
30 chrome controls to leave the Media shell's default state, and 19 of those 30 are primary
navigation, so it is a design decision on the shell (collapsible sidebar / grouped rail).
main-v1: complete-except-external, unchanged, INHERITED. mal-pipeline: 34 of 34, closed.

2026-08-25 | liquid | units done this turn: 0 | units left: 10 | basis: the 13 `Gate:` lines in src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md (`grep -c '^Gate:'` = 13, re-run this turn); the 3 closed (L0 452 / L2 591 / L3 600) are INHERITED, gate 461 was re-derived directly and is OPEN — Dictionary holds 8 of 8 (leg 1 closed in `af7fd609` after `9c4a38e5`; the SCORECARD doc still lags that and its last section reads stale), Video went from 2 of 8 categories at 10 to 2 at 10 with category 2's dead-end half measured for the first time (0 dead ends of 22 covered, bait fired) and category 5's Q4 moved 30 -> 19 scanned by a real product change | projected finish: UNKNOWN

Rate, arithmetic and not optimism: 3 of 13 gates closed in the 14 days since liquid opened
2026-08-16 = 0.21 gates/day at 2 workers; 10 ÷ 0.21 = 47 days → 2026-10-12 by the same method
every previous turn used. **It is written UNKNOWN instead, and the reason is a finding rather
than a hedge.** The Video window is in **standard** presentation (`fwin-liquid` false; its chrome
still offers `Make Liquid`) and has been for every category scored on it. Rubric category 2 asks
for the Liquid path's input cost *against the Standard path*, and category 6 asks for parity in
BOTH presentations — neither is answerable on a window with no Liquid path enabled. So gate 461's
Video half is not "2 of 8 categories done"; an unknown number of its closed categories were
measured on a surface the gate is not about. Until Video is driven in Liquid presentation and the
closed categories are re-derived there, any remaining-work figure for this gate is a guess, and a
projected date computed from a guess is the exact thing RULE 0 forbids.
main-v1: complete-except-external, unchanged, INHERITED. mal-pipeline: 34 of 34, closed.

2026-08-25 | liquid | units done this turn: 0 | units left: 10 | basis: the 13 `Gate:` lines in src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md (`grep -c '^Gate:'` = 13, re-run this turn); the 3 closed (L0 452 / L2 591 / L3 600) are INHERITED, gate 461 was re-derived directly and is OPEN — Video is now in **liquid** presentation (clicked its own `Make Liquid`, survived a renderer reload) and moved from 2 of 8 categories at 10 to **3 of 8**: category 3 CLOSED at 10 (liquidTreatedEligible 3 of 4 -> **4 of 4**, denseWorkOnTranslucent 0, control CONTROL-FAILED-AS-REQUIRED on Video AND Dictionary for the first time) and category 1 RE-DERIVED in liquid where it found a real failure and closed again after fixing it (min 2.83:1 -> **5.13:1**, failing 1 -> 0) | projected finish: 2026-09-24

**The arithmetic, and the caveat is part of it.** 3 of 13 gates closed in the 9 days since liquid
opened 2026-08-16 = **0.333 gates/day** at 2 workers; 10 ÷ 0.333 = 30 days → **2026-09-24**. That
is the OPTIMISTIC bound and the reason is measurable rather than a hedge: all three closed in the
plan's first two days and **zero** have closed in the seven days since, so on the trailing rate the
projection is unbounded. It is written as 2026-09-24 rather than UNKNOWN because last turn's stated
reason for UNKNOWN — that Video had never been driven in the presentation the gate is about — is now
resolved: it is liquid, and two of its categories were measured there this turn.
Still OPEN on Video: category 4's **maximized** leg (default 5.8% of viewport and compact 260x170
both re-derived in liquid this turn, 0 clipped / 0 overlap / 0 h-scroll / restoredExactly true, but
the maximized third was not re-run, so 4 is not re-confirmed in liquid); categories 2, 5, 6, 7, 8.
Category 6 is newly UNBLOCKED — `parity-ledger.json`'s 0-of-7 reason was "no Liquid destination
exists" and Video is now one.
main-v1: complete-except-external, unchanged, **INHERITED** — RULE 1's re-count is still owed and
was not done this turn. mal-pipeline: 34 of 34, closed.

2026-08-25 | liquid | units done this turn: 0 | units left: 10 | basis: the 13 `Gate:` lines in src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md (`grep -c '^Gate:'` = 13, re-run this turn); the 3 closed (L0 452 / L2 591 / L3 600) are INHERITED, gate 461 was re-derived directly and is OPEN — it needs 80/80 on Video AND Dictionary. Video moved from **3 of 8 categories at 10 to 4 of 8**: category 6 CLOSED at 10 (parity **8/8 in liquid and 8/8 in standard**, read off the same component in one run because two Media Center windows exist one per presentation; round trip Liquid→Standard→Liquid title-anchored and driven dirty gave **`diffKeys: []`**, byte-for-byte on geometry/focus/z-index/app data; **3 of 3 controls fired**, each flipping exactly one row 8→7→8; 8 of 8 `mediaCenter` ledger rows now `both`), and category 4 was RE-CONFIRMED in liquid including the maximized third it had been carrying from a standard run (maximized 1264x765: clipped 0 / overlaps 0 / h-scroll 0 / hiddenOverflowX 0, dead **7.0%** of viewport, chrome **49.8→45.8%** and canvas **64.7→68.6%** as the window grows; control 0→1→0 on Video with Dictionary unchanged at 0; `restoredExactly: true`). Dictionary unchanged at 7 of 8, category 7 the open one. The six `mediaWorkspace` ledger rows are re-derived as genuinely un-Liquid-able rather than unfinished: the Media workspace mounts at `body > div > .seanime-host`, outside every `.fwin`, with no window chrome and no `data-presentation` for L3 to reach | projected finish: 2026-09-27

**How 2026-09-27 is arithmetic rather than the date that was asked for.** Measured THIS turn, not
inherited: **1 rubric category closed + 1 re-confirmed per ~80-minute turn** on the surface under
test. Gate 461 needs 5 more category-closures (Video's 2, 5, 7, 8 — 5 has one number and 2 has its
dead-end half — plus Dictionary's category 7 re-drive, which `af7fd609` already measured at the
compositor ceiling and so is a pass, not a refactor). At the relay's measured ~3 turns/day across
two workers that is **~2 days: gate 461 ≈ 2026-08-27**.

The other **9** gates are the whole projection and none of them has started. There is no closure
rate for L4–L12 at all, so they are projected at the only gate cost this plan has actually
observed: **L1 has taken 10 days and is not finished**. Charging each of the nine at L1's cost
discounted for two workers running one plan depth-first (~3.5 days each) gives **31.5 days from
08-27 → 2026-09-27**. Both halves of that are stated so the next worker can attack either: the
461 half is measured, the L4–L12 half is an extrapolation from ONE gate's cost and is the number
to distrust. It is 26 days past the 2026-09-01 target, and the scope is not being cut to hide that.

2026-08-25 | liquid | units done this turn: 0 | units left: 10 | basis: the 13 `Gate:` lines in src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md (`grep -c '^Gate:'` = 13, re-run this turn); the 3 closed (L0 452 / L2 591 / L3 600) are INHERITED, gate 461 was re-derived directly and is OPEN. Video stayed at **4 of 8 rubric categories** — category 2 gained four of its five terms and did NOT close, which is the honest reading: cost parity **2 clicks / 3 keystrokes in liquid and standard, exactly equal**, modal traps **0** (menu focus-trapped, Escape 4 items → 0), content-hiding scroll traps **0**, but input latency STRADDLES the 100 ms bar (first keystroke 81.1 / 88.8 / 102.3 / 164.4 ms over four runs, 2 of 5 events over the bar in one standard run) with control A proving an instrument floor of **0.6 ms**, so the number is the app's; and the dead-end sweep has still never run on Video in liquid. Three real product defects were found by driving and fixed: list view's 578x945 rows (7,560px of scroll for 8 titles → **672px**), the row trigger's hit expander claiming the whole 588x84 row, and a context menu scrolling the Liquid window 186px sideways with standard as the control at 0. Dictionary unchanged at 7 of 8 | projected finish: 2026-09-27

**Why 2026-09-27 is unchanged rather than pulled in.** Measured this turn: **0 categories closed
per ~80-minute turn** — the turn went into three product fixes instead, which is what the category
was for. Gate 461 still needs Video's 2, 5, 7, 8 plus Dictionary's category 7 re-drive. Category 2
is now one debounce slice and one probe re-drive from closing, so the previous ~2-day estimate for
461 (≈ 08-27) holds only if the next turns close one category each; on this turn's actual rate 461
lands ≈ **08-29**. The L4–L12 half is untouched and still extrapolated from L1's single observed
cost (10 days and unfinished), i.e. ~3.5 days x 9 gates at two workers = **~31 days**, so the
projection stays **2026-09-27**, 26 days past the 2026-09-01 target. The scope is not being cut.

main-v1: complete-except-external, unchanged, **INHERITED** — RULE 1's re-count is STILL owed and
was not done this turn either (fifth turn). It needs the last `##` section of
`src/MAIN_V1_EVIDENCE_LEDGER.md` counted across Tracks 2/7/8/9. mal-pipeline: 34 of 34, closed.
