# DISPATCH B7 (static half) — The UI box census

Cold agent, `jp-study-app`. **CSS and source reading only. Do not start, restart or kill any
app** — another agent holds the live queue. Your output is the census the later render pass
measures against.

## 0. Read first

`.claude/skills/jp-dispatch/SKILL.md` · **`.claude/skills/css-measure/SKILL.md`** — its
corrections decide whether any number here is true · `.claude/skills/honesty-probe/SKILL.md`
(row schema) · `.claude/skills/claim-check/SKILL.md`.

## 1. The rule being audited

`UI_UX_REFINEMENT_MASTER_PLAN.md` §8: **a standard card uses no more than one strong containment
cue** — border **or** fill **or** shadow. The user called this out specifically as "the UI boxes".

## 2. Ownership

Only `docs/audit/CENSUS_BOXES.md` and `docs/audit/HANDOFF_B7_BOXES.md`.
**Read `styles.css`; never write it.** No commits, no `git add`, no fixes.

## 3. Scope — and what is excluded

**In:** default `study-os` plus the 12 named palette themes.
**Out, by user ruling:** Blanc, Frutiger Aero, Wired / `wired-archive`, secret-mode. Their
stylesheets are read-only *context* — you must understand the guards to reason about the base
rules, but you never report them as findings.

## 4. The census

Enumerate every box family — `*-card`, `*-panel`, `.ui-card`, `.ui-panel`, and any other
container idiom you find — across `styles.css` (617 KB), `ui/ui.css`, `shell.css`,
`mediaCenter.css`, `scraper.css` and the rest.

Per family: **which cues it paints** (border / fill / shadow), **which tokens each resolves
through**, **how many files use it**, and **whether it is guarded** against the excluded skins.

**Flag every family painting two or more strong cues** — that is the §8 violation, and it is the
core deliverable.

## 5. Bound the theme problem algebraically — do not brute-force it

Families × 13 themes × 2 sizes is unbounded and rendering every cell is not what buys confidence.

1. Resolve each family's cues to the **tokens** they read.
2. Enumerate **which themes override those specific tokens.** A family whose cues are all
   `var(--token)` can only behave differently in a theme that overrides one of its tokens.
3. Output a **short list of theme × family cells that actually need rendering.** That list is the
   later live pass's entire workload.

This reduction *is* the deliverable. Say how many cells the naive matrix would have been and how
many survive.

## 6. Probe F's CSS signals — compute these while you are in here

They share this census's inputs, so do them once:

- **class families used exactly once** — a `*-card` family of size 1 is a bespoke box, not a component
- **native unstyled `<input>` / `<select>` / `<button>`** carrying no app class — the strongest
  "rough box" signal in the set
- **inline `style=`** attributes in TSX
- **hardcoded hex / px** instead of tokens. Known starting point: `mediaCenter.css` reportedly
  holds **133 hex values and 427 `rgba()` literals**, and `--mc-accent: #d84a68` is not the app's
  `--accent` — a second design system. **Re-derive both counts.**
- **structural conformance:** which surfaces adopt `AppChrome` and which are bare `div`s.
  **`AppChrome` has 23 render sites — that is the measured figure; an earlier count of 42 was a
  line-count artifact.** Do not repeat 42.

## 7. The ten open `IR-*` rows

`UI_MIGRATION_DEBT.md` carries ten integration requests. Classify each as **task**,
**decision-needed**, or **won't-fix with reason**. Verify each against the current tree first —
several are old and the code may have moved.

**`IR-3` and `IR-4` are blocking rulings, not tasks.** `theme/blanc-native.css` re-skins Study OS
classes *by class name and prefix*, so migrating Anki, Notebook or Statistics to `ui/*` silently
stops those selectors matching and breaks Blanc — which is out of scope and therefore must not be
broken. State the constraint precisely; do not propose a migration that violates it.

## 8. Instrument corrections you must apply

From `css-measure`, because each has produced a false finding here before:

- `color-mix()` computes to `color(srgb 0.87 …)` — **0..1 channels**. An 8-bit parser reads them
  as near-black and turns a pass into a fail (one real case: 1.38 reported, **5.33** actual).
  Strip the colourspace token before matching numbers — `display-p3` contains a digit.
- **WCAG 2.5.8's spacing exception** — a raw "under 24px fails" rule produced 98 false failures.
  But note it cleared the *Scraper*, not the suite: ~40 `.gx-notebook-lineage-btn` controls were a
  genuine failure it did not absolve. Measure the **rendered** box, not the declared one — the
  shell runs at a user-set UI zoom.
- A **borderless-by-design** control is not a contrast failure.
- **`@media (max-width:)` never fires inside a floating window** — the viewport is the whole
  screen. `@container` with `container-type: inline-size` is the working idiom, and a family
  relying on `@media` for narrow layout is **inert**, which is itself a finding.

## 9. Handoff

`CENSUS_BOXES.md` — the family table, the §8 violations, and the surviving theme × family cell
list.
`HANDOFF_B7_BOXES.md` — **written as you go**: the naive-vs-reduced cell counts, every number
re-derived rather than repeated, the ten `IR-*` classifications, and anything you could not
resolve without rendering (that is the live pass's queue, not a gap).
