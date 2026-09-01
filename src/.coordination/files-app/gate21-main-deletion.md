# Gate 21 — main-lane deletion evidence

## 2026-08-31 codexB — exact and honest failure paths

Gate 21 remains **OPEN**. The production Files surface/index lives on
`wt/files-app` until mergeback, so this lane did not claim a Recycle Bin pass
without invoking the real handler and restoring the fixture.

- `3c341378` — a rejected/stale delete bridge now resolves to
  `filesApp.delete.failed` with the selected item id; it no longer escapes as an
  exception that can strand the inspector in a busy state.
- `167962d1` — the renderer validates the runtime result union. A malformed
  soft-delete success without an undo token, a non-finite expiry, a wrong item
  id, an unknown failure key, and a non-string detail all refuse.
- `0104ecff` — persisted tombstones retain the first unique item/token pair and
  discard colliding rows. A generated token collision refuses before writing,
  so Undo cannot restore a different item.

Focused evidence: 28/28 deletion/session/main-boundary tests passed after the
bridge validator; 19/19 soft-delete/session tests passed after token hardening.
Turn-wide evidence: 948/949 Vitest files passed (1 skipped), 12,265/12,271 tests
passed (6 skipped); i18n 11,793 keys complete; architecture reports Nothing
new; touched-path ESLint exit 0.

Exact next main-lane step after mergeback: register `filesapp:delete` beside the
existing index/reveal handlers with `shell.trashItem`, expose the preload/type
bridge, wire the inspector, then trash and restore one owned fixture through the
running app. The worktree lane owns Gate 22 persistence meanwhile.
