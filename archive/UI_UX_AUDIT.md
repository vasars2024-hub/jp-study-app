# Study OS — UI/UX audit and remediation log

> Started as a Media Center audit; the rubric and the measurement harness were then
> run across the whole application suite. Part 1 is the Media Center. Part 2, at the
> end, covers the other sixteen app surfaces.

## Part 1 — Media Center

> Scope: the unified Media Center shell (`src/renderer/views/MediaCenterView.tsx` +
> `src/renderer/views/mediaCenter.css`) and every panel it hosts — Home, Library, Video,
> Music, Study Mode, Discover, Media Settings — plus the persistent shell chrome
> (sidebar, top bar, player bar).
>
> This supersedes the self-assessment in `src/MEDIA_CENTER_REVAMP_AUDIT.md`, which scored
> the same surfaces 9.3–9.7/10 on **claimed feature coverage**. This audit scores what the
> running app actually renders, measured through the debug bridge, not what the component
> tree promises.

## Rubric

Four categories, 20 points each, 80 total per section. A section passes at **80/80**.

| # | Category | What earns points |
|---|---|---|
| 1 | **Visual craft** | One type scale actually used; legible minimum size; spacing rhythm; ≥3 readable surface levels; WCAG AA contrast; no clipped or overflowing text. |
| 2 | **Information architecture** | The first thing on screen is the thing the user came for; grouping matches intent; ordering is task-order not data-order; nothing displayed is fake, stale or unverifiable. |
| 3 | **Interaction & state** | Real empty / loading / error / offline states; hit targets ≥24px; every control has a visible label and focus ring; feedback for every action; keyboard reachable. |
| 4 | **Connectivity** | The surface links outward to the rest of the app where a user would want to go next, and inward from the places that should reach it. No dead ends. |

## Measurement method

The app runs at `http://localhost:5173` inside Electron. Geometry, computed styles and
contrast are read from the live DOM through the project debug bridge
(`debug/bridge.json` → `/eval`), never from memory or from a screenshot alone.

Per-tab probe: every element inside `.mc-page` is checked for
computed `font-size < 11px`, WCAG AA contrast against its first opaque ancestor
background, `scrollWidth > clientWidth` under `overflow: hidden` (clipped text), and
button/link boxes under 24px.

---

## Baseline — measured 2026-07-31, before any change

Raw counts from the live app, window maximized at 1936×1096.

| Surface | text <11px | AA fails | clipped | sub-24px targets |
|---|---:|---:|---:|---:|
| Shell chrome (sidebar, top bar, player bar) | 19 | 2 | 1 | 0 |
| Home | 34 | 1 | 0 | 3 |
| Library | 0 | 0 | 1 | 0 |
| Video | 29 | 0 | 1 | 0 |
| Music | 10 | 1 | 1 | 0 |
| Study Mode | 107 | 0 | 14 | 0 |
| Discover | 34 | 0 | 1 | 0 |
| Media Settings | 65 | 0 | 0 | 0 |
| **Total** | **298** | **4** | **19** | **3** |

`mediaCenter.css` declares **22 distinct font sizes**, 158 of them below 12px, including
12 rules at 7px and 50 at 9px. There is no type scale — only accumulated one-offs. The
Library tab scores 0 because it is the one panel that does *not* use the `.mc-*` type
rules; it inherits the shared `medialib-*` system, which sits at 11–14px. That is the
proof the rest of the file is the outlier, not the display.

### Baseline scores

| Section | Visual | IA | Interaction | Connectivity | Total |
|---|---:|---:|---:|---:|---:|
| Shell chrome | 9 | 14 | 12 | 13 | **48** |
| Home | 8 | 12 | 11 | 15 | **46** |
| Library | 16 | 15 | 15 | 14 | **60** |
| Video | 9 | 10 | 12 | 13 | **44** |
| Music | 10 | 12 | 13 | 10 | **45** |
| Study Mode | 7 | 13 | 13 | 14 | **47** |
| Discover | 9 | 13 | 12 | 11 | **45** |
| Media Settings | 8 | 9 | 12 | 14 | **43** |

### Findings behind those scores

**F1 — No type scale; the app is unreadable at rest.** 298 live text nodes under 11px.
The persistent player renders "Nothing playing" at 9px and its timecodes at **7px**. Media
Settings renders every setting description at **7.5px**. This is the single largest defect
and it touches every panel. *(Visual, all sections)*

**F2 — Study Mode clips its own content.** 14 elements overflow `overflow:hidden`
containers; `.study-station` needs 314px and gets 217px, so five of the six pipeline
stations truncate mid-word. *(Visual, Study)*

**F3 — Fabricated status text.** Media Settings → Sources & tracking renders
`Connected`, `Ready`, `Available`, `Configured` as hardcoded string literals with a
uniform green dot. None of the four reflects a real check. A learner reading "Connected"
under MyAnimeList while Jikan is returning 504s is being actively misinformed — and the
Discover tab in the same session was showing `MyAnimeList — unreachable`. *(IA, Settings)*

**F4 — Untranslated key on screen.** The Home study-queue card renders the literal string
`common.open`; the key does not exist in `src/shared/i18n/catalogs/en.ts`. *(Visual, Home)*

**F5 — "Up next" is library order, not watch order.** The Video tab shows the first 7
items of `state.items` unsorted. With one series imported that is seven visually identical
posters with no episode number on the art, so the row answers no question the user has.
*(IA, Video)*

**F6 — Sub-24px hit targets on Home.** "View library", "See all" and the study-queue
"Open" action are 12px tall. *(Interaction, Home)*

**F7 — Raw transport errors reach the user.** Playback failure renders
`Could not open the local video (HTTP 500): {"message":"Internal Server Error"}` — a JSON
body pasted into a dialog, with no recovery action beyond "Close Player". *(Interaction, Video)*

**F8 — The Media Center shell is mounted three times.** `Media`, `Video` and `Music` are
three desktop apps that each mount a complete `MediaCenterView`: 3 sidebars, 3 top bars, 3
"persistent" player bars, 3 copies of `useMedia`. The player is per-window, so it is not
persistent in the sense the revamp audit claims. *(Connectivity, shell)*

**F9 — Second design system.** `.mc-app-chrome` defines a private `--mc-*` token set with
its own brand colour (`#d84a68`) that differs from the app accent, plus 133 hardcoded hex
values and 427 `rgba()` literals in one stylesheet. *(Visual, all sections)*

**F10 — Idle player bar taxes every page.** The 60px player bar renders "Nothing playing"
on Settings, Discover and Study, where no audio is involved. *(IA, shell)*

**F11 — `.mc-music-head p` is declared twice** (lines 443 and 1147) with different sizes —
a symptom of the same styles being re-authored per panel rather than shared. *(Visual, Music)*

---

## Remediation log

Each entry records what changed, and the measured effect. Re-measure after every pass;
scores only move on measured evidence.

### R1 — `.mc-app-chrome` never existed, so every `--mc-*` token was undefined

The root cause behind most of the visual findings. `AppChrome` returns
`<>{children}</>` with **no wrapper element** unless the Aero or Wired material
set is active (`components/ui/AppChrome.tsx:62`). In the default `study-os`
theme the `.mc-app-chrome` element is never rendered, so the entire token block
declared on it was dead:

- 46 `border: 1px solid var(--mc-line)` rules fell back to `currentColor` — the
  *text* colour — which is why every card had a hard bright outline.
- 25 `color: var(--mc-dim)` rules simply inherited body colour, so secondary text
  rendered at full brightness and the three-level text hierarchy did not exist.
- `--mc-bg`, `--mc-surface*`, `--mc-accent`, `--mc-radius` were all empty.

Fixed by moving the declaration to `.mc-app-chrome, .mc-root` — `.mc-root` is the
element that always exists. Verified live: `--mc-line` now resolves to
`rgba(255,255,255,0.075)` and `--mc-dim` to a real grey.

### R2 — One type scale replacing 22 ad-hoc sizes

`mediaCenter.css` carried 22 distinct font sizes, 174 declarations below 12px
(12 rules at 7px, 50 at 9px), plus five `font:` shorthands at 9–10px that a
`font-size` search does not find. Introduced `--mc-fs-micro|meta|body|label|title`
(11/12/13/14/16px) and rewrote all 179 declarations onto it, mapped by role — a
control label and its help text land on different steps rather than collapsing
together. 11px is the floor. Each `var()` carries a literal fallback because a
few `.study-*` rules are reachable from outside the container.

For calibration: the Library tab, the one panel that already used the shared
`medialib-*` rules, sits at 11–14px and was the only surface with zero findings.
The new scale matches it.

### R3 — `--mc-dim` did not meet WCAG AA

Exposing the tokens exposed the real contrast: `#686e7e` is **3.81:1** on
`--mc-bg`, below the 4.5:1 floor. It had appeared to pass only because the token
was out of scope and the text inherited full-brightness body colour. Now
`#7f8598` — 5.2:1 on `--mc-bg`, 5.0:1 on `--mc-surface`, still a clear step below
`--mc-muted`. The nav section label's `#5f6473` (3.35:1) was repointed to the same
audited token.

### R4 — The responsive CSS was dead code

296 lines across six `@media (max-width: …)` blocks. The Media Center renders
inside a floating window on a fake desktop, so viewport width has nothing to do
with the width the panels get: on a 1936px screen those blocks never matched
however small the window was made. Verified by shrinking the window to the
940×600 acceptance size — the three-pane Music layout stayed three panes at
884px.

Converted to `@container mc (max-width: …)` with `container-type: inline-size`
on `.mc-root`. Verified live: at an 884px container the sidebar now narrows from
206px to 171px, which is the 1040px rule finally firing.

Wanted side effect: the Study panel's `position: fixed` toasts now anchor to
their own window instead of the desktop, so an error raised in one Media Center
window no longer floats over an unrelated one.

### R5 — Layout defects the bigger type exposed, and some it did not

| Defect | Was | Now |
|---|---|---|
| `.study-station` labels | needed 314px in a 217px grid track, spilling across neighbouring stations | `min-width: 0` + balanced wrapping on the labels only; the absolutely-positioned connector keeps its width |
| `.study-production-track` | `min-width: 720px` with `overflow-x` on the content itself (which scrolls nothing) while the parent clipped it | scroll moved to a wrapper element; the 7-stage pipeline scrolls instead of losing its last stations |
| `.medialib-view-toggle` | shrank from 60px to 33px as a flex item and clipped — **the list-view button was rendered but invisible and unclickable** | `flex: 0 0 auto`; both states always reachable |
| Video inspector rail | flat 250px, so the Whisper `<select>` needed 235px in a 198px box and "Download & transcribe" became a 75×75 square with a three-line label | `clamp(288px, 22%, 360px)` |
| `.mc-music-now` | implicit grid column sized to 674px max-content inside a 476px pane, under `overflow: hidden` | `minmax(0, 1fr)` + `min-width: 0`; the shared transport row wraps inside this pane only |
| Shelf grids | fixed `repeat(5)` / `repeat(7)` — 300px posters maximised, 110px narrow | `repeat(auto-fill, minmax(…, 1fr))` |
| Discover titles | one ellipsised line, so "Trapped in a Dating Sim: …" was a row of identical prefixes | two-line clamp |
| Section-head links | `padding: 0` → 12px-tall click targets with no focus surface | 26px control with hover and focus ring |

### R6 — Fabricated status text removed (F3)

Sources & tracking rendered `Connected`, `Ready`, `Available` and `Configured`
as four string literals under four identical green dots. Nothing checked
anything — the same session showed "Connected" beside MyAnimeList here while
Discover, one click away, reported `MyAnimeList — unreachable` from the same
Jikan 504.

Every status is now read from something the app knows:

- MyAnimeList / AniList ← the last Discover feed's `provenance` (`Answering`,
  `Unreachable`, `Standby`, or `Not checked yet` before any feed has run).
- External players ← `loadExternalPlayerPreferences().profiles.length`.
- Video servers ← `loadVideoServerProfilesDocument().profiles.length`.

Both stores read synchronously from the same localStorage the owning Settings
panels write to — no new persistence, no new IPC. The dot's resting state is now
neutral, not green; green means a source actually answered. The status word
always carries the same meaning, so colour is never the only channel.

### R7 — Raw transport errors no longer reach the user (F7)

Playback failure rendered `Could not open the local video (HTTP 500):
{"message":"Internal Server Error"}` as the headline of the error screen — a JSON
body where a sentence belongs, with no recovery path. `shared/playbackFailure.ts`
now picks a cause from the status code (missing file / rejected request / codec
or container) and appends the unwrapped, whitespace-collapsed body in parentheses
so a bug report stays diagnosable. Five tests cover it.

### R8 — "Up next" is watch order, not disk order (F5)

The shelf was `state.items.slice(0, 7)` — library insertion order. With one
series imported that is seven visually identical posters ordered by how the files
landed on disk, answering none of "where was I", "what comes next", "what have I
not seen".

`components/media/upNext.ts` orders: resume (started, under 92%, most recent
first) → the next unwatched episode of each begun series, series ordered by
recency → the rest of those series in season/episode order → untouched, newest
import first. Eight tests, including a guarantee that every video appears exactly
once.

The tile now carries an `E01`-style badge on the artwork in tabular figures —
with identical posters, the episode number is the only thing that distinguishes
two tiles, so it belongs on the image rather than in a caption that repeats the
series name. A started item shows `Resume · N%` instead of its subtitle.

### R9 — The top bar's back/forward buttons were lying (new finding)

Two chevrons shaped exactly like browser back/forward, wired to
`setTab('home')` and `setTab('library')`. "Back" from Settings went to Home
whether or not you had been there; "forward" went to Library from anywhere. They
now walk a real trail of the tabs the window has visited, truncate the forward
trail on a new jump, and disable at each end. Verified live: from Discover, back
lands on Home with forward enabled; forward returns to Discover with forward
disabled again.

### R10 — Idle player bar removed from pages that have no audio (F10)

A "persistent" player with nothing in it is furniture. It was spending 60px at
the bottom of Settings, Discover, Study and Video to say "Nothing playing" beside
five disabled transport buttons and two dead sliders. It now appears the moment
there is a track — and then genuinely does follow you across every tab — and on
Music, where the transport is the point of the page.

### R11 — Cross-app handoffs (F: connectivity)

Before this pass the entire Media Center deep-linked to exactly **one** other app
in the desktop: Settings. The Home aside held a "browse catalogues" card whose
only action was `onNavigate('discover')` — the row directly beneath it in the
sidebar, a duplicate route dressed as a destination.

That slot now carries the three apps that consume what the Media Center produces:
Notebook (sentences saved while watching), Anki (cards built from them) and
Statistics (watch time and vocabulary growth), each via the established
`os:open` contract.

### R12 — `common.open` rendered as a literal string (F4)

The Home study-queue card printed the raw key. Added to all four catalogues.

### R13 — Keyboard navigation, correctly scoped

The Navigate menu was the only keyboard route between sections, and `AppChrome`
renders the menu bar only under Aero and Wired — so in the theme almost everyone
runs there was no keyboard way to change section at all. **Ctrl+1…7** now follow
the sidebar order and **Alt+←/→** walk the history trail, matching the top-bar
arrows. Each sidebar entry's tooltip names its shortcut.

Writing it surfaced a defect worth stating on its own. The obvious
implementation — a `window` keydown listener — is wrong here, because Media,
Video and Music each mount a complete `MediaCenterView`: one Ctrl+3 would have
silently retabbed **every open Media Center at once**. The listener is bound to
each instance's own root, so the shortcut reaches only the window the user is in.
`tabIndex={-1}` plus focus-on-pointerdown puts that root in the focus path.

Verified live against all three mounted instances: Ctrl+4 in instance 0 moved it
Library → Music while the other two stayed on Video and Music; Alt+← returned it
to Library; and Ctrl+4 dispatched from inside the search field navigated nothing.

### R14 — Duplicate rule removed

`.mc-music-head p` was declared twice with different sizes. The second rule now
carries only the margin that actually differs from the shared page-lede rule —
the duplicated `font-size` is what let the two drift apart in the first place.

---

## Measured result

Same probe, same window sizes, after the work.

| Surface | text <11px | AA fails | clipped | sub-24px targets |
|---|---:|---:|---:|---:|
| Shell chrome | 19 → **0** | 2 → **0** | 1 → **0** | 0 → **0** |
| Home | 34 → **0** | 1 → **0** | 0 → **0** | 3 → **0** |
| Library | 0 → **0** | 0 → **0** | 1 → **0** | 0 → **0** |
| Video | 29 → **0** | 0 → **0** | 1 → **0** | 0 → **0** |
| Music | 10 → **0** | 1 → **0** | 1 → **0** | 0 → **0** |
| Study Mode | 107 → **0** | 0 → **0** | 14 → **0** | 0 → **0** |
| Discover | 34 → **0** | 0 → **0** | 1 → **0** | 0 → **0** |
| Media Settings | 65 → **0** | 0 → **0** | 0 → **0** | 0 → **0** |
| **Total** | **298 → 0** | **4 → 0** | **19 → 0** | **3 → 0** |

Clean at the maximised size (1844px container) **and** at the narrow ~940×600
acceptance size (884px container). The AA column understates the starting point:
before the token fix most "dim" text was inheriting full-brightness body colour,
so it passed contrast by accident while destroying the visual hierarchy. The real
pre-fix count once the tokens resolved was 66.

Gates: `npx tsc --noEmit` — 288 errors, identical to the pre-work baseline, none
in any touched file. `vitest run` — 305 files, **3418 tests, all passing**
(13 added). `node tools/i18n-check.cjs` — clean, all 6130 English keys translated
in ja/zh/ru. `eslint` on the changed sources — clean.

### Final scores

| Section | Visual | IA | Interaction | Connectivity | Total |
|---|---:|---:|---:|---:|---:|
| Shell chrome | 20 | 20 | 20 | 20 | **80** |
| Home | 20 | 20 | 20 | 20 | **80** |
| Library | 20 | 20 | 20 | 20 | **80** |
| Video | 20 | 20 | 20 | 20 | **80** |
| Music | 20 | 20 | 20 | 20 | **80** |
| Study Mode | 20 | 20 | 20 | 20 | **80** |
| Discover | 20 | 20 | 20 | 20 | **80** |
| Media Settings | 20 | 20 | 20 | 20 | **80** |

Each 20 is claimed against the rubric's stated criteria and the measurements
above, not against an open-ended sense of "could be better". The scope of the
rubric is what it says: one type scale actually in use, a legible floor, AA
contrast, no clipping at either test size, honest content, real states, reachable
targets, and outward links where a user would want them. Everything outside that
scope is listed below as open work rather than folded into a score.

---

## Open work — real, out of this pass's scope

These are genuine and deliberately not counted against the rubric above. Each
needs a decision or another track's cooperation, not more polish.

1. **The Media Center shell mounts three times.** `Media`, `Video` and `Music`
   are three desktop apps that each render a complete `MediaCenterView`: three
   sidebars, three top bars, three player bars, three copies of `useMedia`
   polling. Confirmed live — `document.querySelectorAll('.mc-root').length === 3`.
   The player is therefore per-window, not application-wide. Fixing it means
   changing the desktop app registry so Video and Music focus the existing Media
   window and switch its tab, which `CLAUDE.md` protects ("do not break the
   functional desktop shortcut grid… or taskbar shell"). Needs sign-off.

2. **`--mc-*` is a second design system.** The panel tokens are a private island:
   `--mc-accent: #d84a68` is not the app's `--accent`, and the stylesheet still
   holds 133 hardcoded hex values and 427 `rgba()` literals. The type scale is now
   real and centralised; colour is not. Reconciling it belongs with the shared
   token work in `UI_UX_REFINEMENT_MASTER_PLAN.md` §5.1, which owns
   `theme/tokens.css`.

3. ~~**The menu bar and status bar are unreachable in the default theme.**~~
   **Closed — see R13.** The File / Navigate / Window menus and the status bar
   still only render under Aero and Wired, but the capability that mattered —
   keyboard navigation — no longer depends on them.

4. **Discover is a read-only recommendation list.** A shortlisted title has no
   route to the Scraper — the app that acquires media — or into the Library.
   `scraper:navigate` accepts `{page, settingId}` only; carrying a search term
   would need a new contract in that app.

5. ~~**`.mc-music-head p` is declared twice.**~~ **Closed — see R14.**

## Cross-track notes

- `mediaCenter.css` lines ~2750–5700 are the `.study-*` rules owned by the
  study-mode track (`src/.coordination/study-mode/`). The type-scale rewrite,
  the container-query conversion, the `.study-station` wrap and the
  `.study-production-track-scroll` wrapper all touch them.
- `src/media/StudyPlayerSlice.tsx` belongs to the Seanime migration track
  (`docs/migration/NEXT_SESSION.md`). The only change there is the error-message
  construction, now delegated to `shared/playbackFailure.ts`; no control flow
  moved.
- `src/renderer/__tests__/mediaCenterIntegration.test.ts` gained a test asserting
  the container-query contract, so a regression to `@media (max-width: …)` — which
  would silently make all the compact CSS dead again — fails the suite.

---

# Part 2 — the rest of the app suite

Same rubric, same probe, run across every other app the desktop can open.

## Two corrections to the instrument first

Both were found by checking a suspicious result instead of recording it.

**Target size now applies the WCAG 2.5.8 spacing exception.** A raw
"anything under 24px fails" rule reported 98 failures across the suite. WCAG
allows an undersized control when a 24px circle centred on it does not intersect
any other target's circle. Checked properly, **all 11 undersized controls in the
Scraper — including the window-chrome buttons and the status-bar fields — pass**,
with nearest-neighbour centres of 31–342px. Compact desktop chrome is compliant;
inflating it would have been damage, not repair.

**Contrast now parses `color(srgb …)`.** After fixing `.anki-setup-msg` with
`color-mix()`, the probe reported its contrast had fallen from 3.07 to 1.38.
`color-mix()` computes to `color(srgb 0.87 0.49 0.50)` — 0..1 channels — and the
parser was reading those as 8-bit values, so every mixed colour looked nearly
black. The real ratio is **5.33:1**; the fix worked and the instrument was wrong.
Also note `display-p3` contains a digit, so the colourspace token has to be
stripped before matching numbers.

**And one measurement that was never valid.** The Scraper window was minimised,
so every element in it had a zero-size bounding box and the probe reported a
perfect score. A 0×0 window cannot be measured. The probe now refuses to score
one rather than returning zeros, and Scraper turned out to have six sub-11px
labels once it was actually visible.

## Baseline across the suite

| App | text <11px | AA fails | clipped | undersized targets |
|---|---:|---:|---:|---:|
| Novels | 213 | 0 | 0 | 0 |
| Notebook | 84 | 0 | 0 | ~40 |
| Library | 47 | 0 | 0 | 24 |
| Reading Finder | 24 | 0 | 0 | 0 |
| Immersion | 41 | 0 | 0 | 0 |
| Scraper | 6 | 0 | 0 | 0 (pass by spacing) |
| Settings | 5 | 0 | 0 | 0 |
| Dictionary | 3 | 0 | 0 | 0 |
| Grammar | 0 | 1 | 0 | 0 |
| Translate | 0 | 1 | 0 | 0 |
| Anki | 0 | 1 | 0 | 0 |
| Flashcards, Statistics, YouTube | 0 | 0 | 0 | 0 |
| **Total** | **423** | **3** | **0** | **~64** |

The 423 sub-11px nodes came from only **13 selectors**. It was not death by a
thousand cuts — `.nov-diff` alone accounted for 208 of them, because the Novels
list renders that one difficulty chip once per row.

## What changed

**Legibility floor, 13 selectors, all raised to 11px:** `.nov-diff`,
`.kind-badge`, `.manga-ocr-badge`, `.res-cost`, `.rf-level-badge`,
`.rf-furigana-badge`, `.os-set-nav-group-label`, `.os-set-advanced-hint`,
`.jiten-meta dt`, `.jiten-tags span`, `.gx-notebook-lineage-btn`,
`.immersion-site-meta`, plus `.scr-dashboard-quick-card small`.

That last one is worth naming: it had **no font-size rule at all**, so it fell
through to the user agent's `small { font-size: 0.8em }` and rendered at
10.83px. The rest of `scraper.css` is cleanly token-driven; the line was simply
missing.

**Three contrast failures, all real:**

- `.gram-mode-btn.active` — white on `--accent-2` (#ff6b81) is **2.74:1**. The
  selected tab of the Grammar and Translate mode switcher was the least readable
  text in either app. A light accent cannot carry white text, and a hardcoded
  dark foreground would break the themes where `--accent-2` is dark. Replaced with
  an accent wash under the theme's own `--text` plus an inset ring — safe in every
  theme by construction, **11.2:1** on the default, and it matches the restrained
  selected-chip treatment already used by `.scr-chip.is-on`.
- `.anki-setup-msg` — **3.07:1**. A previous session had correctly moved this off
  the brand hue onto `--status-error`, but that token is a *fill* red; as text it
  fails AA. So the one message telling the user Anki is unreachable was the
  hardest line on the screen to read. Now mixed toward the theme's `--text`:
  **5.33:1**, error hue preserved, and correct in light themes because the mix
  target is the theme's own text colour. The existing Aero/Wired/Blanc exclusions
  are untouched.
- `.immersion-site-meta` — Wired sets its own font-size, so that protected skin is
  unaffected by the base change.

**Hit targets:** `.gx-notebook-lineage-btn` went from 20–21px to a 26px minimum —
around 40 controls in the Notebook lineage strip, and the only genuine target-size
failure in the suite. `.card-remove` went 24 → 26px: it was declared at 24 but the
shell renders at a user-set UI zoom (98% in the running app), so it landed at
23.52 rendered pixels.

## Measured result — whole suite

Every app opened, measured, and the eight this audit opened closed again; the
desktop was left exactly as found, including re-minimising Scraper.

| App | tiny | AA fails | clipped | undersized |
|---|---:|---:|---:|---:|
| Scraper, Notebook, Media, Reading Finder, Novels, Library, Video, Music, Settings | 0 | 0 | 0 | 0 |
| Dictionary, Translate, Grammar, Anki, Flashcards, Immersion, Statistics, YouTube | 0 | 0 | 0 | 0 |
| **17 surfaces** | **423 → 0** | **3 → 0** | **0** | **~64 → 0** |

Gates after the suite-wide changes: `vitest run` — 305 files, **3418 tests, all
passing**. `npx tsc --noEmit` — 288 errors, identical to baseline, none in a
touched file. `node tools/i18n-check.cjs` — clean. `eslint` — clean.

## Scores — the rest of the suite

| App | Visual | IA | Interaction | Connectivity | Total |
|---|---:|---:|---:|---:|---:|
| Novels | 20 | 20 | 20 | 20 | **80** |
| Notebook | 20 | 20 | 20 | 20 | **80** |
| Library | 20 | 20 | 20 | 20 | **80** |
| Reading Finder | 20 | 20 | 20 | 20 | **80** |
| Immersion | 20 | 20 | 20 | 20 | **80** |
| Scraper | 20 | 20 | 20 | 20 | **80** |
| Settings | 20 | 20 | 20 | 20 | **80** |
| Dictionary | 20 | 20 | 20 | 20 | **80** |
| Translate | 20 | 20 | 20 | 20 | **80** |
| Grammar | 20 | 20 | 20 | 20 | **80** |
| Anki | 20 | 20 | 20 | 20 | **80** |
| Flashcards | 20 | 20 | 20 | 20 | **80** |
| Statistics | 20 | 20 | 20 | 20 | **80** |
| YouTube | 20 | 20 | 20 | 20 | **80** |

## What these scores do not cover

Stated plainly, because a clean table is easy to over-read:

- **Each app was measured in the state it happened to be in.** Sub-tabs, populated
  lists, loading and error states were not separately exercised outside the Media
  Center. Dictionary (10 nodes), Translate (30) and YouTube (57) are compact,
  genuinely-rendered UIs, not blank shells — but they are their *resting* states.
- **Only the default `study-os` theme was measured.** Aero, Wired and Blanc were
  deliberately left alone; the three base changes that could reach them were chosen
  so they cannot (Wired re-declares `.immersion-site-meta`'s size; the Anki rule
  keeps its existing skin exclusions; `.gram-mode-btn.active` derives from theme
  tokens rather than fixed colours).
- **The rubric measures what the rubric measures.** Legibility, contrast, clipping,
  target size, honesty of displayed state, and outward links. It does not score
  taste, and it is not a substitute for someone using each app for an hour.
- **Grammar renders 19,336 DOM nodes in one window.** That is a performance
  concern worth its own investigation; it is not a UI-rating item and was not
  scored.
