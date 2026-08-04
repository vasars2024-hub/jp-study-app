# CENSUS_BOXES — the UI box census (B7, static half)

Static pass. **No app was started, restarted or killed.** Every number below was derived by
parsing the stylesheets in this tree; nothing is repeated from a prior document without
re-derivation. Where a handed figure did not survive re-derivation, both numbers are shown.

- Base commit: `00db8e5`, branch `audit/a-evidence`
- Rule under audit: `UI_UX_REFINEMENT_MASTER_PLAN.md:150` — *"A standard dashboard card uses
  **no more than one strong containment cue** (border OR fill OR shadow)."*
- Scope: default `study-os` + the 12 named palette themes (`theme/engine.ts:69-83`).
  Blanc / Frutiger Aero / Wired / secret-mode read as context only, never reported as findings.

---

## 0. The two methodological points that decide every number here

### 0a. `styles.css` cannot be read rule-first

The §8 remediation that already happened in this repo used a **zero-specificity guarded override**
layered *after* the original rule:

```css
/* styles.css:7623 — the original, still present, still what a grep finds */
.res-card { background: var(--panel); border: 1px solid var(--border); }

/* styles.css:7657 — the rule that actually wins in study-os */
:where(html:not([data-materials='aero']):not([data-materials='wired']))
  .res-card:where(:not(.blanc-root *)) { background: var(--surface-2); border: 0; }
```

Both selectors score **(0,1,0)** — `:where()` contributes nothing — so the second wins on source
order alone, which is exactly what lets Aero/Wired/Blanc overrides keep out-specifying it.

**Consequence: a grep-based census of this file reports the pre-refinement state and is wrong.**
Naively, `.res-card` reads as `FILL + BORDER` (a §8 violation). Resolved through the cascade it is
`FILL` only, and compliant.

Measured differentially — the census run with guard handling disabled, then diffed against the real
run — **19 families resolve to a different cue count than a grep would report**, every one of them
in the compliant direction:

| family | grep view | cascade-resolved | | family | grep view | cascade-resolved |
|---|---|---|---|---|---|---|
| `.anki-card` | 3 | **1** | | `.gx-notebook-item-btn` | 2 | **1** |
| `.ui-toolbar` | 3 | **1** | | `.media-card` | 2 | **1** |
| `.ui-card` | 3 | **2** | | `.os-set-card` | 2 | **1** |
| `.bundle-card` | 2 | **1** | | `.pl-item` | 2 | **1** |
| `.bundle-download-card` | 2 | **1** | | `.res-card` | 2 | **1** |
| `.cbh-card` | 2 | **1** | | `.rf-level-badge` | 2 | **1** |
| `.cs-card` | 2 | **1** | | `.stats-card` | 2 | **1** |
| `.gram-card` | 2 | **1** | | `.ui-panel` | 2 | **1** |
| `.gram-item` | 2 | **1** | | `.guide-item` | 2 | **1** |
| `.gx-notebook-count` | 2 | **1** | | | | |

A census that reported these 19 as violations would be re-opening work that has already shipped.
Every count in this document comes from a cascade-resolving parser.

### 0b. A class is not dead because a `className` parser missed it

The first usage index built for this census parsed `className={…}` with a brace-counting regex. It
truncated on nested template literals, so classes written as

```jsx
className={`flash-card ${flipped ? `flash-card--flipped` : ''}`}
```

were invisible, and **42 families were wrongly reported as dead CSS**. The published index instead
searches every `.tsx`/`.ts` source for the exact class token bounded by characters that cannot
continue a class name, and was positive-controlled both ways: the 8 families it calls dead return 0
under an independent raw grep, and `anki-card` / `scr-tile` / `flash-card` return 31 / 70 / 1.

---

## 1. Corpus and cue distribution

35 stylesheets parsed in `main.tsx` import order (`main.tsx:27-66`), plus the component-imported
sheets. Skin sheets (`aero-*`, `wired-*`, `blanc*`, `frutiger-aero`) are parsed for guard context
and excluded from resolution.

| | count |
|---|---|
| class families with a resolvable base rule | **3,723** |
| painting 3 strong cues | 88 |
| painting 2 strong cues | 449 |
| painting 1 strong cue | 554 |
| painting 0 strong cues | 2,632 |
| **painting ≥2 (the §8 candidate set)** | **537** |
| …of those, referenced from `src/**/*.tsx` | **484** |
| …of those, defined in CSS but **rendered nowhere** | **53** |

"Base rule" = the declarations that apply to a bare `.family` in study-os at rest: guards stripped,
no extra class, no state pseudo-class, no pseudo-element, no ancestor context. Variant, state,
context and skin rules are bucketed separately and are not folded into the base reading.

---

## 2. The §8 violations — container families

Restricting the 484 rendered ≥2-cue families to genuine containment boxes
(`*-card`, `*-panel`, `*-tile`, `*-box`, `*-section`, `*-item`, `*-surface`, `*-well`) gives
**46 families**: **11 paint all three cues**, 35 paint two.

`F` = fill · `B` = border · `S` = shadow. "guarded" = a protected skin overrides this family, so a
refinement must carry the `:where()` guard or it will change Aero/Wired/Blanc.

### 2a. Three cues — 11 families

| family | files/sites | guarded by | base rule | cue tokens |
|---|---|---|---|---|
| `.settings-panel` | 2/3 | aero-apps, blanc | `styles.css:3925` | `--panel`, `--border` |
| `.cbh-panel` | 2/2 | aero-shell | `styles.css:17570` | `--panel`, `--border` |
| `.os-aero-boot-sleep-card` | 1/2 | — | `shell.css:645` | *(literals only)* |
| `.os-qs-tile` | 1/2 | aero-shell | `shell.css:81` | `--glass-tint`, `--glass-border`, `--glass-highlight` |
| `.consent-card` | 1/1 | — | `styles.css:20576` | `--panel`, `--border` |
| `.field-hint-panel` | 1/1 | — | `styles.css:1518` | `--panel`, `--border` |
| `.manga-settings-panel` | 1/1 | — | `styles.css:8712` | `--panel`, `--border` |
| `.mini-panel` | 1/1 | aero-shell, wired-shell | `styles.css:18898` | `--mini-border` |
| `.ocr-panel` | 1/1 | aero-apps | `styles.css:8391` | `--panel`, `--border` |
| `.os-set-search-panel` | 1/1 | — | `styles.css:14271` | `--panel`, `--border` |
| `.ui-glass-card` | 1/1 | — | `ui.css:148` | `--glass-tint`, `--glass-border`, `--elevation-3`, `--glass-highlight` |

`.consent-card` is one of four families the in-code exclusion register at `styles.css:23336`
**deliberately** exempts ("prominent modal") — a documented deviation, not an unowned defect.
`.ui-glass-card`'s single "site" is its own declaration in `ui/Surfaces.tsx:18`; see §2c.

### 2b. Two cues — 35 families

| family | files/sites | guarded by | base rule | cue tokens |
|---|---|---|---|---|
| `.scr-tile` | 6/70 | — | `scraper.css:972` | `--surface-1`, `--panel`, `--border` |
| `.study-loop-card` | 2/12 | — | `styles.css:24532` | `--surface-2`, `--surface`, `--border` |
| `.set-section` | 3/7 | aero-apps | `styles.css:8154` | `--panel`, `--border` |
| `.sa-card` | 1/6 | — | `sentenceAnalysis.css:84` | `--sa-panel`, `--sa-rule` |
| `.deck-action-item` | 1/4 | aero-apps | `styles.css:2920` | *(literals only)* |
| `.flash-strip-card` | 3/4 | wired-apps, blanc-native | `styles.css:5953` | `--border` |
| `.tr-analysis-section` | 4/4 | — | `styles.css:22149` | `--panel`, `--border` |
| `.download-deck-format-tile` | 1/2 | — | `styles.css:1865` | `--panel-2`, `--border` |
| `.heatmap-section` | 1/2 | — | `styles.css:20657` | `--panel`, `--border` |
| `.mc-aside-card` | 1/2 | — | `mediaCenter.css:905` | `--mc-line` |
| `.mini-add-box` | 2/2 | — | `styles.css:18996` | `--panel`, `--border` |
| `.mining-progress-panel` | 2/2 | — | `styles.css:2068` | *(literals only)* |
| `.special-game-card` | 1/2 | — | `styles.css:21724` | `--panel`, `--accent` |
| `.study-preview-panel` | 1/2 | — | `mediaCenter.css:5806` | *(literals only)* |
| `.collapse-section` | 1/1 | aero-apps | `styles.css:5308` | `--panel-2`, `--border` |
| `.flash-card` | 1/1 | wired-motion, wired-apps | `styles.css:6421` | `--panel`, `--border` |
| `.flash-review-strip-card` | 1/1 | — | `styles.css:6281` | *(literals only)* |
| `.game-answer-box` | 1/1 | — | `styles.css:20082` | `--control-bg`, `--game-border` |
| `.gx-test-card` | 1/1 | — | `styles.css:22965` | `--panel-2`, `--border` |
| `.mc-settings-section` | 1/1 | — | `mediaCenter.css:1984` | `--mc-line` |
| `.mc-stat-card` | 1/1 | — | `mediaCenter.css:598` | `--mc-line` |
| `.media-hub-shelf-item` | 1/1 | — | `styles.css:290` | `--surface-1`, `--border` |
| `.media-tracking-card` | 1/1 | — | `styles.css:609` | `--surface-2`, `--border` |
| `.os-set-quick-card` | 1/1 | aero-apps, wired-apps | `styles.css:14518` | `--panel-2`, `--border` |
| `.rf-continue-card` | 1/1 | — | `styles.css:21925` | `--panel`, `--border` |
| `.scr-card` | 1/1 | — | `scraper.css:1041` | `--surface-1`, `--panel`, `--border` |
| `.scr-dashboard-quick-card` | 1/1 | — | `scraper.css:849` | `--surface-1`, `--panel`, `--border` |
| `.scr-dashboard-series-card` | 1/1 | — | `scraper.css:910` | `--surface-1`, `--panel`, `--border` |
| `.scr-discover-featured-card` | 1/1 | — | `scraper.css:1573` | `--surface-1`, `--panel`, `--border` |
| `.scr-form-card` | 1/1 | — | `scraper.css:2043` | `--surface-1`, `--panel`, `--border` |
| `.study-episode-card` | 1/1 | — | `mediaCenter.css:4932` | *(literals only)* |
| `.tr-history-item` | 1/1 | — | `styles.css:23094` | `--panel-2`, `--border` |
| `.ui-card` | 1/1 | — | `ui.css:107` | `--surface-2`, `--elevation-2` |
| `.wall-slideshow-panel` | 1/1 | — | `styles.css:14617` | `--panel`, `--border` |
| `.widget-card` | 1/1 | aero-shell, wired-shell, wired-apps | `styles.css:15949` | `--panel-2`, `--border` |

`.ui-card` is the only row painting `FILL + SHADOW`; every other two-cue row is `FILL + BORDER`.
`.cal-month-cell` (2 cues, `styles.css:17872`) is outside this suffix set but is the third documented
exemption ("border = the calendar grid"); `.flash-card` is the fourth.

### 2c. The finding that outranks the table

**`.ui-card` — the app's canonical card primitive — is itself a §8 violation, and no screen renders it.**

```css
/* ui.css:107  original  */ .ui-card { background: var(--panel); border: 1px solid var(--border);
                                       box-shadow: var(--elevation-2); }
/* ui.css:120  guarded   */ …  .ui-card… { background: var(--surface-2); border: none; }
```

The guarded refinement drops the border and **leaves `box-shadow: var(--elevation-2)` standing**, so
the resolved study-os treatment is `FILL + SHADOW` = **two strong cues**. Its own header comment
(`ui.css:95-99`) states the intent as *"cards separate by SURFACE CONTRAST + a soft elevation, not by
a 1px border (§8: a standard card uses ≤1 strong containment cue)"* — describing two cues in the
sentence that cites the rule permitting one.

Adoption is zero. `Card`, `GlassCard` and `Panel` are declared at `ui/Surfaces.tsx:14,18,22`, and the
strings `ui-card` / `ui-panel` / `ui-glass-card` appear **nowhere else in `src`** — the 1/1 counts in
the tables above are those declarations. The two `<Card>` render sites in
`SeanimeWatchLoopPanel.tsx:326,341` are a **local** `Card` defined at `:358` in the same file, not the
primitive. So the one card family refined toward the §8 target — and missing it — is also the one
family no screen uses, while the 44 others do the real work.

---

## 3. The theme reduction

### The naive matrix

3,723 families × 13 base themes × 2 sizes = **96,798 cells**. Restricting to the 484 rendered
≥2-cue families still leaves 484 × 13 × 2 = **12,584**. Neither is a workload.

### Step 1 — the size axis collapses completely

Measured across every `.css` under `src/`:

| | count |
|---|---|
| `@media (max-width \| min-width)` blocks | 37 |
| …of which touch a containment cue (background / border / box-shadow) | **0** |
| `@container` blocks | 15 |
| …of which touch a containment cue | **3** |
| `container-type` declarations | 5 |

No width media query anywhere changes a containment cue, so **width cannot change a §8 verdict** and
the ×2 size factor disappears. The 3 cue-touching `@container` blocks live in `mediaLibrary.css`,
`scraper.css` and `mediaCenter.css` — the three sheets that also declare `container-type`, so they
do fire inside a floating window and are the only size-sensitive cells.

*(Separately: those 37 `@media` width blocks are inert for anything rendered inside a floating
window — the viewport is the whole screen, `css-measure` §5. They do not affect §8, but they are a
live-pass layout question, not a box question.)*

### Step 2 — only 3 token overrides in the entire theme set can change a cue count

The 12 named themes override **20 distinct tokens** between them (`styles.css:744-956`, plus
`a11y.css:69` for `high-contrast`); `study-os` overrides none, being the `:root` default.

```
--bg --border --chrome --chrome-elevated --control-bg --control-border --focus-ring-color
--focus-ring-width --glass-border --glass-highlight --glass-tint --glass-tint-strong --grid-line
--muted --panel --panel-2 --shadow-card --shadow-toolbar --sidebar --text
```

Enumerating every one of those override *values*: **every theme swaps one opaque colour for another
opaque colour.** A colour change alters how a box looks; it cannot alter whether a cue is painted.
Exactly three overrides set a cue-bearing token to a value that extinguishes the cue, and all three
are in one theme:

| theme | token | value |
|---|---|---|
| `high-contrast` | `--shadow-card` | `none` |
| `high-contrast` | `--shadow-toolbar` | `none` |
| `high-contrast` | `--glass-highlight` | `transparent` |

The companion `a11y.css:78-93` block for `high-contrast` only *adds* fill and border
(`background: var(--panel) !important; border-color: var(--text) !important`), so it can turn cues
on, never off.

**Therefore the §8 cue count is invariant across 12 of the 13 base themes**, and the surviving
workload is families whose cues resolve through those three tokens.

> The closure must be **transitive**, and getting this wrong was a live error in this pass. Both
> `--surface-2 → --panel-2` (`styles.css:99`) and the whole `.game-arena` ladder
> (`--game-border: color-mix(in srgb, var(--border) 82%, var(--text) 10%)`, `styles.css:19819`) are
> theme-reactive only via a token they *derive from*. A first cut of this reduction stopped at the
> scoped name and wrongly declared the Game Arena theme-invariant. It is not.

### The surviving cells — 12

Every one is `high-contrast` × family. Nothing else needs rendering for §8.

| # | family | cues | prediction under `high-contrast` | source |
|---|---|---|---|---|
| 1 | `.buddy-toast` | 3 | shadow is `var(--shadow-card)` alone → **3→2** | `styles.css:12734` |
| 2 | `.os-companion-menu` | 3 | shadow is `var(--shadow-card)` alone → **3→2** | `styles.css:13196` |
| 3 | `.os-start-app-ic` | 3 | shadow is `var(--shadow-toolbar)` alone → **3→2** | `styles.css:13910` |
| 4 | `.os-qs-tile` | 3 | shadow is `inset … var(--glass-highlight)` alone → **3→2** | `shell.css:81` |
| 5 | `.os-flyout` | 3 | `var(--elevation-5)` survives → no change | `shell.css:26` |
| 6 | `.os-start` | 3 | literal second shadow layer survives → no change | `styles.css:13810` |
| 7 | `.ui-dialog` | 3 | `var(--elevation-4)` survives → no change | `ui.css:222` |
| 8 | `.ui-glass-card` | 3 | `var(--elevation-3)` survives → no change | `ui.css:148` |
| 9 | `.ui-menu` | 3 | `var(--elevation-4)` survives → no change | `ui.css:487` |
| 10 | `.ui-notification` | 3 | `var(--elevation-3)` survives → no change | `ui.css:554` |
| 11 | `.ui-toast` | 3 | `var(--elevation-4)` survives → no change | `ui.css:461` |
| 12 | `.ui-window` | 3 | `var(--elevation-5)` survives → no change | `ui.css:171` |

**96,798 → 12.** Rows 5–12 are included because their shadow *mentions* a flip token; the algebra
says the outer elevation layer survives and the count holds. They are cheap to confirm and are the
only places the prediction could be wrong, which is why they stay on the list rather than being
argued away. Add **3** more cells if the live pass wants the `@container` size axis covered.

### Step 3 — the families the algebra cannot help

**144 of the 484 rendered ≥2-cue families paint through no theme-reactive token at all** — they are
identical in all 13 themes by construction. That is not a reduction win; it is §4.

By prefix: `study` 32 · `mc` 27 · `os` 12 · `arcade` 8 · `lens` 7 · `reading` 6 · `csv` 5 · `sa` 4 ·
`lockscreen` 3 · `mini` 3 · `ai` 3 · `deck` 3 · others 61.

---

## 4. The second design system, measured

`master §6` forbids "no second design system". Two exist, and both are in one file.

| scope | tokens defined | how many derive from an app token | verdict |
|---|---|---|---|
| `.mc-root` (`mediaCenter.css:18-42`) | 20 | **0** | second system |
| `.study-orchestrator` (`mediaCenter.css:2799-2803`) | 4 | **0** | second system |
| `.game-arena` (`styles.css:19819-19825`) | 6 | **6** | correctly integrated — *not* a finding |

`.mc-root` hardcodes its entire surface ladder and accent as literals — `--mc-bg: #0b0d13`,
`--mc-surface: #12151f`, `--mc-line: rgba(255,255,255,.075)`, `--mc-accent: #d84a68`. The app's
accent is `--accent: #ff2e4d` (`styles.css:39`); **`--mc-accent` is a different red**, and no theme
and no personalization path writes any `--mc-*` (the only file mentioning them is `mediaCenter.css`
itself). The Media Center therefore does not re-tint with the theme or with the user's accent
preset — 27 of the 144 theme-invariant families are `mc-*`, and 32 more are `study-*` from the same
file.

`.game-arena` is the counter-example worth preserving: it defines a scoped vocabulary, but every
entry is a `color-mix()` of `--border` / `--panel` / `--panel-2` / `--accent` / `--accent-2` /
`--text`, so it re-tints for free. Scoped tokens are not the problem; **literal** scoped tokens are.

---

## 5. Probe F — CSS signals

### Structural conformance

`AppChrome` is rendered by **19 files at 23 sites** (`rg -c "<AppChrome" src`) — re-derived, matching
the figure the dispatch carried. The older "42" is a line-count artifact (`ui/index.ts:42` is
`export * from './AppChrome';`) and is not repeated here.

### Shared-primitive adoption — render sites outside `components/ui/`

| adopted | | barely adopted | | **zero consumers** |
|---|---|---|---|---|
| `Button` | 167 | `Progress` | 5 | `Card`\*, `Panel`, `GlassCard`, `Window`, |
| `Toggle` | 50 | `Sidebar` | 4 | `Sheet`, `Toast`, `MenuBar`, `Tooltip`, |
| `IconButton` | 25 | `ContextMenu` | 3 | `Dropdown`, `SearchBox`, `Breadcrumb`, |
| `AppChrome` | 23 | `Dialog`, `Checkbox`, `Tabs` | 2 | `TreeView`, `StatusBar`, `SplitPane`, |
| `Select` | 19 | `Notification`, `Input` | 1 | `FormRow` |
| `Slider`, `Toolbar` | 8 | | | |

\* `Card` shows 2 raw matches; both are the local component in `SeanimeWatchLoopPanel.tsx:358`. The
primitive's true adoption is 0.

**15 of 30 primitives have no consumer outside their own directory.** The library is real, and the
app is built on `Button` / `Toggle` / `IconButton` and almost nothing else structural.

### Bespoke box families

| | count |
|---|---|
| `*-card` / `*-panel` families with a base rule | 76 |
| rendered anywhere | 68 |
| **used in exactly one file at exactly one site** (bespoke, not a component) | **48** |
| **defined in CSS, rendered nowhere** (dead) | **8** |

Dead: `mat-panel`, `mc-study-queue-card`, `mining-generated-card`, `mining-language-panel`,
`nov-card`, `cs-card`, `mc-sync-card`, `media-lib-panel` — each independently confirmed at 0
occurrences by raw grep. `cs-card` is notable: it is one of the nine families the `styles.css:23343`
refinement pass was written to fix, and nothing renders it.

48 of 68 rendered card/panel families are one-offs. That is the shape §5 of the master plan called
"every screen has its own card", now with a denominator.

### Native controls carrying no `className`

| element | bare | with `className` | bare share |
|---|---|---|---|
| `<input>` | **470** | 100 | 82% |
| `<select>` | **105** | 85 | 55% |
| `<textarea>` | **44** | 20 | 69% |
| `<button>` | 233 | 1,179 | 16% |

Buttons are largely styled; **inputs are not**. Worst files: `VideoCoreStudyOverlay.tsx` (42),
`VisualNovelPanel.tsx` (42), `MediaCenterView.tsx` (37), `EpubMiningPanel.tsx` (34),
`settings/pages/ScraperPage.tsx` (31).

### Inline `style=`

**436 inline `style={…}` attributes across 116 files.** Heaviest: `SeanimeDevPanel.tsx` (25),
`LibraryView.tsx` (24), `ArcadeGames.tsx` (17), `settings/pages/ScraperPage.tsx` (15).

### Hardcoded values vs tokens (in-scope sheets, comments stripped)

| file | hex (distinct) | `rgba()` | `px` | `var(--…)` |
|---|---|---|---|---|
| `styles.css` | 619 (298) | 551 | 6,670 | 3,210 |
| `mediaCenter.css` | **134 (92)** | **429** | 1,403 | 344 |
| `readingGarden.css` | 47 (30) | 120 | 219 | 51 |
| `chrome-extension/content.css` | 73 (28) | 91 | 405 | 138 |
| `shell.css` | 27 (23) | 94 | 227 | 261 |
| `scraper.css` | 9 (4) | 0 | 365 | 1,315 |
| **total, in-scope** | **969** | **1,446** | **9,996** | **6,416** |

> **Re-derivation of the handed figures.** The dispatch carried "133 hex values and 427 `rgba()`"
> for `mediaCenter.css`. Measured now: **134 hex occurrences / 92 distinct, and 429 `rgba()`**
> (136 hex if comments are counted). The claim's substance holds; the digits have drifted by 1–2, so
> the measured values are used throughout and the handed ones are not repeated as current.

`scraper.css` is the contrast case worth naming: 1,315 `var()` references against 9 hex literals and
zero `rgba()`. It is the most token-disciplined sheet in the app, and it sits in the same repo as
`mediaCenter.css`. The gap is a convention gap, not a technical one.

---

## 6. What this census cannot decide without rendering

Handed to the live pass as its queue, not offered as gaps:

1. **The 12 cells in §3.** Predictions are stated per row so the live pass can falsify them.
2. **Whether a resolved cue is *perceptible*.** This census counts cues; it does not measure them.
   `--surface-2` on `--surface-1` is one cue by count and may be invisible at some theme
   luminances. `css-measure` §10 governs: a token reading is a proposal until re-measured on the
   artifact.
3. **Pseudo-element cues.** **75** `::before` / `::after` occurrences across the in-scope sheets
   (68 attached to a family here) were bucketed out of the base reading. `getComputedStyle` cannot
   see them (`css-measure` §4), and this repo has a recorded case of the real cue living in a
   pseudo-element while the stylesheet's declared cue was dead. A family scored "1 cue" here may
   paint a second.
4. **The 3 cue-touching `@container` blocks**, which need the container narrowed from JS, never by
   resizing the OS window.
5. **The guarded families** — `.settings-panel`, `.cbh-panel`, `.mini-panel`, `.os-qs-tile`,
   `.ocr-panel`, `.os-set-quick-card`, `.collapse-section`, `.set-section`, `.flash-strip-card`,
   `.flash-card`, `.widget-card`, `.deck-action-item`. Any refinement must be shown to leave
   Aero/Wired/Blanc unchanged, which is a render comparison, not a read.
