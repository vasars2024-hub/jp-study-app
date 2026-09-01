# Files app deletion evidence

## 2026-08-31 — codexA, gates 9/21/30 foundation

- `670fb01b`: referenced-in-place files now soft-delete their index row; their original bytes never reach trash. Media confirmation applies only to byte deletion. Focused deletion suite: 16/16.
- `5184b8f2`: renderer session persists exact tombstones, filters only matching rows, undoes by bounded token, refuses computed state, and sends no path across IPC. Focused combined suites: 22/22.
- `658dd355`: main boundary re-resolves an item id from the authoritative index, repeats media confirmation, and refuses injected paths, missing/stale ids, referenced rows and index-only rows. Focused combined suites: 28/28.
- `2c27c144`: renderer and main now share one `FilesDeleteRequest` and `FILES_DELETE_CHANNEL`; focused contract suites: 21/21.

Decision: reference-in-place is file-backed for Open/Reveal but index-backed for Delete. Tradeoff: removing it needs an app-owned tombstone, but can never remove the user's original file.

Decision: only `{ itemId, confirmedItemId }` crosses the renderer/main boundary. Main derives path, kind, ownership and risk again from its index. Tradeoff: wiring waits for the index merge; accepting a renderer path would expose arbitrary trashing.

Gate 9 remains OPEN: the merged Files inspector must present the derived-output action and live refusal, then refresh the exact row.

Gate 21 remains OPEN: wire `shell.trashItem`, restore a disposable fixture from the Windows Recycle Bin, and demonstrate UI soft-delete undo.

Gate 30 remains OPEN: the reference-preservation policy is proved in isolation; the library removal flow and broken-link behavior still need integration.

Architecture debt is `pending`, not accepted, for `filesDeletionSession.ts` and `deletionIpc.ts`. Remove both baseline entries when the Files app/index branch merges and consumes them.
