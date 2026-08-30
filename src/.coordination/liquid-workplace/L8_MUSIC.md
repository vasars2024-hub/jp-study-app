# L8 — Music (Media Center), categories 1 and 3

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
| 2, 4, 5, 6, 7, 8 | not yet scored | — | — |

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
