# Relay boss audit log

One dated section per audit. The newest section is the live one: every relay
worker reads it before starting its own ladder work and addresses any real,
unaddressed finding first.

## 2026-08-12 — Rescue audit: ten orphaned Codex worktree commits, plus findings that never reached the tree

Not a routine cadence audit. This one was triggered by a human noticing that
work done **outside** the relay — Codex desktop `<codex_delegation>` sessions
run against `~\.codex` and `~\.codex-backup` — was at risk of being lost. It
was. This section is the recovery record and the work list that follows from it.

### 1. Ten commits existed only in Codex worktrees, unreferenced

`~\.codex\worktrees\*\jp-study-app` held **ten real commits that are not
ancestors of `feat/nyaa-subtitles`**. Because Codex creates those worktrees
with `git worktree add`, the objects live in this repo's own object store —
so they were recoverable, but nothing referenced them and a `git gc` could
eventually have taken them.

**Every one is now tagged** `rescued/codex-worktree/<sha>-<slug>`, so they
cannot be collected and are easy to find:

    git tag -l 'rescued/codex-worktree/*'

| commit | subject | base | behind HEAD | size |
|---|---|---|---|---|
| `27c74b6` | refactor(i18n): remove orphan Mooncap lore catalog | `732f30b` | 1 | 19 files, +370/-389 |
| `2545cd5` | fix(resources): make bundle setup links truthful | `732f30b` | 1 | 10 files, +456/-65 |
| `28a239c` | feat(study): persist local review schedule | `732f30b` | 1 | 13 files, +448/-47 |
| `c3ae5b6` | feat(agent): persist sensitive cloud exclusion | `732f30b` | 1 | 17 files, +292/-16 |
| `20f72eb` | test(scraper): accept scheduler and notifications | `732f30b` | 1 | 10 files, +195/-17 |
| `c48b266` | feat(reading-lens): persist pinned captures | `a43d094` | 5 | 13 files, +195/-16 |
| `9c046cc` | feat(lexicon): add offline interlinear grounding | `a43d094` | 5 | 4 files, +666 |
| `87dd97c` | feat(reading): add unified workspace contract | `f258ef7` | 148 | 3 files, +668 |
| `9e6e82d` | feat(lexicon): bridge SQLite lookups to Workbench aliases | `f258ef7` | 148 | 5 files, +361/-1 |
| `99c8747` | fix(media): restore shared media shell | `372f38d` | 152 | 4 files, +220/-122 |

**Instruction to the next worker — this outranks the normal ladder.** Integrate
these, highest-value and cheapest first. Do **not** bulk-merge them; take one
per turn, and treat each as untrusted until you have re-run its gates yourself
on this branch:

1. **The five at base `732f30b` are one commit behind and should be nearly
   clean** — `27c74b6`, `2545cd5`, `28a239c`, `c3ae5b6`, `20f72eb`. Start here.
2. **`9c046cc` (Lexicon interlinear, +666, four files, no IPC/shell/root-config
   changes) is the highest-value single item** and is only five behind. Its own
   session claimed 105 tests passing and a stated acceptance criterion: `食べた。猫`
   must render from SQLite as `食べた` → `食べる / たべる / to eat` via de-inflection,
   preserving `。` and showing unmatched tokens **without inventing glosses**.
   Re-run that claim; do not take it on trust.
3. **`c48b266`** (ReadingLens pinned captures) touches `preload.ts` — remember a
   preload binding is not proof a main handler exists; invoke it, don't grep it.
4. **The three from 08-08 (`87dd97c`, `9e6e82d`, `99c8747`) are 148–152 commits
   behind** and are the most likely to conflict or to have been overtaken by
   later work. Re-derive whether they are still needed **before** attempting a
   cherry-pick — parts may already be implemented on the branch by now. If a
   commit turns out to be obsolete, say so here and stop; do not force it in.

Cherry-pick into the shared tree with this repo's normal discipline: never
`git add -A`, never stage a whole file that carries other tracks' hunks, and
test the result before moving on.

### 2. Read-only audit findings on `set.metadata` that never reached the tree

A Codex read-only audit (session `019ff467`, 08-12 08:23) reported
`set.metadata` as **10 fields — 8 active, 2 explicitly inert**, with three
focused suites passing 82/82, and named five defects. **These are claims, not
verified facts — re-derive each before acting:**

- `Ani List` normalizes to `ani-list`, but the runtime only recognizes
  `anilist` — so the provider silently never matches.
- Network exceptions **abort** instead of falling through to the next provider.
- `mergeStrategy` and `fetchStaff` are inert despite having visible controls.
- The "Fetch" toggles redact output but still **request** those fields.
- `MetadataPanel` reports **studio** provenance using the **genres** provenance
  field.

The same session designed a no-provider, no-credential live verification path
using a strict loopback CONNECT proxy with deterministic Jikan/AniList
fixtures — worth reusing rather than reinventing if you take this on.

### 3. Scraper acceptance remainder

A second audit (session `019ff468`) put the remainder at **13 untested entries,
reducible to 8 practical acceptance slices**, recommending `page.dashboard`
next, then `page.profiles` + `set.profiles` combined.

### 4. Recovered working-tree work

`featureStatus.ts` and `settings/fields.ts` carried uncommitted work from an
out-of-relay session — the `note` field kind, `inert: true` on the five
performance fields with no consumer, and per-group status documentation. It was
committed as `bfac09d` with 246 files / 3731 tests passing, rather than left in
the tree where the relay could have clobbered it.

### 5. What was NOT done here, deliberately

None of the ten commits were integrated by this audit — tagging them made them
safe, and integration is real work that belongs in a normal turn with gates run
properly. No claim in sections 2 or 3 was verified; they are recorded as leads
with their provenance so the next worker can falsify them cheaply instead of
rediscovering them.

### 6. Integration progress — updated by each worker that lands one

Append to this table when you integrate one. Evidence lives in
`src/MAIN_V1_EVIDENCE_LEDGER.md`, not here.

**Status 2026-08-12: this list is CLOSED — 7 integrated, 3 closed obsolete, 0 open.** The
instruction at the top of section 1 ("this outranks the normal ladder") is therefore spent; later
workers should go straight to the ladder. Do not re-open a row marked *closed obsolete* without
first reading its ledger reasoning — all three were falsified against HEAD, not skipped.

| commit | state | landed as | notes |
|---|---|---|---|
| `27c74b6` | **integrated** 2026-08-12 | `4e5ea28` | Orphan had zero importers and was the stale copy (`a empire` vs canonical `an empire`). Deletion was already live on disk, so no runtime delta. Parity test added. |
| `9c046cc` | **integrated** 2026-08-12 | `a2bbdb5` | Acceptance criterion re-run against a real temp SQLite dictionary and passes. Foundation only — **no IPC channel, no renderer consumer**. Its session's "105 tests" was really 8; 125 is the surrounding area. |
| `2545cd5` | **integrated** 2026-08-12 | `c66ccd3` | Every one of its eight pre-existing files had base blob == HEAD, so the six colliding ones were staged straight at the commit blob; `git diff --cached HEAD` came out byte-identical to `git diff 2545cd5^ 2545cd5`. `BundleDetail.tsx` was the one real conflict — another track's partial i18n pass there is a **strict subset**, so the rescued file was taken whole with nothing lost. `oneClickSetup` had no other consumer and the dropped `.direct` class had no CSS rule. |
| `28a239c` | **integrated** 2026-08-12 | _(see ledger)_ | Split cleanly: 3 files new at both ends, 4 with base blob == HEAD taken whole at the commit blob, only `styles.css` + the 4 catalogs hand-applied. The `flash.unknownOnly` → `flash.dueOnly` rename was safe because both its consumers were in the blob-identical set. Live proof: the real deck is 3 218 epub cards with **zero** `srs`, and a synthetic probe driven through `addDeckCardsTracked`→`reviewDeckCard`→`removeDeckCard` gave Good=+1d / Again=+10min with ease 2.5→2.3, then restored the store byte-identical (1 320 982 bytes). |
| `c3ae5b6` | **integrated** 2026-08-12 | `dd9364e` | Found already staged by a hop that exited before committing; re-derived rather than trusted — the 12 code files + plan doc were byte-identical to the commit's own diff, and the four catalogs carried content-identical hunks at shifted offsets. Wired end-to-end to `main/agentProviderRouter.ts:365`, not foundation-only. Live proof: this machine's real settings document has **no** `excludeSensitiveContext` key and the toggle still renders checked. |
| `20f72eb` | **integrated** 2026-08-12 | `e4ad781` | Re-derived: `bfac09d` only touched the images/performance groups, so no real conflict. Seven of nine files applied verbatim (base blob == HEAD); `featureStatus.ts` and `fields.ts` hand-applied. Both honesty claims confirmed against source — `run-all` really does coalesce, `requireUnmeteredNetwork` really has no reader. |
| `c48b266` | **integrated** 2026-08-12 | `8b55470` | Nine of thirteen files were `HEAD == BASE`; only the four catalogs were reconstructed, and the staged diff matched the original stat exactly (+195/−16 over 13 files). The preload trap fired for real: `window.api.lensHistoryPin` was already a function via hot reload while main still answered "No handler registered". After a restart, two captures identical but for `pinned` had opposite fates under a 200-capture flood. |
| `87dd97c` | **closed obsolete** 2026-08-12 | — | Confirmed. `readingIpc.ts` blob-identical at HEAD; `git diff HEAD 87dd97c` over the other two is **+2 / −55**. Applying it would delete `readingWorkspaceSurfaceForSection` (live consumer at `ReadingWorkspaceView.tsx:111`), the `javascript:`/`data:`/`vbscript:` cover-ref guard, and the 5 000-entry input cap. Nothing there that HEAD lacks. No code change — do not revisit. |
| `9e6e82d` | **closed obsolete** 2026-08-12 | — | Confirmed. `git diff HEAD 9e6e82d` over its three differing files is **+9 / −69**; applying it would delete `enrichLexiconResultMetadata`, which has a live consumer at `main/dictionary.ts:140` and its own tests. HEAD is the later evolution. No code change — do not revisit. |
| `99c8747` | **closed obsolete** 2026-08-12 | — | Superseded by its own twin: **`f258ef7` is on this branch**, same subject, 14m49s later, and its ledger entry names `99c8747` as the worktree commit it reviewed. `mediaCenter.css` blob-identical; `AppSection.tsx` already routes player/video/music to `MediaCenterView` and taking the orphan's copy would delete 152 commits of later routes; the test's stricter assertion is incompatible with HEAD's deliberate `MediaWorkspaceCompatibilityView` export. Only 15 lines remain — auto-`onOpenSeanime` on item play — and those were **rejected on purpose** by the primary review. Earlier "three renderer files look genuinely unlanded" was a stat-level read; per-file it is one file, 15 lines. |

Method worth reusing: `git rev-parse <commit>:<path>` against `git rev-parse HEAD:<path>`
falsifies "is this still needed?" in one command per file, before any merge is attempted.

## 2026-08-12 (later) — `feat/nyaa-subtitles` does not pass its own i18n gate when checked out clean

Found while verifying the `28a239c` integration in a **detached worktree** rather than in the
shared tree. Not caused by that commit, and not caused by the relay — but it is the same
"work exists only in a working tree" loss risk that triggered the rescue audit above, so it
belongs here.

### The finding

`src/shared/__tests__/i18n.test.ts` "catalog hygiene" has **two failing tests at branch HEAD**
(`73c241b`, and equally at `0f5d1cc`) when the commit is checked out into a fresh worktree:

- *does not let a new component render UI text without adopting i18n* — **36** entries
- *does not let a date or time be formatted in the OS locale* — **2** entries

In the shared working tree both pass. The difference is **not** the baselines, which are
committed and (for the hardcoded one) clean. It is that the *source fixes those baselines
already account for* are *uncommitted*.

### Proof, and why it is not a false alarm

`tools/i18n-hardcoded-baseline.json` at HEAD lists **6** files, none of them the offenders. The
seven files that actually carry the conversion work are **all dirty in the shared tree**, to the
tune of **685 insertions / 1 076 deletions**:

    ScraperPage.tsx (744 lines changed)   VisualNovelPanel.tsx (239)
    VerifiedSitesManager.tsx (211)        NovelsContent.tsx (175)
    ReaderCollectionPanel.tsx (163)       VideoServerProfilesManager.tsx (128)
    ArcadeGames.tsx (101)

Run `node tools/i18n-hardcoded-check.cjs` in the shared tree and it says "no new component…, 6
file(s) baselined". Run it at the same HEAD in a clean worktree and `ScraperPage.tsx` alone
reports **184 hardcoded strings**. Same commit, opposite verdicts — the passing one is reading
uncommitted files.

The locale-arg failure is the same shape on a different track: `Lockscreen.tsx:171-172` still
call bare `.toLocaleTimeString()` / `.toLocaleDateString()` at HEAD, and three more files
(`VisualNovelSentenceAssist.tsx`, `MediaTrackingCalendar.tsx`, `ReaderCollectionPanel.tsx`)
"gained bare toLocaleString() since the baseline". `tools/i18n-locale-arg-baseline.json` is
itself dirty (one entry removed, for `ScraperPage.tsx`), so that track's baseline edit is
uncommitted too.

### What this means for the relay, and what NOT to do

1. **A green gate run in the shared tree is not evidence about the commit you just made.** It is
   evidence about the tree, which contains several tracks' unlanded work. If a gate result is
   going to be quoted in a ledger as proof, run it in a detached worktree at the commit.
2. **~1 760 changed lines of i18n conversion currently exist nowhere but this working tree.** No
   commit, no stash (correctly — stashing is banned here), no tag. If that tree is lost, the work
   is lost *and* the committed baselines are left describing a state that no longer exists.
3. **Do not commit it on that track's behalf.** It is mid-flight, it spans seven large surfaces,
   and a relay worker cannot tell a finished conversion from a half-finished one. Whoever owns
   the scraper/VN/novels i18n pass should land it; until then treat these two test failures as
   **known-failing at HEAD** and prove your own changes by set-difference, not by a clean run.
4. The honest status line: this branch's i18n gate is currently **green only in situ**. Say that
   rather than "i18n passes".
