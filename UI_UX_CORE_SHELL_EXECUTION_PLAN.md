# UI/UX Execution Plan — Account A (Core & Shell)

> **Read `UI_UX_REFINEMENT_MASTER_PLAN.md` first.** It holds the shared policy (scope, protected systems,
> design principles, acceptance criteria §8, global rules §7, validation matrix §16, ownership matrix §12).
> This document adds only what Account A needs; it does not repeat the full master plan. If this file and the
> master plan disagree, the master plan wins — raise it, don't guess. Merge/branch mechanics are in
> `UI_UX_INTEGRATION_PROTOCOL.md`. Debt schema is in `UI_MIGRATION_DEBT.md`.

**You are Account A.** Branch/worktree: `ui/core-shell`. You own the **shared visual system + the shell**. You
execute **Phase 1**, then (after the Phase 1 approval gate) **Phase 2**. You do **not** implement the
application screens owned by Account B; you may inspect them only to validate global propagation and catch
regressions.

---

## Ownership (yours)

Primary ownership:
- `src/renderer/theme/tokens.css`, `src/renderer/theme/tokens.ts` (keep the TS mirror in sync),
  `src/renderer/theme/typography.css`.
- `src/renderer/theme/motion.css`, `src/renderer/theme/a11y.css` — **only where necessary**; preserve all
  reduced-motion / `prefers-contrast` / large-text behavior.
- `src/renderer/components/ui/*` and `src/renderer/components/ui/ui.css`.
- The base `:root`, theme blocks, and **shared + shell** rules in `src/renderer/styles.css`
  (**high-conflict file — primarily yours**).
- `src/renderer/components/DesktopShell.tsx`, `src/renderer/components/WidgetGallery.tsx`,
  approved `src/renderer/components/shell/*` tray/overlay components.
- The shared visual treatment of `src/renderer/components/ui/Window.tsx`.

You must **not** modify Account B's app TSX files (see master §12) except a **minimal, documented compatibility
edit** if an approved shared-primitive API change you made causes a compile failure there — record it in
`UI_MIGRATION_DEBT.md` and keep it to the smallest possible change.

You must preserve: all shell behavior, window-state behavior, drag/resize behavior (the
transform-during-gesture → commit-on-release perf invariant), and existing data contracts — notably the
app-list contract duplicated across `DesktopWinSection` (`src/shared/desktop.ts`), `APPS` (in
`DesktopShell.tsx`), `AppSection.tsx`, and `POPOUT_SECTIONS` (`src/main.ts`). Do not alter that contract.

---

## Phase 1 — Foundations

> All counts/line ranges below are **approximate** — re-verify against the tree before editing (master §5).

### 1.1 Semantic color split — `styles.css` base `:root` (≈ lines 1–64) + `tokens.css`
Today `--accent`, `--red`, `--status-error` are all `#ff2e4d`; `--status-info` and `--focus-ring-color` derive
from accent.
- Keep `--accent` / `--accent-2` = brand red, used only for primary/active/focus/progress.
- Give error its own hue: repoint `--status-error` (and add `--danger` / `--danger-weak` for destructive
  controls) to a distinct error red — deeper / less saturated than brand so "Anki not connected" ≠ "primary
  button". Keep `--red`/`--red-deep` if other code depends on them, but stop using them as the error signal.
- `--status-warning` (amber) and `--status-success` (green) already exist — keep. Repoint `--status-info` to a
  calm blue instead of `var(--accent)`.
- Keep the focus ring accent-derived (`--focus-ring-*`) but ensure every interactive primitive uses it.

### 1.2 Surface ladder — default theme only
Widen luminance gaps between `--bg` / `--sidebar` / `--panel` / `--panel-2` so ≥3 surface levels are
distinguishable per screen (master §8). Add semantic aliases (e.g. `--surface-1..3`, `--surface-input`) so
components can stop hardcoding greys. **Change values only for the default `study-os` theme**; each of the 13
base color-theme blocks (`styles.css` ≈ lines 182–381) may need matching alias values — verify all of them plus
Aero/Wired still read correctly (master §9 regression set).

### 1.3 Unify duplicated systems (repoint, don't delete)
- `--shadow-card` → `--elevation-2`, `--shadow-toolbar` → `--elevation-1`.
- `--motion-duration` (0.14s) → `--dur-fast` so shell/personalization uses the canonical motion scale.
- Spacing: consumers should use one `--space-*` model; add the missing ~20px step and document in the token
  comment which file owns which step (base scale is in `styles.css`; extensions in `tokens.css`).
- Keep `tokens.ts` in sync with any `tokens.css` change (it is a manually-synced mirror).

### 1.4 Reconcile `.btn` with `ui-btn` — `styles.css` + `ui/ui.css`
Update legacy `.btn` / `.btn.primary` / `.btn.small` / `.btn.ghost` to match the refined `ui-btn` tiers
(height, radius, padding, weight, hover/pressed/focus). This lifts the ~521 bespoke buttons globally without
editing TSX. Add a **destructive** button style keyed off `--danger`. Ensure `ui-btn` and `.btn` render
identically so B can adopt either.

### 1.5 Card discipline — **follow master §7 "no broad sweeps"**
Introduce shared surface tokens/classes; refactor `*-card` families **one at a time**, screenshot-verifying
each, to use surface contrast + spacing instead of `1px solid` + accent borders. Reserve borders for
inputs/focus. Reduce the ~45 variants toward a small set (base / quiet / interactive card). A standard card
uses ≤1 containment cue. (Shell-owned cards first; app-owned card families are B's to adopt — you provide the
shared classes.)

### 1.6 Controls — `ui/*` + legacy classes
Align legacy `.os-toggle`, text `<select>`/`<input>` skins, and ad-hoc segmented controls (`seg()`,
`gram-level-btn`) to the shared `Toggle`/`Select`/`Input`/`Tabs` visual language via CSS so all states
(hover/active/selected/focus/disabled) are consistent. **Add a shared segmented-control style** (currently
missing) that both `seg()` and `gram-level-btn` can adopt.
- **Raw-input safety (master §7):** no broad `input`/`select` selectors. Exclude + separately audit
  `checkbox`, `radio`, `range`, `color`, `file`, `date`, `time`, `datetime-local`, `number`, and any
  reader-injected/iframe controls.

### 1.7 Accent detox — **follow master §7 "no broad sweeps"**
Classify the ~248 `var(--accent)` uses in `styles.css` into structural / interactive / semantic-status /
decorative / progress / focus. Then, one component family at a time, replace decorative/structural ones (idle
borders, separators, non-active bars) with neutral surface/border tokens; keep accent only for genuine
active/primary/focus/progress. Screenshot-verify each family before the next.

### 1.8 Create `UI_MIGRATION_DEBT.md`
Instantiate the ledger (schema is already defined in the committed file) and log every legacy family you
touched: CSS-propagated vs migrated, adopted primitive, any temporary workaround, remaining inconsistencies,
validation status, phase, commit. Also log any missing-primitive notes B will need.

**Phase 1 checkpoint:** run the full validation matrix (master §16), do the theme-regression sweep
(`study-os` / `classic-light` / `wired` / `aero` — Aero & Wired must match baseline), self-audit against §8,
present before/after screenshots + changed files + commits + results + remaining issues, then **STOP for
approval. Do not start Phase 2.**

---

## Phase 2 — Shell (only after Phase 1 approval)

All in `DesktopShell.tsx` + shell rules in `styles.css` (+ `components/shell/*`); **visual-only, behavior
preserved.**

- **Taskbar** `.os-taskbar` (≈ lines 2217–2310): reduce visual weight; regularize spacing/alignment; quieter
  inactive task buttons (no accent outline — §8); subtle active indicator; group apps vs system tray; refine
  hover; balance the clock. Must stay usable narrow.
- **Launcher / Start** legacy grid `.os-start-legacy` (≈ lines 1949–2080): stronger search affordance, clearer
  category grouping, quieter identical icons, refined open/close motion. Recents/"continue" **only** if a
  reliable existing data source already provides it — **no new persistence/recommendation/analytics/state**
  (master §7); else omit. Leave the Aero/Wired start variant (`.os-start-aero-menu`) untouched.
- **Widget Gallery** `WidgetGallery.tsx`: from plugin-dashboard to polished gallery — category grouping;
  clearer installed/available/hidden distinction; quieter add controls; hover-revealed actions; better
  favorite treatment; responsive card sizing; real empty/loading states. Use only existing registry/localStorage
  data (`jp-widget-gallery`); add no new data system.
- **Window chrome** `FloatingWindow` (≈ lines 2391–2632): refine active vs inactive (subtle recede, no harsh
  outline — §8), title/control alignment + spacing, window shadow via the elevation ramp. **Do not touch**
  drag/resize handlers, snap logic, or the frameless `city`/notes variants' behavior. Mirror the refined
  visuals into `ui/Window.tsx` for consistency.
- **Shell responsiveness:** taskbar crowding, start grid columns, gallery columns at maximized / ~1280 /
  ~940×600; content never hidden under the taskbar (§8).
- **Shell motion:** use `--dur-*`/`--ease-*`; must not interfere with window drag/resize; honor reduced motion.
- **Shell a11y:** icon-only tray/taskbar controls keep accessible names + tooltips; focus ring visible.

**Phase 2 checkpoint:** same gate as Phase 1. Update `UI_MIGRATION_DEBT.md`. **STOP for approval.**

---

## Cost control
Build a verified file map once at the start; after that use targeted searches, not full-repo rescans. Don't
reread large files repeatedly. Run **targeted** `npx vitest run <path>` / `npx tsc --noEmit` while editing;
reserve the full validation matrix + screenshot matrix for checkpoints. Don't regenerate planning docs or
rewrite approved architecture. Stop when the assigned phase is complete; report blockers instead of repeatedly
attempting broad fixes.

---

## Sonnet Execution Protocol

1. Read `UI_UX_REFINEMENT_MASTER_PLAN.md`, this file, `UI_UX_INTEGRATION_PROTOCOL.md`, `UI_MIGRATION_DEBT.md`,
   and `CLAUDE.md` completely.
2. Confirm you are in the `ui/core-shell` worktree/branch, started from the recorded base commit; confirm the
   working tree is as expected and do not discard unrelated pre-existing changes.
3. Verify every named path, selector, count, and approximate line range against the current tree; report stale
   assumptions **before** editing and adjust.
4. Build a concise working file map; keep it; avoid repeated full-repo scans.
5. Operate only within your ownership (master §12). Respect the synchronization gates (master §14).
6. Follow master §7 (no broad sweeps; raw-input safety; no new features) and §8 (acceptance criteria).
7. Capture the required baseline screenshots (master §9) **before any code change**.
8. Make small, phase-labelled commits. Run targeted checks during; the full validation matrix at the
   checkpoint. Inspect the live app via the `jp-app` MCP and compare against labeled baselines.
9. Update `UI_MIGRATION_DEBT.md`; disclose anything not verified.
10. Stop at the assigned checkpoint and wait for approval. **Never** auto-start the next phase. Never claim
    completion based only on tests. Revert/isolate regressions rather than stacking patches. Report scope
    expansion instead of silently performing it. No destructive git.
