# L12 bullet 3 — the gate suite's own health

L12 bullet 3 is "run focused tests, full suite, architecture/i18n gates, packaged-app checks,
and fresh-profile migration". Its own tag has said for two turns that "the gate results are
still not recorded against this bullet's own words". This file is where that record lives, so
the next worker on b3 does not re-derive which failures are real.

The reason it needs its own file: a suite that is mostly instrument noise trains workers to
stop reading it, and this one had reached that state. Boss-audit Finding 4 (2026-09-01) named
it; the class turned out to be twice as wide as the finding.

## 2026-09-02 (primary) — the load-timeout class, measured and closed

**Finding 4's original three were already repaired** at `084dcfea` and `db328e34`; both are
ancestors of HEAD, re-derived rather than inherited. The finding was then widened twice:
primary2's handoff named four more suite identities, and the full-run gate this turn named
**five more on top of that**. Nine in total, all with one signature — a whole-`src/` sweep
that exceeds a timeout rather than failing an assertion.

Two causes, and only one of them may be answered with a bigger number.

**Removable — removed.** `mediaSurfaceImportGraph` re-walked the whole import graph on every
call and re-read every file on every visit; nine call sites asked for `MediaPlayerSurface.tsx`
six times and `MediaWorkspace.tsx` twice. Memoised (`23a30362`): the six comparable cases went
**5,849ms → 146ms**. That was necessary and not sufficient — it *concentrated* the cost into
whichever case ran first, which then blew the timeout at **31,065ms**. Cost belonging to the
whole file now sits in a `beforeAll` at 120s (`f898b52c`). Both halves matter; the first one
alone made the gate look worse, not better.

**External — budgeted, with the number inline.** `readingLensI18n` (four React graphs through
Vite's transform, in a `beforeAll` that failed at FILE level and so printed no per-case line),
`extensionServerPort` (real sockets), `flashcardAudio` (SAPI + an offline synthesis process —
its four cases already carried `20_000`, which is exactly `vitest.config.ts:58`'s default, so
the annotation bought nothing), `blancStudyPlayerRouting` 23,209ms, `deletedPlayerDependents`
31,113ms, `i18n` 23,981ms, `i18nSplit` 44,716ms and 24,402ms. All 60s, each carrying its own
measured duration. A timeout cannot mask a product regression here: every assertion still
fails on the assertion.

### Result, full `npx vitest run`, same machine, same command

| | before | after |
| --- | --- | --- |
| test files failed | 7 | **3** |
| tests failed | 8 | **3** |
| wall time | 187.4s | **102.5s** |

The three that remain, each identified rather than counted:

1. `architectureBaseline > has no stale baseline entries` — the three `src/media/Study*.tsx`
   orphans, whose only importer is the **unstaged** `VideoCoreStudyOverlay.tsx`. Boss-audit
   Finding 1, open across three audits, another track's file. **Not repairable from here** —
   and it is also why `architecture-audit.cjs` exits 1: `tools/architecture-audit.cjs:528`
   returns `fresh.length || stale.length ? 1 : 0`, so it cannot exit 0 while naming them.
2. `studyDetach.test.ts` — an **untracked** file belonging to another track, now failing
   `expected 'files' to be 'notebook'` because files-app landed and moved that route.
3. `scraperSources > caps the stored history` — `ENOTEMPTY: rmdir` on its own temp directory,
   a cleanup race under concurrent load. Passes **13/13 alone**. Verified twice before being
   called a flake, per the banked full-run-flake trap.

**Zero of the three are product defects and zero are this turn's.** That is the number b3
needs, and it is now stable enough to be worth reading.

### Still open on b3, unchanged

`electron-forge package`'s copy stage (Developer Mode is off — `AllowDevelopmentWithoutDevLicense`
unset) and the fresh-profile migration clause. Both are recorded in `needs-user.md`; neither is
a test-suite problem.

### Trap for the next worker

`i18n.test.ts` is **CRLF** in this worktree while its neighbours are LF. Patch it preserving
that or the diff becomes a whole-file rewrite that hides the real hunk. Git normalises the
blob to LF on commit and warns; the warning is correct, not a mistake.

## 2026-09-02 (primary) — the packaged-app clause: the copy stage runs, in the main tree

**The blocker was the WORKTREE, not the machine, and its own needs-user entry named the way
out.** `electron-packager`'s file-COPY stage died `EPERM: symlink ... node_modules` in
`jp-wt-filesapp` because `node_modules` there is a ReparsePoint junction the packager tries to
reproduce as a *directory symlink*. In this tree `node_modules` is a plain `Directory`
(measured: `(Get-Item node_modules).Attributes` = `Directory`, `LinkType` empty), so the
packager never reaches that branch. The two reasons the run was previously declined were both
re-derived and both had moved: free space is **27.0 GB**, not the 18 GB that rationale assumed,
and the main tree is quiet — the relay dispatches one main-tree worker at a time and primary2
is in its own worktree.

**`npx electron-forge package` EXIT 0.** Full log `debug/_pr-forge-package.log`. It ran every
stage the worktree could only half-reach: 8 build targets green (main, preload, the five
utility-process entries, renderer `main_window`), all three prePackage hooks including
`[sidecar] staged ... seanime.exe (84409856 bytes)`, then `Copying files` -> `Preparing native
dependencies` -> `Finalizing package` — the three lines that had never printed before.

RECEIPT, measured on the artifact rather than on the log:
- **40,254 files / 4.15 GB** at `out/jp-study-app-win32-x64`; `jp-study-app.exe` present.
- **0 reparse points anywhere inside the package.** This is the discriminating number: the
  worktree failure was precisely an attempt to *create* one, so a package containing none is
  the copy stage completing rather than being skipped. `resources/app/node_modules` is a plain
  `Directory`.
- No asar: `resources/app/.vite/build/main.js` present, `resources/app/.vite/renderer` carries
  **755** files, `resources/seanime/seanime.exe` staged.
- **The bundled runtime blobs are all here.** `resources/public` carries all **7** entries —
  cedict, kuromoji, models, ort, sounds, tesseract, tray-icon.png — identical to the main
  tree's `public/`, and `resources/public/kuromoji/dict` holds the **12** files whose absence
  produced primary2's 12 anonymous `ERR_FILE_NOT_FOUND` stacks (`96a7b579`). That is a SECOND,
  INDEPENDENT confirmation of their finding from the opposite direction: they proved the 12 by
  removing them, this proves the same 12 by having them. A package built from a clean branch
  checkout is incomplete; one built here is not, and the difference is `.gitignore:106`.

WHAT THIS DOES NOT CLAIM. The package was not BOOTED — primary2 already booted the production
bundle at `96a7b579` and that is where the `appProtocolResolve.ts` fix came from; this run
answers the one stage that had no measurement, and nothing more. `electron-forge make` (the
installer targets) is still unrun and is not what the bullet's words ask for.

`out/` was left in place: it is gitignored build output and the three hand-made
`out/*.pre-*` snapshots were not touched.
