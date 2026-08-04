# HANDOFF B7 — the UI box census (static half)

## 1. Scope and ownership

```
Owned:    docs/audit/CENSUS_BOXES.md, docs/audit/HANDOFF_B7_BOXES.md
Foreign:  everything else. src/renderer/styles.css was READ, never written.
Base:     00db8e5  ·  branch audit/a-evidence  ·  no commits, no git add, no fixes
App:      not started, not restarted, not killed. Static pass only.
```

**Deviation from `jp-dispatch` §2, declared.** The skill says branch before the first write. I did
not. This dispatch says "no commits, no `git add`, no fixes", and the working tree already carries
10 modified files and 7 untracked directories belonging to other live runs. Cutting a branch would
have dragged that uncommitted foreign work onto it. My two deliverables are brand-new untracked
files, so staying put costs nothing and risks nothing. Flagged because the dispatch wins for this
run and the skill asks me to say so.

**Disclosure: I parsed the working tree, not the committed base.** `src/renderer/styles.css` carries
another run's uncommitted change (`git diff --stat` → 34 insertions, 5 deletions, the Slice-77
contrast work). I inspected it rather than assume it was irrelevant: it changes `--muted` in
`soft-sepia` / `mint-green` / `rose-pine` from one opaque colour to another, plus comment blocks —
**no background, border or box-shadow declaration is touched.** Exactly 2 of the 484 rendered
≥2-cue families read `--muted` for a cue (`reader-collection-anki-dot`, `ui-toggle__track`), neither
appears in any published table here, and an opaque-to-opaque swap cannot change a cue count. **The
§8 conclusions are unaffected**, but anyone re-running this census against committed `00db8e5`
should expect those two `--muted` values to differ.

## 2. The instrument, and why it had to be built

**A grep-based census of `styles.css` is wrong, not merely imprecise**, and this is the single most
important thing to carry forward.

The §8 remediation already performed in this repo layers a **zero-specificity guarded override**
*after* the original rule (`styles.css:7657`, `:5237`, `:23343`; `ui.css:120`, `:164`):

```css
:where(html:not([data-materials='aero']):not([data-materials='wired']))
  .res-card:where(:not(.blanc-root *)) { background: var(--surface-2); border: 0; }
```

Both selectors score `(0,1,0)`, so the later one wins on source order — which is precisely what
keeps Aero/Wired/Blanc overrides able to out-specify it. A grep finds the *original* rule and
reports a §8 violation that no longer paints.

Measured differentially rather than asserted — the census re-run with guard handling disabled and
diffed against the real run — **19 families resolve to a different cue count than a grep reports**,
every one in the compliant direction: `.anki-card` and `.ui-toolbar` 3→1, `.ui-card` 3→2, and 16
more 2→1 (`.bundle-card`, `.bundle-download-card`, `.cbh-card`, `.cs-card`, `.gram-card`,
`.gram-item`, `.guide-item`, `.gx-notebook-count`, `.gx-notebook-item-btn`, `.media-card`,
`.os-set-card`, `.pl-item`, `.res-card`, `.rf-level-badge`, `.stats-card`, `.ui-panel`). Full table
in `CENSUS_BOXES.md` §0a. **A census reporting these 19 as violations would re-open shipped work.**

The census was therefore produced by a cascade-resolving parser
(`scratchpad/census2.mjs` → `usage2.mjs` → `report.mjs`), which parses 35 sheets in `main.tsx`
import order, classifies each rule **structurally** as base / variant / state / context / skin /
pseudo, resolves `background` / `border-*` / `box-shadow` by specificity then source order, and
expands `var()` chains transitively before deciding whether a cue is painted.

### Four instrument bugs found by controls, not by inspection

Every one would have produced a false finding, and every one was caught by asserting against a
known answer rather than by reading the code.

1. **State detection was a word blacklist.** `.cal-month-cell.today` and `.game-choice.correct`
   leaked into the base reading because `today` / `correct` were not in the list, so both families
   were scored with a *selected-state* border and shadow. Replaced with a structural rule: more
   classes in the subject compound than the family itself ⇒ not base. There is no closed vocabulary
   of state class names, so a word list cannot be right here.

2. **The skin detector read a negative guard as positive skin targeting.**
   `:where(:not(.blanc-root *))` mentions `.blanc-root` only to *exclude* it, but the substring
   matched, so every guarded override was filed as a Blanc rule and dropped from the study-os
   resolution. Effect: `.ui-card`, `.res-card`, `.anki-card` and the nine families at
   `styles.css:23343` all reported their **pre-refinement** cue counts — the tool reported the
   already-fixed families as still broken. Fixed by recursively removing balanced `:not(…)` groups
   before testing.

3. **The token closure stopped at scoped definitions.** `--game-border` is defined on `.game-arena`
   (`styles.css:19819`), not `:root`, so the closure ended there and declared the Game Arena
   theme-invariant. It is not — all six `--game-*` tokens are `color-mix()`es of `--border` /
   `--panel` / `--accent` / `--text`. Corrected before publication; the Game Arena is explicitly
   **not** a finding.

4. **The usage index missed template-literal class names.** v1 parsed `className={…}` with a
   brace-counting regex that truncated on nested template literals, so
   ``className={`flash-card ${flipped ? `flash-card--flipped` : ''}`}`` was invisible. It reported
   **95** dead ≥2-cue families; the true figure is **53**, and the dead `*-card`/`*-panel` count
   fell from 20 to **8**. `flash-card`, `scr-card`, `widget-card`, `os-set-card` and `mining-panel`
   were all wrongly called dead. Rebuilt as an exact-token search bounded by non-class characters.
   **This bug was caught by spot-checking a claim I was about to publish against a raw grep** — the
   two methods disagreed, and the parser was the one that was wrong.

### Controls the instrument is held to

| control | expected | got |
|---|---|---|
| 9 families behind the `styles.css:23343` override block | 1 cue (fill) | 1 cue ✓ |
| `.res-card` (IR-9), `.anki-card` (IR-2) | 1 cue | 1 cue ✓ |
| `.cal-month-cell`, `.flash-card`, `.consent-card` — deliberately **excluded** at `:23336` | still ≥2 cues | 2, 2, 3 ✓ |
| `.ui-panel` | 1 cue | 1 cue ✓ |
| 8 families called dead, under independent raw grep | 0 occurrences each | 0 each ✓ |
| `anki-card` / `scr-tile` / `flash-card` under the same grep | non-zero | 31 / 70 / 1 ✓ |

Row 3 is the negative control. Per `css-measure` §8, a correction that cannot produce a failure is
an amnesty — this one still fails the three families the codebase intends to fail. Rows 5–6 are the
two-sided control on the rebuilt usage index.

**Read-back on all N** (`jp-dispatch` §8): all **46** transcribed family rows and all **12** cell
rows in `CENSUS_BOXES.md` were re-parsed out of the published markdown and asserted against
`report.json`. **0 mismatches** (`scratchpad/verify.mjs`).

## 3. Naive vs reduced cell counts

| stage | cells | what removed them |
|---|---|---|
| naive: families × 13 themes × 2 sizes | **96,798** | — |
| restrict to rendered families painting ≥2 cues | 12,584 | 3,723 → 484 families |
| drop the size axis | 6,292 | **0 of 37** `@media (max\|min-width)` blocks touch a containment cue |
| apply the token algebra | **12** | only 3 token overrides in all 13 themes can extinguish a cue |

**96,798 → 12.** All 12 are `high-contrast` × family; the other 12 base themes cannot change a §8
verdict because every one of their 20 token overrides swaps an opaque colour for another opaque
colour. The three cue-extinguishing overrides are `high-contrast`'s `--shadow-card: none`,
`--shadow-toolbar: none`, `--glass-highlight: transparent`. Full list with per-row predictions in
`CENSUS_BOXES.md` §3 — 4 are predicted to flip 3→2, 8 are predicted not to move.

Add **3** more cells for the only cue-touching `@container` blocks (`mediaLibrary.css`,
`scraper.css`, `mediaCenter.css`) if the live pass wants the size axis covered at all.

## 4. Verification of every claim I was handed

| claim (source) | verdict | evidence |
|---|---|---|
| `AppChrome` has **23** render sites; an earlier 42 was a line-count artifact | **CONFIRMED** | `rg -c "<AppChrome" src` → **19 files, 23 sites**. `ui/index.ts:42` is `export * from './AppChrome';` |
| `mediaCenter.css` holds **133** hex values | **CORRECTED** | **134** occurrences / **92** distinct with comments stripped; 136 counting comments |
| `mediaCenter.css` holds **427** `rgba()` literals | **CORRECTED** | **429** |
| `--mc-accent: #d84a68` is not the app's `--accent` — a second design system | **CONFIRMED, and stronger than stated** | `--accent: #ff2e4d` (`styles.css:39`). **20** `--mc-*` tokens defined at `mediaCenter.css:18-42`, **0** derive from any app token; no file outside `mediaCenter.css` writes any `--mc-*` |
| `UI_UX_REFINEMENT_MASTER_PLAN.md` §8 governs "a standard card" | **CORRECTED** | The plan says "a standard **dashboard** card" (`:150`). The dispatch dropped the qualifier. I audited the broader reading and marked the documented exemptions rather than silently narrowing scope — see §10 Q1 |
| `UI_MIGRATION_DEBT.md` carries **ten open** `IR-*` rows | **CORRECTED** | Ten IR *ids* exist. The doc's own closure table (`:499-504`) marks **7 closed, 3 open** (IR-5, IR-6, IR-10). See §5 |
| IR-2 / IR-8 / IR-9 fixes are "uncommitted (working tree)" (`:449-451`) | **CONFIRMED as landed in the tree** | guarded overrides present: `.anki-card` `styles.css:5237`, `.res-card` `:7657`, `.form-msg.ok/.err` ×2. Not verified as *committed* — I did not inspect the index |
| IR-2: `.anki-card` used by **12 files** | **CONFIRMED exactly** | `rg -l anki-card src --include=*.tsx \| wc -l` → 12 (31 sites) |
| IR-9: `.res-card` shared with ResourcesContent + BundleDetail | **CONFIRMED** | ReadingFinderContent.tsx, BundleDetail.tsx, ResourcesContent.tsx |
| IR-6/IR-10: `nov-modal*` used by ReadingFinderContent **and** ProfileSwitcher **and** NovelsContent/NovelsView | **CORRECTED** | **2 files only**: ProfileSwitcher.tsx, ReadingFinderContent.tsx. Novels no longer uses it |
| IR-6/IR-10: `nov-modal` overridden by protected `aero-apps.css` **and** `wired-apps.css` | **CORRECTED** | aero-apps.css: **8** `nov-modal` rules. wired-apps.css: **0** — its only `nov-` rule is `.nov-diff` (`:1342`) |
| IR-3/IR-4: migrating to `ui/*` silently breaks Blanc | **CONFIRMED, mechanism verified** | `blanc-native.css:18-28` matches by **prefix**; `:35-44` by explicit name. Detail in §5 |
| `BASE_THEMES` registers 13 | **CONFIRMED** | `theme/engine.ts:69-83` |

## 5. The ten `IR-*` rows

The dispatch called these "ten open rows". **Seven are closed by the debt doc's own final table**
(`UI_MIGRATION_DEBT.md:499-504`), which is newer than the row bodies at `:92-104` that still read as
open. Classifications below are against **the tree**, not against either table.

| IR | doc status | tree says | classification |
|---|---|---|---|
| **IR-1** segmented-control primitive | closed | `.ui-segmented` exists (`ui.css:384`), rendered in **1** file (`scraper/pages/SourceManagerPage.tsx`). `.gram-level-btn` is still the idiom in **7** files | **task** — primitive shipped, adoption is ordinary migration work. Not a missing primitive |
| **IR-2** `.anki-card` treatment | closed | guarded override at `styles.css:5237`; resolves to 1 cue | **closed — verified** |
| **IR-3** Blanc class-name coupling | closed | mechanism verified at `blanc-native.css:18-28`, `:35-44` | **won't-fix as written — blocking ruling.** See below |
| **IR-4** Blanc component-export coupling | closed | `BlancStudyPanels.tsx` still imports AnkiContent/StatsContent internals | **won't-fix as written — blocking ruling.** See below |
| **IR-5** `Notification` primitive coverage | **open** | `<Notification>` at **1** site outside `ui/`; bespoke `status-banner` in **2** files, `form-msg` in **10** | **decision-needed** — structural migration of live call sites, not a CSS repoint |
| **IR-6** `Dialog` parity for `nov-modal` | **open** | `nov-modal*` in **2** files; `<Dialog>` at **2** sites outside `ui/` | **decision-needed**, and **cheaper than recorded** |
| **IR-7** bridge-port contention | closed | superseded; single integrated branch | **won't-fix — obsolete.** The §8 narrow ~940×600 criterion it blocked is still unverified for app screens |
| **IR-8** `.form-msg` brand hue | closed | guarded overrides present (2 rules) → `--status-error` / `--status-success` | **closed — verified** |
| **IR-9** `.res-card` two cues | closed | guarded override at `styles.css:7657`; resolves to 1 cue | **closed — verified** |
| **IR-10** `nov-modal` → shared `Dialog` | **open** | as IR-6 | **decision-needed** |

### IR-3 / IR-4 — the ruling, stated precisely

`theme/blanc-native.css` re-skins Study OS classes **by class name and by class-name prefix**, scoped
to `.blanc-root`:

- **prefix selectors** (`:18-28`): `[class^='flash-']`, `[class^='media-']`, `[class^='stats-']`,
  `[class^='music-']`, `[class^='tr-']`, `[class^='gx-notebook']`, `[class^='lib-']`,
  `[class^='epub-']`, `[class^='deck-']`, each paired with a `[class*=' …']` twin;
- **explicit names** (`:35-44`): `.anki-card`, `.stats-card`, `.stats-section`,
  `.stats-level-estimate`, `.gx-notebook-item`, `.gx-notebook-count`, `.media-card`,
  `.tr-history-item`, `.flash-card`, `.flash-strip-card` and others.

**Renaming any of those classes to `ui-*` stops both selector groups matching, and Blanc loses its
skin silently — no error, no test failure, just an unskinned surface.** Blanc is out of scope for
this wave and therefore must not be broken.

**The constraint, stated as a rule rather than a prohibition:** Anki, Notebook and Statistics may be
refined **in place** — declarations may change freely — but their **class names and prefixes are a
public interface consumed by `blanc-native.css`** and must not be renamed or replaced by `ui/*`
classes while Blanc is out of scope. The guarded-override idiom
(`:where(html:not([data-materials='aero']):not([data-materials='wired'])) .X:where(:not(.blanc-root *))`)
is the mechanism that already satisfies this, and it is what shipped for IR-2 / IR-8 / IR-9. **No
migration to `ui/*` is proposed here**, because any such proposal violates the constraint.

### IR-6 / IR-10 — cheaper than the doc records

The debt doc justifies leaving this open partly on the breadth of the blast radius: four call sites
across Novels, and protected overrides in **both** Aero and Wired. Neither survived re-derivation —
`nov-modal*` is in **2** files, and **only Aero** overrides it. That does not make the decision for
the user, but it is a materially smaller job than the record implies, and the record should be
corrected before it is used to schedule the work.

## 6. What I could not verify without rendering

Not gaps — this is the live pass's queue.

1. **The 12 cells**, with per-row predictions in `CENSUS_BOXES.md` §3 so they can be falsified.
   4 predicted to flip 3→2 under `high-contrast`; 8 predicted not to move.
2. **Whether a resolved cue is perceptible.** This census counts cues; it does not measure them.
   `--surface-2` on `--surface-1` is one cue by count and may be invisible at some theme luminances.
   `css-measure` §10 governs: a token reading is a proposal until re-measured on the artifact.
3. **Pseudo-element cues.** 75 `::before`/`::after` occurrences in the in-scope sheets (68
   family-attached) were bucketed out of the base reading. `getComputedStyle` cannot see them, and
   this repo has a recorded case of the real cue living in a pseudo-element while the stylesheet's
   declared cue was dead. A family scored "1 cue" here may paint a second.
4. **The 3 cue-touching `@container` blocks** — need the container narrowed from JS, never by
   resizing the OS window.
5. **Guarded families under the excluded skins.** The 12 families marked "guarded" must be shown
   unchanged in Aero/Wired/Blanc after any refinement. Note the measurement trap already recorded in
   `UI_MIGRATION_DEBT.md`: stamp `data-materials` in one eval and measure in the **next**, or
   `getComputedStyle` returns a partially-stale mixture of two rules and manufactures a false
   "the guard leaks".
6. **Whether IR-2 / IR-8 / IR-9 are committed** as opposed to present in the working tree. I read the
   files; I did not inspect the index, because the tree carries other runs' uncommitted work and I
   was not going to attribute it.

## 7. Defects noticed in code I do not own — recorded, not fixed

| # | where | what |
|---|---|---|
| D1 | `ui/Surfaces.tsx:14,18,22` + `ui.css:107` | **`.ui-card` is a §8 violation and has zero consumers.** Resolves to `FILL + SHADOW` (the guarded refinement at `ui.css:120` drops the border but leaves `box-shadow: var(--elevation-2)`). `ui-card`/`ui-panel`/`ui-glass-card` appear nowhere in `src` outside `Surfaces.tsx`; the two `<Card>` sites in `SeanimeWatchLoopPanel.tsx` are a local component defined at `:358`. The header comment at `ui.css:95-99` describes two cues in the sentence that cites the rule permitting one |
| D2 | `components/ui/**` | **15 of 30 shared primitives have no consumer outside their own directory** — `Card`, `Panel`, `GlassCard`, `Window`, `Sheet`, `Toast`, `MenuBar`, `Tooltip`, `Dropdown`, `SearchBox`, `Breadcrumb`, `TreeView`, `StatusBar`, `SplitPane`, `FormRow`. The adopted set is `Button` 167, `Toggle` 50, `IconButton` 25, `AppChrome` 23, `Select` 19 |
| D3 | `views/mediaCenter.css:18-42`, `:2799-2803` | Two hardcoded token systems (`--mc-*` 20 tokens, `--study-*` 4), **0** deriving from app tokens. Media Center does not re-tint with theme or accent preset. 27 `mc-*` + 32 `study-*` of the 144 theme-invariant ≥2-cue families come from this one file |
| D4 | 8 `*-card`/`*-panel` families | Defined in CSS, **rendered nowhere**: `mat-panel`, `mc-study-queue-card`, `mining-generated-card`, `mining-language-panel`, `nov-card`, `cs-card`, `mc-sync-card`, `media-lib-panel`. `cs-card` is one of the nine families the `styles.css:23343` refinement pass was written to fix — effort spent on a family nothing renders |
| D5 | repo-wide TSX | **470 bare `<input>`** vs 100 with a `className` (82% unstyled); `<select>` 105/85; `<textarea>` 44/20. `<button>` is fine at 233/1,179 |
| D6 | 37 `@media (max\|min-width)` blocks | Inert for anything inside a floating window (`css-measure` §5). None touch a containment cue, so not a §8 concern, but they are dead weight for layout, and only 5 `container-type` declarations exist against 15 `@container` blocks |

D1 is the one I would put in front of the user first: it is simultaneously an F row (zero entry
points) and a `SHIPPED-DEAD` promise — the expensive part is built, and it missed the rule it was
built to satisfy.

## 8. Findings in the row schema

| id | area | surface | probe | claim | what was measured | verdict | evidence path | severity | owner |
|---|---|---|---|---|---|---|---|---|---|
| B7-F1 | boxes | ui/Surfaces — Card/Panel/GlassCard | F | `ui.css:100` "app-owned `*-card` families adopt these" | `rg "ui-card\|ui-panel\|ui-glass-card" src --include=*.tsx --include=*.ts` → 3 hits, all in `Surfaces.tsx`; `rg "<Card\b" src` → 2, both the local component at `SeanimeWatchLoopPanel.tsx:358` | DEAD | `docs/audit/CENSUS_BOXES.md` §2c | major | `src/renderer/components/ui/**` |
| B7-F2 | boxes | ui/* primitive library | F | a shared component library exists for app surfaces | render sites outside `components/ui/`: 15 of 30 primitives = 0; `Button` 167, `Toggle` 50, `IconButton` 25, `AppChrome` 23 | MIXED | `docs/audit/CENSUS_BOXES.md` §5 | major | `src/renderer/components/ui/**` |
| B7-F3 | boxes | Media Center | F | master §6 "no second design system" | `.mc-root` defines 20 `--mc-*` tokens (`mediaCenter.css:18-42`), 0 referencing an app token; `--mc-accent: #d84a68` vs `--accent: #ff2e4d`; no file outside `mediaCenter.css` writes `--mc-*` | FIXTURE | `docs/audit/CENSUS_BOXES.md` §4 | major | `src/renderer/views/mediaCenter.css` |
| B7-F4 | boxes | 46 container families | F | plan §8 "no more than one strong containment cue" | cascade-resolved base rules: 11 families paint border+fill+shadow, 35 paint two; 4 of the 46 are documented exemptions at `styles.css:23336` | BROKEN | `docs/audit/CENSUS_BOXES.md` §2 | major | `src/renderer/styles.css` (holder-owned) |
| B7-F5 | boxes | card/panel families | F | shared card families, not per-screen boxes | 76 `*-card`/`*-panel` families; 68 rendered; **48 used in exactly one file at one site**; 8 rendered nowhere | MIXED | `docs/audit/CENSUS_BOXES.md` §5 | minor | `src/renderer/styles.css` |

`B7-F4`'s verdict is `BROKEN` rather than `DEAD` because the rule is violated by something that
does paint — the boxes render, they render with too many cues. No row here is `LIVE`, and none is
`NOT-REACHABLE`: this was a static pass, so **nothing in this handoff has been driven**, and per
`honesty-probe` §1 every verdict above is a static verdict awaiting the render pass.

## 9. Gates

**Not run, and deliberately.** The deliverable is two new markdown files under `docs/audit/`. No
gate in `jp-dispatch` §4 reads `docs/audit/**`, no source file was modified, and running the suite
would produce totals I could not attribute to my own work — the tree carries 10 modified files and
7 untracked directories from other live runs. Per `jp-dispatch` §5, a delta I cannot bracket is not
a measurement, so I report no gate numbers rather than borrowed ones.

`git status --porcelain docs/audit/` shows exactly the two files I own, both untracked.

## 10. Open questions for the user

1. **§8's subject.** The plan says "a standard **dashboard** card"; the dispatch says "a standard
   card". I audited the broader reading. If the rule binds only dashboard cards, the 46-family table
   shrinks substantially and most of the Scraper and Settings rows fall out. **This is your call and
   it changes the size of the remediation, not just its wording.**
2. **The in-code exemption register** (`styles.css:23336`) names four deliberate deviations. §8
   permits deviations "with a documented per-surface justification". Is a CSS comment the register
   of record, or should these move into `UI_MIGRATION_DEBT.md` where they are reviewable?
3. **`.ui-card` (D1).** Two routes pointing opposite ways: (a) fix the primitive
   (`box-shadow: none`, keeping surface contrast as the single cue) and drive adoption; or (b)
   delete `Card`/`Panel`/`GlassCard` as dead code and accept that bespoke `*-card` families are the
   app's real card system. Doing (a) without adoption work refines something nothing renders.
4. **IR-5 and IR-6/IR-10** are `decision-needed` and yours, not mine. IR-6/IR-10 is smaller than the
   record states (2 files, Aero-only override) — worth re-scoping before deciding.
5. **`UI_MIGRATION_DEBT.md` is internally inconsistent**: the row bodies at `:92-104` read as open
   while the closure table at `:499-504` marks the same rows closed. Anyone reading top-down gets the
   stale answer. I did not edit it — it is not mine — but it should be reconciled.
