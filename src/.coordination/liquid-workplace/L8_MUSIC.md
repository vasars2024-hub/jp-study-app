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
