# Control run — the binary that still carries the defect

Slice 49, 2026-08-02. This directory is the **control half** of a differential. Read
`../storage-migration-20260802slice49fixed/README.md` for the comparison and the verdict.

```
node docs/migration/tools/storage-migration-gate.mjs \
  --exe=out/jp-study-app-win32-x64.pre-storage-fix/jp-study-app.exe
```

Verdict **FAIL, exit 1**. That is this run's *expected and required* behaviour, not a broken tool
— the gate's own header states it exits 1 on purpose while the defect is present. If this run had
come back PASS, the instrument would have been wrong and the fix would have been unproven.

`out/jp-study-app-win32-x64.pre-storage-fix/` is a byte-verified copy of the 2026-08-01 packaged
build, taken **before** the 2026-08-02 rebuild: 39,715/39,715 files, 0 failed, 0 mismatch,
identical total bytes, identical `jp-study-app.exe` sha256. It is preserved as the gate's control,
not merely as a rollback — this track learned in slice 46 that a fix with no unfixed binary beside
it cannot be measured.

What it measured:

| step | verdict | measurement |
|---|---|---|
| `round-trip` | **FAIL** | 5/5 retained keys re-encoded, parse depth 1 -> 2 |
| `escalation` | **FAIL** | a second completed run takes them to 3 |
| `escalation-third-run` | **FAIL** | a third takes them to 4 — `1/2/3/4` on all five |
| `control` | PASS | `jp-slice48-control`, outside `LS_KEYS`, byte-identical throughout |
| `idb-retention` | — | DROPS 1 enumerated key: `media-study-database` (written back as `undefined`) |
| `interrupt-evidence` | OK | killed 400 ms into a 614 ms run; next boot found `storage-version` still 0 |
| `recovery` | PASS | 14 keys present, next migration completed in 1088 ms, nothing unexpectedly lost |

`jp-flashcard-deck` grew 88 -> 110 -> 242 bytes across seed / one / three migrations, and read
back as a string rather than an object. This reproduces slice 48 exactly, on a preserved binary,
which is what licenses reading the fixed run's PASS as caused by the fix.
