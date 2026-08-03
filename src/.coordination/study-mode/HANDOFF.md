# AI development handoff

## Read first

1. `src/.coordination/study-mode/USER_INTENT.md`
2. `src/.coordination/study-mode/CURRENT_STATE.md`
3. `src/.coordination/study-mode/NEXT_ACTIONS.md`
4. `src/.coordination/study-mode/FOUNDATION_STATUS.md`
5. `src/.coordination/study-mode/DECISIONS.md`
6. `src/.coordination/study-mode/OPPORTUNITY_CATALOGUE.md`

## Current state

The subtitle-mining, Anki-recovery, replay-to-shadowing,
prepared-but-unwatched, recently-learned-in-media, and comprehension-rescue
slices are implemented. The episode-readiness rail is now implemented and
live-verified as well. The subtitle-track upgrade is implemented, with its
authentic no-candidate guard live-verified. Cross-title reinforcement is also
implemented and positive-path visual-verified through the app MCP bridge.
Abandoned-set resizing is implemented and MCP-verified through preview, apply,
undo, evidence retirement, and cleanup. Rank 17 grammar weakness scenes are
implemented and Electron-MCP verified through the Study preview and Grammar
Practice deep link. Rank 18 listening-first is also implemented, with
authentic Electron-MCP audio capability and negative-guard verification.
Rank 19 proper-name review is implemented and fully live-verified on authentic
data with no fixture, including its apply/undo path.
Rank 20 speech-rate challenge and rank 21 Anki leech in context are also
implemented and Electron-verified.

- `subtitle` is a first-class mining source throughout shared rules, Settings,
  extension input, Video Core, and Study export.
- Schema version 1 profile rules migrate safely to version 2 and are rewritten
  atomically.
- Preview and export share one profile/deck/model/rule resolver and surface the
  exact destination to the user.
- All three Anki card construction paths share the media attachment fallback.
- Immediate duplicate checking no longer waits for a large full-collection
  refresh after add/delete.
- Failed exports can be retried without duplicating successful notes, and the
  exact created-note set can be undone.
- Three explicit replays of one G-PLAY cue produce an in-player shadowing
  recommendation using bounded, local evidence. Starting it does not invoke
  the microphone.
- Prepared-but-unwatched compares the durable readiness generation time with
  the media library's real `lastPlayedAt`. It waits 24 hours, requires a
  matching non-empty workspace, and retires after later playback.
- The reminder reuses the authoritative opportunity store and existing resume
  strip. Unfinished sessions retain precedence.
- The Anki interval snapshot records one bounded recency timestamp only when an
  expression's interval truly changes. Recent non-zero changes are indexed once
  per snapshot and matched to existing prepared candidates for exact context.
- No full subtitle rescan, parallel review history, or per-media pass over the
  87,000-entry snapshot was introduced.
- Comprehension rescue keeps one two-minute, same-scene player signal. It
  requires two lookups, two explicit rewinds, and a pause, appears only while
  already paused, and loops the exact surrounding cues through existing A-B
  controls when accepted.
- Programmatic line/A-B seeks are excluded, dismissal is bounded to the scene,
  and no playback tracker or durable behavior log was added.
- Episode comparisons consume only existing readiness snapshots whose analyzer,
  subtitle, vocabulary, level-list, frequency-list, workspace, series, and
  episode identities still match. Missing, unanalyzed, and stale states remain
  explicit.
- The rail reuses the existing preparation path and exact Study context
  handoff. It adds neither a cache nor an episode-opening analysis pass.
- Subtitle upgrade uses only exact attached-local-record mappings into the
  existing rated subtitle catalogue. It requires a newer track, two rated
  dimensions on each side, and a ten-point score improvement.
- Acceptance refreshes the existing Study document with the candidate's exact
  subtitle record. It does not silently change playback selection or introduce
  another subtitle/readiness source of truth.
- Cross-title comparison uses only current selected workspace candidates,
  collapses episodes by canonical title, and requires one normalized
  lemma/reading in at least three titles.
- Its bounded comparison rail preserves exact subtitle record, cue, title, and
  episode provenance. No subtitle scan or durable occurrence index was added.
- Set resizing reuses existing media-study sessions and the existing reversible
  maximum-card filter. It requires two conservatively inferred unfinished
  vocabulary sessions and never changes the workspace without confirmation.
- The preview names retained and deferred candidates; deferred entries remain
  stored and immediate undo restores the prior selection.
- Grammar weakness scenes reuse completed Grammar session history and
  fingerprint-current prepared candidates. Two distinct recent failed sessions
  are required; unsafe one-character literal surfaces are withheld.
- The preview preserves exact title, episode, subtitle record, cue, and
  sentence provenance. It can open that scene or hand the exact pattern, level,
  and Japanese filter to the existing Grammar Practice surface.
- No grammar history, subtitle scan, occurrence index, readiness cache, or
  playback source was duplicated.
- Proper-name review reuses the analyzer's own 固有名詞 tag on existing
  candidates. Three distinct names, each appearing three or more times and still
  unknown, are required inside a fingerprint-current exact-subtitle workspace.
- The review set is transient: it is never persisted, selected, or exported. The
  single optional action flips the existing `excludeProperNouns` filter through
  the existing reversible filter history, and only when names are genuinely in
  the card selection.
- No parallel candidate store, silent workspace mutation, speaker inference, or
  second proper-noun classifier was added.

- Study no longer imports the legacy player. `StudyMediaSurface`
  (`shared/studyMediaSurface.ts`) names the five members Study needs — library
  items, the loaded item, a live position reader, one add-media action — and
  `legacyStudyMediaSurface.ts` is the single adapter that knows both shapes.
- The adopted VideoCore can satisfy that same contract through `vc_videoElement`
  without Study knowing which player produced the values.

Rank 22 series recurrence forecast is implemented, live-verified on a labelled
fixture, and its runtime cleanup was corrected and re-verified with the app down.
Rank 23 subtitle timing repair is implemented and deterministically verified;
it has **no live proof**, because its overlay does not mount without
`SEANIME_SIDECAR=1`.

Rank 24 portable Study recipe is implemented and **fully live-verified on
authentic data with no fixture**: the user's real filters exported, the clipboard
round trip byte-exact, apply 30 → 12 as one reversible history entry, `Undo
filter` back to 30 byte-for-byte, every rejection path rendered, and one real
layout defect found and fixed. There is no recipe store: export is text, import
is a paste box, and applying reuses the one existing filter operation.

The dev-only `/focus` bridge route is now **proven on its first call**. It also
settled rank 22's premise: a `requestAnimationFrame` armed in a minimized window
was still 0 after two seconds and fired the moment `/focus` brought the window
forward. Rank 22's reveal now lacks only its fixture-dependent panel pass.

Automated validation is green at 289 files and 3,171 passing tests, with the one
known unrelated `architectureBaseline` failure. Renderer, main, and preload entry
bundles pass. Changed-slice lint is clean and the changed slice has zero
TypeScript diagnostics.

## Important files

- Portable filter recipe: `src/shared/studyFilterRecipe.ts`
- Proper-name projection: `src/shared/studyProperNameReview.ts`
- Study/player contract: `src/shared/studyMediaSurface.ts`
- Legacy adapter (the only file naming both shapes):
  `src/renderer/components/media/legacyStudyMediaSurface.ts`
- Profile-rule contract and migration: `src/shared/profileRules.ts`
- Profile-rule persistence: `src/main/profileRules.ts`
- Profile-rule UI: `src/renderer/components/settings/pages/ProfileRulesPage.tsx`
- Shared mining route: `src/shared/videoCoreMining.ts`
- Study export orchestration: `src/main/mediaStudyOrchestrator.ts`
- Anki routing/export: `src/main/anki/index.ts`
- Anki interval snapshot: `src/main/anki/intervals.ts`
- Study renderer: `src/renderer/components/media/StudyOrchestratorWorkspace.tsx`
- Grammar cue projection: `src/shared/studyGrammarWeaknessScenes.ts`
- Shared grammar surface normalization: `src/shared/grammarPatternSurface.ts`
- Grammar session history: `src/renderer/grammarSessionHistory.ts`
- Replay, comprehension and timing-drift evidence: `src/shared/videoCoreStudy.ts`
- Adopted G-PLAY overlay: `src/media/VideoCoreStudyOverlay.tsx`
- Player styling: `src/media/mediaWorkspace.css`
- Debug bridge (dev-only; `/focus` lives here): `src/main/debugBridge.ts`

## Live proof

- Settings exposed separate Audio and Subtitles rule sources.
- The real rules file migrated to schema version 2.
- Subtitle preview and a created note both resolved to `Japanese Immersion`,
  `New rule`, `JP Study::Immersion`, and
  `JP Study App::JA Immersion`.
- A forced six-card mixed Anki batch proved carried, duplicate, failed,
  selective retry, and exact undo behavior. No proof notes remain.
- A real G-PLAY cue showed no prompt after replay clicks one and two, then
  offered shadowing after click three. Starting shadowing left recording idle,
  requested no permission, and produced zero renderer errors.
- Authentic `The Big O - 01` state met the prepared-but-unwatched rule. The
  live resume strip showed the exact title, explanation, and `Watch now`;
  authoritative persistence was active and renderer errors were zero.
- Playback was not started, so the user's real timestamp and position were not
  changed during this proof.
- The real 87,257-entry Anki snapshot currently has no interval-change
  timestamps. This is expected for the upgraded schema until a later poll sees
  a genuine delta; no synthetic review evidence was seeded.
- The rank-7 dev app reached the adopted Video workspace with zero renderer
  errors. Windows then raised a firewall permission dialog for FACET before
  media could load. The prompt was left untouched, the test app was stopped,
  and end-to-end live activation is not claimed.
- Authentic `The Big O` state rendered one trusted cached episode and 25
  missing-subtitle episodes. The strip scrolled internally without widening
  the document.
- Selecting episode 1 emitted its exact media ID, episode, Japanese subtitle
  record, and saved 53.267-second position, then opened `The Big O - 01` in
  Video with zero renderer errors.
- The player was paused after the smoke and the original playback timestamp and
  position were restored exactly.
- The authentic subtitle catalogue contained zero providers and zero rated
  tracks, so the rank-9 smoke correctly withheld the upgrade card. No synthetic
  evidence was seeded; the Study surface remained bounded with zero renderer
  errors.
- Authentic data had only one prepared title, so rank 10 correctly stayed
  hidden. A temporary three-title visual fixture proved the comparison UI,
  revealed and fixed clipped fluid cards, and drove the exact `The Big O`
  context to 42.000 seconds with zero renderer errors.
- The app was stopped and both touched runtime files were restored
  byte-for-byte to their original SHA-256 hashes.
- Authentic media-study history was empty, so rank 11 stayed hidden. Two
  temporary session records produced a 30 → 18 preview; apply reached 18/370,
  in-panel undo restored 30/370, and removal retired the opportunity.
- Visual review moved clipped far-right controls into the left reading flow.
  Local history returned to null and the Study document returned to its exact
  original hash after shutdown.
- Rank 12 was audited and deferred: local cards expose missing path roles, but
  VideoCore has no authoritative managed asset write/update path for repairing
  an existing card. The Anki fallback only attaches bytes during note creation.
- Rank 13 was audited and deferred because subtitle and Study candidate records
  do not include speaker identity.
- Rank 14 now derives bounded quick scenes from current exact-subtitle selected
  candidates without a subtitle rescan or scene index.
- Authentic `The Big O - 01` yielded a seven-word 0:48–3:59 preview. Visual QA
  found and fixed the range being pushed off the right edge.
- MCP launch set the existing player A/B controls to 48.00s/239.00s; playback
  at the endpoint looped to 49.71s, with zero renderer errors.
- No fixture was needed. The app was stopped and both runtime JSON files were
  restored to their original SHA-256 hashes.
- Rank 15 retires outdated Study debt for three provable reasons only: removed
  media, a detached exact Japanese subtitle record, or a workspace whose every
  selected word is already exported or known. Fingerprints never retire
  anything, because a stale analysis means refresh.
- Retirement changes opportunity status only. Cards, candidates, workspaces,
  media, and subtitle records are preserved, each item is previewed with its own
  evidence, and the panel exposes an immediate undo.
- The renderer sync now also retires spent `scene-quick-session` and
  `stale-queue-cleanup` entries, which rank 14 had left active forever.
- The authentic library no longer contains the media id behind the existing
  Study workspace, so the pre-existing sync retired the real
  `prepared-unwatched` entry at boot and the honest cleanup list was empty.
  Three labelled fixtures proved apply (3 dismissed, stream emptied) and undo
  (3 active, card restored) with all study data unchanged and zero errors.
- `study-orchestrator-v2.json` was restored to its exact original hash and the
  real `media.json` was never modified, both confirmed from a non-sandboxed
  shell. The test app ran inside a tooling filesystem overlay, so runtime
  restoration must always be verified outside that overlay — a sandboxed shell
  will happily report a shadow copy as restored.
- SM-022 is deliberately not on this list. It is a contract decoupling with no
  user-visible delta, verified deterministically only; the app was not launched
  and no runtime file was touched. Do not record a live proof it did not have.
- Rank 16 compares only current, exact-subtitle cached readiness for favorites.
  A `save-for-later` favorite points to the easiest favorite already at
  `short-preview` or `ready-now`; stale, unanalyzed, detached-track, and
  non-favorite entries are excluded on both sides.
- The action reuses the exact Study context handoff for the easier media,
  subtitle record, episode, and stored position. The projection creates no
  analysis pass, workspace requirement, or alternate readiness/favorite index.
- Authentic state has 30 media items and zero favorites, so the recommendation
  is correctly ineligible. The current worktree was not launched because the
  installed packaged app predates it; no live UI claim is made and both runtime
  files retained their original SHA-256 hashes.
- Authentic state had no Grammar history, so rank 17 correctly stayed hidden.
  The real prepared workspace nevertheless exposed truthful longer-surface
  matches and revealed unsafe one-kanji matches, which the detector now rejects.
- Two temporary completed sessions missing N4 `ではない` produced two authentic
  `The Big O - 01` scenes at 3:33 and 10:16. Electron MCP visual QA confirmed
  both highlighted lines and all controls in the bounded left-flow panel.
- The Practice action opened Grammar Practice with Japanese, N4, and exact
  `ではない` filters, yielding three truthful results and zero renderer errors.
- Temporary history, preferences, filters, and proof windows were removed.
  After the dev app stopped, both runtime JSON files matched their original
  SHA-256 hashes.
- The listening-first detector requires fingerprint-current, complete
  `ready-now` readiness at 85%+ known occurrence coverage, the exact attached
  Japanese subtitle/workspace context, and usable audio proven by the currently
  mounted player.
- Player proof may come from exposed audio tracks, a disposable capture stream,
  or Chromium's positive decoded-audio byte counter. The last path is required
  for this app's cross-origin `playfile://` media and is capability evidence,
  not an audio-quality score.
- The action reuses the exact Study handoff and existing dictation controls. It
  does not request microphone permission or create alternate readiness,
  subtitle, audio, or playback state.
- Authentic `The Big O - 01` reached ready state 4 with 1,204,401 decoded audio
  bytes, while its exact current readiness remained 0%/`save-for-later`.
  Electron MCP therefore confirmed the card stayed hidden and renderer errors
  stayed at zero. No synthetic positive fixture was added.
- Telemetry consent and both runtime JSON files were restored exactly after the
  MCP smoke; hashes remain `A834EA90…4AF7` and `4F16DAEB…1A26`.
- Rank 19 activated on authentic data with no fixture: the Study stream showed
  `5 recurring names in The Big O - 01` and the panel listed ドロシー ×17,
  ロジャー ×7, ノーマン ×6, アンドロイド ×5, スミス ×4 across 39 appearances.
- The ≥3-occurrence gate rejects the analyzer's junk tags in the same workspace
  (`ぐ`, `ー`, `フフフ`, and the mis-split `ボン`/`クラ`).
- Visual QA found and fixed redundant furigana on katakana names and quotes that
  merely repeated the headword. Both were re-verified live.
- The pollution branch was proved through the real UI: `Keep names out of cards`
  moved the selection 268 → 251 and `Undo this filter change` restored 268. Two
  setup filter changes were then unwound to the exact baseline.
- Verified from PowerShell after shutdown: `study-orchestrator-v2.json` and
  `media.json` are back at `4F16DAEB…1A26` and `A834EA90…4AF7`. Telemetry
  consent, which this session created, was removed again.
- **The Bash tool served a stale overlay of `media.json`** during that session,
  which produced a completely wrong audit (1,586 items, zero Japanese subtitle
  records, orphaned workspace). Verify runtime state from PowerShell.
- Rank 20 captures speech timing only while preparation already holds subtitle
  cues, then derives analyzer words/second without another subtitle read or a
  stored difficulty score.
- The baseline is the median of one value per canonical title, gated at three
  titles and 40 contributing cues. The existing player speed is the user's
  preference; a slower preference can resolve the signal.
- Electron bridge QA used a labelled three-title fixture because authentic data
  has one measured title. The panel showed 3.20 words/s versus a 2.00 median,
  suggested 0.6×, and was fixed to scroll fully into the viewport.
- Apply changed the real existing preference 1× → 0.6× and retired the signal;
  Restore returned 0.6× → 1× and restored it. Closing while applied also
  restored 1×. Renderer error logs stayed at zero.
- Fixture data, telemetry consent, screenshots and dev logs were removed.
  Runtime hashes are again `A834EA90…4AF7` and `4F16DAEB…1A26`.
- Rank 21 adds the current Anki-owned `leech` note tag and suspended scheduler
  queue state to the same bounded interval snapshot. A full authentic poll
  returned 87,257 expressions, one leech (`厳粛`), and zero suspended cards.
- Flagged expressions are indexed once and matched only to candidates from the
  newest fingerprint-current workspace for the exact attached Japanese
  subtitle record. Clearing the current Anki state retires the renderer signal.
- Authentic Study data has no prepared `厳粛` candidate, so the recommendation
  correctly remained absent. A labelled runtime-only candidate fixture proved
  the positive deep-red preview, its read-only safeguards, and the exact 0:42
  player handoff.
- Visual QA found the panel below the viewport. It now scrolls into view with
  its first context, close button, exact-scene action, and provenance visible;
  document width remained 1,264 pixels and renderer errors stayed zero.
- Anki itself was never mutated. The fixture, telemetry key, logs, and QA
  processes were removed. Restored hashes are Anki snapshot
  `D1056B3E…CBB51`, Study `4F16DAEB…1A26`, and media
  `A834EA90…4AF7`.

- Rank 24 exports and imports the workspace's nine filter fields as byte-stable
  text and nothing else. Omitted fields are completed from the app's defaults,
  never from the workspace being pasted into, and the preview shows every
  resulting field before anything is applied.
- Its live pass on authentic data: real filters exported with code `15xr5gc` and
  the label `The Big O - 01`; clipboard byte-exact at 443 characters; apply moved
  30 → 12 with coverage 17% → 13% as one history entry and one action record;
  `Undo filter` restored 30, history 3, and the filter object byte-for-byte;
  every rejection reason rendered; the whole panel fits one 821px viewport with
  no horizontal overflow in a window that is partially off-screen.
- Visual QA fixed one real defect: diff values had been pushed against the far
  right edge by `space-between` and now read directly after their labels.
- `/focus` is proven. `POST /focus {"window":"main"}` restored, showed and focused
  a minimized window, and the frame that had been stalled for two seconds fired
  immediately. Minimize through the app's own `popoutControl('minimize')` to
  reproduce the unfocused state without touching the mouse or keyboard.
- After that pass: `media.json` was never modified (`DC2C4E37…`), the Study
  document was audited and restored byte-for-byte (`FC9E50B9…`) with the app down,
  and `anki-intervals.json` was left as the app's own authentic poll wrote it.

SM-032 localized the Study surface itself. About 190 strings in
`StudyOrchestratorWorkspace.tsx` — the funnel, filter bar, candidate list,
pagination, context rail, card and Anki previews, opportunity actions, production
line and episode rail, plus ~30 status/error messages — now go through `useT()`,
with 262 new keys in EN/JA/ZH/RU.

- Filter field and value labels live at `study.filter.field.*` / `study.filter.value.*`
  and are shared by the filter bar **and** the rank-24 recipe diff. Use those keys
  for anything that names a filter; do not add a second wording.
- Readiness categories go through `readinessCategoryLabel` in the renderer. The
  shared `readinessLabel` stays English on purpose — it also feeds main-process
  evidence strings.
- `StudyPipelineStage` now carries optional `detailKey`/`detailVars` beside the
  English `detail`. Main-process writers set all three; the renderer prefers the
  key and falls back to the stored sentence, so jobs written before this still read
  truthfully. Stage *names* are translated by stage id.
- `studyFilterRecipeSource` connects rank 24 to the episode rail: a fresh workspace
  for the next episode starts from the app defaults, so the panel offers the newest
  other same-series workspace whose filters differ. It fills the paste box only.
- Two defects a Japanese live pass caught: the recipe's undo hint quoted the
  English button label, and the recipe code rendered uppercase in one place and
  lowercase in another. Both fixed and re-verified live.
- `StudyOpportunity` and `StudyEvidence` now carry optional `titleKey`/`titleVars`,
  `explanationKey`/`explanationVars` and `labelKey`/`labelVars`. The renderer
  resolves them through `opportunityTitle` / `opportunityExplanation` /
  `evidenceLabel` — use those three anywhere an opportunity is rendered.
  `continue-session`, `prepared-unwatched` and `subtitle-required` are migrated;
  `recently-learned-context`, `queued-preparation`, `favorite-preparation`,
  `newly-unlocked`, `export-pending` and the readiness-derived explanations are
  not, and each is a five-line change on the same pattern.
- The recipe panel leads with its nine filters **in words** before the JSON, and
  the evidence panel names the opportunity type (`study.type.*`) instead of
  printing its slug.

## Repository state

- Branch: `grammarx/phase-1-5`
- Verified base: `a22e7ba1f72aa7942890ad7eb3ac253b37be0735`
- The worktree contains extensive unrelated modifications and untracked files.
- No commit was created and no unrelated change was discarded.

## Do not

- Modify files outside `src/`.
- Reset, clean, or discard the worktree.
- Create alternate subtitle, profile-rule, Anki, opportunity, or playback
  sources of truth.
- Count automatic loop playback as explicit replay evidence.
- Count programmatic line/A-B seeks as comprehension-rewind evidence.
- Trigger microphone permission during a non-hardware smoke.
- Remove the legacy player until every active route and Study handoff consumer
  has migrated.

## Exact next action

Rank 24 is **implemented, live-verified and cleaned up**. Next, in order:

1. Rank 25, offline preparation bundle — audit before implementing, the way
   ranks 12 and 13 were audited into honest deferrals.
2. Rank 23's live proof, which needs `SEANIME_SIDECAR=1` plus a genuinely
   drifting subtitle track.
3. Rank 22's panel reveal, which now needs only its two-episode fixture; both
   audit-first removers are committed for the cleanup.

Back up **every** file in `%APPDATA%\jp-study-app` before starting the app, not
only the three documented data files — this session lost the pre-session
`desktop-layout.json` that way. And remember the user's saved desktop can hold a
**minimized** Media window: `element.click()` drives a `display:none` window
perfectly well while every measurement comes back zero.

Three hard-won facts: the Bash tool serves a **stale filesystem overlay** (read
runtime JSON and hashes from PowerShell); the `jp-app` MCP server only loads
when the session cwd is `jp-study-app` — otherwise drive `debug/bridge.json`
directly at `127.0.0.1:<port>` with its bearer token, and **never** substitute
desktop remote control, which the user has rejected twice; and a runtime hash
read while the app is still running proves nothing, which is exactly how the
previous session came to report a restoration that had not happened.

The suite currently has one unrelated red test: `architectureBaseline` lists a
finding for `src/main/city/assets/validateAssets.ts`, which is among ~215 files
deleted in the working tree by other in-flight work. Do not revert those.

The legacy player migration is not the next action any more, and the reason is
recorded so it is not re-derived. Step 2 of the four — moving the Study handoff
off `MediaState` — is done. Steps 1, 3 and 4 are blocked outside this track:
`MediaWorkspaceHost` renders nothing unless `SEANIME_SIDECAR=1`, which is off in
a normal run, and `docs/migration/NEXT_SESSION.md` puts old-player retirement
behind its own unfinished G-PLAY and microphone proofs. Re-check those two facts
before picking the migration back up.

> **Answer to that re-check, from the migration track, 2026-07-30.** Both proof
> facts are settled: **G-PLAY passed** (`docs/migration/proof/gplay-20260730/`) and
> the **microphone proof is a user decision to skip**, recorded as a permanent known
> gap. **But steps 1, 3 and 4 are still blocked**, for a different and more concrete
> reason than the one above — `SEANIME_SIDECAR` cannot be turned on in a normal run
> yet:
>
> - `forge.config.ts` ships `extraResource: ['public']` only, so a **packaged build
>   contains no `seanime.exe`**; and
> - `supervisor.ts` keeps the sidecar datadir **deliberately outside `userData`** —
>   without `SEANIME_DATADIR` every start `mkdtemp`s an empty one and deletes it on
>   stop, so a normal run would show an empty library.
>
> Full detail, including the half that is now fixed (the exe path no longer hardcodes
> a developer's home directory), is under "What old-player retirement really needs"
> in `docs/migration/NEXT_SESSION.md` and `playerRetirementBlockers` in
> `docs/migration/progress.json`. Rank 23's live proof is unblocked in the meantime:
> `SEANIME_SIDECAR=1` plus a `SEANIME_DATADIR` still works for a driven run.

> **Update, migration track, 2026-07-30 (later).** The **datadir blocker is closed**.
> `src/main/seanime/dataDir.ts` gives the sidecar a durable `<userData>/seanime` (a
> subdirectory, never the userData root), `stop()` no longer deletes it, and a leftover
> `seanime-phase1-*` temp datadir is adopted once. Proven live across a real quit and
> relaunch: `docs/migration/proof/datadir-durable-20260730/`. **On a dev machine with
> the pinned sibling checkout, `SEANIME_SIDECAR=1` in a normal run is now safe and keeps
> its library across restarts** — so steps 1, 3 and 4 are unblocked for local work.
> **The packaging blocker is closed too**, same day: the user authorised the
> `forge.config.ts` edit, and a real `npm run package` produced
> `out/jp-study-app-win32-x64/resources/seanime/seanime.exe`, sha256-identical to the
> pinned checkout. **So steps 1, 3 and 4 are fully unblocked** and `SEANIME_SIDECAR` can
> become the default. One caveat if you are the track that flips it: a **packaged** app
> has never been launched with the flag on — the debug bridge is dev-server-only, so that
> check is a manual launch, and it is the right first step of the retirement.
