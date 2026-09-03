# L12 bullet 4 — remaining-risk report

GENERATED, not written. Re-run `node src/.coordination/liquid-workplace/probes/l12-risk-register.cjs --control`
rather than editing this file; a hand-edit is a claim with no measurement behind it.

Branch `feat/nyaa-subtitles` at `8b10bc75`, 2026-09-02T21:59:03.396Z.

**6 of 9 risks open** (3 high, 3 closed, 0 unmeasured).

| id | sev | state | risk |
| --- | --- | --- | --- |
| R1 | HIGH | OPEN | Runtime blobs the app loads from public/ are not in git |
| R2 | HIGH | CLOSED | A source file is imported by tracked code but is itself untracked |
| R3 | MED | OPEN | Feature-parity rows are still pending |
| R4 | MED | OPEN | Liquid plan bullets are still open |
| R5 | MED | OPEN | The architecture-audit gate is red |
| R6 | HIGH | CLOSED | The visual atlas is not certification evidence |
| R7 | LOW | CLOSED | The packaging stage has never completed in this tree |
| R8 | HIGH | OPEN | The repo's own gates are not green at this HEAD |
| R9 | HIGH | OPEN | Banked visual evidence has no per-run namespace, so a re-run overwrites it |

### R1 — Runtime blobs the app loads from public/ are not in git

**HIGH · OPEN**

Why it matters: A production build from a clean clone lacks them and fails at runtime with no useful diagnostic. This is how 12 anonymous ERR_FILE_NOT_FOUND stacks got into a production boot.

What would close it: Either track the blobs (they are large), or make the packaging step fetch/stage them and fail loudly when they are absent. The named-diagnostic fix landed in 96a7b579 makes the failure legible; it does not make the blobs present.

```json
{
  "entriesOnDisk": 7,
  "entryNames": [
    "cedict",
    "kuromoji",
    "models",
    "ort",
    "sounds",
    "tesseract",
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
  "referenceTreeOnly": []
```

### R2 — A source file is imported by tracked code but is itself untracked

**HIGH · CLOSED**

Why it matters: Dev resolves imports lazily, rollup resolves the whole graph, so this class of defect is invisible from a working tree and kills the production build on a clean checkout.

What would close it: git add the resolved target, or delete the import.

```json
{
  "specifiers": 7905,
  "resolved": 7878,
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
  "rows": 213,
  "tally": {
    "both": 204,
    "pending": 9
  },
  "pendingRows": [
    {
      "surface": "city",
      "feature": "Open the dossier from the hero, and get back out of it",
      "blocker": null
    },
    {
      "surface": "city",
      "feature": "The stage the badge claims is the stage the scene paints",
      "blocker": null
    },
    {
      "surface": "city",
      "feature": "Three dossier facts, all filled, with the banked-pages sentence agreeing with the progress bar it sits above",
      "blocker": null
    },
    {
      "surface": "city",
      "feature": "Ambient music on/off, with the volume slider disabled exactly when music is off",
      "blocker": null
    },
    {
      "surface": "city",
      "feature": "The volume number shown is the volume the slider holds",
      "blocker": null
    },
    {
      "surface": "city",
      "feature": "The scene is actually painted: every canvas has pixels and the parallax layers are all present",
      "blocker": null
    },
    {
      "surface": "city",
```

### R4 — Liquid plan bullets are still open

**MEDIUM · OPEN**

Why it matters: The release gate is the plan’s own definition of done.

What would close it: Close each remaining bullet against its own words with live evidence.

```json
{
  "closed": 37,
  "open": 9,
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
    "Close every feature-ledger row."
  ]
}
```

### R5 — The architecture-audit gate is red

**MEDIUM · OPEN**

Why it matters: It is one of the four repo gates; red on inherited state hides a genuinely new finding behind noise.

What would close it: Reconcile the stale baseline entries it names.

```json
{
  "exit": 1,
  "modules": 2542,
  "stale": null,
  "fresh": null,
  "tail": "  test-only-module       13  (6 pending)\n\nBaseline entries that no longer occur (3) — remove them:\n  orphan-module:src/media/StudyBottomBar.tsx\n  orphan-module:src/media/StudyDocks.tsx\n  orphan-module:src/media/StudyWorkspaceCustomizer.tsx"
}
```

### R6 — The visual atlas is not certification evidence

**HIGH · CLOSED**

Why it matters: L12 exists to certify the transformation visually. An atlas that cannot certify is the whole bullet unmet, however many images it holds.

What would close it: Every blocker the atlas lists, in its own words.

```json
{
  "available": true,
  "file": "src/.coordination/liquid-workplace/baselines/l12-atlas-final-v2.json",
  "selectedBy": "newest generatedAt",
  "candidates": 3,
  "candidateFiles": [
    "l12-atlas-final-v2.json",
    "l12-atlas-final.json",
    "l12-atlas.json"
  ],
  "unreadable": 0,
  "generatedAt": "2026-09-02T21:54:15.921Z",
  "certifiable": true,
  "blockers": [],
  "completeness": 93,
  "axes": {
    "app": "effective",
    "theme": "effective",
    "presentation": "effective",
    "state": "effective"
  }
}
```

### R7 — The packaging stage has never completed in this tree

**LOW · CLOSED**

Why it matters: Compilation is proven (8 of 8 forge targets build), but the file-copy stage that produces a shippable app is unexercised here.

What would close it: Windows Developer Mode, or running the packager in a tree whose node_modules is a real directory. Environment, not product: the copy stage compiles nothing.

```json
{
  "nodeModules": "real-directory",
  "packagerCopyStageRunnable": true,
  "outDirPresent": true,
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
    "lastLine": "      ja 142, zh 140, ru 146 keys still render English verbatim and are baselined as accepted (product names, format strings, the Aero easter egg) — tools/i18n-untranslated-baseline.json."
  },
  "i18nHardcoded": {
    "exit": 1,
    "lastLine": "  src/renderer/components/SeanimeDevPanel.tsx — 18 -> 21 string(s)"
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
  "manifests": 9,
  "declaredPlatePaths": 2604,
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
