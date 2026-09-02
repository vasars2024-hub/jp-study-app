# L12 bullet 4 — remaining-risk report

GENERATED, not written. Re-run `node src/.coordination/liquid-workplace/probes/l12-risk-register.cjs --control`
rather than editing this file; a hand-edit is a claim with no measurement behind it.

Branch `wt/files-app` at `32aae369`, 2026-09-02T05:35:36.556Z.

**7 of 9 risks open** (4 high, 2 closed, 0 unmeasured).

| id | sev | state | risk |
| --- | --- | --- | --- |
| R1 | HIGH | OPEN | Runtime blobs the app loads from public/ are not in git |
| R2 | HIGH | CLOSED | A source file is imported by tracked code but is itself untracked |
| R3 | MED | OPEN | Feature-parity rows are still pending |
| R4 | MED | OPEN | Liquid plan bullets are still open |
| R5 | MED | CLOSED | The architecture-audit gate is red |
| R6 | HIGH | OPEN | The visual atlas is not certification evidence |
| R7 | LOW | OPEN | The packaging stage has never completed in this tree |
| R8 | HIGH | OPEN | The repo's own gates are not green at this HEAD |
| R9 | HIGH | OPEN | Banked visual evidence has no per-run namespace, so a re-run overwrites it |

### R1 — Runtime blobs the app loads from public/ are not in git

**HIGH · OPEN**

Why it matters: A production build from a clean clone lacks them and fails at runtime with no useful diagnostic. This is how 12 anonymous ERR_FILE_NOT_FOUND stacks got into a production boot.

What would close it: Either track the blobs (they are large), or make the packaging step fetch/stage them and fail loudly when they are absent. The named-diagnostic fix landed in 96a7b579 makes the failure legible; it does not make the blobs present.

```json
{
  "entriesOnDisk": 3,
  "entryNames": [
    "ort",
    "sounds",
    "tray-icon.png"
  ],
  "pathsTrackedByGit": 2,
  "trackedNames": [
    "public/sounds/README.md",
    "public/tray-icon.png"
  ],
  "gitignoreLines": [
    {
      "line": 103,
      "text": "public/models/"
    },
    {
      "line": 104,
      "text": "public/ort/"
    },
    {
      "line": 105,
      "text": "public/cedict/"
    },
    {
      "line": 106,
      "text": "public/kuromoji/"
    },
    {
      "line": 107,
      "text": "public/tesseract/"
    }
  ],
  "referenceTreeEntries": 7,
  "referenceTreeOnly": [
    "cedict",
    "kuromoji",
    "models",
    "tesseract"
```

### R2 — A source file is imported by tracked code but is itself untracked

**HIGH · CLOSED**

Why it matters: Dev resolves imports lazily, rollup resolves the whole graph, so this class of defect is invisible from a working tree and kills the production build on a clean checkout.

What would close it: git add the resolved target, or delete the import.

```json
{
  "specifiers": 7749,
  "resolved": 7722,
  "findings": []
}
```

### R3 — Feature-parity rows are still pending

**MEDIUM · OPEN**

Why it matters: The plan's reversibility promise is only as strong as the ledger behind it; a pending row is a feature nobody has shown survives the Liquid round trip.

What would close it: Each pending row names its own blocker in the ledger.

```json
{
  "available": true,
  "rows": 50,
  "tally": {
    "both": 45,
    "pending": 5
  },
  "pendingRows": [
    {
      "surface": "mediaWorkspace",
      "feature": "Open a study-ready file into the player",
      "blocker": null
    },
    {
      "surface": "mediaWorkspace",
      "feature": "Readiness category filters over the whole library",
      "blocker": null
    },
    {
      "surface": "mediaWorkspace",
      "feature": "Transcript rail: cue list, active-cue follow, per-cue translate, card preview",
      "blocker": null
    },
    {
      "surface": "mediaWorkspace",
      "feature": "Detach a Study Block into its own OS window, and return it",
      "blocker": null
    },
    {
      "surface": "mediaWorkspace",
      "feature": "Send a detached block to another monitor, and restore its rectangle across close/reopen",
      "blocker": null
    }
  ]
}
```

### R4 — Liquid plan bullets are still open

**MEDIUM · OPEN**

Why it matters: The release gate is the plan’s own definition of done.

What would close it: Close each remaining bullet against its own words with live evidence.

```json
{
  "closed": 35,
  "open": 11,
  "unknown": 0,
  "total": 46,
  "openTitles": [
    "Record performance baselines: boot, window drag, resize, theme switch, memory, and player frame stability.",
    "Approve the definitions in §§1–4 against two representative apps: Video and Dictionary.",
    "Confirm the four surface roles and orientation-spine behavior.",
    "Approve standard/Liquid entry, exit, and recovery UX.",
    "Produce static layout studies for compact, default, and maximized states.",
    "Validate every player feature in standard and Liquid modes.",
    "Keep review/input surfaces spatially fixed during active tasks.",
    "Use Liquid only for context, preview, scheduling detail, and session summaries.",
    "Close every feature-ledger row.",
    "Run focused tests, full suite, architecture/i18n gates, packaged-app checks, and fresh-profile migration.",
    "Produce a final visual atlas and remaining-risk report."
  ]
}
```

### R5 — The architecture-audit gate is red

**MEDIUM · CLOSED**

Why it matters: It is one of the four repo gates; red on inherited state hides a genuinely new finding behind noise.

What would close it: Reconcile the stale baseline entries it names.

```json
{
  "exit": 0,
  "modules": 2515,
  "stale": null,
  "fresh": null,
  "tail": "  duplicate-export        7  (0 pending)\n  duplicate-storage       3  (0 pending)\n  orphan-module           7  (3 pending)\n  test-only-module       13  (6 pending)\n\nNothing new. 9 known finding(s) still marked pending."
}
```

### R6 — The visual atlas is not certification evidence

**HIGH · OPEN**

Why it matters: L12 exists to certify the transformation visually. An atlas that cannot certify is the whole bullet unmet, however many images it holds.

What would close it: Every blocker the atlas lists, in its own words.

```json
{
  "available": true,
  "file": "src/.coordination/liquid-workplace/baselines/l12-atlas.json",
  "generatedAt": "2026-09-02T05:32:48.937Z",
  "certifiable": false,
  "blockers": [
    "21 indexed images no longer hash to their recorded sha256"
  ],
  "completeness": 93.47,
  "axes": {
    "app": "effective",
    "theme": "effective",
    "presentation": "effective",
    "state": "effective"
  }
}
```

### R7 — The packaging stage has never completed in this tree

**LOW · OPEN**

Why it matters: Compilation is proven (8 of 8 forge targets build), but the file-copy stage that produces a shippable app is unexercised here.

What would close it: Windows Developer Mode, or running the packager in a tree whose node_modules is a real directory. Environment, not product: the copy stage compiles nothing.

```json
{
  "nodeModules": "reparse-point",
  "packagerCopyStageRunnable": false,
  "outDirPresent": false,
  "viteBuildPresent": true
}
```

### R8 — The repo's own gates are not green at this HEAD

**HIGH · OPEN**

Why it matters: L12's own third bullet is the gate run. A branch that is red alone and green only because of another track's uncommitted files has no clean release gate at all — that is boss-audit Finding 1, carried across audits.

What would close it: Each red identity fixed or hunk-scope committed by its owner, then a re-run that shows no NEW identity — never a smaller count.

```json
{
  "i18nCheck": {
    "exit": 0,
    "lastLine": "i18n: all 12115 English keys are translated in ja/zh/ru. Nothing to do."
  },
  "i18nHardcoded": {
    "exit": 1,
    "lastLine": "If a file is genuinely exempt, run with --update-baseline and say why in the commit."
  },
  "vitest": {
    "available": false,
    "why": "no --vitest-log given; the full suite is not run from inside this generator"
  }
}
```

### R9 — Banked visual evidence has no per-run namespace, so a re-run overwrites it

**HIGH · OPEN**

Why it matters: Every certification artifact here is a JSON index over gitignored binaries. A plate is named app__presentation__theme__state.png with nothing identifying the run, so two overlapping runs write the same path and the later one destroys the earlier image while its manifest keeps asserting a hash. Measured live: 21 of the 650-cell run's oled-black plates now hash to the tries40 run's recorded values. The wall of pictures a reader is shown is then not the wall the verdict was computed from, and nothing in the JSON says so.

What would close it: l12-visual-matrix.cjs writing plates under a per-run directory (a run id or the manifest's own generatedAt), so no two runs can share a path. That file is bullet 1's and another worker's, so this is reported rather than repaired.

```json
{
  "available": true,
  "manifests": 3,
  "declaredPlatePaths": 701,
  "pathsClaimedByMoreThanOneRun": 22,
  "pathsWhereRunsRecordDifferentBytes": 21,
  "examples": [
    {
      "file": "debug/shots/l12-matrix/agent__liquid__oled-black__normal.png",
      "runs": [
        "l12-matrix-normal.json",
        "l12-matrix-tries40.json"
      ]
    },
    {
      "file": "debug/shots/l12-matrix/library__liquid__oled-black__normal.png",
      "runs": [
        "l12-matrix-normal.json",
        "l12-matrix-tries40.json"
      ]
    },
    {
      "file": "debug/shots/l12-matrix/novels__liquid__oled-black__normal.png",
      "runs": [
        "l12-matrix-normal.json",
        "l12-matrix-tries40.json"
      ]
    },
    {
      "file": "debug/shots/l12-matrix/dictionary__liquid__oled-black__normal.png",
      "runs": [
        "l12-matrix-normal.json",
        "l12-matrix-tries40.json"
      ]
    }
  ]
}
```
