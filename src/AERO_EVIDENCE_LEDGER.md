# Aero / Secret OS audit continuation

The acceptance source is `docs/frutiger-aero/V1_AUDIT.md` in HEAD (26 rows in
sections 1–5: the original 25 items plus discovered defect 1.1b). Its working-copy
deletion and untracked relocation under `docs/ACTIVE/` belong to another workflow.
This ledger records current evidence without staging or undoing that relocation.

## 2026-09-06 codexB — recover Display / Monitors merge, item 5.2

- Interrupted primary committed `cf0528f6` at 06:54:21 EDT, before exiting at
  06:54:40. Index empty; latest 12 source mtimes match that commit. No later
  product residue found. Existing Immersion catalog hunks remain untouched.
- Decision: keep the unified Display page and its historical `settings:navigate`
  redirect. Synchronize monitor preferences with the existing change event;
  normalize/deduplicate recent `monitors` entries to `display` on read, without
  rewriting storage until a subsequent user navigation.
- Live negative control: uncheck layout scaling, confirm Display reset → stored
  `remapLayoutProportionally:true`, checkbox **false**. The composed monitor
  component held stale local state. With this repair both are **true**; cancel
  leaves both false; clicking again returns both to false.
- Browser: actual SettingsApp at isolated `/relay-settings-recovery.html`,
  one explicit fixture display, 17 rendered cards, one Display & monitors rail
  item. Legacy monitors/simulated deep link lands on display with the exact
  `monitors-simulated` highlight. Two legacy recent entries render one reachable
  `System · Display & monitors` item. No Electron instance or real store touched.
- Focused gates: existing recovery group 91/91; integration + monitors 15/15.
  ESLint on the three repair paths exits 0. Browser reports two Vite HMR socket
  infrastructure errors, zero component exceptions. Screenshot outside repo:
  `~/.claude-runs/codexB-0906-recovery/display-recovered.png`.
- Item 5.2 now closes, with `cf0528f6` plus this recovery commit. Source-table
  baseline is 21/26 DONE/FIXED; this makes 22/26 annotated resolutions. The other
  21 closures were counted, not freshly re-certified. Remaining source rows:
  5.3 scraper relocation, 5.4 translator/model/dictionary integration, 5.6 help
  assistant, 5.7 persistence hardening; re-derive them before building.
- Boss-audit triage: F1/F2/F5/F6/F7/F8 have landed fixes (`fd4a9363`, `ec18c236`,
  `6a06e067`, `8c728ff5`, merged ancestors, `c0a87c93`). F4 is already amended
  in the scorecard at fd4a9363 despite the stale handoff. F3's comment repair is
  foreign-dirty and was preserved. No new audit-driven product work is owed.

## 2026-09-06 codexB — clean-tip gate correction after 70464e9e

- Detached `70464e9e`: full Vitest 14,409 passed / 1 failed / 6 skipped;
  1,121 passed files / 1 failed / 1 skipped. Failure: visualizerIdleAction pinned
  `setGuidedPage(options?.guided ? next : null)` while cf0528f6 renamed the
  resolved page to `target`. Updated the guard to require the exemption and
  `setPage` to use the same value, regardless of its spelling.
- Detached i18n exits 0 (12,539 keys); architecture exits 0 (23 known findings,
  2 pending, none new). Shared catalogs have two additional foreign Immersion
  keys, which are intentionally not part of the committed snapshot.
