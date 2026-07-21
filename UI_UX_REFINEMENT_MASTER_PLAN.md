# UI/UX Refinement — Master Plan (Source of Truth)

> **Authority:** This document is the single source of truth for the Study OS UI/UX refinement.
> `UI_UX_CORE_SHELL_EXECUTION_PLAN.md` (Account A) and `UI_UX_APP_SCREENS_EXECUTION_PLAN.md` (Account B) are
> **subordinate** to this file. Neither agent may reinterpret the overall visual direction independently. When
> an execution plan and this master plan disagree, this master plan wins; raise the discrepancy rather than
> guessing. Coordination/merge mechanics live in `UI_UX_INTEGRATION_PROTOCOL.md`; migration state lives in
> `UI_MIGRATION_DEBT.md`.

---

## 1. Purpose & final design goal

Transform the app from a visually consistent but dense, developer-made desktop into a **commercial-quality
Study OS** that combines:
- **Windows** productivity, discoverability, and multi-window practicality;
- **macOS** spacing, typography, alignment, and motion discipline;
- **Goose** calm restraint and low visual noise;
- its own **original Study OS identity** (a focused, calm environment built for studying Japanese).

This is **not** a recolor. Success is measured by the acceptance criteria in §8, not by subjective "looks
better."

## 2. Repository context (verified against the working tree)

- Electron + React + TypeScript app; a fake "desktop OS" rendered inside one `BrowserWindow`. Windows,
  taskbar, start menu, and widgets are React DOM, not real OS windows (except optional pop-outs).
- No Tailwind / no CSS-in-JS. Styling = CSS custom properties + plain CSS files + some inline React styles.
- Global CSS import order is defined in `src/renderer/main.tsx` (the authoritative cascade contract).
- **A mature token layer already exists** (`src/renderer/theme/tokens.css` + base `:root` in
  `src/renderer/styles.css`) **and a solid shared component library exists** (`src/renderer/components/ui/*`,
  `ui.css` ≈ 568 lines) — both are **widely bypassed**. The refinement makes the existing system
  authoritative rather than building a new one.
- `src/renderer/styles.css` is a ~20.7k-line monolith holding base tokens, all theme override blocks, and most
  component styles. It is the highest-conflict file in the repo.
- Theme engine: `src/renderer/theme/engine.ts` (facade `theme.ts`). Default look = theme id **`study-os`**
  (no `data-theme` attribute). 13 base color themes + runtime-registered skins (Frutiger Aero, Wired, Anime).
- Base branch for this effort: `grammarx/phase-1-5` (confirm at start; use whatever the user's current
  approved base is).

### Verified tooling / commands (do NOT invent script names)
- `package.json` scripts: **`lint`** = `eslint --ext .ts,.tsx .`; **`test`** = `vitest run`; **`start`** =
  `electron-forge start` (Vite dev server on `http://localhost:5173`). **There is no `typecheck` script.**
- **Type check:** `npx tsc --noEmit` (root `tsconfig.json` includes `src`; `tsconfig.json` must NOT be edited).
- **i18n check:** `node tools/i18n-check.cjs` (exists). Catalog-hygiene is also enforced by vitest at
  `src/shared/__tests__/i18n.test.ts`.
- **Live app inspection:** the `jp-app` MCP — `app_health`, `app_screenshot`, `app_eval`, `app_dom`,
  `app_reload`, `app_click`, `app_type`, `app_key`, `app_logs`. The app is typically already running.
- **Screenshots:** save under `debug/shots/ui-refinement/{baseline,core-shell,app-screens,integration}/`.
  (Confirm `debug/` write location; it may be gitignored — that's fine, baselines only need to persist on
  disk for comparison, not be committed.)

### Path corrections (previous drafts were stale — use THESE)
- SpecialPage → **`src/renderer/components/settings/pages/SpecialPage.tsx`** (not `src/renderer/pages/…`).
- i18n catalog → **`src/shared/i18n/catalogs.ts`** (not `src/renderer/shared/i18n/…`). Core:
  `src/shared/i18n/core.ts`; hook: `src/renderer/i18n.ts` (`useT()`).

## 3. Hard scope boundaries

**In scope:** the default `study-os` theme; the shared token layer; the shared `components/ui/*` primitives;
the legacy global classes in `styles.css` (`.btn`, `.os-*`, `*-card`, borders); the desktop shell (taskbar,
launcher, window chrome, widget gallery); the marquee app screens (Anki, Reading Finder, Settings/Special,
Notebook, Statistics, Reader).

**Out of scope / must not touch — see §4.**

**Migration policy (hybrid, user-chosen):** improve tokens + legacy classes + `ui/*` primitives first so most
screens inherit the new look globally; migrate a bespoke screen to `ui/*` only where CSS propagation cannot
produce a clean, consistent result. No blind 100+ file rewrite. But do **not** preserve duplicated or
fundamentally incompatible bespoke components merely to reduce churn. Prioritize maximum visual consistency
with minimal regression risk; document remaining debt; validate representative screens before expanding.

## 4. Protected systems (never modify)

- **Frutiger Aero** — `src/renderer/theme/frutiger-aero.*`, `theme/aero-shell.css`, `theme/aero-apps.css`, and
  any `[data-materials='aero']` / Aero-scoped `[data-theme=...]` rules.
- **Wired** — `src/renderer/theme/wired-*.css` (`wired-shell.css`, `wired-apps.css`, `wired-widgets.css`,
  `wired-motion.css`, `wired-archive.css`) and any `[data-theme='wired']`-scoped rules or behavior.
- **Blanc** — `src/renderer/theme/blanc*.css` (`blanc.css`, `blanc-native.css`, `blanc-media.css`,
  `blanc-library.css`) and any `.blanc-root`-scoped rules. Blanc is a separate macOS-neutral system with its
  own plan and its own `--blanc-*` token namespace.
- **Build/config** prohibited by `CLAUDE.md`: `forge.config.*`, `vite.*.config.*`, `tsconfig.json`.

**Aero/Wired equivalence rule:** Aero and Wired must remain **visually and behaviorally equivalent to their
baselines**. They inherit base tokens, so every base-token change must be verified against `data-theme='wired'`
and `data-materials='aero'`. A small inherited fix is acceptable **only** if it corrects a genuine defect AND
is documented in `UI_MIGRATION_DEBT.md` as an exception; they must never receive the new default aesthetic.

## 5. Current verified diagnosis (root causes)

1. **Accent == error.** `--accent`, `--red`, `--status-error` are all `#ff2e4d`; `--status-info` and
   `--focus-ring-color` also derive from accent. Brand, primary, error, and focus are the same red.
2. **Flat surface ladder.** `--bg #0f0e13`, `--sidebar #0a0a0e`, `--panel #17161d`, `--panel-2 #211f29` are
   near-identical luminance → windows/cards/rails blend; elevation is unreadable.
3. **Accent overuse.** ~248 `var(--accent)` refs in `styles.css` (borders, bars, badges, links, active states).
4. **Bordered-card overload.** ~465 `1px solid` + ~45 distinct `*-card` rules; every screen has its own card.
5. **Arbitrary spacing.** ~5,362 hardcoded `px` in `styles.css`; the spacing scale exists but is ignored.
6. **Duplicated systems.** Two shadow systems (`--shadow-card` vs `--elevation-*`), two motion-duration
   systems (`--motion-duration 0.14s` vs `--dur-*`), spacing/radius split across `styles.css` + `tokens.css`.
7. **Library underused.** `.btn` ≈521×/102 files vs `<Button>` ≈71×/10 files; bespoke `.os-toggle`, ad-hoc
   segmented controls (`seg()`, `gram-level-btn`), bespoke modals (`nov-modal`) instead of shared `Dialog`.

> **All counts and line ranges in this document are APPROXIMATE** (the tree changes). Execution agents must
> re-verify each cited count/selector/path/line range against the current working tree before editing, and
> correct course if reality differs.

## 6. Design principles (the target language)

- Neutral dark foundation; **brand red used sparingly** — only for primary action, active nav/tab, focus,
  meaningful progress, current state.
- **Separate semantic states:** brand/accent, error, danger/destructive, warning, success, information are
  visually distinct.
- **Perceptible surface hierarchy:** a ~6-step ladder (desktop → window → toolbar → workspace → card → input)
  separated by luminance + one restrained elevation ramp. Borders are intentional (inputs, focus, true
  containment), not decorative repetition.
- **One canonical scale each:** spacing, radius, shadow/elevation, motion. Legacy aliases are repointed to the
  canonical tokens (kept for back-compat), not deleted.
- **Adaptive density:** compact for data rows, comfortable for forms/nav, spacious for dashboards/discovery.
- **No second design system**; no scattered one-off patches; shared-system improvement before bespoke
  migration.

## 7. Global implementation rules

- **No broad sweeps.** The accent detox and card-variant reduction must not be one giant edit. For each:
  (1) classify every usage into structural / interactive / semantic-status / decorative / progress / focus;
  (2) change ONE component family at a time; (3) run targeted validation; (4) capture a representative "after"
  screenshot and diff against the labeled baseline; (5) keep the change independently reviewable;
  (6) continue only when sound.
- **Raw-input safety.** Never apply broad raw-element selectors (`input`, `select`) without excluding and
  separately auditing: `checkbox`, `radio`, `range`, `color`, `file`, `date`, `time`, `datetime-local`,
  `number`, and any reader-injected / embedded / iframe (epub) controls.
- **No new features disguised as refinement.** Do not create new persistence, recommendation, analytics, or
  state-management systems (launcher/widget-gallery/anywhere). Use only existing reliable data; else omit.
- **Preserve:** functionality, keyboard shortcuts, persisted settings, theme switching, window state,
  accessibility, tests, i18n. Do not rename/remove public APIs casually. No mock interfaces, no placeholder
  data.
- **i18n:** any new/changed UI chrome string is an EN key in `src/shared/i18n/catalogs.ts` rendered via
  `t()`/`useT()`; then `node tools/i18n-check.cjs` must be clean and the vitest catalog-hygiene gate green.
  Never translate study content. If a `useMemo`/`useCallback` calls `t()` and must react to language switch,
  depend on `lang` (not `t`). Module-level arrays store i18n keys, resolved at render.
- **Verify before editing:** re-verify cited counts/paths/selectors/line ranges against the tree first.

## 8. Visual acceptance criteria (measurable honesty checks)

Deviations are allowed only with a documented per-surface justification.
- Inactive cards have **no accent-colored border/outline**.
- Inactive task buttons have **no accent-colored outline**.
- Primary/brand actions and errors **never share the same complete visual treatment** (color + shape + weight).
- Normally **one dominant primary action per local region**.
- A standard dashboard card uses **no more than one strong containment cue** (border OR fill OR shadow).
- Every major screen exposes **at least three distinguishable surface levels**.
- At the narrow test size (~940×600), **no primary control clips or becomes inaccessible**.
- **Window content never disappears beneath the taskbar.**
- Active vs inactive windows stay distinguishable **without harsh outlines**.
- Useful information density is retained; advanced functions are **not hidden** merely for minimalism.
- Application screens use shared primitives where suitable; specialized screens keep functional personality
  without diverging from the system.

## 9. Baseline screenshot procedure (before ANY code change)

Capture and label baseline screenshots at fixed viewport sizes and identical app states, into
`debug/shots/ui-refinement/baseline/`. Every "after" screenshot must reuse the exact same size/state as its
baseline. **Do not compare from memory.** Required states:
- Default `study-os`: maximized, medium (~1280×860), narrow (~940×600).
- Overlapping active + inactive windows.
- Launcher open; Widget Gallery open; taskbar with several apps open.
- Anki disconnected state; Reading Finder; Notebook; Statistics; Settings/Special; Reader chrome.
- Reduced-motion state on.
- Theme regression set: `classic-light`, `wired`, `aero`, and Blanc where practical.

Ownership of baselines: whichever agent owns the surface captures it (A → shell/theme set; B → app screens);
either may capture the shared theme-regression set. See the integration protocol for storage handling.

## 10. Phase structure & dependency graph

```text
              Baseline + repository verification
                            │
                 Account A — Phase 1 (Foundations)
                            │
                 Phase 1 checkpoint APPROVED  ◄── hard gate
                            │
        ┌───────────────────┴───────────────────┐
   A — Phase 2 (Shell)                 B — Phase 3A (Anki, Reading Finder, Settings/Special)
        │                                        │
   Shell checkpoint                       App 3A checkpoint
        │                                        │
   (optional shell fixes)              B — Phase 3B (Notebook, Statistics, Reader)
        └───────────────────┬───────────────────┘
                       Integration
                            │
                  Full verification + sign-off
```

- **Phase 1 (A) — Foundations:** tokens (semantic color split, surface ladder, unify shadow/motion/spacing),
  shared `ui/*` primitives, legacy-class reconciliation (`.btn`, cards, toggles, inputs, segmented control),
  controlled accent detox, controlled card cleanup. Creates `UI_MIGRATION_DEBT.md`. **Highest leverage, mostly
  CSS, lowest risk.**
- **Phase 2 (A) — Shell:** taskbar, launcher, window chrome (active/inactive), Widget Gallery, shell
  responsiveness/motion/a11y, shell theme-regression validation. Visual-only; behavior preserved.
- **Phase 3A (B) — App screens:** Anki, Reading Finder, Settings + Special.
- **Phase 3B (B) — App screens:** Notebook, Statistics, Book Reader (+ any explicitly approved remaining
  marquee surfaces).

**Hard dependency:** Account B may implement Phase 3A **only after** Account A's Phase 1 is approved and B has
incorporated the exact approved Phase 1 commit. While Phase 1 is in progress, B runs **preparation mode only**
(audit, file map, baseline screenshots, behavior notes — no visual changes, no global CSS).

## 11. Two-agent work allocation

- **Account A — Core & Shell** (`ui/core-shell`): Phase 1 + Phase 2. Owns the shared visual system and shell.
- **Account B — App Screens** (`ui/app-screens`): Phase 3A + Phase 3B. Consumes A's shared system; never
  redefines it.

## 12. File-ownership matrix

| File / area | Owner | Notes |
|---|---|---|
| `src/renderer/theme/tokens.css`, `tokens.ts` | **A** | Keep the TS mirror in sync with the CSS. |
| `src/renderer/theme/typography.css` | **A** | Type roles/scale. |
| `src/renderer/theme/motion.css`, `theme/a11y.css` | **A** (only where necessary) | Reduced-motion/contrast preserved. |
| `src/renderer/components/ui/*` (+ `ui/ui.css`) | **A** | Shared primitives + a new segmented control / danger button. |
| `src/renderer/styles.css` — base `:root`, theme blocks, shared component + shell rules | **A** | **High-conflict; primarily A-owned.** |
| `src/renderer/components/DesktopShell.tsx` | **A** | Visual-only; preserve drag/resize + app-list contract. |
| `src/renderer/components/WidgetGallery.tsx` | **A** | Gallery redesign. |
| `src/renderer/components/shell/*` (tray/overlays) | **A** | Visual-only. |
| `src/renderer/components/ui/Window.tsx` (shared visual treatment) | **A** | Align with shell chrome. |
| `src/renderer/components/anki/AnkiContent.tsx` | **B** | Phase 3A. |
| `src/renderer/components/reading/ReadingFinderContent.tsx` | **B** | Phase 3A. |
| `src/renderer/components/settings/SettingsApp.tsx`, `SettingsCard.tsx`, `SettingsNav.tsx` | **B** | Phase 3A. |
| `src/renderer/components/settings/pages/SpecialPage.tsx` | **B** | Phase 3A (visual + i18n only; Aero/Wired lab content behavior-identical). |
| `src/renderer/components/notebook/NotebookContent.tsx` | **B** | Phase 3B. |
| `src/renderer/components/stats/StatsContent.tsx` | **B** | Phase 3B; do not touch the Aero render branch. |
| `src/renderer/views/BookReader.tsx` | **B** | Phase 3B; do not disturb epub iframe CSS injection. |
| App-local styles for B-owned screens (in `styles.css`) | **B, serialized** | Only under the §15 conditions; else request via A. |
| `src/shared/i18n/catalogs.ts` | **Joint, serialized** | Each adds keys for its own screens; merge additively. |
| `UI_MIGRATION_DEBT.md` | **Joint** | A creates; both update only their own entries. |
| **Protected** (Aero/Wired/Blanc, build/config) | **None** | Never edited. |
| Validation-only (tests, screenshots) | either | No source contract changes. |

Ambiguity rule: if ownership of a specific selector/section is unclear, it belongs to **A** (shared) unless it
is exclusively scoped to a single B-owned screen.

## 13. Branch / worktree strategy

- Branch names: `ui/core-shell` (A), `ui/app-screens` (B), `ui/integration` (merge target).
- Both branches start from the **same verified base commit** (record its SHA in the integration protocol).
- Use **separate git worktrees or separate clones** so the two accounts never edit the same physical checkout
  concurrently.
- Small, phase-labelled commits. Integrate at checkpoints — never leave two large unreviewed branches to merge
  at the very end.
- No destructive git (no `reset --hard`, `clean`, force-push, or discarding unrelated working-tree changes).
  Note: the working tree currently has unrelated modifications — do not discard them; branch/worktree from the
  agreed base without clobbering them.

## 14. Checkpoint & synchronization gates

Each phase ends with a gate: present before/after screenshots (same viewport/state as baseline), changed-file
list, `npx tsc --noEmit` + `vitest run` + `node tools/i18n-check.cjs` results, theme-regression sweep results
(incl. Aero/Wired equivalence), acceptance-criteria self-audit, and remaining issues. **Then stop and wait for
user approval.** Agents never auto-advance to the next phase. The Phase 1 → (Phase 2 ‖ Phase 3A) gate is hard:
B cannot implement until the approved Phase 1 commit is incorporated.

## 15. Conflict-prevention rules (shared files)

`styles.css` is primarily A-owned. Account B may modify app-specific sections of `styles.css` only when ALL of
these hold: (1) the selectors are exclusively tied to a B-owned screen; (2) the edit does not redefine any
shared component contract; (3) the section can be isolated cleanly; (4) the change is documented in
`UI_MIGRATION_DEBT.md`; (5) A is not simultaneously editing that section; (6) the commit is small and
independently mergeable. Prefer keeping app-local styles in appropriately scoped selectors; do not perform
unrelated stylesheet-architecture refactors just to avoid a merge. Any unavoidable shared-file change is
resolved via the integration protocol (not by blindly accepting either branch).

## 16. Validation matrix

| Check | Command / method | When |
|---|---|---|
| Type check | `npx tsc --noEmit` | during (targeted) + at checkpoint |
| Unit/catalog tests | `vitest run` (or `npx vitest run <path>` targeted) | targeted during; full at checkpoint |
| i18n | `node tools/i18n-check.cjs` | after any chrome-string change; at checkpoint |
| Lint | `npm run lint` | at checkpoint |
| Live inspection | `jp-app` MCP (`app_screenshot`/`app_eval`/`app_dom`/`app_reload`) | during + checkpoint |
| Responsive | resize to maximized / ~1280 / ~940×600 | checkpoint |
| Theme regression | `study-os`, `classic-light`, `wired`, `aero` (Aero/Wired unchanged) | after token/global edits; checkpoint |
| Accessibility | keyboard nav, focus ring visibility, icon-button names/tooltips, non-color status | checkpoint |
| Reduced motion | `html.reduce-motion` / `prefers-reduced-motion` | checkpoint |

Compilation alone is **not** visual verification.

## 17. Migration-debt rules

Maintain `UI_MIGRATION_DEBT.md` (schema defined in that file). A creates it in Phase 1. Each agent updates only
its own entries where possible. Record CSS-propagated vs structurally-migrated, adopted primitive, temporary
local workarounds (marked for removal), missing-primitive integration requests, remaining inconsistencies,
validation status, phase, commit, and any Aero/Wired inherited-fix exception. **Remove an entry only after the
related work is visually verified.** Merge reconciliation for the file is defined in the integration protocol.

## 18. Final integration procedure (summary; full detail in the integration protocol)

Integrate incrementally: approve+integrate Phase 1 → allow parallel Phase 2 (A) and Phase 3A (B) →
integrate those checkpoints → complete Phase 3B → final integration verification (full validation matrix +
full screenshot matrix + functional smoke checks + theme regression) → sign-off report.

## 19. Definition of done

- Practical/discoverable like a strong Windows desktop; macOS spacing/typography/motion polish; Goose calm;
  recognizable Study OS identity.
- Works maximized, medium, and narrow (~940×600).
- No longer reads as an admin dashboard or generic Electron app.
- Shared components genuinely consistent; major screens inspected, not assumed.
- Taskbar, launcher, and widget gallery meaningfully redesigned; advanced functionality still available.
- Quieter without becoming empty; all acceptance criteria (§8) met or documented as justified exceptions.
- Aero, Wired, Blanc unchanged (or only documented, approved inherited fixes).
- All validation-matrix checks pass; result visually reviewed and iterated, not merely compiled.
- `UI_MIGRATION_DEBT.md` reflects the true end state (no unverified removals).

## 20. Rollback procedure

- Work in phase-labelled commits so any phase can be reverted with `git revert` of its commit range (never
  `reset --hard` on shared branches).
- If a global token/class change causes a regression that can't be quickly fixed, revert that specific
  commit/family and re-approach it as a smaller, classified change (per §7 "no broad sweeps").
- Keep `ui/integration` as the safe merge target; if integration reveals conflicts that can't be cleanly
  reconciled, drop back to the last integrated checkpoint rather than stacking patches.
- Never discard the repo's pre-existing unrelated working-tree changes during a rollback.
