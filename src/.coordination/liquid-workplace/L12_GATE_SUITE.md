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

## 2026-09-02 (primary2) — b3 CLOSES: the branch's own suite at a clean checkout of its tip, every non-green identity named

**Subject:** `df751d60`, which is the `feat/nyaa-subtitles` tip (files-app merged, `0 / 0`
divergence), in the clean `jp-wt-filesapp` worktree — `git status --short` empty before the
run. This is the checkout the bullet's own last clause asked for: the branch alone, no other
track's uncommitted files.

**Full `npx vitest run`: exit 1, 14 failed files / 27 failed tests of 1,006 / 12,982, 243.3 s**,
with a concurrent main-tree worker running (`ClaudeRelay-primary-20260902-112215`), i.e.
under contention. Every failure identified, not counted:

- **13 of 14 are load flakes, proven by re-run alone.** Two batches of 7 files: **12 pass**
  (batch 1: 6/7 files, 51/52 tests; batch 2: 6/7, 85/86). `extensionPopup` failed at 20 s in
  its batch and passes **14/14 in 6.9 s** as a single file — the same finding the main tree
  banked this morning. The thirteen: extensionServerPort, flashcardAudio,
  mediaTranscriptionDependencyMatrix, scraperSources (`ENOTEMPTY rmdir`, the banked race),
  commandPaletteFocus, mangaCanvas, mangaDisclosures, paletteSettingsReach,
  readingCapturesHandoff, visualNovelRemoveReports (a `beforeAll` hook timeout, so it fails
  at FILE level with no per-case line), extensionPopup, i18n — the **date/time OS-locale
  sweep** case at 67.6 s against its 60 s budget, NOT the hardcoded-strings case, which
  passed — and i18nSplit at 86 s.
- **1 of 14 is REAL at HEAD and is fixed in this commit.** `liquidWindowSnapshotFidelity >
  one predicate decides both rendering liquid and offering the way out`. `02f3bdca`
  (08:26 EDT) added a COMMENT to `DesktopShell.tsx` that spells the predicate call out with
  a literal section name; the ratchet names every call site by regex over the raw source and
  reads comments too, so it scored a fourth caller. Reworded to say the same thing without
  the call shape: **14/14**, call-site set back to exactly the three it names. Control that
  cost one extra run: the first reword still mentioned the call shape in prose and failed the
  same test in 5 ms — the regex is the instrument and it is right to be blunt.

**The two identities this bullet was held open on are GREEN at this checkout.**
`i18n.test.ts`' catalog-hygiene hardcoded-strings case passes, because
`tools/i18n-hardcoded-baseline.json` was re-derived from HEAD with a per-file count ratchet
(`b94dca35` + `9842c0d6`); `architectureBaseline.test.ts` passes, because the three
`src/media/Study*.tsx` orphans have zero importers at HEAD, so the baseline's pending entries
are accurate — they read "stale" only in the shared tree's uncommitted overlay.

**Gates, same tree, same commit:** `i18n-check` exit 0 (12,115 keys); `architecture-audit`
exit 0 ("Nothing new", 9 pending); `i18n-hardcoded-check` exit 0 (33 files / 815 strings
baselined, none grew). Packaged-app: closed above (primary, 2026-09-02). Fresh-profile
migration: closed 2026-09-01 (primary2), `L3_PRESENTATION.md`.

**Not claimed:** no second full run was made. The 13 flake identities are proven by re-run
alone, and a full run beside a concurrent worker will flake again; the number that is stable
is *zero failures that are not load flakes*, and that is the number the bullet needed.

## 2026-09-02 late (backup) — the branch's deterministic red, and the two gates that are not the branch's

Recovery turn: `primary` died at 16:50:42 EDT, 16 s after committing `c51e4232`. It left one
verified-but-uncommitted edit (landed as `b037607c`) and one red it never re-ran.

**The branch was red at its own tip, and not for the reason anyone recorded.**
`liquidWindowSnapshotFidelity` fails at `c51e4232` with
`expected [ 'map(winToSnapshot)', …(3) ] to have a length of 3 but got 4`: the zoom re-fit added
a real fourth `.map(winToSnapshot)` (`toAuthoredSpace(winsRef.current.map(winToSnapshot))`,
DesktopShell.tsx:947) against a count pinned at 3. This is the SECOND time this one suite has
been the branch's only deterministic red in two days, and the first repair (`0227993f`) fixed
the sentence rather than the instrument. Fixed at `03758f25`: every counting/enumerating
assertion reads a comment-stripped copy of the shell. Controls — fixture (prose counts 2 raw,
0 stripped); mutation A on the REAL file (append a comment naming two call sites → still
15/15); mutation B (a hand-built literal beside a converter call → RED, "expected 5 to be 4").
Both mutations restored byte-identical, verified by sha256.

**Boss-audit Finding 1, re-derived rather than quoted, and the plan is corrected (`bf8875d4`).**
Same three files, same command, two trees. Detached worktree at HEAD, node_modules junctioned:
`architectureBaseline` + `i18n` + `liquidWindowSnapshotFidelity` = **3 files / 42 tests, ALL
PASS**. Shared main tree: **2 failed / 40 passed**, the two being `architectureBaseline > has no
stale baseline entries` and `i18n > catalog hygiene`. The plan's L12 tag said those two were the
BRANCH's blocker and named two benched owners as the only people who could clear it. Inverted:
they are the SHARED TREE's, and no action by those owners would have closed the bullet.

**Finding 6 re-derived at `b76fb0ac`, both directions.** Committed tree (clean worktree):
`architecture-audit` **exit 0** ("Nothing new", 9 pending), `i18n-hardcoded-check` **exit 0**
(33 files / 815 strings). Shared tree, same commit: arch **exit 1** on the 3
`src/media/Study*.tsx` orphan-module baseline entries, hardcoded **exit 1** on
`SeanimeDevPanel.tsx 18 -> 21`. The whole delta is two foreign ` M` files, named not asserted.
`i18n-check` **exit 0** in both (12,250 keys).

**Trap for the next worker, stated once:** a shared-tree number for these two gates is not a
statement about the branch, in either direction. Run them in a detached worktree or do not
report them.
