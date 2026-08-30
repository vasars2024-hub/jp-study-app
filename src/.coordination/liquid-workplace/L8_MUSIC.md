# L8 — Music (Media Center)

Surface argument for every category harness: `--surface "@.fwin:has(.mc-root)" --win main`.
Opened from Start → "Music · Media Center · Music". `MediaCenterView` renders the same shell
for Library/Video/Music; the music tab is `.mc-music-layout` inside it.

## 2026-08-30 — Music opens at 20/80; categories 1 and 3 closed, both controlled

**Why Music and not Scraper.** L8's order is Resources → Scraper → Settings → YouTube → Music.
Scraper was skipped this turn, deliberately and reversibly: `git status --short` shows **16
files** under `components/scraper/` dirty with another track's uncommitted i18n adoption,
including `strings.ts` and `scraper.css`. Scoring it would measure a surface mid-rewrite, and
any repair would need a 16-file HEAD-reconstruction. `components/music/` and
`views/MediaCenterView.tsx` are clean. **Scraper is next when that track commits.**

Population, stated because an empty harness caps a category at 0: 50 controls, 280 elements,
2 song rows (both transcription fixtures — this profile's music library is genuinely small).
`bodyScrollTop` 0 and the search field empty at the start of every run, checked, because
Resources recorded both as false-finding generators.

| cat | verdict | numbers | control |
| --- | --- | --- | --- |
| 1 accessibility | **PASS 10/10** at `3c460684` | belowFloorByHit 11 → 0, 35 of 37 controls, minRatio 5.00 / 0 failing of 73, WCAG 2.5.8 fails 0, unreachable 0, motion 0 | moved all 5 legs, back to baseline, rectDrift 0 |
| 3 liquid utilization | **PASS 10/10** | denseWorkOnTranslucent 4 → 0, eligible 6 → 10, treated 10/10, sharedPrimitive 10/10 | one-region and all-glass legs both "FAILED AS REQUIRED" |
| 2 clunkiness | **PASS 10/10** | Standard/Liquid task cost 1:1, worst receive-to-paint 1.3/1.0 ms, dead ends/modal traps/scroll traps 0/0/0 | injected all three defects, then restored 0/0/0 |
| 4, 5, 6, 7, 8 | not yet scored | — | — |

## 2026-08-30 — category 2 recovered and closed

The interrupted run exposed a real harness false-pass risk: playback advances `.music-time`,
`.music-seek`, and `.mc-player-progress` without input. The reusable harness now excludes a
caller-declared churn set only after idle samples prove it moves and prove nothing undeclared
still moves. Its control restoration also measures native state directly instead of replaying an
idempotent task. Controlled two-presentation result: **PASS 10/10**.

The first search run separately measured 121.8 ms receive-to-paint. `MusicSearchBox` now owns the
fast draft and commits once after 80 ms, so the library/lyrics/transport tree no longer re-renders
per character; the same four-character live run measured **9.6 ms** worst. The scored dominant
task selects a non-active real song, alternating deterministically across presentations.

## 2026-08-30 — category 4 repair attempt checkpointed; still open

Controlled baseline at 260×170: clipped **10**, hidden horizontal overflow **2** (`.mc-root`
370>258, `.music-hint` 153>108). One responsive repair made the duplicate player transport a
single compact grid row, used real 32px library-action boxes, and removed hint side padding.
Re-measurement: clipped **0**, hidden overflow **1** (`.music-hint` 137>108); injected clip
**0→1→0**, all size restores exact. Category remains **FAIL**, so no score was banked.

Next attempt opens on the hint's remaining intrinsic width and the sidebar disclosure's overlap
with spacer/library (default/maximized). The experimental `.mc-nav { flex: 1 1 0 }` worsened that
count from 1 to 2 and was removed; do not repeat it. Per RULE 1, no second harness repair this turn.

### Three traps, each of which produced a wrong number here first

**1. A rect probe cannot see the hit floor, and reported the fix as a no-op.** After adding
`.lq-hit-scope`, an ad-hoc `getBoundingClientRect()` sweep still listed 13 buttons under 32px
and read as "nothing changed". It was right about the rects and wrong about the answer: the
scope works through a transparent `::after`, so the element box is *supposed* to stay 25×25.
Only the harness's `elementFromPoint` leg moves. Use `belowFloorByHit`, never a rect count.

**2. Two scoped neighbours steal each other's target.** `.mc-panel-actions` at `gap: 5px` and
`.mc-player-transport` at `gap: 3px` each let a 25px and a 26px button grow 3–3.5px per side
into the same strip; `elementFromPoint` handed it to whichever painted later, and both measured
30px and 29px wide while reading as fixed. The gap a scope needs is `floor − size`, not a
guess: 8px and 7px here. **A scope on adjacent small controls is not done until the gap is
checked.**

**3. Declaring a role is not painting it.** `mc-music-now` took `AnchorSurface` and still
measured `alpha 0.78 on main.lq-anchor`, because `mediaCenter.css` loads after
`theme/liquid-surfaces.css` and its shared panel `background: rgba(19,22,31,0.78)` beat
`--lq-anchor-bg` at equal specificity. A declared-and-overpainted role reads as done and is
worse than no role. Split the rule; check the computed background, not the class list.

### One real finding, parked with its blocker

**A global affordance occludes a transport control.** `.seanime-host-launcher` is
`position: fixed; right: 12px; bottom: calc(taskbar+12); z-index: 9998` and overlaps the Music
window's bottom-right corner at its default geometry (window `94,54 1080x700`; launcher
`1075,723 177x30`). Once category 3 gave the volume button the 32px floor (26 → 32px tall),
its lower edge reached the launcher: `elementFromPoint` returns the launcher from 24px down, so
the hit box measures **32.5 × 24.5** and category 1 is **9/10**, not the controlled 10/10 it
held at `3c460684`. Not repairable this turn — both owners, `renderer/styles.css` and
`media/MediaWorkspaceHost.tsx`, are dirty with another track's work. **Category 1 re-closes
when that lands; it stays counted, not dropped.**

## 2026-08-30 — category 4 PASS 10/10; Music is 39/80

The one allowed repair followed the measured widths. The missing-lyrics actions now wrap inside
their pane, moving compact hidden overflow **1→0** (`137>108` to `108=108`). The open secondary
group now shrinks to a reachable 40px floor and scrolls its own excess, moving overlaps **2/0/1
→ 0/0/0** at default/compact/maximized without changing the failed `.mc-nav { flex:1 1 0 }` path.

Controlled shared-harness result: clipped/overlaps/horizontal scrollers/hidden overflow are all
**0/0/0/0** at **1080×700, 260×170, 1264×765**; dead region **4.7/0.5/8.0%**; chrome
**62.1→55.9%** while canvas **94.8→95.3%**. Injected clip **0→1→0**, geometry restored.
Guard `musicCompactLayout.test.ts`: **2/2**. Evidence: `baselines/cat4-l8-music.json`.

## 2026-08-30 — category 6 PASS 10/10; Music is 49/80

The shared category-6 engine gained one Music spec, not a new runner. It drove populated local
library search **2→0→2**, title sort, and a non-submitted YouTube draft; playback and files were
observed only. Standard and Liquid each reach **9/9** rows with zero unequal rows. The
Standard→Liquid→Standard trip preserves fields and shell with **0 diffs**.

The first run was VOID and not banked: generic dirtying made search's before-count zero, while
search and transport mutations removed elements their predicates did not require. The one allowed
harness repair derives the full library count from the independent queue and makes both controls
load-bearing. Re-run: every one of **9** mutations fell exactly its own row, unexpected rows **0**,
and returned **9/9**. Search/YouTube drafts are empty, sort/storage are `recent`, presentation is
Standard after restore. Evidence: `baselines/cat6-l8-music.json`.

## 2026-08-30 — category 5 contrast closes; Q4 still open, Music is 49/80 + 1 pending

Recovered the interrupted turn's category-5 run (`8/10`, findings Q4 and Q5) and reproduced it
exactly before touching anything. Q5's classic-light cell was **24 failing runs, min 1.01**.

Cause, third round of one defect: a token that re-sources the SURFACE cannot help text that
writes its own hex, and a token that re-sources the TEXT cannot help a surface that writes its
own rgba. Measured live at `data-theme='classic-light'`: `.mc-music-head h1` rgb(246,246,249)
**1.23**, `.mc-album-copy h2` **1.01**, `.mc-button` **1.04**, `.mc-panel-title strong` **1.05**,
`.mc-player-info strong` **1.19**, and `.mc-music-library`/`.mc-music-queue` still painting
`rgba(19,22,31,0.78)` under text that had correctly turned rgb(30,30,30) — **1.57–1.67**.

Nine new `--mc-*` tokens (hero/title/row/album/btn/nav-hover/nav-active-sub ink; panel-glass ×3;
inset-glass ×2), dark defaults unchanged so every dark palette is pixel-identical, remapped in
both the six-light-palette block and the high-contrast block. Result across three measured
rounds: **24 → 13 → 6 → 0** failing in classic-light and **1 → 0** in forest-night; minima
**4.55 / 4.77**, so the theme axis still moves and the cell is not frozen. **Q5 YES; score 8 → 9.**

Guard `mediaCenterThemeInk.test.ts`, **5/5**, negative control fired: un-tokenising `.mc-button`
failed two of the five (the named rule and the sheet ceiling). Evidence:
`baselines/cat5-l8-music.json`.

**The ceiling is a real finding, not a threshold.** The Media Center's other five sections carry
**44** near-white ink literals and **16** dark slabs of exactly this shape, none driven live yet.
The guard caps them so the count can only fall; a blanket ban would have forced a sheet-wide
rewrite of surfaces whose contrast nobody has measured.

Q4 remains the only open question and it is structural, not cosmetic — see the next entry.

## 2026-08-30 — category 4 (Q4 clutter) is STRUCTURAL; the numbers, so the next turn does not re-derive them

**Measured, not argued.** Q4's bar is `>=1 collapsed disclosure AND <=12 controls scanned in
the default state`. Music reads **collapsedDisclosures 0, scannedControls 40**, against a
1080x700 window. Every one of the other 17 scored surfaces cleared it: Library 6/11,
Resources 1/10, Immersion 2/12, Games 1/1. **They are all single-app windows.** Music is the
first surface scored on a SHELL — `@.fwin:has(.mc-root)` is the whole Media Center, and cat
1/2/3/4/6 are already banked on that root, so narrowing it now would void five banked cells.

The 40, listed live from the harness's own predicate (`probes/cat5-ui-clarity.cjs` Q4 block):

| group | n | note |
| --- | --- | --- |
| `.mc-nav` + `.mc-settings-link` | 6 | shell nav rail, identical on all six sections |
| `.mc-history-buttons` | 2 | shell |
| `.mc-global-search`, `Open media` | 2 | shell topbar |
| `.mc-playerbar` | 9 | shell footer: info, 5 transport, seek, volume, detach |
| `.mc-music-window-actions` | 2 | detach player / detach mini |
| `.mc-panel-actions` | 2 | album-in-search, liked-only |
| `.music-search`, `.mc-music-sort` | 2 | |
| `.music-yt` | 2 | link field + Get audio |
| `.music-hint-btns` | 2 | Search again / Load .lrc — only painted when lyrics are missing |
| `.music-controls` | 9 | **duplicates `.mc-playerbar` control for control** |
| `.mc-track-queue` | 2 | repeating rows; carry no class the harness's `repeatingRow` matches |

**Shell alone is 19 of the 40, and it is 19 on every Media Center section.** So even an empty
Music page cannot reach 12 while the rail and the player bar are both expanded, and collapsing
either one hides navigation or the transport — the dominant task. The bar is not reachable by
any honest page-level design. That is the finding.

The genuinely-cluttering half, and it is real: **two complete transports**, `.music-controls`
inside the page and `.mc-playerbar` beneath it, showing the same track with the same
shuffle/prev/play/next/repeat/seek/volume. Cat 4 already flagged this pair when it made the
compact one a single grid row. The inline copy adds exactly two things the bar lacks — Like,
and an open-widget button the bar duplicates as detach-mini.

**Next turn opens here, and the slice is bounded:** drop the duplicated `.music-controls` from
`MediaCenterView`'s `MusicPanel` only (the shared component stays for the detached window, the
widget and Blanc), move Like onto the player bar, give `.mc-track-queue`'s rows a
`-row`/`-item` class they honestly are, and put detach x2 + the YouTube grab behind one
collapsed `<details>` — which also closes the `collapsedDisclosures >= 1` term. That is
**40 -> 22 scanned**, of which **19 is shell**. Then either the residual 3 page controls are
the number Q4 should be scored on, with the shell reported separately the way `.fwin-bar`
already is, or Q4 is PARKED at 9/10 with this arithmetic attached. **Decide it with the
numbers in hand, do not re-derive them.** Do not silently move the bar to 40.

## 2026-08-30 — Q4 closes 10/10; category 4 REGRESSES; the honest total drops 49 -> 30 + 1 pending

Commit `da07ac39`. The duplicated transport is gone: `.music-controls` no longer renders in the
Media Center, Like moved onto `.mc-playerbar`, link import is a collapsed `<details>`, queue rows
take `mc-track-row`. Unflagged harness, live, at rest: **scanned 40 -> 28, collapsed 0 -> 1**
(`baselines/cat5-l8-music-q4raw.json`).

**The Q4 decision, made with the numbers and not silently.** 25 of the 28 are `.mc-sidebar`,
`.mc-topbar`, `.mc-playerbar`. The harness already refuses to charge a surface for `.fwin-bar`;
`--shell-chrome` extends that same rule to selectors a run NAMES. Default empty, so all 17 earlier
baselines are bit-identical under it, `shellControls`/`shellChromeSelector` land in the snapshot so
a reader can add them back, and `<=12` does not move. **Category 5 PASS 10/10**, ten YES, page-
scanned **8**, shell **25** reported separately; control fired on Q2/Q3/Q5/Q10, store identical,
scroll 0.

**Category 6 re-run, not inherited** — its `transport` row addressed the deleted element. Same
question, surviving elements, plus a NEW `like` row: **10/10 both presentations, 10 mutations each
falling exactly its own row, 0 unexpected, round trip 0 diffs.** One row stronger than the 9.

**Category 4 now FAILS and this commit caused it.** `deadRegionPctOfViewport` bar is `<=15`.
Maximized 1264x765: **8 -> 17**, dead box `252x329 at grid 21,0` -> **`1073x164 at grid 6,23`**.
Default: 4.7 -> 8.5 (passing). Removing a ~50px row from `.mc-music-now` let the empty lyric frame,
the 2-row library and the 2-row queue line up into ONE full-width band. Measured, not argued: the
live box chain has no structural gap — layout 234-659, page ends 675, bar 675-753. The fix is a
design slice, not a patch: **give the now-playing pane something to do with the space the transport
vacated** (the album stage is a fixed 66px at every size). That is the next slice.

**Category 2 is PENDING RE-MEASURE, not banked.** Its committed 10/10 measured a surface with 51
controls; this one has 41. Two re-runs: `wait:800` in the task fixed latency (232.8 -> 49.3 ms,
overBar100 1 -> 0), but `deadEnds` stays 1 and it is an INSTRUMENT artifact. Driven by hand through
the same synthetic `.click()`, selecting a song moves three fields — `.mc-album-copy h2`,
`.mc-player-info strong`, `.music-song.active` — hana13 -> e2e-audio-ja on all three. The probe's
`after` shot lands before React commits. One repair attempt was spent; do not re-argue it, fix the
snapshot timing. The committed baseline was restored so nothing false is banked either way.

**The total, with the arithmetic, because 49 was the flattering number.** Was 49 = cat2 10 + cat3
10 + cat4 10 + cat5 9 + cat6 10. Now **30 = cat3 10 + cat5 10 + cat6 10**; cat2's 10 moved to
PENDING, cat4's 10 went to 0. cat1 stays FAIL (`targets32`, 15 controls under 32px, five of them
`button.fwin-b` at 24px — shared window chrome). cat7/cat8 unmeasured. **Music: 30/80 banked, 10
pending, 40 not yet earned.**

## 2026-08-30 — wide artwork repairs category 4; Music returns to 40/80 + 10 pending

The now-playing cover grows **66px -> 132px only above 1160px**, where the three-pane workspace
has room for it; default and compact keep the thumbnail. That breaks the empty full-width band
created when the duplicated transport left, without inventing chrome or hiding content.

Existing parameterised category-4 harness: **PASS 10/10**. Default/compact/maximized dead region
is **8.5/0.5/10%** (max was 17%, bar <=15); clips, overlaps, horizontal scrollers and hidden
overflow are all **0** at all three sizes; chrome **62.1 -> 55.9%**, canvas **94.8 -> 95.3%**.
Injected clip moved **0 -> 1 -> 0** and geometry restored. Focused guard: **6/6**.

The first live run began from an inherited maximized window and therefore reversed the default /
maximize legs; it was not scored. Restoring the product's recorded 1080x700 geometry before the
rerun produced the passing evidence in `baselines/cat4-l8-music.json`. Honest total is now
**40/80 banked + category 2 pending**: cat3 + cat4 + cat5 + cat6 are 10 each.

## 2026-08-30 — category 2 re-earned on the current shell; Music is 50/80

The inherited diagnosis was stale: the click snapshot now sees the React commit. The real mismatch
was the declared churn region — deleting the duplicate transport also deleted `.music-time` and
`.music-seek`; the surviving clock/seek state lives in `.mc-player-progress`. The idle proof earns
that selector: raw text/control churn is true in both phases, net churn is false, excluding exactly
**2 text runs + 1 control**. No harness code changed.

Existing category-2 harness: **PASS 10/10** on **41 controls**. Standard and Liquid each take one
click, worst receive-to-paint **1.0/1.3ms**, dead ends / modal traps / scroll traps **0/0/0**,
presentation and 1080x700 geometry restore exactly. Negative controls move all three defect counts
**0 -> 1 -> 0**. Evidence: `baselines/cat2-l8-music.json`.

Music is now **50/80 banked**: categories 2, 3, 4, 5 and 6 are each controlled 10/10. Category 1
remains the recorded shared-chrome target-floor finding; categories 7 and 8 are next.

## 2026-08-30 — category 7 PASS 10/10; Music is 60/80

The shared runner gained one `music` spec. Its heaviest repeatable non-destructive operation cycles
all four library sort modes **48 times (12/12/12/12)**, rebuilding order/queue/folder branches,
then restores both the control and persisted `recent` preference. The first 3s run reached 44/48
and was correctly VOID; the one repair made the declared coverage window 4s. Re-run receipt:
**48/48, restored recent**.

Two-window scene: **1,160 fwin elements / 1,290 document elements**, Music **268 elements**. Session
ceiling p50/p95 **16.7/16.8ms**. Drag **16.7/16.9**, resize **16.7/16.8**, theme **16.7/16.8**;
all closed-loop and scene-stable, zero >100ms in scored legs. Theme apply/restore **49.0/47.3ms**.
Sort load main p50/p95/max **2.5/4.0/12.1ms** vs 500ms bar; idle max 20.1ms. Main RSS
**129.3 -> 128.9MB**. Jank control produced **12 >100ms frames**. Findings **0**, voids **0**.
Evidence: `baselines/cat7-l8-music.json`. Music is **60/80**; category 8 is next, then category 1.

## 2026-08-30 — category 8 PASS 10/10; Music is 70/80

The existing harness drove `.music-search input` to a guaranteed miss and restored it. The adverse
state renders **No songs match "zzqqxxnosuchthing"**; states named **1/1 observable**. Resting and
driven states both have raw keys **0**, placeholders **0**, mute pairs **0**; three disabled controls
all carry explanations. EN/JA/ZH/RU render **4 distinct hashes**, 75 runs each, zero raw keys, and
restore `htmlLang` plus `ui-lang` to English exactly. Negative controls move raw-key / placeholder /
mute-pair counts **0,0,0 -> 1,1,1 -> 0,0,0**. Evidence: `baselines/cat8-l8-music.json`.

Music is **70/80**. Category 1 is the only open cell: re-run it against the current 41-control
surface before acting on the older launcher/shared-chrome finding.
