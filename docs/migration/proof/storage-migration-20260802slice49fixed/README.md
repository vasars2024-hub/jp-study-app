# The storage-migration fix, proven as a differential between two packaged binaries

Slice 49, 2026-08-02. Slice 48 found the defect; this run proves the fix **in a packaged build**,
against the binary that still carries it.

A verdict is the difference between two binaries on identical input, never an absence read alone.
One green run against the new build would prove much less than the pair below.

## The two binaries

| | control | fixed |
|---|---|---|
| path | `out/jp-study-app-win32-x64.pre-storage-fix/` | `out/jp-study-app-win32-x64/` |
| exe mtime | 2026-08-01T11:40:01Z | 2026-08-02T10:39:12Z |
| renderer bundle | `main-DMgBDn1J.js` | `main-Ct5UAKwv.js` |
| bundle sha256 | `B321CCF0E067BBF5789D65EA13C617D5305A592793A8223E493BBB54882D8203` | `1ADF062C516702B469E56A77B0E554B9BE17D4F28741458407F480A543FC5690` |
| **gate verdict** | **FAIL, exit 1** | **PASS, exit 0** |
| proof | `../storage-migration-20260802slice49control/` | this directory |

The control is a byte-verified copy of the 2026-08-01 packaged build, taken **before** the rebuild:
39,715/39,715 files, 0 failed, 0 mismatch, identical total bytes, identical `jp-study-app.exe`
sha256. The Electron exe is stock and hashes the same in both — the app code lives in
`resources/app`, which is where the two differ.

Reproduce:

```
node docs/migration/tools/storage-migration-gate.mjs --exe=<...>/jp-study-app.exe
```

The gate is byte-identical between the two runs. It was not edited for this slice; changing the
instrument between control and treatment would have destroyed the comparison.

## What flipped

| step | control | fixed |
|---|---|---|
| `round-trip` | **FAIL** — 5/5 retained keys came back re-encoded, parse depth 1 -> 2 | **PASS** — every retained key came back byte-identical |
| `escalation` | **FAIL** — a second run added another layer to 5/5 keys | **PASS** — a second run changed nothing further |
| `escalation-third-run` | **FAIL** — depths `1/2/3/4` on all five | **PASS** — depths `1/1/1/1` on all five |
| `idb-retention` | DROPS 1 enumerated key: `media-study-database` | no seeded key dropped — every enumerated key is retained |
| `control` (un-enumerated LS key) | PASS | PASS |
| `recovery` | PASS | PASS |

`jp-flashcard-deck`, in bytes, across seed / one migration / three migrations:

- control **88 -> 110 -> 242**, and the value reads back as `"{\"folders\":[\"slice48\"],…` — a
  string, not an object.
- fixed **88 -> 88 -> 88**.

`jp-slice48-control`, which `LS_KEYS` does not enumerate, is byte-identical in both runs. That is
what makes the change attributable to the runner rather than to anything else in the app.

## The fix, as it appears in the shipped bundles

Both halves are visible in the minified renderer bundle, so the differential is anchored in the
artifact and not only in the source tree.

`writeLocal`:

```js
// control  main-DMgBDn1J.js
function dB(e,s){try{localStorage.setItem(e,JSON.stringify(s))}catch{}}
// fixed    main-Ct5UAKwv.js
function kF(e,s){try{localStorage.setItem(e,typeof s=="string"?s:JSON.stringify(s))}catch{}}
```

Retention lists (`HEAVY_LOCAL_STORAGE_KEYS`, `HEAVY_INDEXED_DB_KEYS`):

| | control | fixed |
|---|---|---|
| localStorage | 5 keys | 6 — adds `jp-media-study-database-v1` |
| IndexedDB | 11 keys | 12 — adds `media-study-database` |

The enumeration map in `localAgentAutomationStore-*.js` carries
`mediaStudy:"jp-media-study-database-v1"` in **both** builds. Enumerated-but-not-retained is what
made the runner delete that store every boot; the control run shows it landing as
`media-study-database: undefined`.

## What this does NOT show

- **The `media-study` localStorage half was not exercised end to end.** The gate's `RETAINED_LS`
  list is the five keys slice 48 seeded; `jp-media-study-database-v1` is not among them, so the
  LS side of that defect is proven **statically** (retention list, both bundles) and via the
  IndexedDB twin, not by a seeded round-trip. Extending `RETAINED_LS` to six would close this and
  is the obvious next edit to the gate — it was deliberately not made here, because editing the
  instrument mid-differential invalidates the pair.
- **`idb-retention` is an informational row, not a scored one.** The gate hardcodes it to `OK` and
  reports the dropped list in its detail. It therefore did not contribute to either exit code; the
  exit codes are carried by `round-trip`, `escalation` and `escalation-third-run`. The row still
  flipped, and the flip is real, but it is a change of detail text rather than of verdict.
- **`interrupt-evidence` is weaker on the fixed run, not better.** Control got `OK` (first read on
  the next boot found `storage-version` still 0, proving the kill landed mid-flight).
  Fixed got `INCONCLUSIVE` — the next boot's own migration reached the version cell before the
  harness's first read. That is a race in the instrument's observation window, not a regression:
  `recovery` still PASSes on both, 14 keys present, nothing lost. The mid-flight kill is proven by
  the control run; this run does not re-prove it.
- The interruption behaviour was already safe in slice 48 and is unchanged. This slice changes the
  *completed* run only.
- Only the five `LS_KEYS` and twelve `IDB_KEYS` were exercised. `profileRules` v1->v2,
  `desktop.ts` schemaVersion 1->2 and the extension settings migration have their own paths and
  were not touched.

## Hygiene

Fresh throwaway `--user-data-dir` under the OS temp dir per run
(`%TEMP%\jp-storage-migration-20260802slice49{control,fixed}-<pid>`), `SEANIME_DATADIR` pointed at
a scratch directory, never at `<userData>/seanime` or `%APPDATA%/jp-study-app`. No profile inside
the repo. No second instance against the real profile.
