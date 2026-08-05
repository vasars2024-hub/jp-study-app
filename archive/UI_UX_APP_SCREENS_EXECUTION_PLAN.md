# UI/UX Execution Plan — Account B (Application Screens)

> **Read `UI_UX_REFINEMENT_MASTER_PLAN.md` first.** It holds the shared policy (scope, protected systems,
> design principles, acceptance criteria §8, global rules §7, validation matrix §16, ownership matrix §12).
> This document adds only what Account B needs. If this file and the master plan disagree, the master plan
> wins — raise it, don't guess. Merge/branch mechanics are in `UI_UX_INTEGRATION_PROTOCOL.md`. Debt schema is
> in `UI_MIGRATION_DEBT.md`.

**You are Account B.** Branch/worktree: `ui/app-screens`. You own the **application screens**. You **consume**
the shared visual system that Account A establishes; you do **not** create a competing system. You execute
**Phase 3A**, then (after its checkpoint) **Phase 3B** — but only after the hard dependency below is satisfied.

---

## HARD DEPENDENCY — read this before doing anything

Account A must finish **Phase 1 (Foundations)** and get it **approved** before you implement any screen.
Reason: your screens must be built against the *new* shared tokens, `.btn`/`ui-btn`, cards, inputs, toggles,
and segmented control. Building against the old contracts means redoing the work.

- **While Phase 1 is in progress → PREPARATION MODE ONLY** (see below).
- **After Phase 1 is approved →** incorporate the exact approved Phase 1 commit per
  `UI_UX_INTEGRATION_PROTOCOL.md`, verify the shared token/primitive contracts match the master plan, then
  implement Phase 3A.

---

## Ownership (yours)

Primary ownership:
- `src/renderer/components/anki/AnkiContent.tsx`
- `src/renderer/components/reading/ReadingFinderContent.tsx`
- `src/renderer/components/notebook/NotebookContent.tsx`
- `src/renderer/components/stats/StatsContent.tsx`
- `src/renderer/components/settings/SettingsApp.tsx`, `SettingsCard.tsx`, `SettingsNav.tsx`
- `src/renderer/components/settings/pages/SpecialPage.tsx`  ← note the `settings/pages/` path
- `src/renderer/views/BookReader.tsx`
- App-local styles that do **not** alter global contracts.
- `src/shared/i18n/catalogs.ts` — **only** for strings introduced by your own screens (add EN key + run the
  i18n check; a follow-up fills ja/zh/ru).

You must **not** independently redefine any global system: tokens, button styles, card styles, inputs, focus
rings, surface levels, typography, window chrome, taskbar, or launcher styling. Those are Account A's. You also
must not touch protected systems (Aero/Wired/Blanc, build/config — master §4).

### When you need a shared primitive/token that doesn't exist yet
1. Record it in the **Integration Requests** section of `UI_MIGRATION_DEBT.md` (component/token needed, screen,
   why).
2. Prefer a **narrow, temporary, local** solution only when necessary to keep moving; mark it clearly for
   removal.
3. Do **not** silently edit Account A-owned global files.
4. Let Account A (or the final integration pass) implement the shared change.

### Editing `styles.css` (high-conflict, primarily A-owned)
Allowed only under all six conditions in master §15 (selectors exclusively tied to your screen; no shared
contract redefined; cleanly isolated; documented; A not editing that section; small independently-mergeable
commit). Otherwise file an integration request. Prefer keeping app-local styles in tightly-scoped selectors;
don't refactor stylesheet architecture just to avoid a merge.

---

## PREPARATION MODE (while Phase 1 is in progress)

**Allowed:** read the plans + `CLAUDE.md`; verify your assigned paths; build a concise app-screen file map;
record current bespoke components per screen; identify likely shared-primitive replacements; capture your
screens' **baseline screenshots** (master §9); document behavior that must be preserved; identify i18n
requirements; identify missing component states; prepare an implementation checklist.

**Forbidden in prep mode:** implementing visual changes; altering global CSS; creating competing primitives;
migrating screens against the pre-Phase-1 contracts; committing styling based on old tokens; any change that
will need redoing after Phase 1.

End preparation with a **preparation report** and wait for the approved Phase 1 commit.

---

## Phase 3A — Anki, Reading Finder, Settings/Special

> Hybrid migration (master §3): consume shared primitives; migrate a screen structurally only where CSS
> propagation can't yield a clean result. Re-verify all cited paths/selectors first.

- **Anki** `anki/AnkiContent.tsx` (logic via `useAnkiConfig`; setup in `components/AnkiSetup.tsx`). Design
  proper connection states — connected / disconnected / connecting / config-required / add-on-unavailable /
  unexpected-error — using the shared `Notification` primitive (`kind="error"` etc.) instead of the bespoke
  `status-banner`/`form-msg err` blocks. The big red error block becomes a **calm status banner + progressive
  disclosure** of setup, with clear action hierarchy (Retry / Open setup / Test connection / Manage profile).
  Error state uses the error hue, **not** brand accent (§8). This screen currently ignores every shared
  primitive → likely a **real migration** target (adopt `Button`/`Input`/`Select`/`Card`/`Notification`).
  Note: `AnkiContent` deliberately renders frameless so Study OS wraps bodies in `anki-card` and Blanc in
  `fieldset` — preserve that seam; do not break Blanc.
- **Reading Finder** `reading/ReadingFinderContent.tsx`. Establish the reading sequence: continue → level →
  search → refine → results. Adopt shared `SearchBox`/`Select`/the new segmented control for the JLPT level
  row (`gram-level-btn`) and filters (genre/length/price + furigana/18+ toggles). Replace the bespoke
  `nov-modal`/`nov-modal-backdrop` detail with shared `Dialog`. Calm the accent on level buttons + the
  `rf-continue-bar` progress. Keep all content reachable at limited window height (internal scroll).
- **Settings** `settings/SettingsApp.tsx` + `SettingsCard.tsx` + `SettingsNav.tsx`. Reduce the wall of bordered
  `os-set-card`s: use section titles + grouped controls + spacing where a card isn't needed; keep advanced
  disclosure. Tidy nav selection state (clear current selection without heavy accent). Standard cards ≤1
  containment cue (§8).
- **Special page** `settings/pages/SpecialPage.tsx`. Visual cleanup + **i18n** for its stray literals (e.g.
  "Blanc Mode", "Reduced static/noise", "Replay boot on entry") via `catalogs.ts`. **Its Aero/Wired lab
  content must stay behavior-identical** — you are cleaning up the page's own chrome, not the Aero/Wired
  systems. Do not restyle Aero/Wired themselves.

**Phase 3A checkpoint:** full validation matrix (master §16), theme regression (incl. Blanc for Anki since it
shares those bodies), §8 self-audit, before/after screenshots (same states as baseline), changed files +
commits, unresolved integration requests, remaining issues. Update `UI_MIGRATION_DEBT.md`. **STOP for
approval. Do not start Phase 3B.**

---

## Phase 3B — Notebook, Statistics, Reader (only after 3A approval)

- **Notebook** `notebook/NotebookContent.tsx`. Reduce per-card borders; adopt the shared `Tabs` for the
  bespoke `gx-notebook-views` tablist; dashboard rhythm; readable list rows + timestamps.
- **Statistics** `stats/StatsContent.tsx`. Reduce `stats-card` borders; dashboard rhythm; align numerals.
  **Keep the classic render path; do NOT touch the Aero (`aero-stats-*`) render branch** (that's protected
  Aero territory).
- **Book Reader** `views/BookReader.tsx`. Refine reader chrome spacing/typography only (`reader-bar`,
  `reader-controls`, `reader-footer`, buttons). **Do NOT disturb the epub iframe CSS injection**
  (`buildReaderCss` / `styleContents`) or the `stageBg` reading-surface logic — raw-input/embedded-content
  safety (master §7).
- Plus any explicitly approved remaining marquee surfaces.

**Phase 3B checkpoint:** same gate as 3A. Update `UI_MIGRATION_DEBT.md`. **STOP for approval.**

---

## Cost control
Build your app-screen file map once during prep; after that use targeted searches. Don't reread large files
repeatedly. Run targeted `npx vitest run <path>` / `npx tsc --noEmit` while editing; full validation matrix +
screenshot matrix at checkpoints only. Don't regenerate planning docs. Stop when the assigned phase is
complete; report blockers rather than repeatedly attempting broad fixes.

---

## Sonnet Execution Protocol

1. Read `UI_UX_REFINEMENT_MASTER_PLAN.md`, this file, `UI_UX_INTEGRATION_PROTOCOL.md`, `UI_MIGRATION_DEBT.md`,
   and `CLAUDE.md` completely.
2. Confirm you are in the `ui/app-screens` worktree/branch, from the recorded base commit; don't discard
   unrelated pre-existing working-tree changes.
3. If Phase 1 is **not yet approved** → PREPARATION MODE ONLY (see above); end with a prep report and stop.
4. If Phase 1 **is approved** → incorporate its exact commit per the integration protocol; verify shared
   token/primitive contracts match the master plan **before** implementing.
5. Verify every named path/selector/count/line range against the tree; report stale assumptions before
   editing. Keep a working file map; avoid full-repo rescans.
6. Operate only within your ownership (master §12). Consume shared primitives; never redefine global systems.
   File missing-primitive integration requests in `UI_MIGRATION_DEBT.md`.
7. Follow master §7 (no broad sweeps; raw-input/embedded safety; no new features) and §8 (acceptance criteria).
   Respect i18n rules (EN key + `t()`, then `node tools/i18n-check.cjs`, keep the vitest catalog gate green).
8. Capture required baseline screenshots (master §9) before any code change; reuse identical states for after.
9. Small, phase-labelled commits; targeted checks during, full validation matrix at checkpoint; inspect the
   live app via the `jp-app` MCP.
10. Update `UI_MIGRATION_DEBT.md`; disclose anything not verified and any unresolved integration requests.
11. Stop at the assigned checkpoint and wait for approval. **Never** auto-start the next phase. Never claim
    completion based only on tests. Revert/isolate regressions rather than stacking patches. Report scope
    expansion instead of silently performing it. No destructive git.
