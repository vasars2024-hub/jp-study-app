# UI/UX Refinement — Integration Protocol

> Coordination + merge mechanics for the two-agent refinement. Read with
> `UI_UX_REFINEMENT_MASTER_PLAN.md` (source of truth). Account A =
> `UI_UX_CORE_SHELL_EXECUTION_PLAN.md`; Account B = `UI_UX_APP_SCREENS_EXECUTION_PLAN.md`.
> Git guardrails: no destructive operations (no `reset --hard`, `clean`, force-push, or discarding unrelated
> working-tree changes). The current working tree already has unrelated modifications — never clobber them.
> Interactive git flags (`-i`) are unavailable in the agent shells.

---

## 1. Branch & worktree preparation

- Branches: `ui/core-shell` (A), `ui/app-screens` (B), `ui/integration` (merge target). All start from the
  **same base commit** (§2).
- Prefer **separate git worktrees** (or separate clones) so the two accounts never edit the same physical
  checkout at once. Example (adjust to the user's setup; run from the repo root):
  ```bash
  # from the agreed base commit/branch
  git branch ui/core-shell
  git branch ui/app-screens
  git branch ui/integration
  git worktree add ../jp-study-app-core-shell ui/core-shell
  git worktree add ../jp-study-app-app-screens ui/app-screens
  ```
- If worktrees are impractical, the two accounts must work **sequentially in time** on the same checkout, never
  concurrently, switching branches between sessions. Worktrees are strongly preferred.

## 2. Base commit recording

Record the exact base SHA both branches start from:
```bash
git rev-parse HEAD    # note this SHA in UI_MIGRATION_DEBT.md header
```
Fill it into `UI_MIGRATION_DEBT.md` (Coordination header) so both agents share one anchor.

## 3. Baseline ownership

Baseline screenshots (master §9) are captured **before any code change**, into
`debug/shots/ui-refinement/baseline/` with fixed sizes/states. A captures the shell + theme-regression set; B
captures its app screens (during prep mode). Either may capture the shared theme set; don't duplicate
needlessly. Baselines only need to persist on disk (they may be gitignored).

## 4. Phase 1 synchronization gate (hard)

1. A implements Phase 1 on `ui/core-shell`, runs the full validation matrix + theme regression, presents the
   checkpoint, and gets **user approval**.
2. Tag/record the approved commit:
   ```bash
   git tag ui-phase1-approved <approved-sha>   # or record the SHA in UI_MIGRATION_DEBT.md
   ```
3. Only now may B leave preparation mode.

## 5. How Account B incorporates the approved foundation

Before implementing Phase 3A, B brings the approved Phase 1 into `ui/app-screens` using the
**repository-safe, non-destructive** method:
```bash
# in the app-screens worktree, clean working tree for tracked files you own
git fetch    # if remotes are involved; otherwise operate locally
git merge ui-phase1-approved        # preferred: a real merge, preserves history
# (rebase onto the tag is acceptable only if B has no un-pushed shared commits and the user is comfortable;
#  default to merge to avoid rewriting history)
```
Then B verifies the shared token/primitive contracts (accent-vs-error split, `.btn`/`ui-btn` parity, surface
aliases, segmented control) match the master plan **before** editing screens. If they don't match, stop and
raise it — do not build against a mismatch.

## 6. File ownership (authoritative copy — mirrors master §12)

- **A:** `theme/tokens.css`, `theme/tokens.ts`, `theme/typography.css`, (as needed) `theme/motion.css`,
  `theme/a11y.css`; `components/ui/*` + `ui/ui.css`; base `:root` / theme blocks / shared+shell rules in
  `styles.css`; `DesktopShell.tsx`; `WidgetGallery.tsx`; approved `components/shell/*`; shared visuals of
  `ui/Window.tsx`.
- **B:** `anki/AnkiContent.tsx`; `reading/ReadingFinderContent.tsx`; `notebook/NotebookContent.tsx`;
  `stats/StatsContent.tsx`; `settings/{SettingsApp,SettingsCard,SettingsNav}.tsx`;
  `settings/pages/SpecialPage.tsx`; `views/BookReader.tsx`; app-local non-global styles.
- **Joint, serialized:** `src/shared/i18n/catalogs.ts` (additive per screen); `UI_MIGRATION_DEBT.md`.
- **High-conflict, primarily A:** `styles.css` (B edits only under §8 conditions here / master §15).
- **Protected, nobody:** Aero/Wired/Blanc, `forge.config.*`, `vite.*.config.*`, `tsconfig.json`.

## 7. Shared-file request workflow

When B needs a shared token/primitive/global change: record it in the **Integration Requests** table of
`UI_MIGRATION_DEBT.md` (what, which screen, why, temporary workaround if any). A (or the integration pass)
implements it in A-owned files. B removes its temporary workaround once the shared change lands and is
verified.

## 8. B editing `styles.css` — six conditions (all required)

(1) selectors exclusively tied to a B-owned screen; (2) no shared component contract redefined; (3) section
cleanly isolable; (4) documented in `UI_MIGRATION_DEBT.md`; (5) A not editing that section concurrently;
(6) small, independently-mergeable commit. Otherwise → integration request (§7).

## 9. Commit naming convention

`ui(<phase>/<area>): <summary>` — examples:
- `ui(p1/tokens): split brand accent from error/danger hues`
- `ui(p1/btn): reconcile legacy .btn with ui-btn tiers`
- `ui(p2/taskbar): quiet inactive task buttons, regularize spacing`
- `ui(p3a/anki): connection states via shared Notification`
Keep commits small and single-purpose so they can be reverted or cherry-picked independently.

## 10. Checkpoint integration order (incremental — never big-bang)

```text
approve Phase 1 → merge ui/core-shell(P1) → ui/integration
   → (parallel) A: Phase 2   |   B: Phase 3A
approve Phase 2 → merge into ui/integration
approve Phase 3A → merge into ui/integration
   → B: Phase 3B
approve Phase 3B → merge into ui/integration
   → final integration verification → sign-off
```
Do **not** leave both branches unmerged until the very end.

## 11. Merge-conflict handling

- Conflicts should be rare if ownership is respected. When they occur, resolve by **intent**, not by blindly
  choosing "ours"/"theirs": A wins on shared/global rules; B wins on app-local selectors.
- `styles.css` conflicts: re-apply each side's change to its owned section; if a B edit turns out to touch a
  shared contract, revert it and convert to an integration request.
- If a conflict can't be cleanly reconciled, drop back to the last integrated checkpoint on `ui/integration`
  rather than stacking fixes (master §20).

## 12. `UI_MIGRATION_DEBT.md` reconciliation

Both branches may append rows. On merge, keep **both** sides' rows (the schema's `Owner` column disambiguates);
never drop a row during conflict resolution. If the same row was edited by both, keep the more recent
`Validation status` and note both commits. Remove a row only after its work is visually verified.

## 13. Theme-regression verification (every integration)

After each merge into `ui/integration`, run the theme sweep: `study-os`, `classic-light`, `wired`, `aero`
(+ Blanc for Anki). Aero/Wired/Blanc must match their baselines (or match a documented, approved exception).

## 14. Full integration screenshot matrix (final)

Reproduce the master §9 state list on `ui/integration` at identical sizes/states and compare to baselines:
maximized / medium / narrow; overlapping windows; launcher; widget gallery; taskbar with several apps; Anki
disconnected; Reading Finder; Notebook; Statistics; Settings/Special; Reader; reduced-motion; theme set.

## 15. Full validation (final)

`npx tsc --noEmit`; `vitest run`; `node tools/i18n-check.cjs`; `npm run lint`. All must pass.

## 16. Functional smoke checks (final)

Open/close/minimize/maximize/drag/resize windows; switch virtual desktops; open launcher + widget gallery;
add/remove a widget; switch a theme and switch back; Anki retry/setup flow renders; Reading Finder search +
detail dialog; Notebook tabs; Statistics render; Settings navigation + a toggle; Reader opens a book and the
iframe styling is intact. Confirm no console errors via `app_logs` / `read_console_messages`.

## 17. Rollback procedure

Phase-labelled commits → revert a specific commit/range with `git revert` (never `reset --hard` on shared
branches). If integration is unstable, return `ui/integration` to the last good checkpoint. Never discard the
repo's pre-existing unrelated changes.

## 18. Final sign-off report

Summarize: systemic problems fixed; tokens/components changed; screens migrated vs CSS-propagated (from the
debt ledger); functionality preserved; responsive/a11y/reduced-motion checks; commands run + results; theme
equivalence for Aero/Wired/Blanc; remaining limitations; anything not visually verifiable; and the exact
manual checks for the user to perform.
