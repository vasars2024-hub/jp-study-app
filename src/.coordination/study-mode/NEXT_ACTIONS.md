# Next actions

## Completed in the latest slice

- Added Subtitles as a first-class mining-rule source.
- Migrated and atomically persisted profile-rule schema version 2.
- Unified Anki preview/write routing and surfaced exact destinations.
- Applied one media attachment fallback to all Anki construction modes.
- Removed the large-collection refresh stall after note add/delete.
- Live-verified mixed partial export, selective retry, and exact undo.
- Implemented and live-verified bounded replay-to-shadowing in G-PLAY.
- Implemented and live-verified prepared-but-unwatched from authentic durable
  preparation and playback state.
- Implemented recently learned Anki cards in exact prepared media context with
  bounded interval-change evidence.
- Implemented a session-local comprehension rescue from real lookup, rewind,
  pause, and cue events. Automatic loops cannot create evidence, and the
  explicit rescue action reuses the existing three-cue A-B loop.
- Audited legacy player retirement and confirmed that active routes still
  depend on it.
- Implemented and live-verified the episode readiness rail from authoritative
  media identity and existing cached readiness only.
- Distinguished trusted, stale, unanalyzed, and missing-subtitle episodes;
  reused existing preparation and exact-context handoff paths.
- Implemented subtitle-track upgrade from exact attached local records and the
  existing rated catalogue, with deterministic rejection of catalogue-only,
  older, weakly rated, marginal, and cross-series candidates.
- Reused exact-record Study preparation for acceptance; no silent playback
  switch, alternate catalogue, or parallel readiness cache was added.
- Live-verified the authentic no-candidate state: the user's empty rated
  catalogue correctly produced no recommendation and zero renderer errors.
- Implemented cross-title reinforcement from current selected workspace
  candidates, with a strict three-canonical-title gate and exact cue contexts.
- Positive MCP visual QA found and fixed clipped comparison cards in a
  partially off-screen draggable window. Exact handoff reached 42.000 seconds.
- Implemented conservative abandoned-set resizing from existing bounded
  media-study sessions and the reversible maximum-card filter.
- MCP visual QA found and fixed unreachable far-right actions. Apply moved the
  workspace 30 → 18 and immediate undo restored 30; all fixtures were removed.
- Audited rank 12 and deferred it because no existing managed VideoCore asset
  write/update path can repair a local card in place.
- Audited rank 13 and deferred it because subtitle and Study candidate
  provenance has no speaker identity.
- Implemented scene-based quick sessions from current exact-subtitle selected
  candidates, with no scene index or subtitle rescan.
- Authentic MCP visual QA found and fixed a clipped range. `The Big O - 01`
  launched at A=48.00s/B=239.00s and looped from B to 49.71s with zero errors.
- Restored the temporary visual fixture byte-for-byte after stopping the app.
- Restored proof data and removed all temporary Anki notes.
- Implemented stale queue cleanup from the persisted Study document, the current
  library, exact attached Japanese records, and finished vocabulary work only.
- Retirement reuses the existing opportunity status operation, previews every
  item with its own reason, and exposes an immediate undo; no cleanup ledger,
  and no analysis fingerprint can retire anything.
- Fixed the pre-existing gap where a spent `scene-quick-session` entry was never
  retired by the renderer sync.
- Live apply moved three labelled fixtures to dismissed and undo returned all
  three to active, with workspaces, candidates, exports, readiness, and action
  history unchanged and zero renderer errors.
- Restored `study-orchestrator-v2.json` and `media.json` byte-for-byte.
- Decoupled the Study surface from the legacy player: `StudyOrchestratorWorkspace`
  now takes the five-member `StudyMediaSurface` instead of the whole
  `MediaState`, with one adapter holding the legacy shape. No behavior change,
  deterministic verification only, no live smoke claimed.
- Filed separately: two `.test.tsx` renderer test files have never run, because
  the vitest include globs only match `.test.ts`.
- Implemented easier favorite alternatives from fingerprint-current cached
  readiness only. A `save-for-later` favorite can suggest the easiest favorite
  already at `short-preview` or `ready-now`; stale or unanalyzed entries are
  excluded on both sides.
- Reused exact media/subtitle/position handoff, added no analysis pass or
  workspace requirement, and localized the new recommendation in EN/JA/ZH/RU.
- Authentic data contains zero favorites, so rank 16 correctly stays hidden.
  No current-worktree live UI claim is made and no runtime file was touched.
- Implemented grammar weakness scenes from the existing completed Grammar
  history and fingerprint-current prepared candidates. Two distinct failed
  sessions in the recent bounded window are required.
- Rejected unsafe one-character pattern surfaces after authentic projection
  exposed false substring matches. No subtitle rescan, occurrence index, or
  second grammar history was added.
- Electron MCP visual QA proved two authentic `The Big O - 01` contexts for N4
  `ではない`, fixed clipped controls, and verified the existing Grammar Practice
  deep link with Japanese, N4, and exact-query filters.
- Removed the temporary proof history, filters, preferences, and windows, then
  restored both runtime JSON files to their original hashes.
- Implemented listening-first from fingerprint-current, exact-subtitle cached
  readiness plus one transient capability signal from the currently mounted
  player. A complete `ready-now` result at 85%+ known occurrence coverage is
  required.
- Reused the exact Study handoff and existing dictation/reveal controls. No
  audio-quality score, alternate readiness cache, playback state, subtitle
  source, or microphone request was added.
- Electron MCP confirmed authentic `The Big O - 01` audio through 1,204,401
  decoded bytes at ready state 4. Its readiness is genuinely 0%, so the
  listening-first card correctly stayed hidden with zero renderer errors.
- Restored telemetry consent and both runtime JSON documents exactly after the
  rank-18 smoke.
- Implemented proper-name review as a temporary set built from the proper-noun
  candidates the current prepared workspace already stored. Three distinct
  names, each recurring three or more times and still unknown, are required.
- Kept the set out of every source of truth: nothing is persisted, selected, or
  exported, and the only workspace write flips the existing `excludeProperNouns`
  filter through the existing reversible history — offered only when names are
  genuinely inside the card selection, and guarded by a staleness check.
- Localized the panel and recommendation in EN/JA/ZH/RU and registered the new
  type for renderer-signal retirement.
- Live-verified on authentic data with no fixture: the stream showed `5
  recurring names in The Big O - 01` and the panel listed the real five names.
  The pollution branch was proved through the real UI (268 → 251 → 268), and all
  setup changes were unwound to the exact baseline.
- Fixed two defects found by visual QA: redundant furigana on katakana names,
  and quotes that only repeated the headword.
- Corrected earlier notes in these docs that were wrong. The Bash tool served a
  stale overlay of `media.json`, which had produced a fabricated picture of the
  library (1,586 items, no Japanese subtitles, orphaned workspace). Real state:
  30 items with `The Big O - 01` and its exact Japanese record.
- Filed separately: `syncStudyOpportunities` never retires a spent
  `grammar-weakness-scenes` entry — that type is missing from
  `rendererSignalTypes`.
- Filed separately: the Study→player handoff silently no-ops from a cold player,
  affecting every rank that uses `openContext`. Two causes isolated live — an
  80 ms race after navigation, and `takeHandoff` burning the pending context in
  whichever Media Center window mounts first.
- Implemented speech-rate capture inside the existing preparation pass and
  derived words/second from analyzer occurrences over summed spoken cue time.
- Compared one median per canonical title against the user's existing player
  speed, with a three-title/40-cue gate and no subtitle rescan, playback tracker,
  alternate preference, or persisted difficulty score.
- Added a Fluent deep-red comparison panel with explicit `Use`, `Restore`, and
  guarded close-to-restore behavior. Apply 1× → 0.6× retired the resolved signal;
  Restore returned 0.6× → 1× and brought it back.
- Electron bridge visual QA fixed the panel initially remaining below the
  viewport; it now scrolls fully into view with no horizontal overflow.
- Authentic data correctly stayed ineligible with one measured title. A labelled
  temporary three-title fixture proved the positive UI and was removed; runtime
  JSON hashes and telemetry consent were restored exactly.
- Extended the existing 87,257-entry Anki interval snapshot with current
  `leech` note-tag and suspended-card queue flags from the same notes/cards poll.
  Duplicate expressions retain the strongest interval and union current flags;
  no review event or second Anki source was added.
- Matched flagged expressions only to the newest fingerprint-current workspace
  for the exact attached Japanese subtitle record. The read-only deep-red panel
  can open exact cues but cannot reset, unsuspend, edit, or otherwise mutate
  Anki.
- Authentic Anki contains one leech (`厳粛`) and no suspended cards. The full
  production poll captured it, while authentic Study data correctly produced
  no recommendation because no prepared candidate matches that expression.
- A labelled runtime-only candidate fixture proved the positive panel and real
  0:42 player handoff. Visual QA found and fixed a below-viewport preview; the
  final first card, close button, action, and provenance stayed visible with
  document width bounded and zero renderer errors.
- Removed the fixture, telemetry consent, logs, and dev processes, then restored
  the Anki snapshot, Study document, and media document to their exact baseline
  hashes.
- Implemented series recurrence forecast: selected lemmas from one prepared
  episode projected against later prepared normal episodes of the same canonical
  series, using newest fingerprint-current exact-subtitle workspaces on both
  sides. No subtitle rescan, recurrence index, or persisted forecast score.
- Excluded specials, OVAs and creditless items by `episodeKind`/episode number,
  collapsed multiple encodes of one episode to a single identity, and rejected
  proper nouns and cue-less candidates on both sides.
- Added a read-only ranked preview capped at 8 lemmas and 3 future contexts,
  with honest totals and the existing exact-cue actions for the current and each
  future scene. Localized in EN/JA/ZH/RU.
- Re-ran validation from PowerShell this session: 14 focused tests pass, full
  suite 3,130 passed / 1 known unrelated failure, 5,442 i18n keys in parity, and
  all three production bundles build.
- Corrected the previous session's false restoration claim. Its dev app was
  never stopped, so the QA fixture was still in the user's live data hours
  later, and `media.json` had been mutated too — a fixture subtitle record
  persisted onto `The Big O - 02`, and `The Big O - 01`'s `lastPlayedAt` bumped
  by an exact-scene click that never navigated.
- Removed all of it with the app down and verified from PowerShell: Study
  document `FC9E50B9…4490` (1 workspace, 3 readiness, 3 authentic episode-1
  opportunities), media `DC2C4E37…1F52` (30 items, `lastPlayedAt` restored,
  `positionSec` untouched at 53.267). Zero fixture residue in either, and none
  in the Anki snapshot.

- Implemented rank 23, subtitle timing repair cue, in the adopted player beside
  ranks 2 and 7. Only explicit ±0.1s activations create evidence; the tracker's
  own writes bypass that handler so they cannot feed themselves.
- Gated it on progressive drift alone: four or more corrections, one direction,
  strictly advancing playback positions, a 120-second span, at least 100 ms of
  delay per minute, and every correction within 0.15s of the measured line.
  Converging on a constant offset stays silent by design.
- The action follows the measured rate forward from the newest manual
  correction through the player's existing `setSubtitleDelay`. No timing store,
  subtitle rescan, correction score, or second offset source was added, and the
  projection is clamped to the manual control's own ±10s range.
- Made it fully reversible: `Stop following` restores the anchor value exactly,
  a later manual correction re-anchors, a contradicting correction stops the
  tracker, and a track change discards the evidence.
- Localized the cue in EN/JA/ZH/RU, with CLDR plural forms for the Russian
  correction count. Added 17 focused tests covering every gate and the maths.
- Added a `/focus` route to the debug bridge so a QA pass can bring the window
  to the foreground through Electron's own API. This removes the harness limit
  that blocked rank 22: Chromium does not run `requestAnimationFrame` in a
  non-foreground window. No input is synthesized; it never starts when packaged.
- Claimed no live proof for rank 23. The running app reported `SEANIME_SIDECAR`
  unset, so its surface never mounts. No runtime file was touched this session
  and no fixture was created — with the app down, `media.json` and
  `study-orchestrator-v2.json` still carry the rank-22 cleanup hashes and
  timestamps from before this session started.

- Implemented rank 24, portable Study recipe: `shared/studyFilterRecipe.ts` turns
  the workspace's nine filter fields into byte-stable text and back. No media id,
  workspace id, candidate, selection or timestamp travels with it, and there is
  no recipe store — export is clipboard text, import is a paste box, and applying
  reuses the one existing `study:applyFilters` operation, so `Undo filter`
  reverses a pasted recipe in one step.
- Made incomplete recipes honest rather than convenient: omitted fields are
  completed from the app's defaults, never from the workspace being pasted into,
  and the preview shows every resulting field before anything is applied. Unknown
  fields, unreadable values and omitted fields are counted and reported; hostile
  numbers clamp through the existing `normalizeStudyFilters`; seven distinct
  rejection reasons are localized.
- Added a read-only preview derived from the live workspace on every keystroke —
  field diff, selection delta, and a bounded six-word sample of what enters and
  leaves — so it needs no staleness guard.
- Localized 45 new keys in EN/JA/ZH/RU, with CLDR plural forms in Russian for the
  three count messages and the applied confirmation. The recipe's own label comes
  from the media title and is deliberately untranslated.
- Live-verified the whole feature on authentic data with **no fixture**, through
  the app's own debug bridge: real filters exported (code `15xr5gc`), clipboard
  round trip byte-exact, apply 30 → 12 as one history entry and one action
  record, `Undo filter` back to 30 with the filter object byte-identical, every
  rejection path rendered, and geometry fully inside one viewport with no
  horizontal overflow. Zero renderer errors.
- Visual QA found and fixed a real defect: the diff values were pushed to the far
  right edge by `justify-content: space-between` — the ranks 10/11/14/17 pattern.
  They now read directly after their labels at x=305.
- **Proved `/focus` on its first ever call**, and with it rank 22's premise: a
  `requestAnimationFrame` armed in a minimized window was still 0 after two
  seconds, then fired the moment `/focus` brought the window forward.
- Left runtime state clean and said exactly what moved. `media.json` was never
  modified (`DC2C4E37…`, still stamped 21:01). The Study document was audited
  (only 2 QA action records and 3 app-restamped opportunity timestamps differed,
  zero fixture residue) and restored byte-for-byte to `FC9E50B9…` with the app
  down. `anki-intervals.json` was left as the app's own authentic poll wrote it.
  `desktop-layout.json` had no pre-session backup — recorded as a lesson, and the
  layout was restored by reversing the window actions inside the app.

- SM-032: localized the Study surface itself — ~190 strings and 262 keys in
  EN/JA/ZH/RU covering the funnel, filter bar, candidate list, pagination, context
  rail, card/Anki previews, opportunity actions, production line and episode rail,
  plus ~30 status and error messages. Filter field/value labels are now shared by
  the filter bar and the rank-24 recipe diff; readiness categories go through one
  renderer helper; stage names translate by id; and `StudyPipelineStage` gained
  optional `detailKey`/`detailVars` so main-process details can be shown in the
  user's language with the stored English kept as a fallback.
- Connected rank 24 to the episode rail: `studyFilterRecipeSource` offers the
  newest other same-series workspace whose filters differ, filling the paste box
  only, so applying stays explicit and reversible.
- A live Japanese pass found and fixed two real defects: the recipe's undo hint
  quoted the English button label, and the recipe code rendered uppercase in the
  header but lowercase in the copy notice.

### Still owed from SM-032

- The translated stage **details** are unproven live: the user's persisted job
  predates `detailKey`, so the English fallback is what displays. They appear on
  the next preparation of any title. Verify then, rather than re-preparing a title
  just to see a label.
- The cross-episode recipe offer has deterministic coverage only, because the
  authentic document holds one workspace. It will activate on its own once a second
  episode is prepared — no fixture needed, just wait for real data.

## Legacy player migration — steps 1 and 2 done; step 3 is next and UNBLOCKED

> **2026-07-31, by the migration track.** Step 1 is **done** — `player` and `video` now
> route to the adopted workspace via `renderer/views/MediaWorkspaceSectionView.tsx`, proven
> live in `docs/migration/proof/media-routing-20260731115831/`.
>
> **`music` was deliberately excluded**, by user decision: `MediaWorkspace.tsx` contains
> nothing music-shaped, so routing it there would delete the music player, its lyrics pane
> and `PersistentPlayer` rather than migrate them. A harness phase fails if that is undone.
>
> The blocking objection recorded below — that the swap would leave the app with no media
> surface — is answered *including under the rollback*: `SEANIME_SIDECAR=0` still returns
> `null` from the host, so the section decides from `window.api.seanimeStatus()` and falls
> back to `MediaCenterView` with a stated reason. Phase D proves it.
>
> **Step 3 is also done and covers all five checks it names**, 2026-07-31 —
> `docs/migration/proof/retirement-step3-20260731125703/`. Driven through the NEW route:
> taskbar identity unchanged (Video / Media / Music); **window dragging survives the
> workspace opening and closing** (67,29 → 132,72, via CDP input because `dragStart` calls
> `setPointerCapture`); a real file plays at 1920×1080 with both subtitle tracks;
> **exact cue seeking** — replay → 6.551, previous → 2.041, next → 6.556 against the file's
> true starts of 6.5 and 2.0; **resume across a real restart** — quit at 11.871, relaunched,
> reopened at 14.197; and no orphan on quit.
>
> It found and fixed a real defect: the host and the section were **both** opening the
> workspace, so `video` opened twice and a fast close was undone by the section's late
> dispatch. The host's `os:open` listener is now the single owner.
>
> **Scope note on cue seeking:** navigation is exact, but full-timeline subtitle *delivery*
> is not established — only cues 0 and 1 are ever delivered for that fixture. That is a
> directstream property, not a control defect.
>
> **Only your step 4 is left, and it is a decision rather than cleanup.** 2026-07-31 also
> closed the gap that made step 4 look mechanical: `MediaCenterView`'s own sidebar still
> listed Video and Library, so from the Music app the retired player was one click away.
> Those tabs are now hidden whenever the workspace exists — and **restored when it does
> not**, because that is the `SEANIME_SIDECAR=0` fallback. Both directions are asserted live
> (`docs/migration/proof/media-routing-20260731131337/`).
>
> So the legacy player is already unreachable in normal use. Deleting it additionally
> requires resolving three things: `MediaCenterView` cannot go at all (music renders it,
> and the workspace has no music surface); `MediaContent.tsx` cannot go while
> `MediaCenterView` composes its library/hub/YouTube/transcription exports; and deleting the
> legacy video and library surfaces makes `SEANIME_SIDECAR=0` stop being a rollback.
>
> `renderer/mediaWorkspaceAvailability.ts` is the single owner of "is there a workspace?" —
> use it rather than adding another `seanimeStatus()` call; a test enforces that.

1. Move library/video/music routing to `MediaWorkspace`. **UNBLOCKED 2026-07-31 —
   the migration track flipped the flag.** `SEANIME_SIDECAR` is now **on by
   default** (`shared/seanime.ts`; `=0`/`false`/`off` opts out), so a normal run
   reports `stopped` rather than `disabled` and `MediaWorkspaceHost` mounts — the
   swap no longer leaves the app with no media surface. Proven on a run with the
   variable deleted from the environment, plus the opposite result under `=0`:
   `docs/migration/proof/sidecar-default-on-20260731114100/`.

   The migration track's own retirement blockers (packaged binary, durable
   datadir, packaged start) are all closed too, so nothing upstream of this
   remains. Read `docs/migration/NEXT_SESSION.md`'s top section before starting —
   it scopes the removal, and in particular records that
   `shared/mediaProviders.ts`'s `MediaContentType` is an **unrelated union
   sharing the name** with the legacy player and must not be removed with it.
2. Move Study-context handoff away from the legacy `MediaState` contract.
   **Done, SM-022.** `shared/studyMediaSurface.ts` +
   `renderer/components/media/legacyStudyMediaSurface.ts`.
3. Verify dragging, taskbar identity, resume, subtitles, and exact cue seeking.
   Blocked behind 1.
4. Remove legacy code only after route and restart smokes pass. Blocked behind 1
   and 3.

## Next 1 — Rank 25, offline preparation bundle

Catalogue rank 25: "Losing optional services · upcoming title + local assets ·
cache queue". Audit before implementing. The two honest deferrals on this track
(ranks 12 and 13) both came from an audit that found no authoritative path, and
that is a better outcome than a feature resting on one.

Two facts to check first, because they decide the shape: whether VideoCore has a
managed local-asset path that can be pre-warmed (rank 12 concluded it has no
write/update path for repair — pre-warming may be a different question), and
what the existing preparation pass already caches, so the bundle reuses it rather
than becoming a second cache.

### `/focus` is proven — the recipe for using it

```text
POST /eval   {"window":"main","js":"(window.api.popoutControl('minimize'),'ok')"}
GET  /health                    → focused:false, minimized:true
POST /eval   arm requestAnimationFrame → stays 0 while minimized
POST /focus  {"window":"main"}  → ok:true, focused:true, visible:true
GET  /health                    → focused:true, minimized:false
POST /eval   read the flag      → 1, and newly armed frames fire too
```

Rank 22's reveal effect is byte-identical to rank 21's live-proven one
(`StudyOrchestratorWorkspace.tsx:275-303`) and its scroll target was already
proven, so only the fixture-dependent panel pass is still owed.

Before and after any such pass, audit **both** `study-orchestrator-v2.json` and
`media.json` with the app down. This slice proved the app writes fixture
subtitle records into `media.json` and bumps `lastPlayedAt` even from a handoff
that never navigated. Two audit-first removers are committed here as the
pattern to reuse:

```text
node src/.coordination/study-mode/remove-rank22-fixture.cjs
node src/.coordination/study-mode/remove-rank22-media-fixture.cjs
```

## Next 2 — Rank 23's live proof

Implemented and deterministically verified; the live half is owed. It needs
`SEANIME_SIDECAR=1` (otherwise `MediaWorkspaceHost` renders null and the overlay
never mounts), a subtitle track genuinely drifting at 100 ms/min or worse, and
four explicit ±0.1s corrections spread over at least two minutes of playback.
Prove both directions — drift raises the cue, converging on a constant offset
does not — then `Follow the drift`, watch the offset advance on its own, and
`Stop following` back to the exact anchor value. Expect the Windows firewall
dialog rank 7 hit. Audit `media.json` as well as the Study document afterwards.

## Next 3 — Rank 22's panel reveal, only if the fixture earns it

Everything else about rank 22 is proven. What remains needs the two-episode
fixture in the user's live data, which is the exact class of data that leaked
into `media.json` twice. Both audit-first removers are committed here if you
decide to do it.

Read runtime JSON and verify hashes from **PowerShell** — the Bash tool serves a
stale overlay and gave rank 19 a wrong picture of the library. If the `jp-app`
MCP server is missing (it only loads when cwd is `jp-study-app`), drive
`debug/bridge.json` directly instead. **Never** fall back to desktop remote
control for this app; the user has corrected that twice.

## Running the app for QA — the checklist this session learned

1. Back up **every** file in `%APPDATA%\jp-study-app`, not only the three
   documented data files. This session lost the pre-session `desktop-layout.json`
   that way.
2. `npm start` from the project root; the bridge writes `debug/bridge.json`
   (port + bearer token) within about a minute.
3. The Study surface lives in the Media Center window, reachable through
   `os:open` → `video`/`library` and then the `Study Mode` nav entry. Beware: the
   user's saved desktop can hold a **minimized** Media window, and
   `element.click()` happily drives a `display:none` window — every rect comes
   back `0,0,0,0`. Check `getComputedStyle(section.fwin).display` before
   measuring anything, and restore the window from the taskbar first.
4. Close the app through `/eval window.close()`. It then shuts down via
   `stopDebugBridge` and removes `debug/bridge.json`, which is the clean signal
   that no app is running.
5. Only then hash `userData` from PowerShell, audit the diff before overwriting
   anything, and restore from the verified backups.

## Optional hardware smoke

With explicit user permission, press `Record response`, verify the operating
system microphone prompt and denial/retry behavior, and remove any captured
test audio. This is not required for the replay recommendation itself.

## Validation

Keep changes under `src/`, preserve the dirty worktree, and rerun:

```text
npx vitest run --reporter=dot
npx vite build --config vite.renderer.config.ts
npx vite build --config vite.main.config.ts --ssr src/main.ts
npx vite build --config vite.preload.config.ts --ssr src/preload.ts
```
