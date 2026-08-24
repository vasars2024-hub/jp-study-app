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
