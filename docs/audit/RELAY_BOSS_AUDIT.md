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

## 2026-08-13 09:01 MSK — Boss audit: Workbench relay window survives; one stale plan claim corrected

Reviewed all 29 commits returned by `git log --all` after
`2026-08-12T14:11:29.6385541+03:00`: the 28-commit `feat/nyaa-subtitles` ancestry from `bef3b2e`
through `dc5f0f3`, plus branch-only sibling `45ab70c`. The sibling and integrated `8e28b8d` have
identical product/test trees; `8e28b8d` only adds six honest detached-worktree gate lines to the
ledger. I inspected every commit's paths/stat, the cumulative 82-path diff, added gate claims, and
added tests instead of accepting commit messages at face value.

### What I tried to break and what survived

- Current shared tree: `npx vitest run` exited 0 at **566 passed / 1 skipped files, 7,514 passed /
  6 skipped tests**. `node tools/i18n-check.cjs` exited 0 with **9,430** keys complete.
  `node tools/architecture-audit.cjs` exited 0 with **1,764 modules / 17 known findings / 2 known
  pending**, nothing new. These numbers describe the dirty shared tree, not committed HEAD.
- Clean detached `dc5f0f3`: the full suite has the documented clean-HEAD baseline of **9 failed /
  7,144 passed / 6 skipped tests** in four files; i18n exits 0 at **9,259** committed keys and
  architecture exits 0 at **1,704 modules / 17 findings / 2 pending**. The pre-window parent
  `d0d1be0` has all nine of those identities plus the two failures the preceding boss audit handed
  off and five scraper import-time suite failures. Set difference therefore finds **no new HEAD
  failure**; this relay window removed failures and introduced none. Do not report the raw nine as
  a relay regression.
- The cumulative touched-test patch adds no `skip`, `todo`, `xdescribe`, `xit`, or `xtest`. The
  six current skips remain outside this window. The focused claims are subsumed by the clean and
  in-situ full runs; no claimed green owned test failed.
- Commit hygiene survived review. The 11,497-addition cumulative footprint is large, but it is a
  sequence of bounded Workbench/ReadingLens features plus their tests, locale keys, and ledger
  entries, not a single unrelated bulk-stage. Individual large commits remain internally scoped.
  The branch-only duplicate is untidy history but contains no divergent product hunk and needs no
  cherry-pick or repair.

### Live falsification through the debug bridge

Started one dev process, drove it only through the authenticated bridge, and stopped exactly that
process tree afterwards. No foreign HMR appeared. Staging `猫はかわいい。` through the real preload
and main handler opened the Translate pop-out and rendered the exact sentence, immediate installed-
dictionary interlinear glosses, difficulty, composition, subtitle-example, and vocabulary-harvest
surfaces. “Explain in Agent” opened the shared Agent with the passage marked Personal/Session, and
the “Explain nuance” suggestion populated (without sending) the constrained prompt requiring
meaning, nuance, at most two similar words, exact evidence, and explicit uncertainty. Those recent
Workbench, handoff, privacy, and grounded-suggestion claims survived a live attempt to falsify them.

### Finding and correction

`src/MAIN_V1_COMPLETION_PLAN.md` still said both sentence → Workbench and passage → Reading had no
receiver, contradicting `8e28b8d`, all later Workbench entries, and the live result above. I changed
only that stale status: sentence → Workbench is done; passage → Reading remains open. No product
code needed an audit fix.

### Instruction to the next normal ladder worker

No new relay regression is handed off. Preserve the clean-HEAD set-difference discipline and do not
reopen sentence routing. Continue from the actual remaining item: passage → Reading workspace (and
the later progressive Read/privacy/OCR decisions), while respecting the newer Phase 9.75 ordering
entry above. Treat the shared-tree green suite as in-situ evidence only until your own commit is
also checked detached.

## 2026-09-05 06:44 MSK — Boss audit: recovery falsification and interrupted-work attribution
<!-- relay-audit-id: audit-20260904-220532-d888f576 -->
Audit ID: audit-20260904-220532-d888f576
Result: BLOCKED
Commit window: Retry 2 evidence. Frozen integration HEAD 3205e7537cb258d429c01b1a02ea7e741bdf74cc on feat/nyaa-subtitles; window starts 2026-09-03T20:18:32.0896072-04:00. Initial all-refs enumeration: 228 commits including 34 merges; 119 non-merge product/gate commits and 75 non-merge bookkeeping commits. 0a0b6857 is product work only on wt/files-app, not in frozen integration HEAD. Bookkeeping touched no product path and is excluded from deep dives.
Baseline: Starting index empty. Shared status: 134 modified tracked paths, 132 deleted tracked paths, 88 collapsed untracked entries (205 expanded untracked files). Saved original full staged/unstaged diffs, status, worktrees, branches, reflog and exact window outside repository at C:/Users/Arseniy/AppData/Local/Temp/jp-boss-audit-d888f576-attempt2. Clean detached checkout C:/Users/Arseniy/AppData/Local/Temp/jp-boss-d888f576-head-at2 validated at frozen SHA, initially clean, node_modules junction only. Product files in shared tree never edited by this auditor.
Gates: Fresh committed focused tests: readingListsStore, readingListsIpc, playerLeaderRelease, playerLeaderHandback, readingGardenSkyResize, exit 0, 40/40. Isolated CAS mutation removed revision guard: exit 1, 2 intended failures/13 (stale write accepted and refused write logged); restoration exit 0, 13/13. Isolated sky same-size guard removal: exit 1, 4/4 failed; still-box width allocations 121 instead of 1, jitter 11 instead of 1; restoration exit 0, 4/4. Mutation files restored byte-for-byte and isolated git status clean. Shared full Vitest exit 1: 14,192 passed, 13 failed, 17 pending; failure rerun and clean HEAD broad run pending. i18n both trees exit 0, 12,509 keys; architecture both exit 0, 27 known findings, 6 pending, zero new (shared 2650 modules versus HEAD 2630).
Live falsification: Fresh authenticated debug bridge port 39274, main pid 20540, main renderer localhost:5174, window 1 bounds x640/y266/1280x860, focused/visible, no emulated media. City frame grew from 680x657 to 820x657 and restored to 680x657; sky backing width grew 897 to 1089 and returned 903 (animated transformed host does not return identical sampled dimensions). Dossier Show -> Hide -> Show driven through DOM, controls hit-tested, main and renderer errors still to inspect. City controls and taskbar Start were reachable by elementFromPoint and ancestor pointer-events were recorded. Background Scraper controls were covered by City, an ordinary overlap rather than an attributed defect. Required all-surface reachability and native popout main properties not yet proven.
Dirty-tree attribution: b980c42e is the interrupted backup's committed garden blur slice (22:02:34), now reachable via integration merge. Its two product paths DesktopShell.tsx and readingGarden.css have no shared dirty modifications. No staged/orphaned continuation of those files found. Other dirty and untracked slices remain foreign or unattributed, including media, scraper, i18n, study-mode state, document relocations and tests. Handoff marker preserved; exact marker location still being established. wt/files-app advanced during audit, so later branch tips will be named separately rather than silently changing frozen integration scope.
Findings: 1. CONFIRMED P0, introduced 25a83b55, src/main/readingListsStore.ts:125-129 and :212-222: corrupt-object recovery destroys last-good data. In isolated temporary test storage: write fixture with one list; call read to establish last-good; replace only primary JSON with {}; read again. Expected recovered plus one list. Actual health ok plus zero lists, and last-good is rewritten with zero lists. Fresh appended audit-only regression fails expected ok to be recovered; 13 original tests still pass. No real userData was accessed. Smallest next action: validate required document shape before normalization/promotion, guard write IPC against malformed documents, add object-corruption recovery coverage. 4. HYPOTHESIS, 7061329f, src/main.ts:1618-1637: crash recovery tests live BrowserWindow IDs rather than webContents crash state; a renderer crash may retain its dead leader. Requires dedicated live crash probe; do not treat source reasoning as live confirmation.
Handoff: BLOCKED, with confirmed findings. Required native/main and all-host live verification remains incomplete. The dated completion evidence below supersedes pending statements above. Do not continue the product ladder until a verified audit; do not repair product files in the audit retry. Temporary scripts and JSON evidence are fresh to retry 2, not copied from a previous audit.

Retry 2 completion evidence, 2026-09-05 06:44 MSK:

- Broad gate completion: clean frozen HEAD `npx vitest run --reporter=json --outputFile=<evidence>/head-vitest.json` exited 0: 1089 files, 14,015 passed, zero failed, six pending (14,021 collected). Shared run exited 1: 1104 files, 14,192 passed, 13 failed, 17 pending. Nine files reported failures, including three Visual Novel suites with no failed-assertion count. A final fresh serial rerun of ALL nine failed files with `--maxWorkers=1` exited 1: 62 passed, two failed, seven files passed. Persistent identities: `i18n.test.ts > catalog hygiene > does not let a new component render UI text without adopting i18n` and `i18nNumberFormatting.test.ts > numbers reach Intl > never hands a t() slot a toFixed string, outside the ledgered files`. They pass at committed HEAD. Extension port, Immersion windowing, palette reachability, plate identity and three VN-suite failures did not reproduce on the final serial rerun; do not classify those intermittent failures as committed regressions. Full JSON and serial transcripts are in the evidence directory. The clean current HEAD is the fresh zero-failure baseline; a historic red baseline is not being borrowed.
- Focused suite counts at HEAD are store 13, IPC 10, player release 9, player handback 4, sky resize 4. The same selected suites pass in the shared full report. Both original mutation files were restored byte-identical; clean status was checked before the broad run. CAS mutation produced two intended failures; sky mutation produced four intended failures. No mutation touched the shared working tree. A separate executable `corrupt-proof.cjs` reproduced Finding 1 against BOTH shared and isolated roots, using freshly created temporary test storage: `beforeLastGood=1`, `health={state:'ok',lostRevisions:0}`, `readLists=0`, `afterLastGood=0`. It also demonstrated that `isReadingListsWriteRequest` accepts both `document:[]` and `document:{}`. That identifies the related malformed-write gap at `src/shared/readingListsBridge.ts:164-170`. No actual userData was read or written by the corruption experiment.
- Additional confirmed Finding 2, P2, dirty-only localization regression, introducing commit unknown: `src/renderer/components/SeanimeDevPanel.tsx`, whole-file census guarded at `src/shared/__tests__/i18n.test.ts:380`. Expected no added hardcoded strings beyond the accepted 18; actual 21. Reproduction: `npx vitest run src/shared/__tests__/i18n.test.ts --maxWorkers=1`, shared exit 1 / HEAD pass. Impact: untranslated UI additions and a red shared gate. Smallest next action: the dirty-hunk owner translates the added labels through the existing seam; do not increase the baseline.
- Additional confirmed Finding 3, P2, dirty-only number-formatting regression, introducing commit unknown: `src/renderer/components/immersion/VisualNovelCommunityPanel.tsx:238-239` supplies two `toFixed(1)` strings to translation slots. Expected numeric slots handled by Intl; actual two bypasses with zero baseline allowance. Reproduction: `npx vitest run src/shared/__tests__/i18nNumberFormatting.test.ts --maxWorkers=1`, shared exit 1 / HEAD pass. Impact: locale formatting bypass and a red gate. Smallest next action: pass numbers through the established formatting seam while preserving intended precision, without baselining the bypass. These two findings are foreign unstaged work, not defects introduced by the audited committed relay slice.
- Live adverse IPC evidence: through the authenticated bridge, `window.api.readingListsWrite(-1,null)` returned `{ok:false,code:'invalid-request'}`. `readingListsLoad` returned healthy empty revision 0; `playerGetSnapshot` returned null. Invalid input was chosen to avoid modifying real study data. `/logs?level=error&limit=100` returned total 0 after the probes. Dossier Show -> Hide -> Show was driven and restored; Close/On/Off controls were individually centre-hit-tested and reachable. City chrome, mushroom button and taskbar Start/Desktop 1/Desktop 2 passed identical elementFromPoint measurements. Complete ancestor pointer-events were captured through HTML. The garden's pointer-events:none ancestors do not invalidate its auto-enabled mushroom child, which is actually the hit target. Background Scraper controls were occluded by the foreground City window; this ordinary z-order difference was not misreported as broken control wiring.
- Required MAIN observation is unavailable on this bridge. Fresh `/main`, `/windows` and `/window-state` requests each returned HTTP 404 unknown route. `/health` reports visible/focused/bounds but omits native focusability, transparency and mouse-ignore state; `/eval` runs only renderer code (`src/main/debugBridge.ts:343`). A fresh repository search found setIgnoreMouseEvents calls only in `companionHost.ts` and `readingLens.ts`; this source trace does not substitute for requested runtime MAIN evidence for recent reading-list popouts. No crash was induced in the user's existing window and no new dev process was started. Standard/Liquid, compact/maximized, keyboard, reduced-motion, reopen geometry and off-screen clamping across every recent UI host remain incomplete. Synthetic handler success is not credited as proof of physical input. These missing mandatory checks require BLOCKED, despite the confirmed recovery finding and clean broad gate.
- Final universe accounting: 228 initial commits include 34 merges. Non-merges are 119 product/gate and 75 bookkeeping; merge first-parent paths add 31 product merges and three bookkeeping merges (150/78 total). Changed paths/reachability for every commit were recorded before source inspection; full product diffs were acquired and searched for risky boundaries/gate changes. This is path/stat and risk-scan overview depth, not a claim that every control was operated. One product commit, `0a0b68574f86fda54aa3ccd65709e8e54f6e680f`, remains only on `wt/files-app`. It adopts Novels contextual regions, retains the table anchor and adds a toolbar shrink guard; its source-text test and changed hunks were inspected, but no fresh Novels live check was completed. That branch advanced during audit to `1fb5cdee4bf1b61526482eaeb5660353a7be72f7`; the other post-HEAD commits `1984032a`, `0bc696b3`, `1fb5cdee` are coordination bookkeeping. Integration HEAD stayed `3205e753` throughout evidence collection.
- Gate weakening review: product diffs were scanned for skip/only/todo, timeout changes, suppressions, mocks, swallowed errors and synchronous I/O. No added skip/only/todo or suppression was found in the selected test changes. `68a8e218` adds a fourth sky resize case rather than weakening the guard. The window does contain a deliberate rollback: `b2ee7d7d` replaces 313 lines with 65 in `videoStudyLayout.test.ts` after `ba494825` added tests requiring dirty implementation. This is a real committed-versus-dirty coverage distinction, not evidence that the newer study slice is complete. Sky drawing is broadly mocked, but real width setters remain observable and all four guard mutations fail; the test proves reallocations, not compositor performance.
- Cross-surface trace: reading-list request/result normalization -> main startup registration -> `readingListsIpc` -> store -> preload load/write/events/changed methods -> `window.d.ts` -> queued CAS retries and onChanged unsubscribe in `readingListsClient`. Missing bridge and read/write failures map to explicit codes; refused CAS writes do not broadcast/log. Defaults/reset/roundtrip/scalar corruption have tests; object corruption falsifies the recovery acceptance. Store writes/log trimming are synchronous main I/O and whole snapshot/event payloads have no size bound at this seam; latency and oversized-input attacks remain unmeasured. Music changed ownership rather than a persisted schema; migration is non-applicable to that deep dive. Sky adds no IPC/persistence; cleanup cancels rAF, disconnects the observer, removes visibility listener and simulation handler. Reduced-motion source suppresses ambient spawning, but this audit did not emulate it. Anki-specific imports/SRS migration, credential-vault changes and release packaging were skipped because those subjects did not change in the window. Shared UI host checks remain applicable and unfinished.
- Interrupted-work attribution: the committed backup blur slice `b980c42eb47ac3518cd02fc91cfb09fbb2616ae0` is reachable through `0e4c38d4` and `3205e753`. Neither of its product files has remaining staged/unstaged differences. No dirty product file has a modification timestamp in or after the interruption interval; timestamps support attribution only, not authorship. Ignored residue inventoried in the interval: `debug/_bk-cat7-city-fixed.json` at 21:58:52, `debug/_bk-vitest-full.log` at 22:01:34, and `debug/state.json`. None was reused as evidence or changed. No staged, unstaged or untracked product continuation attributable to backup was found. No separately named on-disk interruption marker was found in searched coordination/relay locations, so its location is not invented; the provided interruption notice and all candidate residue are preserved. Other dirty work remains foreign/unattributed. Recent detached `jp-codexb-20260904` is clean at `83da5c12`. Reflog-only `48cc35fe687e608d36a43e47a8b976b1106eade3` and `401b400c6fa8cf72cf8bb2eab5dd8c03893d002e` have tree-identical replacements `648e9328` and `b2ee7d7d` (fresh git diff --stat empty); they contain no missing companion hunks. No garbage collection or foreign worktree cleanup occurred.
- Plan cross-examination LAST: `docs/ACTIVE/READING_LISTS_PLAN.md:386` requires corrupt-file recovery; line 395 marks P0 CLOSED. Finding 1 contradicts that completed acceptance. Main V1 plan and evidence ledger were read after source/tests/live evidence; their automated-plus-live rule does not authorize treating these unfinished hosts as complete. Current City scorecard correctly leaves cat7 resize open, so no false FPS closure is alleged and no earlier measurements are reused. Previous boss handoff's missing tests, Statistics overlap and preload typing have reachable repair commits `ba494825/b2ee7d7d/923eecbb`, `63432f9a`, `cb4bfa75`; today's clean full run refutes the old shared-green/committed-red gate state. The dirty newer study slice remains outside committed reality and was not completed here.
- Exact retry action: obtain a supported MAIN diagnostic for recent popout focusability/transparency/mouse-ignore state, and an audit-owned popout lifecycle/crash probe; finish remaining changed-surface reachability, reverse/keyboard/reduced-motion/compact checks and scope review. Do not modify product code in the audit. If confirmed findings persist after mandatory evidence completes, use FINDINGS. After a VERIFIED audit the first normal worker must fix Finding 1 before the product ladder, coordinate Findings 2-3 with their dirty-hunk owners, and recover the preserved backup notice. The clean isolated checkout is retained intentionally for retry, not orphaned unfinished product work. No owned development process needs stopping.
- Commit disposition: only this audit section may be staged as a constructed HEAD-plus-entry blob while the index is empty. The entire working ledger must not be staged: its thousands of foreign uncommitted audit lines predate this attempt. Readback and exact marker/result verification are required after staging/commit as well as before exit.

## 2026-09-08 07:45 MSK — Boss audit: relay product falsification; committed YouTube lost-update race
<!-- relay-audit-id: audit-20260908-004413-4bbf3625 -->
Audit ID: audit-20260908-004413-4bbf3625
Result: BLOCKED
Commit window: Fresh `git log --all --pretty=format:"%h %ad %an %D %s" --date=format:"%Y-%m-%d %H:%M" --since="2026-09-07T00:22:37.8710197-04:00"` enumerated 204 commits. Intended branch `feat/nyaa-subtitles` and `wt/files-app` both pointed to cd3708199394c2cae8f10dcedd9f8d08db92e14b; every window SHA is reachable from the intended branch. No window commit is stranded on another local branch. Oldest window product is 55c7445030e6734d992d84dde0e13afa3f3aea53; its parent is a727b8a9f47eca5d5fb6e6296b1214a78f1f7ada. Worktree porcelain, all local branches, recent commits, full window and per-commit paths were freshly saved under `%TEMP%/jp-boss-audit-20260908-004413-4bbf3625/` (worktrees.txt, branches.txt, window.txt, partition-fast.json). Detached historical verification worktrees were inventoried, not cleaned.

Scope partition, announced before source review: 95 PRODUCT/test commits; 86 PLAN/PROBE BOOKKEEPING commits, whose paths were entirely Markdown and/or src/.coordination and touched no product path (no deep dive); 21 merges; 2 gate/tool-only commits (367cf19a, 65c67d64). The 95 product subjects were inventoried at changed-path overview depth, not falsely certified as all having received complete hunk/host review. Exact product SHA set: 55c74450, 7bc4eb31, be81bd88, cd503890, e1985518, c94cfbba, 24182319, 9ec217d6, 1ba582b7, 6bd06b89, c6e50000, 3eeb532b, 97ec304c, 1f0f423d, a2e4423a, dbc5d509, 33a5ec13, 353a7f27, cd57a7b3, e574b8fa, 942e13de, 3f0b5986, addacc6e, 1e644ed4, 3fa7052c, c5b59c0e, 606c889b, b528f7cc, 999a0d36, 95d4803f, 7d541d1a, 4d4251f2, b962135d, 9d702238, fe18a2cd, 57756cee, 35d54725, 8abab7ac, 7e062ae5, 30ba69e8, 7d603ea1, e6153b1b, 775d6be2, 6c7ce0de, d00b8c06, 92895fdf, cb044636, 719b0d13, 62a03d9f, 25c6b3ff, 51e94537, 520f17fe, f8684f33, 980ceb4d, dab3b480, b9e96be5, 5bbe92df, 55ecdb07, 145d68e5, 4d8774fd, 05d29b98, 9f61d93a, 9ebfdcef, e346c3fd, 845cd318, 23000fc0, 0a26f5a9, c79adcc7, 9d755922, ab0eb062, cde262d3, 7ebd4c10, 3af567f6, 84e74280, 5bd6caac, 1150a5be, 3a362d78, a3388f99, e99955e2, e952a885, 0823033b, 08ae4f43, 5570b5ed, 63748864, 24a59996, a8ce2fa5, dc684c71, f074c9c1, e9b9b3ab, 92f2579a, 3d841f96, 1159f5fc, 8e67251e, ff8d2804, cd370819.

Baseline: Started on feat/nyaa-subtitles at cd3708199394c2cae8f10dcedd9f8d08db92e14b. After the required receipt skeleton, fresh status counted 129 modified tracked files, 132 deleted tracked files, 218 individual untracked paths; 146 dirty product paths. Index was empty. Staged diff was empty; complete unstaged binary diff and status were saved outside the repo. Extensive documentation relocation and product work predated this audit. Two new detached audit worktrees, `head` and `mutation` beneath the audit temp directory, were validated at that exact HEAD with no tracked changes before use. Their node_modules junctions reference the shared installed dependencies, but their source is committed-tree source. Both were restored to no tracked changes after probes. This is a clean-source baseline, not an independently installed dependency baseline. A full pre-window baseline was NOT run; no pre-window failure set is invented.

Gates: Fresh isolated `npx vitest run` exited 1 after 482.99 s: 1,210 files, 1,207 passed / 2 failed / 1 skipped; 15,276 tests, 15,268 passed / 2 failed / 6 skipped. Exact failures were `src/shared/__tests__/i18nNumberFormatting.test.ts:91` / "never hands a t() slot a toFixed string, outside the ledgered files" and `src/shared/__tests__/deadEslintDirectives.test.ts:71` / "no source disables react-hooks/*, which is not a loaded plugin", both 20,000-ms timeouts. Recheck of those two files with --maxWorkers=2 exited 1 (8 passed, only deadEslintDirectives timed out at 21.884 s). A further --maxWorkers=1 run of deadEslintDirectives plus ytAutoUpdateClock exited 0, 18/18, 14.01 s. Thus both original identities pass freshly with reduced concurrency; no assertion regression was observed in that failure set. The original broad run remains recorded as red, not rewritten to green.

Isolated `node tools/i18n-check.cjs`: exit 0, 12,938 English keys translated. Shared same command: exit 0, 12,940 keys, with existing verbatim-English baselines reported by the dirty checker. Isolated `node tools/architecture-audit.cjs`: exit 0, 2,779 modules, 23 findings, 2 pending, "Nothing new". Shared: exit 0, 2,806 modules, same category counts and pending count, "Nothing new". These are fresh ratchet comparisons to the checked-in baselines; differing module/key counts belong to dirty/untracked state, not this audit. `node tools/i18n-dupe-keys.cjs`: exit 0, 10,978 keys per catalog, no duplicates. `node tools/i18n-locale-arg-check.cjs`: exit 0, 46 number-formatting sites baselined in 16 files and 2 explicit date/time exclusions.

Deep-dive claim matrix: (a) oldest-third 3fa7052c2351826aceceb632ded73c77fbd1f63f: refuse bulk deletion on Cancel -> pruneMissingMedia.ts:59 plus both callers -> pruneMissingMediaGuard.test.ts -> 4 tests passed shared/isolated -> isolated removal of the exact confirm guard produced 3 failures / 1 pass -> restored real code passed. The cancellation helper is discriminating; both live host dialogs were not operated, so end-to-end confirmation is pending. (b) highest-risk c79adcc7effbdd359293a060cdaa921a9523e0df: automatic YouTube updating, retained preferences and recovery -> main.ts startup/quit plus ytPlaylists.ts:563-608 -> ytAutoUpdateClock.test.ts -> 14 passing existing cases, but actor startup can be removed without failing them, and three fresh concurrency cases fail on real committed code (F1/F2). (c) newest-third e99955e20694db9b640bbb3c0a657e75b4e26c44: sequel query and episode-frame remapping -> mediaSeasons.ts, mediaProviderClients.ts and subtitleDiscovery.ts -> mediaSeasons.test.ts + subtitleDiscoverySweep.test.ts -> fresh positive; replacing only the candidate renumber expression with `candidate` produced exactly 1 failure / 24 passes in the sweep file: "attaches the sequel file to the folder-numbered item", expected jimaku record, got []. Restored code passed. All four primary focused files together passed 56/56 in shared, isolated before mutation, and isolated after restoration. Both implementation mutations were occurrence-count validated and byte-read-back verified, never applied in the shared tree.

Additional claimed gate: isolated `npx vitest run src/shared/__tests__/pluralArmSlots.test.ts src/shared/__tests__/dynamicI18nKeyGate.test.ts src/shared/__tests__/catalogDuplicateKeys.test.ts --maxWorkers=1` exited 0 but collected only 2 files / 16 tests: catalogDuplicateKeys.test.ts is not committed (F3). Shared collected 3 files / 20 tests, 19 passed and dynamicI18nKeyGate.test.ts:209 timed out at its 60,000-ms gate (68.208 s). This extra failure identity is a shared scan timeout; its precise contribution from dirty source versus machine load is unclassified. The catalog test itself passed. No tsc --noEmit was used. The claimed eight-path `npx eslint` run on the prune test, helper, both callers and four catalogs exited 0 on isolated HEAD (head-prune-eslint.log).

Weakened-gate search: inspected parent-relative touched test/tool diffs for skip/only/todo, mocks, suppressions, catch blocks and timeout changes. No added skip/only/todo surfaced in that scan. 24182319 raises three glyph/mojibake scan budgets to 120,000 ms; its mojibake optimization retains the same three code-point leads. Tests isolate Electron/provider side effects with scripted mocks; those mocks did not model an unresolved request concurrent with another writer, which is exactly F1. The 14-test clock suite imports/calls runAutoUpdateDue and never starts/stops the clock. Restoring all product bytes after the no-op timer mutation was verified. This is not a complete review of every removed assertion or every merge-resolution hunk; that remains an audit gap.

Live falsification: Used only authenticated HTTP Electron debug bridge, no mouse/keyboard automation or Computer Use, no userData backups. Fresh /health found windows 1 and 2, both visible, no emulated media or network settings. /eval on window 1 read the current Scraper surface; /focus raised main via the bridge. Results tiles were 10 results / 1,193 episodes / 0 Japanese-subtitle episodes / 0 failed. Independent read-only scraperListJobs + scraperGetResult IPC returned 10 stored results with 1,193 distinct episode ids. Entering `audit-no-such-result-4bbf3625` through the input's DOM handler yielded 0 cards / "0 results" while global totals remained unchanged; clearing it restored 10 cards / "10 results". Dashboard Runtime and rail were sampled together twice: 834 MB / 6% and later 951 MB / 6%, identical in each pair. Dashboard eventually reported 5 series / 1,193 episodes. These current dirty-renderer claims survived the attacks; they are not proof of clean-HEAD Electron behavior.

Reachability measurements: computed pointer-events on Results navigation/search and every ancestor through HTML were all auto. Initially Flashcards was foreground and elementFromPoint found its fieldset/summary over the background Scraper controls. The reachable Scraper taskbar button brought Scraper forward; identical centre measurements then returned the Results label descendant and the actual search INPUT. The same measurement on the working taskbar control also returned its descendant. This falsified an apparent occlusion defect: normal window stacking explained it. The Advanced Settings drawer was closed for the measurement, then reopened; Dashboard selection, drawer-open state, prior foreground Flashcards and OS focus on window 2 were restored and read back. Audit temporary renderer globals were deleted. Final /logs?level=error returned total 0, including main and renderer log sources; final /health retained original bounds and no emulation. No Electron process was started or killed.

Required native reachability is still incomplete: /health at debugBridge.ts:413 exposes focused/visible/bounds, NOT BrowserWindow.isFocusable, transparent construction state, movable/resizable flags or ignore-mouse state. /bounds at :1123 likewise only exposes geometry; the inspected bridge route set has no general main-process evaluation/property endpoint. Source search found setIgnoreMouseEvents in companionHost.ts:56/113/242-243 and readingLens.ts:300/536-537, but source calls are not a fresh main-process property read. Separate Mini/Reading Lens/other changed hosts were not all opened and measured, nor were move/resize, close/reopen rect persistence, off-screen clamping, all themes, reduced motion and compact/default/maximized cells completed. These are pending required passes, NOT skipped-because-unchanged passes and NOT proof from mounted tests. This incomplete live evidence requires BLOCKED even though actionable defects were reproduced.

Cross-surface contracts: YouTube prefs travel shared/ytPlaylists.ts:44/132 (autoUpdate defaults true unless explicitly false), preload.ts:1907-1964, renderer/window.d.ts:1141-1190, YouTubePlaylistsView.tsx:347-356/393, main setPrefs/remove handlers and yt:changed store broadcast. Calls successfully persist the reverse transition before the later stale sweep overwrites it; this is a persistence/concurrency defect rather than a missing renderer handler. Timer re-entrancy only guards timer ticks, not other IPC writers. Main writeStore at :129-143 writes the entire normalized store synchronously. Cancellation-focused SRS scheduling, Anki Workbench schema migration, new HTML/media-path handling and credential transport are not subjects of the three deep dives; no new claims about them are made. Broader window changes do affect UI/i18n/keyboard and are not exempted. For metadata, old-item round trip is not complete: fresh listMedia IPC read 39 items, 32 with AniList ids, zero with relatedWorks, and 13 beyond their matched episodeCount. This corroborates the already-open D318 limitation; it does not establish new provider availability or a new defect id.

Dirty-tree attribution: The affected YouTube implementation/test, main.ts, subtitleDiscovery.ts and pruneMissingMedia helper have no shared diff from audited HEAD. F1 and F2 therefore reproduce in committed source, independent of dirty files. Shared preload, catalogs, Scraper sources and many adjacent surfaces are dirty; live Scraper evidence is explicitly attributed to that tree. catalogDuplicateKeys.test.ts is untracked and absent from isolated HEAD; its extra four tests explain the collected-file/test-count difference, not a shipped product dependency. Product code was never edited by this audit. Temporary probes used fixture-only userData directories created by their tests and restored isolated source byte-for-byte.

Findings:
1. P0 CONFIRMED — persisted state is lost when the new unattended YouTube sweep completes across another write. Exposure introduced by c79adcc7effbdd359293a060cdaa921a9523e0df; the older manual sync already used snapshot-shaped writes, so this audit attributes the new unattended actor, not original authorship of every underlying write. Exact paths: src/main/ytPlaylists.ts:563-574 (readStore, await sync, saveAndBroadcast), :129-143 (whole-store persistence), :625-637 (folder save), :713 onward (remove/prefs), src/main.ts:1764 (start timer). Reproduction: `python "%TEMP%/jp-boss-audit-20260908-004413-4bbf3625/reproduce-yt-race.py"` validates the clean isolated HEAD, adds a deferred ytDlpJson fixture to the existing test, runs its real IPC handlers, and restores the test. Start a due sweep, hold provider response, save a folder / disable autoUpdate / remove the playlist, verify each persisted write, then resolve provider successfully. Expected: folder remains, autoUpdate stays false, removed playlist stays absent. Actual: folder list becomes [], autoUpdate becomes true, deleted playlist returns. Reproduced twice, latest result 14 old tests passed / 3 new tests failed, exit 1; isolated-yt-race-reproduced.log contains exact assertions. Impact: silent loss of saved organization and reversal of intentional disable/remove actions without user initiation. Smallest safe next action: add these deferred-provider regressions permanently, then make the background completion merge against current persisted state or serialize all related writers with explicit deletion/cancellation handling; do not merely guard timer-versus-timer overlap. No real user data was mutated to demonstrate it.
2. P2 CONFIRMED — the claimed automatic-update regression gate cannot detect loss of its actor. Introducing commit c79adcc7; src/main/__tests__/ytAutoUpdateClock.test.ts:61 imports runAutoUpdateDue, while src/main/ytPlaylists.ts:596 defines startup. Repro in isolated checkout: replace the entire startYtAutoUpdateTimer body with a no-op and run `npx vitest run src/main/__tests__/ytAutoUpdateClock.test.ts --maxWorkers=1`. Expected: startup/delayed-tick assertion fails. Actual: 14/14 pass, exit 0 (mutation-clock-noop.log). Impact: checkbox can become inert again while its named suite remains green. Next action: fake-time tests for startup first tick, repeat start, delayed-provider overlap, stop-before-first-tick and stop/restart; include application startup wiring in a focused integration assertion.
3. P3 CONFIRMED — a cited gate includes a regression file that was never committed. 3fa7052c commit body cites catalogDuplicateKeys alongside dynamicI18nKeyGate; exact path src/shared/__tests__/catalogDuplicateKeys.test.ts exists only as untracked shared state. Repro: the three-path Vitest command above returns exit 0 in isolated HEAD while silently collecting only two files; explicit Test-Path returns false. Expected: cited committed-tree evidence includes all named files. Actual: shared has four extra cases from an untracked file; historical 19/19 is not reproducible as committed evidence. Impact: misleading gate provenance. Next action: review/commit that file in its owning track or stop citing it as committed coverage, and assert expected test-file collection in future receipts.

Plans and ledgers cross-examined last: Main V1 plan/evidence remain explicit that gate 11 clauses 2-3 lack proof; no completion reversal is invented. The pre-sweep register marks YouTube partial and D318 open, and records D319/D322 fixed. Fresh Scraper observations support the latter two; fresh metadata-field counts support D318. The previous boss handoff's A6-F1 has a subsequent D121 repair record and corresponding popout-aria change in this window, but this audit did not repeat every live popout property and therefore does not close it anew. Anki Workbench-specific plan deep dive is skipped because no Workbench-specific product commit was selected/identified in this window; Blanc/Aero authoritative acceptance and whole-host controls remain incomplete, not passed from docs.

Handoff: Next normal worker's first action is reproduce and fix F1 before continuing the product ladder; then add real timer lifecycle coverage for F2 and resolve F3's evidence provenance. Audit retry must continue this same unique marker section, obtain fresh main-process focusability/transparency/input/move/resize evidence through an authorized bridge capability, complete every affected surface's reachability and reverse/geometry cells, finish per-product hunk/integration hygiene review, and derive a fresh pre-window failure identity baseline. Do not claim FINDINGS/PASS from the 56-test run or the two successful Scraper flows alone. Required evidence gaps, rather than lack of actionable findings, are why this attempt is BLOCKED. Temporary evidence and both clean audit checkouts are intentionally retained for retry; no audit-created development service remains running. Only this unique audit section is staged for a local ledger commit. The index blob is constructed from the prior HEAD ledger plus this section, preserving all foreign working-tree ledger hunks unstaged; the committed hunk and unchanged shared-file bytes are verified after commit.
