# HANDOFF S0b — repo skills `honesty-probe`, `css-measure`, `claim-check`

Branch: `audit/s0b-skills`, cut from `audit/s0-skills` @ `1d30324`.

```
Owned:    .claude/skills/honesty-probe/**, .claude/skills/css-measure/**,
          .claude/skills/claim-check/**, docs/audit/HANDOFF_S0B_SKILLS.md
Foreign:  everything else. In particular src/renderer/styles.css (read only),
          .claude/skills/jp-bridge/**, .claude/skills/jp-dispatch/** (S0 — read,
          referenced, not extended)
```

**Pre-existing working-tree state at branch time** — 20 entries, none of them mine, recorded here
so the §6 `git status` check has a baseline to subtract:

```
 M docs/migration/NEXT_SESSION.md                        ?? docs/audit/DISPATCH_S0B_SKILLS.md
 M docs/migration/SLICE_76_PRACTICAL_SWEEP.md            ?? docs/audit/DISPATCH_S0_SKILLS.md
 M docs/migration/USER_VERIFICATION_CHECKLIST.md         ?? docs/audit/PRECOST_A1_A2_PROVENANCE.md
 M docs/migration/progress.json                          ?? docs/migration/SLICE_77_B2P_CORRECTION.md
 M docs/migration/tools/a11y-pixel-sampler.mjs           ?? docs/migration/proof/packaged-a11y-deep-slice77-aero-pixels/
 M docs/migration/tools/audit-carried-items.mjs          ?? docs/migration/proof/packaged-a11y-deep-slice77-default-pixels-v2/
 M docs/migration/tools/packaged-a11y-deep-gate.mjs      ?? docs/migration/proof/packaged-a11y-deep-slice77-default-pixels/
 M docs/migration/tools/storage-migration-gate.mjs       ?? docs/migration/proof/packaged-a11y-deep-slice77-sepia-final/
 M src/renderer/styles.css                               ?? docs/migration/proof/packaged-a11y-deep-slice77-sepia-fixed/
                                                         ?? docs/migration/proof/packaged-a11y-deep-slice77-sepia-pixels/
                                                         ?? docs/migration/proof/storage-migration-slice77-mediastudy-ls/
```

The app was not started, restarted or killed. Nothing outside the owned paths was modified.

---

## 1. Facts I verified myself (not inherited from `HANDOFF_S0_SKILLS.md`)

Every fact encoded into the three skills is below or in §5. The S0 fact table was inherited
whole and not re-derived.

### Facts encoded into `honesty-probe`

| # | Fact as encoded | Verdict | Evidence |
|---|---|---|---|
| **H1** | `src/preload.ts` is the real renderer-facing IPC surface; it exposes one object, `api`, via `contextBridge.exposeInMainWorld('api', api)` | **CONFIRMED** | `src/preload.ts:2209`. File is 105,729 bytes. |
| **H2** | The preload declares **374 distinct `invoke('…')` channels** — the denominator for probe A's static diff | **CONFIRMED (measured this run)** | `grep -oE "invoke\('[^']+'" src/preload.ts \| sort -u \| wc -l` → `374` |
| **H3** | Cross-surface navigation runs on a `window` `CustomEvent` bus named `os:open`, listened for in the shell and dispatched by the command palette | **CONFIRMED** | listener `src/renderer/components/DesktopShell.tsx:1091`; palette dispatcher `src/renderer/components/CommandPalette.tsx:77`. Other dispatchers at `GameArenaContent.tsx:111`, `VisualNovelSentenceAssist.tsx:166`, `MediaContent.tsx:935`, `BlancReadyToolPanels.tsx:144`. |
| **H4** | `AppChrome` is the structural-conformance datum: **19 files import it and render it at 23 sites** | **CORRECTED** — the dispatch says **42 consumers**; the measured number is 19 | Component: `src/renderer/components/ui/AppChrome.tsx:60`. Render sites: `rg -c "<AppChrome" src` → **23 occurrences across 19 files**. Import sites (multiline-aware): **19 files**. See §5.1 for where 42 probably came from. |
| **H5** | `KNOWN_ISSUES.md` still does not exist anywhere in the repo, so probe A–E's document-don't-fix resolution has nowhere to write yet | **CONFIRMED** (re-verified, inherited claim) | `git ls-files \| grep -i known_issues` → no output |
| **H6** | Two separable persistence channels exist and a settings probe must name which one it tested: main-process JSON under `%APPDATA%\jp-study-app`, and renderer `localStorage` | **CONFIRMED** | JSON channel: `HANDOFF_S0_SKILLS.md` §1 (64 entries, 18 `.json` state files). localStorage channel: `UI_UX_AUDIT.md:218-220` — `loadExternalPlayerPreferences()` / `loadVideoServerProfilesDocument()` "read synchronously from the same localStorage the owning Settings panels write to". |
| **H7** | A real orphan-key example exists and is still open: `RETAINED_LS` seeds 5 keys and not `jp-media-study-database-v1` | **CONFIRMED** | `docs/migration/SLICE_76_PRACTICAL_SWEEP.md:378-380`, carried item `media-study-localstorage-half-never-round-tripped`, `audit-carried-items.mjs` exit 0 with that item OPEN. |
| **H8** | `NOT-REACHABLE` is an established verdict in this repo's gates and is deliberately *not* reported as a pass | **CONFIRMED** | `docs/migration/NEXT_SESSION.md:1436-1437` — "E2 honestly reports 2 disabled sliders as NOT-REACHABLE rather than as passes"; `SLICE_76_PRACTICAL_SWEEP.md:6` — "Anything marked UNTESTED or NOT-REACHABLE was not measured, and that is a result, not an omission". |
| **H9** | Probe D's empty/silent vocabulary is not invented here — a shipped gate already distinguishes `CONTENT` / `CONTENT-AWAITING-INPUT` / `EMPTY-HONEST` / `EMPTY-SILENT` / `ERROR` / `NOT-OPENED`, and its first run produced five false EMPTY-SILENT findings | **CONFIRMED** | `docs/migration/SLICE_76_PRACTICAL_SWEEP.md:394-416`. `docs/migration/tools/packaged-surface-sweep.mjs` exists. |
| **H10** | Probe B's "fabricated data" pattern has a shipped precedent: four status words rendered as string literals under four identical green dots, contradicted by the same app one click away | **CONFIRMED** | `UI_UX_AUDIT.md:203-221` (finding F3 / resolution R6). |

### Facts encoded into `css-measure` — the §4 checks

These are §5 of the dispatch's own requirement: whether each item held. Full result table in §5.

| # | Item | Verdict | Evidence |
|---|---|---|---|
| **C1** | `color-mix()` computes to `color(srgb 0.87 0.49 0.50)`, 0..1 channels; 8-bit parse → 1.38 where the true ratio is 5.33; `display-p3` contains a digit | **CONFIRMED, verbatim** | `UI_UX_AUDIT.md:425-431`. Independently corroborated as a *different* failure mode at `docs/migration/NEXT_SESSION.md:1159-1162` and `:1183-1184` (there the unparseable value scored as **ABSENT**, a silent null, not as near-black) — both encoded. Live parser: `docs/migration/tools/packaged-a11y-deep-gate.mjs:312-322`. |
| **C2** | WCAG 2.5.8 spacing exception: raw "under 24px fails" reported **98**; all **11** undersized controls passed, nearest-neighbour centres **31–342px** | **CORRECTED — the exception did not clear the suite, only the Scraper** | `UI_UX_AUDIT.md:417-423`: the 11 are "all 11 undersized controls **in the Scraper**". The suite total was **~64** undersized (`:441-455`), and the exception did **not** absolve them: `.gx-notebook-lineage-btn` at 20–21px across ~40 controls was "the only genuine target-size failure in the suite" and was fixed to 26px (`:493-497`). See §5.2. |
| **C3** | A minimised window measures as perfect — every box 0×0; refuse to score | **CONFIRMED, and stronger than stated** | `UI_UX_AUDIT.md:433-437`: the Scraper window was minimised, "every element in it had a zero-size bounding box and the probe reported a perfect score" — and once actually visible it had **six sub-11px labels**. The silent pass was hiding six real defects. |
| **C4** | A detached node's `getComputedStyle` returns an empty declaration, not `auto` | **CONFIRMED, with its cause** | `docs/migration/NEXT_SESSION.md:6395-6397`: `pick()` closes the palette, so a z-index read taken after Enter returned `''` and "looked like a token that had failed to resolve. Read it before Enter." The interaction being measured is what detaches the node. |
| **C5** | `@media (max-width: …)` never fires inside a floating window; use `@container` + `container-type: inline-size`; drive `.fwin` width from JS, never the OS window | **CONFIRMED; the `.fwin` half is my own addition and is verified separately** | `UI_UX_AUDIT.md:173-184`: **296 lines across six `@media (max-width: …)` blocks** were dead — at 940×600 the three-pane layout stayed three panes at 884px. Converted to `@container mc (max-width: …)` with `container-type: inline-size` on `.mc-root`; at an 884px container the sidebar narrowed 206px → 171px. Regression-pinned at `src/renderer/__tests__/mediaCenterIntegration.test.ts:162,164`. `.fwin` is the floating-window element: rule `src/renderer/styles.css:13440`, applied at `src/renderer/components/DesktopShell.tsx:2700`. |
| **C6** | `.os-tray-btn` declares `background: transparent; border: 1px solid transparent`, so a sampler with no "paints no boundary" class scores the absence of a border at a flat 1.00:1 | **CORRECTED — the conclusion holds, the citation and the declaration do not** | The real declaration is `src/renderer/styles.css:13765-13776`: `background: transparent; **border: none**`. `shell.css:864-876` *does* declare `background: transparent; border: 1px solid transparent`, but its selector list is `.os-start-btn`, `.os-desktop-switch`, `.os-task-win` — **`.os-tray-btn` is not in it**. `shell.css:954-962` is the `.os-tray-btn` rule and sets neither background nor border. See §5.3. |
| **C7** | An `::after` bar at `bottom: 3px; height: 2px` falls between sample rings at 1px and ~6px | **CONFIRMED, exact** | CSS: `src/renderer/components/shell/shell.css:911-923` — `bottom: 3px; width: 16px; height: 2px; background: var(--accent)`. Instrument: `docs/migration/tools/a11y-pixel-sampler.mjs:550-561` states the two depths and that the bar "occupies 3-5px and BOTH rings miss it by a pixel". Rescan bound at `:1161-1180`. |
| **C8** | A contrast defect moves with the palette; this test invalidated a headline finding of 66 that was really 0 | **CONFIRMED** | `docs/migration/SLICE_77_B2P_CORRECTION.md:1-15` and `:112-116` — default `study-os` **66 → 0**, `soft-sepia` **67 → 1**, same build, same flags. The tell at `:18-28`: `identity: 48` was byte-identical on two unrelated palettes because 48 = 6 controls × 8 surfaces and contained no colour at all. |
| **C9** | Bound the work: 13 themes; render-measure `study-os` and `soft-sepia`, verify the rest algebraically | **CONFIRMED, with a naming trap** | `BASE_THEMES` at `src/renderer/theme/engine.ts:69-83` registers **13** themes, `study-os` first and default. `src/renderer/main.tsx:175-176` registers **two more at boot** (`registerFrutigerAero()`, `registerWiredArchive()`), so the app has **15** — "13 themes" is the base set only. `soft-sepia` is the worst light theme by measurement: **174 real B1 failures of 343**, the highest of all 13 (`SLICE_76_PRACTICAL_SWEEP.md:441-455`). |

### Extra traps found while verifying, and encoded

| # | Fact | Evidence |
|---|---|---|
| **X1** | `getComputedStyle(el)` **cannot see a pseudo-element**. A probe reading the element scored the design's backing surface at 1.35:1 and never saw the cue a user reads. "Reading `styles.css` would have confirmed the wrong answer here" — the underline the stylesheet declares is dead, replaced by a different mechanism in a different file. | `docs/migration/NEXT_SESSION.md:986-993` |
| **X2** | Reading `getComputedStyle(el).opacity` immediately after `el.focus()` returns the **mid-transition** value. A 150 ms reveal measures as `0` — i.e. as a CSS bug that is not there. | `docs/migration/NEXT_SESSION.md:35-36` |
| **X3** | The wrong-layer finding is this repo's most repeated instrument failure, counted **five** times in one line of work: offline never requested the network; `distinctStops` counted strings against elements; `targetEnabled` read disk not app; B3 scored 2 of 52; the pseudo-element. | `docs/migration/NEXT_SESSION.md:995-997` |
| **X4** | An instrument that reports clean can be a **non-scan**. `rg --files-from=…` is not a ripgrep flag; with `2>/dev/null` the error vanished and empty output read exactly like "no credentials found". A positive control (`grep for 'export'`, which must match hundreds of files) returned **0**, which is what exposed it. | `docs/migration/SLICE_76_PRACTICAL_SWEEP.md:50-54` |
| **X5** | The 1×1-GIF-class fixture failure has a live analogue: `--fixture` alone measures the same 4 images as no fixture at all; only `SEANIME_SIDECAR=0 … --fixture` produces the 16-image artwork coverage. Anyone running `--fixture` alone and reporting "artwork coverage" is reporting the un-fixtured number. | `docs/migration/SLICE_76_PRACTICAL_SWEEP.md:306-317`, `:537-540` |
| **X6** | A theme-application guard hard-failed on a **correctly applied** theme because it required `data-materials`, which only material-set themes stamp. All twelve base themes would have been reported as twelve theme-application failures. | `docs/migration/SLICE_76_PRACTICAL_SWEEP.md:141-158` |
| **X7** | `--selfcheck` is not universal: `packaged-a11y-deep-gate.mjs` and `phase7-queue-refusal-live-gate.mjs` honour it; `packaged-csp-gate.mjs` and `packaged-offline-gate.mjs` **ignore it and run the full gate**. | `docs/migration/SLICE_76_PRACTICAL_SWEEP.md:525-529` |
| **X8** | A counter that reads 0 in **both** arms of a differential is not observing what it names. `rendererRequestsDuringStep` is 0 in the control arm that demonstrably loaded a remote AniList image. | `docs/migration/SLICE_76_PRACTICAL_SWEEP.md:355-361` |
| **X9** | A token is advisory until proven, and this codebase has **three** instances of one shape: `--control-edge` (a rule outranked the token), `--focus-ring-color` (a recomputation bypassed it), `--accent-2` (an inline write on `<html>` at `osPersonalization.ts:116` shadows it). A stylesheet-only "fix" for the third was **inert on a rebuilt binary** and was reverted. | `docs/migration/SLICE_77_B2P_CORRECTION.md:177-196` |

---

## 2. What I created

| Path | What it is |
|---|---|
| `.claude/skills/honesty-probe/SKILL.md` | The six probes (A–F), the verdict vocabulary, **the canonical row schema**, the two resolution ladders, and the promise-register classification. |
| `.claude/skills/css-measure/SKILL.md` | The nine corrections that decide whether a contrast/layout/box number is true, plus the algebraic bound on theme coverage. |
| `.claude/skills/claim-check/SKILL.md` | Reading a report you did not produce: eight re-derivation rules. |
| `docs/audit/HANDOFF_S0B_SKILLS.md` | This file. |

The row schema is defined **once**, in `honesty-probe` §5. `css-measure` and `claim-check` both
point at it and neither redefines it — verified by grep in §6.

---

## 3. What I could not verify

1. **The skills have never been used by a dispatched agent.** Every fact in them traces to source,
   but whether the row schema actually produces concatenable output across six independent agents
   is untested by construction — it needs six agents. The first wave is the test. If two agents
   disagree about a column, that is a defect in `honesty-probe` §5, not in their work.
2. **Description-triggering is unverified.** Whether the frontmatter `description` on each skill
   actually fires on the phrasings in §3 of the dispatch cannot be checked from inside a run. I
   wrote them to include the literal trigger phrasings; nobody has confirmed a match.
3. **Probe F's proxies have no measured baseline in this repo.** Entry-point count, discovery depth,
   control-type histogram and the lazy-CSS proxies are all *computable* from the tree, but none of
   them has been computed for any surface yet. The `AppChrome` datum (H4) is the only one with a
   number. An agent running probe F is establishing the baseline, not comparing against one.
4. **The `color(srgb …)` near-black failure mode (C1) is documented once, in `UI_UX_AUDIT.md`.**
   The migration track's own record of the same construct describes a *different* failure (parse
   returns null → scored ABSENT). Both are real and both are encoded, but I could not find a second
   independent record of the near-black variant, so its 1.38 figure rests on one source.
5. **I did not run any gate.** No `vitest`, no `i18n-check`, no `architecture-audit`. My four owned
   paths are two Markdown skills' worth of prose plus a handoff; none of them is in a test glob, an
   i18n catalog, or the architecture graph. Stating this rather than implying a clean run.
6. **`docs/audit/PRECOST_A1_A2_PROVENANCE.md` was not read.** It is untracked, someone else's, and
   the dispatch did not point me at it. If it contains facts that contradict what I encoded, they
   have not been reconciled.

---

## 4. Defects noticed in code I do not own — recorded, not fixed

1. **`.os-tray-btn`'s borderless declaration is cited wrongly in two places, one of them shipped
   instrument source.** `docs/migration/tools/a11y-pixel-sampler.mjs:493-496` and
   `docs/migration/SLICE_77_B2P_CORRECTION.md:34-35` both state that `.os-tray-btn` declares
   `background: transparent; border: 1px solid transparent`. It declares
   `background: transparent; border: none` at `src/renderer/styles.css:13765-13772`; the
   `1px solid transparent` belongs to a *different* rule covering three *other* controls
   (`shell.css:864-876`). **The correction's conclusion is unaffected** — the control paints no
   boundary either way, and the fix keys off a measured `bestPairRatio ≈ 1.00`, not off the
   declaration. But an agent who greps `border: 1px solid transparent` looking for the borderless
   family will not find `.os-tray-btn`, and one who reads the comment as a spec will mis-state the
   CSS in a report. Owner of `docs/migration/tools/**` should fix the comment.

2. **`src/renderer/styles.css` and `src/renderer/components/shell/shell.css` both style
   `.os-tray-btn`, and the shell rule does not restate the base.** `styles.css:13765` gives it
   `34×34`, `background: transparent`, `border: none`; `shell.css:954` re-declares `width/height`
   as `32×32` under a `:where(...)` wrapper of zero specificity. Which one wins depends on load
   order, and the size differs between them. Not investigated further — not my path. Flagging
   because any probe-F measurement of tray-button hit size will get one of two answers depending
   on how it reads the cascade.

3. **`jp-bridge` §8 ships a selector that matches nothing: `.fwin[data-id="settings"]`.**
   **`data-id` does not exist anywhere in `src/**`** (`rg data-id src` returns only `data-idx` in
   `CommandPalette.tsx`/`content.js` and `data-identity-*` in two settings panels). The floating
   window is `<section className={`fwin …`} style={{…}}>` at
   `src/renderer/components/DesktopShell.tsx:2698-2702` with **no data attributes at all**.

   **This is the worst possible place for it.** `jp-bridge` §8 is the *refuse-to-score-a-minimised-
   window* guard — the selector returns `null`, the guard returns `{refuse: 'section not found'}`,
   and **a guard that always refuses looks exactly like a guard that is working.** An agent would
   conclude the window was not open and move on, never measuring, never noticing.

   Working replacement, verified: match on the title, which is rendered into `.fwin-title-text`
   (`DesktopShell.tsx:2713`):

   ```js
   [...document.querySelectorAll('.fwin')].find(
     (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes('Settings'))
   ```

   I did **not** edit `jp-bridge` — not my path, and `jp-dispatch` §1 forbids the drive-by fix.
   `css-measure` §3 carries the warning and the working helper, so an agent that loads either skill
   gets the right answer. **The owner of `.claude/skills/jp-bridge/**` should apply the same fix at
   its §8.** Worth also checking `click.ps1` and the other scripts for the same assumption; I read
   `SKILL.md` only.

4. **The `jp-dispatch` §4 gate table and the `jp-bridge` script set are still unexercised.**
   Carried from `HANDOFF_S0_SKILLS.md` §3.1 and repeated here because `honesty-probe` tells agents
   to drive the app through `jp-bridge`, which makes that unverified dependency load-bearing for
   the whole audit wave. One live run should exercise `eval.ps1`, `click.ps1` and `shot.ps1`
   before the first dispatched agent depends on a finding produced by them — and defect 3 above is
   evidence that the untested half of that skill has at least one real fault in it.

5. **`.os-tray-btn` is styled from two files that disagree on its size.**
   `src/renderer/styles.css:13765-13776` gives it `34×34`, `background: transparent`,
   `border: none`. `src/renderer/components/shell/shell.css:954-962` re-declares `width`/`height`
   as `32×32` inside a `:where(...)` wrapper of zero added specificity, and sets no background or
   border. Which wins depends on load order. **Any probe-F measurement of tray-button hit size will
   get one of two answers** depending on how it reads the cascade. Not investigated further — not
   my path.

---

## 5. Whether the §4 items held — the corrections to the audit's own instrument

**Seven of the nine held as written. Two did not**, and one of those changes what an agent should
conclude. Detail for the rows marked CORRECTED in §1.

### 5.1 — `AppChrome` has 19 consumers, not 42 (C-row H4)

```
rg -c "<AppChrome" src      -> 23 occurrences across 19 files
```

19 files import it, 19 files render it, 23 render sites. 39 `.tsx` files mention the string
`AppChrome`, but the extra 20 reference `AppChromeProps` / `useAeroMaterials` / `useWiredMaterials`
from the same module, which is not the same claim.

**Where 42 probably came from:** `src/renderer/components/ui/index.ts` **line 42** is
`export * from './AppChrome';`. A line number read as a count. I cannot prove that is the origin,
but the coincidence is exact and the true count is nowhere near 42.

**Why it matters:** probe F says non-adoption of `AppChrome` "is a measurement and not a matter of
taste". At 42 consumers that argument is strong. At 19, out of ~24 driveable surfaces, it is still
a real majority — but an agent quoting 42 to a user will be quoting a number that does not exist,
in a skill whose subject is not doing that. The skill now carries 19/23 and the command that
produces it.

### 5.2 — the 2.5.8 spacing exception cleared the Scraper, not the suite (C-row C2)

The dispatch reads as though applying the exception took 98 failures to zero. It did not:

- **98** was the raw count across the suite before the exception was applied.
- The **11** that the exception cleared are "all 11 undersized controls **in the Scraper**"
  (`UI_UX_AUDIT.md:420-422`) — window-chrome buttons and status-bar fields, nearest-neighbour
  centres 31–342px.
- The suite baseline records **~64 undersized targets** (`:441-455`), concentrated in Notebook
  (~40) and Library (24).
- Of those, `.gx-notebook-lineage-btn` at 20–21px was **"the only genuine target-size failure in
  the suite"** and was fixed to a 26px minimum (`:493-495`). `.card-remove` was declared at 24px
  but rendered at **23.52** under the user's 98% UI zoom and went to 26px (`:495-497`).

**The correct rule, and it is a sharper one:** apply the exception before reporting, *and* measure
the rendered box, not the declared one — a 24px declaration is not a 24px control under a non-100%
UI zoom. Encoded that way in `css-measure`.

### 5.3 — `.os-tray-btn` is borderless by `border: none`, not `border: 1px solid transparent` (C-row C6)

Verified by reading both files. Detail and the recorded defect in §4.1. The item's *conclusion* —
a borderless-by-design control is not a contrast failure, and a sampler with no class for it scores
the absence of a boundary at a flat 1.00:1 — **holds and is fully corroborated** by the measured
rows (`SLICE_77_B2P_CORRECTION.md:31-33`: every one of the 30 retained rows read
`painted === against, boundaryDistinct: 1, ratio: 1.00`) and by the glyph's real 6.18:1
(`:44-47`). Only the citation and the declared property were wrong.

### 5.4 — the other seven held

C1, C3, C4, C5, C7, C8, C9 verified as written, several of them stronger than stated (C3 was hiding
six real defects; C4 has a named cause; C9's 13 is the *base* set and the app ships 15). Details in
§1.

---

## 6. Self-verification (dispatch §6) — and what the read-back caught

All three files were re-read from disk after writing. **The read-back was not a formality: it
caught two things, one of them serious.**

### 6.1 — I had fabricated a worked example inside the anti-fabrication skill

`honesty-probe` §5's row schema shipped with a "worked row" reading:

```
| S3-E2 | settings | Settings ▸ Reading | E | "Furigana density applies immediately" |
  flipped to `low`; config.json unchanged; `rg jp-reading-furigana-density src`
  → 1 write site, 0 read sites | DEAD | … |
```

**`jp-reading-furigana-density` does not exist** (`rg "furigana-density|furiganaDensity" src` → no
hits). No setting was flipped, no file was diffed, no grep was run. It was illustrative filler that
reads exactly like a measured finding about a real settings panel — in the skill whose §3.B defines
fabricated data and whose §5 says *"a row without this is an opinion."* Anyone skimming for an
example of a real defect would have found one that never happened.

Replaced with an unmistakable `<placeholder>` template. The `31 / 41 controls driven` example in §2
was corrected the same way — `41` is real (the surface sweep's settings count) but the pairing
implied a measurement I never took.

**This is the second consecutive S0-series run whose read-back caught invented illustrative
numbers in the skill that forbids them** — `HANDOFF_S0_SKILLS.md` §2 records the same class of
error in `jp-dispatch` §5. It is evidently the default failure mode when writing an example, and
worth a standing rule: **in these skills, examples use placeholders unless the value was measured.**

### 6.2 — a selector copied from `jp-bridge` matches nothing

`.fwin[data-id="…"]`. Full detail as defect §4.3. I had copied it into two `css-measure` code
samples before verifying it; both are now title-matching helpers, and `css-measure` §3 carries the
warning.

### 6.3 — the four required checks

| Check | Result |
|---|---|
| All three parse as YAML frontmatter + Markdown | **PASS** — `---` at line 1, closing `---` at L12 / L11 / L11, `name:` and `description:` present in each. Lengths 320 / 340 / 212 lines. All three were subsequently picked up and listed as available skills by the harness, which is independent confirmation the frontmatter parsed. |
| Every encoded fact traces to a `CONFIRMED`/`CORRECTED` row | **PASS with two exceptions, both now removed.** Traced in §1 (rows H1–H10, C1–C9, X1–X9). Two claims inherited from the dispatch could not be traced and were rewritten rather than repeated: *"both recorded wrong claims were sweeping quantifiers"* (I could not identify which two; replaced with the two I measured myself) and *"six false findings caught in one session"* (recast as the five-plus-one that `SLICE_76_PRACTICAL_SWEEP.md:50-54` and `:401` actually record). |
| Row schema defined in exactly one place | **PASS** — `grep -rl "\| id \| area \| surface \| probe \|" .claude/skills/` returns **one** file, `honesty-probe/SKILL.md`. Both other skills contain the string `` `honesty-probe` §5 `` and no column list. |
| `git status --porcelain` shows only owned paths | **PASS** — 24 entries: the **20 pre-existing** recorded at the top of this file, plus exactly **4** new: `.claude/skills/claim-check/`, `.claude/skills/css-measure/`, `.claude/skills/honesty-probe/`, `docs/audit/HANDOFF_S0B_SKILLS.md`. |

### 6.4 — read-back on all N edits (`jp-dispatch` §8)

Thirteen assertions run against the three files after the last edit, not a spot check:

```
[1] hp: template row is placeholders        [0] hp: fabricated key removed
[1] hp: coverage example generic            [1] cm: data-id warning present
[0] cm: broken selector removed             [3] cm: title-match helper
[1] cm: React-reassert note                 [1] cm: twelve/13 reconciled
[1] cc: 2.5.8 example added                 [0] cc: untraceable claim removed
[1] cc: 1×1 GIF cited                       [1] cc: .test.tsx cited
[1] cc: six-edits cited
```

All 13 match the expected count. The one `data-id` string remaining in `css-measure` is inside the
warning that explains the selector matches nothing — confirmed by reading its three occurrences.

### 6.5 — one number re-derived by hand rather than inherited

`--muted #9d97a6` on `--panel #1a1823` = **6.18:1**. Computed independently from the WCAG relative
luminance formula (L1 = 0.3205, L2 = 0.009952, (L1+0.05)/(L2+0.05) = 6.18) rather than quoted from
`SLICE_77_B2P_CORRECTION.md:47`. It matches. This is the number the whole borderless-control
correction rests on, so it seemed worth not taking on trust.

---

## 7. Open questions for the user

1. **The `.gitignore` question from S0 is still open and now covers five skills, not two.**
   `HANDOFF_S0_SKILLS.md` §5 asked whether `.claude/skills/` should be written for an outside
   reader or gitignored. I wrote these three in the same **(b)** register — blunt, specific, naming
   incident history, absolute paths, the debug bridge's design, and other agents' worktrees —
   because that is what stops an agent repeating a mistake. **The decision has not been made and I
   did not touch `.gitignore`.** It gets more expensive to reverse with each run.

2. **`AppChrome`'s 42 → 19 correction may propagate.** If the figure 42 came from somewhere other
   than `index.ts:42` — a plan doc, an earlier audit — that source is also wrong and I did not go
   looking. Worth one grep before the audit wave quotes it.

3. **Nothing in this run was committed.** Four untracked paths sit on `audit/s0b-skills`. Say the
   word and they go in with explicit paths; `jp-dispatch` §2 forbids `git add -A` here and there
   are 20 foreign entries in the tree.

4. **`docs/audit/PRECOST_A1_A2_PROVENANCE.md` is untracked, unread by me, and possibly relevant.**
   The dispatch did not point me at it and it is not mine. If it carries facts about the surfaces
   the audit wave will cover, someone should reconcile it against `honesty-probe` before dispatch.
