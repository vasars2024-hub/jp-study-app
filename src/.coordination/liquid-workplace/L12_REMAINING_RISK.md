# L12 bullet 4 — remaining-risk report

GENERATED, not written. Re-run `node src/.coordination/liquid-workplace/probes/l12-risk-register.cjs --control`
rather than editing this file; a hand-edit is a claim with no measurement behind it.

Branch `feat/nyaa-subtitles` at `871cb8b4`, 2026-09-03T08:34:35.505Z.

**4 of 9 risks open** (2 high, 5 closed, 0 unmeasured).

| id | sev | state | risk |
| --- | --- | --- | --- |
| R1 | HIGH | CLOSED | Runtime blobs the app loads from public/ are not in git |
| R2 | HIGH | CLOSED | A source file is imported by tracked code but is itself untracked |
| R3 | MED | CLOSED | Feature-parity rows are still pending |
| R4 | MED | OPEN | Liquid plan bullets are still open |
| R5 | MED | OPEN | The architecture-audit gate is red |
| R6 | HIGH | CLOSED | The visual atlas is not certification evidence |
| R7 | LOW | CLOSED | The packaging stage has never completed in this tree |
| R8 | HIGH | OPEN | The repo's own gates are not green at this HEAD |
| R9 | HIGH | OPEN | Banked visual evidence has no per-run namespace, so a re-run overwrites it |

### R1 — Runtime blobs the app loads from public/ are not in git

**HIGH · CLOSED**

Why it matters: A production build from a clean clone lacks them and fails at runtime with no useful diagnostic. This is how 12 anonymous ERR_FILE_NOT_FOUND stacks got into a production boot.

What would close it: Either track the blobs (they are large), or make the packaging step fetch/stage them and fail loudly when they are absent. 96a7b579 made the RUNTIME failure legible without making the blobs present; a76163dd and 871cb8b4 took the second route — kuromoji, ort and the tesseract engine are staged from node_modules by postinstall, and tools/check-runtime-assets.cjs refuses to package when any of the six witness files is missing, naming the path, the feature that dies and the remedy. What is still only obtainable out of band is listed in measurement.gate.obtainableOnlyOutOfBand; the harm this risk names — a SILENT runtime failure — is what the preflight removes.

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
  "referenceTreeOnly": [],
```

### R2 — A source file is imported by tracked code but is itself untracked

**HIGH · CLOSED**

Why it matters: Dev resolves imports lazily, rollup resolves the whole graph, so this class of defect is invisible from a working tree and kills the production build on a clean checkout.

What would close it: git add the resolved target, or delete the import.

```json
{
  "specifiers": 7916,
  "resolved": 7889,
  "findings": []
}
```

### R3 — Feature-parity rows are still pending

**MEDIUM · CLOSED**

Why it matters: The plan's reversibility promise is only as strong as the ledger behind it; a pending row is a feature nobody has shown survives the Liquid round trip.

What would close it: Each pending row names its own blocker in the ledger.

```json
{
  "available": true,
  "rows": 222,
  "tally": {
    "both": 221,
    "standard-only": 1
  },
  "pendingRows": []
}
```

### R4 — Liquid plan bullets are still open

**MEDIUM · OPEN**

Why it matters: The release gate is the plan’s own definition of done.

What would close it: Close each remaining bullet against its own words with live evidence.

```json
{
  "closed": 45,
  "open": 4,
  "unknown": 0,
  "total": 49,
  "openTitles": [
    "Record performance baselines: boot, window drag, resize, theme switch, memory, and player frame stability.",
    "**DEFECT S3 — the Russian second subtitle line flickers.** Observed live by the user 2026-09-02: the secondary/dual subtitle line disappears and reappears during playback. The second line is the `videoCoreStudy` offered-languages path. Likely a re-render or cue-boundary problem rather than a font one. Prove the fix with a timed capture across several cue boundaries, not a single frame.",
    "Keep review/input surfaces spatially fixed during active tasks.",
    "Use Liquid only for context, preview, scheduling detail, and session summaries."
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
  "modules": 2550,
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
