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
