# Current state

Last updated: 2026-07-30T01:05:00+03:00

Active phase: Rank 24 implemented and fully live-verified on authentic data with
no fixture. `/focus` proven on its first call, which also closes rank 22's
`requestAnimationFrame` premise.

Active task: SM-031 — rank 24, portable Study recipe

Active branch: `grammarx/phase-1-5`

Verified base commit: `9ee04eef147527b5c784652fda4df91909461d99`

## What works now

- Study orchestration, readiness, preparation, filtering, selection, export
  history, and opportunities remain backed by the versioned main-process store.
- Subtitle mining is a first-class profile-rule source. It is distinct from
  audio in the shared contract, Settings UI, simulator, extension input,
  Video Core routing, and Study export.
- Profile rules use schema version 2. Version 1 audio rules migrate to
  audio-plus-subtitle behavior so existing users keep the behavior they had,
  while newly authored rules can target subtitles independently.
- Profile-rule migration is normalized and persisted atomically. A live app
  restart rewrote the real rules document to schema version 2.
- Anki preview and write paths use one shared route resolver. The UI reports
  the exact profile, rule, deck, model, and whether a default was used.
- Prebuilt cards, field-template cards, and automatic cards all use the shared
  Anki media attachment fallback.
- Large Anki collections no longer force a full collection rescan after each
  add or delete. The interval snapshot is updated optimistically, making
  immediate duplicate checks responsive.
- Partial Anki export retains successful note IDs and retry targets only failed
  entries. Undo deletes the exact successful IDs, updates the duplicate
  snapshot, resets the stage, and marks the matching actions undone.
- A live six-card recovery run produced one carried item, three duplicates, and
  two failures; after restoring the model, retry created only those two failed
  notes. Undo then removed exactly the three notes created by the proof.
- Replay-to-shadowing is implemented in the adopted G-PLAY player. Three
  explicit replay-button clicks on one cue within ten minutes show a small
  recommendation that starts the existing shadowing flow without requesting
  microphone permission.
- Automatic looping cannot increment replay evidence. Cue changes, expiry, and
  dismissal reset or suppress the bounded suggestion state.
- Prepared-but-unwatched reuses the durable readiness generation time and the
  media library's real `lastPlayedAt` value. It adds no playback tracker or
  synthetic history.
- A prepared workspace becomes eligible after a 24-hour grace period only when
  no later playback exists. A real playback after preparation removes the
  active signal through the existing authoritative stale-retirement path.
- The existing resume strip prioritizes unfinished sessions, then offers the
  prepared title with a `Watch now` action and preserved playback position.
- The existing bounded Anki interval snapshot now carries one optional
  `lastIntervalChangeAt` value per expression. It advances only when a poll
  observes a real interval change and is not a parallel review log.
- Recent non-zero interval changes remain eligible for seven days. One
  expression index is built per snapshot, then prepared workspace candidates
  use direct lookups instead of rescanning subtitles or multiplying work by
  media count.
- A matching card produces one bounded per-title opportunity with its exact
  prepared sentence, subtitle record, and cue timestamp.
- Comprehension overload rescue reuses the adopted player's real lookup,
  backward-seek, pause, and cue events. It creates no playback document or
  persistent behavior history.
- Evidence is capped to one two-minute window within a five-cue neighborhood.
  Two lookups, two explicit rewinds, and a pause are required. Automatic line
  and A-B loops are marked as programmatic and cannot increment rewind density.
- The rescue is rendered only while playback is already paused. Its explicit
  action reuses the existing A-B controls to loop the previous, current, and
  next subtitle cues; dismissal lasts for the active bounded scene window.
- The Study surface now renders a series episode-readiness rail from the
  existing versioned readiness snapshots. It does not open media or analyze
  subtitles merely to manufacture comparison scores.
- A score is trusted only when the analyzer version, exact Japanese subtitle
  record/source fingerprint, knowledge fingerprint, level-list fingerprint,
  frequency-list fingerprint, workspace context, series identity, and normal
  episode identity all still match.
- Missing subtitles, unanalyzed episodes, and stale analyses remain visibly
  distinct. Their actions reuse the existing preparation/transcription path;
  no readiness cache or queue was added.
- Ready-card selection reuses the exact Study context handoff with the real
  media ID, episode, Japanese subtitle record, and saved position.
- Subtitle-track upgrade compares only attached local Japanese subtitle records
  that map exactly to rated tracks in the existing authoritative catalogue.
- A recommendation requires a newer candidate, at least two explicitly rated
  quality dimensions on both tracks, and a score improvement of at least ten
  points. Catalogue-only, weakly rated, older, and cross-series candidates are
  rejected.
- Acceptance prepares the exact recommended subtitle record and refreshes the
  existing Study document/workspace. It neither changes the playback subtitle
  silently nor creates a second readiness cache or subtitle catalogue.
- Subtitle-catalogue changes invalidate the renderer projection through one
  bounded change event; the main-process readiness source remains authoritative.
- Cross-title reinforcement projects only selected candidates from the newest
  exact-subtitle workspace for each media item and requires current analyzer,
  vocabulary, level-list, and frequency-list fingerprints.
- One normalized lemma/reading must span at least three canonical titles.
  Episodes under one series collapse to one title, and ungrouped episodic
  filenames are rejected rather than counted as separate works.
- The comparison session shows up to four exact Japanese contexts with
  title/episode provenance, recurrence and frequency evidence, and direct cue
  actions. No subtitle rescan or persistent occurrence index was added.
- Abandoned-set resizing reads the existing bounded media-study sessions only.
  Two deliberate, recent vocabulary sessions must end without review or cards
  after surfacing at least the current set size.
- The preview activates only above 20 selected words, explains retained and
  deferred candidates, preserves all existing filters, and changes only
  `maximumCards` through the existing reversible filter history.
- Applying is always explicit. The panel exposes immediate undo and no
  candidate, session, workspace, or filter source of truth was duplicated.
- Stale queue cleanup audits the persisted Study document against the current
  library, the exact attached Japanese subtitle records, and finished vocabulary
  work. It adds no cleanup ledger and reads no new source of truth.
- An item retires only when its media left the library, its exact Japanese
  subtitle record is no longer attached, or every selected word in its workspace
  is already exported or known at level 2 or above. Analysis fingerprints are
  deliberately not consulted: a stale analysis means refresh, not retire.
- Reminders whose value survives finished vocabulary work — watching a prepared
  title, hearing a learned card in context, repairing a source — are excluded
  from the resolved-debt rule. An empty library is treated as unloaded, never as
  proof that media was removed, and the cleanup never audits itself.
- Retiring reuses the existing opportunity status operation only. Each item is
  previewed with its own reason and evidence first, and the panel exposes an
  immediate undo that restores the previous active or snoozed status.
- The existing renderer sync now also retires missing active `scene-quick-session`
  and `stale-queue-cleanup` entries, so a spent cleanup disappears on its own.
- Renderer-generated opportunities, stored Japanese-track preparation,
  frequency ranking, JLPT filters, repeated lookups, exact cue handoff, and
  restart persistence from the earlier slice remain intact.
- The Study surface no longer depends on the legacy player. `StudyMediaSurface`
  in `shared/studyMediaSurface.ts` names the five members Study actually needs —
  the media library, the loaded item, a live position reader, and one add-media
  action — and `StudyOrchestratorWorkspace` consumes that instead of the 100+
  member `MediaState` it used to receive whole.
- `legacyStudyMediaSurface.ts` is the single adapter that knows both shapes.
  `MediaCenterView` still builds it from the legacy player, so no player
  behavior changed; the adopted VideoCore can satisfy the same contract through
  `vc_videoElement` without Study knowing which player produced the values.
- The live-versus-stored position rule and the two-second write threshold are
  now exported and tested rather than inlined in the return-target poll.
- Rank 16 compares only favorited media with fingerprint-current cached
  readiness. A `save-for-later` favorite may point to the easiest current
  favorite already in `short-preview` or `ready-now`; stale and unanalyzed
  favorites cannot participate on either side.
- The recommendation opens the easier favorite with its exact media, episode,
  Japanese subtitle record, and saved position. It runs no analysis and stores
  no second favorite/readiness index.
- Grammar weakness scenes reuse completed Grammar session history and the
  current prepared-workspace candidates. A point must be missed in two distinct
  sessions among the ten most recent sessions in 30 days.
- Matching is intentionally conservative: only Japanese grammar points with a
  literal surface of at least two characters can activate, and evidence must
  come from the newest fingerprint-current workspace for the exact attached
  Japanese subtitle record. No subtitle rescan or occurrence index was added.
- The bounded preview shows the pattern, meaning, failed-session count, and up
  to four exact title/episode/cue contexts. Scene actions reuse the existing
  exact Study handoff; `Practice this pattern` opens Grammar Practice with the
  Japanese, level, and exact-pattern filters already applied.

- Listening-first practice combines fingerprint-current cached readiness with
  one transient capability signal from the exact mounted media element. It
  accepts a browser audio track, a captured audio track, or Chromium's positive
  decoded-audio byte counter; file extension and container metadata are never
  treated as audio proof.
- Eligibility requires current analyzer, vocabulary, level-list, and
  frequency-list fingerprints; the exact attached Japanese subtitle record and
  matching workspace; a complete `ready-now` analysis; and at least 85% known
  occurrence coverage.
- The explicit action opens the exact saved media/subtitle context and enables
  the existing dictation controls with primary subtitles available for reveal.
  It requests no microphone access and adds no audio-quality score, readiness
  cache, playback document, or subtitle source of truth.

- Proper-name review projects a temporary "who is who" set from the proper-noun
  candidates the current prepared workspace already stored. The only
  classification used is the analyzer's own 固有名詞 tag, which every candidate
  already carries; no speaker identity is consulted, because subtitle and Study
  provenance still has none.
- Eligibility requires the same fingerprint-current, exact-subtitle workspace
  gate as ranks 14, 17, and 18, plus a real cluster: at least three distinct
  names, each appearing three or more times, each still unknown at level 0–1,
  each with a real cue sentence and timestamp. Internal duplicates are skipped
  and remaining copies collapse by normalized word/reading.
- The set is temporary in the literal sense: it exists only in the panel that
  renders it. Nothing is persisted, added to the selection, or exported, and the
  displayed set is capped at eight while the reported totals stay honest.
- The only workspace write is the deck-pollution case. When the workspace has
  `excludeProperNouns` switched off and names are genuinely inside the card
  selection, the panel offers one explicit action that flips that existing
  filter through the existing reversible filter history, with the existing undo.
  When names are already excluded — the default — the panel is read-only and
  says so.
- `properNameReviewStillCurrent` refuses that action if the stored workspace's
  candidates, selection, or proper-noun filter moved after the preview, so a
  refreshed analysis can never be filtered against a stale name list.
- Speech-rate capture runs inside the preparation pass that already holds parsed
  cues. It stores only summed credible cue time, contributing cue count, and raw
  Japanese-character count alongside the existing analyzer word-occurrence
  total; it never re-reads a subtitle or stores a difficulty score.
- The comparison derives words per second at render time. One median value per
  canonical title prevents a long series from outvoting the rest of the
  library, and at least three measured titles plus 40 contributing cues are
  required before "faster than usual" has meaning.
- The user's existing player `playbackRate` is the stated preference. A title is
  offered only when its effective pace at that rate is still at least 15% above
  the personal median. An already-slower preference can therefore resolve the
  signal without another setting or dismissal.
- The panel changes no state until `Use …×` is clicked. That explicit action
  writes through the existing player setter; Restore returns the exact previous
  value, and closing an applied preview restores automatically so the panel
  cannot strand a hidden preference change.
- `StudyMediaSurface` now carries the player-agnostic playback preference and
  setter as well as its existing library, position, audio-capability, and
  add-media members. Study still does not import or name the legacy player.
- The bounded Anki interval snapshot now carries two optional current-state
  flags per expression: Anki's own `leech` note tag and the scheduler's
  suspended queue state. They are captured from the existing notes/cards poll,
  included in its data fingerprint, and clear on the next poll when Anki clears
  them.
- Duplicate expressions keep the strongest interval while unioning current
  problem flags, so a sibling note or card cannot hide the signal. No review
  timestamp, review log, or second Anki store was introduced.
- One flagged-expression index is built per snapshot. Rank 21 reads only the
  newest fingerprint-current workspace for the exact attached Japanese
  subtitle record, then opens the candidate's already stored sentence and cue;
  it never reads a subtitle file again.
- The Fluent deep-red preview is strictly read-only. It reports current leech
  and suspension state, exact prepared context, occurrences and interval, but
  exposes no reset, unsuspend, edit, or other Anki mutation.

- Series recurrence projects the anchor episode's *selected* lemmas against
  later prepared normal episodes of the same canonical series. Both sides come
  from the newest fingerprint-current workspace for the exact attached Japanese
  subtitle record; no subtitle file is reopened and no forecast score is stored.
- Only normal episodes participate. `episodeKind` other than `episode`, missing
  or non-positive episode numbers, and titles without a canonical series
  identity are all excluded, so specials, OVAs and creditless openings/endings
  can never be counted as a later episode.
- Multiple encodes of one episode collapse to a single episode identity by
  `series + season + episode`, preferring the most recently prepared workspace,
  so a re-release cannot inflate the future count.
- The anchor side requires membership in the user's current selection; proper
  nouns and candidates without a real cue sentence and finite timestamp are
  rejected on both sides. Future episodes contribute evidence regardless of
  their own card filters, because recurrence is a property of the subtitles,
  not of that episode's mining settings.
- Lemmas are keyed by the existing normalized duplicate key, ranked by future
  episode breadth, then future occurrences, then frequency rank, then current
  occurrences. The panel shows at most 8 lemmas and 3 future contexts each while
  the reported totals stay honest.
- The preview is read-only. It writes nothing, selects nothing, exports nothing,
  and its only actions are the existing exact-cue handoff for the current scene
  and for each future scene.

- Subtitle timing repair reads only *explicit* ±0.1s activations in the adopted
  player. The drift tracker's own writes deliberately bypass that handler, so a
  correction the app applied can never re-enter as fresh evidence — the same
  rule that keeps automatic loops out of ranks 2 and 7.
- One bounded signal per subtitle track holds at most 16 samples inside a
  fifteen-minute window. Each sample is one playback position and the delay it
  produced. Nothing is persisted, and switching tracks discards it.
- The cue fires only on *progressive drift*: at least four corrections, all in
  one direction, at strictly advancing playback positions, spanning at least
  120 seconds, implying at least 100 ms of delay per minute, with every
  correction within 0.15s of the measured line.
- Converging on a constant offset is deliberately not a signal. The user has
  already solved that by hand and the app has nothing better to offer; only
  drift — the fault a fixed offset cannot hold — earns an interruption.
- The single action follows the measured rate forward from the user's newest
  manual correction, writing through the player's existing `setSubtitleDelay`.
  No subtitle file is read or re-timed, no timing store, correction score, or
  second offset source of truth was added.
- Tracking is reversible and cannot strand a hidden change: `Stop following`
  restores the exact manual value it was anchored on, a later manual correction
  re-anchors the line, and a correction that contradicts the measurement stops
  the tracker instead of applying a rate the evidence no longer supports.
- Projections are clamped to the manual control's own ±10s range, so the tracker
  can never leave the player somewhere the user could not have reached by hand.

- A portable Study recipe is this workspace's nine vocabulary filter fields as
  text, and nothing else: no media id, no workspace id, no candidate, no
  selection, no timestamp. `shared/studyFilterRecipe.ts` owns it.
- Serialization walks a fixed field list and sorts the excluded JLPT levels, so
  two workspaces that reached the same filters by different routes export
  byte-identical text, and a short display code identifies a recipe at a glance.
- There is **no recipe store**. Export produces text for the clipboard, import
  consumes text from a textarea, and applying goes through the one existing
  `study:applyFilters` operation — so a pasted recipe lands as a single entry in
  the workspace's own filter history and the existing `Undo filter` reverses it.
- A trimmed or partly damaged recipe is completed from the app's own defaults,
  never from the workspace it is pasted into. Filling gaps from the target would
  make the same text mean different things in different places, which is exactly
  what a portable recipe must not do; the preview shows every resulting field, so
  a default that arrived this way is visible before it is applied.
- Every rejection is a distinct localized reason: empty, oversized, unreadable
  JSON, valid JSON that is not an object, not exported as a Study recipe, a
  version this build cannot honour, and no readable filter. Unknown fields,
  unreadable values and omitted fields are counted and reported rather than
  silently absorbed, and hostile numbers clamp through the existing
  `normalizeStudyFilters`.
- The preview is derived, not remembered: it is recomputed from the live
  workspace on every keystroke, which is why it needs no staleness guard. It
  reports the field diff, the selection delta, and a bounded six-word sample of
  what enters and leaves while the counts stay honest.
- Applying a recipe normalizes the stored `excludedJlptLevels` order (`['N5','N4']`
  becomes `['N4','N5']`). Selection is a set-membership test, so nothing changes
  but the stored order, and `Undo filter` restores the original order exactly.

- The debug bridge now has a `/focus` route. It restores, shows, raises and
  focuses one window through Electron's own API, with `app.focus({ steal: true })`
  because Windows will not otherwise hand foreground to a background process.
  It synthesizes no mouse or keyboard input and, like the rest of the bridge,
  never starts in a packaged build. This exists to remove the exact harness
  limitation that blocked rank 22: Chromium does not run `requestAnimationFrame`
  in a non-foreground window, so a reveal effect cannot be exercised from an
  unfocused one.

## Live verification

- Settings displayed `Subtitles` separately from `Audio`.
- The persisted profile-rules document was upgraded to schema version 2.
- The active subtitle mining rule resolved to:
  - profile: `Japanese Immersion`
  - rule: `New rule`
  - deck: `JP Study::Immersion`
  - model: `JP Study App::JA Immersion`
- Preview and actual note creation reported that same destination.
- The partial-failure, selective-retry, and exact-undo journey passed against
  live AnkiConnect. All proof notes were removed afterward.
- On a real G-PLAY cue, replay clicks one and two showed no suggestion; click
  three showed the shadowing recommendation. `Start shadowing` enabled the
  existing shadowing panel with recording still idle and no renderer errors.
- Authentic user data contained one eligible title: `The Big O - 01` had been
  prepared for about 30.5 hours and its last playback predated preparation.
  The live resume strip displayed `Watch your prepared The Big O - 01`, the
  no-later-playback evidence, and `Watch now`.
- The prepared reminder persisted as an active authoritative opportunity.
  Playback was intentionally not started, and renderer error logs remained
  zero.
- The real Anki snapshot contained 87,257 entries and no interval-change
  evidence because this field is new and no later interval change had been
  observed. No synthetic review event was added; the new context opportunity
  will activate only after a genuine poll delta.
- The microphone button was not pressed, so no hardware permission was
  requested.
- A live rank-7 attempt reached the adopted Video workspace with zero renderer
  errors, but Windows raised a firewall permission dialog for FACET before
  media could load. The dialog was left untouched and the test app was stopped;
  live activation is not claimed.
- Authentic `The Big O` data produced a 26-episode rail. Episode 1 showed its
  trusted cached 0% score and N1 recommendation; episodes 2–26 were correctly
  labeled `Japanese subtitles missing` with `Prepare subtitles`.
- The rail remained within the Study panel with internal horizontal scrolling:
  document width stayed bounded while the 26-card strip retained its full
  scrollable width.
- Selecting episode 1 emitted the exact media ID
  `7b984295-2d7a-4818-b17c-c89f850f7483`, subtitle record
  `c377bed4-301e-45dd-9848-000a981c1802`, episode 1, and saved position
  53.267 seconds. The Video surface opened `The Big O - 01` with zero renderer
  errors.
- The normal player autoplay was paused immediately after this smoke. The app
  was stopped and the original `lastPlayedAt` and `positionSec` were restored
  exactly, so the proof left no playback-state mutation.
- The authentic subtitle catalogue currently contains zero providers and zero
  rated tracks. The rank-9 live smoke therefore correctly rendered no upgrade
  card; no synthetic catalogue data or recommendation was introduced.
- The Study surface, episode rail, and bounded document width remained healthy
  during that negative-guard smoke, with zero renderer errors.
- Authentic data has one prepared title, so cross-title reinforcement honestly
  remains hidden. A temporary, clearly labeled three-title fixture exercised
  the positive UI through the app MCP bridge.
- Pixel review found and fixed clipped right-side evidence in a partially
  off-screen draggable window. The final card rail kept all three contexts and
  controls visible while the document remained 1,264 pixels wide.
- The exact-context action opened `The Big O - 01`; a controlled repeat of the
  same bridge handoff landed at exactly 42.000 seconds and was paused. Renderer
  error logs remained empty.
- The app was stopped and `media.json` plus
  `study-orchestrator-v2.json` were restored to their original SHA-256 hashes.
- Authentic local media-study history was empty, so rank 11 correctly stayed
  hidden. Two temporary bounded session records exercised the positive path.
- Visual review found the first far-right close/apply controls unreachable in
  the user's partially off-screen window. The final layout keeps actions in the
  left flow and caps preview columns.
- Applying the live preview changed the real workspace from 30/370 to 18/370
  selected. `Undo this resize` restored 30/370, evidence removal retired the
  opportunity, and renderer error logs remained empty.
- The original null local-history value and Study document SHA-256 were
  restored after the app stopped.
- Rank 12 is evidence-based deferred: missing local asset roles are visible,
  but no authoritative managed VideoCore write/update path exists for an
  in-place repair. The shared Anki resolver only attaches supplied bytes while
  creating a note.
- Rank 13 is signal-ineligible because prepared subtitle and candidate records
  carry no speaker identity.
- Rank 14 projects short scenes from current exact-subtitle selected candidates
  only. The gate is five useful unknowns, three recurring unknowns, ten total
  occurrences, and a 30–180 second cluster.
- Authentic `The Big O - 01` produced a 0:48–3:59 preview with seven recurring
  selected unknowns. Visual QA moved the initially clipped range into the left
  flow.
- Launch set the existing player to A=48.00s/B=239.00s. A live end-boundary
  check looped to 49.71s and the renderer error log remained empty.
- The app was stopped and both runtime JSON files were restored to their exact
  original hashes; no synthetic scene evidence was needed.
- Proof preferences, export state, test notes, and temporary filters were
  restored after verification.
- The authentic library no longer contains the media the existing Study
  workspace was prepared from, so the pre-existing sync retired the real
  `prepared-unwatched` entry on boot and the honest cleanup list was empty of
  genuine items. Three clearly labelled `TEMP FIXTURE` opportunities and one
  temporary workspace exercised the positive path.
- The live panel showed one item per reason: already finished (3 exported),
  media removed, and subtitle removed. Its actions stayed in the left reading
  flow — apply at x=460 and close at x=650 inside a 1,264-pixel document with no
  horizontal overflow — so the clipping seen in ranks 10, 11, and 14 cannot
  recur here.
- Retiring moved all three to `dismissed` and emptied the stream; the in-panel
  undo returned all three to `active` and restored the cleanup card. Across both
  directions the two workspaces (370/30 and 3/3 with three exports), three
  readiness snapshots, and fifteen action records were unchanged, and the
  renderer error log stayed empty.
- The app was stopped and `study-orchestrator-v2.json` was restored to its exact
  original SHA-256 hash (`4F16DAEB…1A26`), verified on the real filesystem.
- The temporary subtitle record never reached the on-disk `media.json`: the test
  app ran inside a tooling filesystem overlay, so that write stayed in the
  overlay. The real `media.json` was never modified — its timestamp still
  predates this slice. Verify runtime restoration with a non-sandboxed shell;
  a sandboxed one can report a shadow copy as restored.
- Authentic state had no completed Grammar history, so rank 17 honestly stayed
  hidden. Running the projection against the real prepared workspace found
  exact longer-surface candidates and also exposed unsafe one-kanji substring
  matches; those short surfaces are now rejected.
- Two temporary completed-session records for N4 `ではない` produced the
  recommendation `ではない in 2 prepared scenes` from authentic `The Big O -
  01` cues at 3:33 and 10:16. Both literal surfaces were highlighted.
- Electron MCP visual QA found controls clipped by the user's partially
  off-screen parent window. The final left-flow layout keeps both scene cards
  and `Practice this pattern` visible in the 1,264-pixel document.
- Clicking the real Practice action opened Grammar in Practice mode with
  Japanese, N4, and exact query `ではない`; three truthful matching points were
  visible and renderer error logs remained empty.
- The temporary Grammar history, telemetry choice, practice filters, and proof
  windows were removed. After stopping the exact dev process tree,
  `media.json` and `study-orchestrator-v2.json` matched their original SHA-256
  hashes (`A834EA90…4AF7` and `4F16DAEB…1A26`).
- Rank 18 was verified using only the dedicated Electron app MCP server.
  Authentic `The Big O - 01` playback reached ready state 4 and Chromium
  reported 1,204,401 decoded audio bytes. The `playfile://` capture stream is
  cross-origin blocked, so the implementation uses the positive decoded byte
  counter as direct fallback evidence instead of guessing from the MKV.
- The exact cached readiness remains 0% and `save-for-later`, so Study Mode
  correctly rendered no listening-first card or label despite proven audio.
  The current 0% readiness rail and existing opportunities remained intact,
  and renderer error logs stayed empty.
- No synthetic coverage, audio score, or microphone request was introduced.
  Telemetry consent was returned to unset, the dev process tree was stopped,
  and both runtime JSON files were restored to the same original hashes.
### Rank 19 — full live proof on authentic data

**Read this first: the Bash tool in that session served a stale overlay copy of
`media.json`.** An audit run through it reported 1,586 library items, zero
attached Japanese subtitle records, and an orphaned workspace. All three were
measurement artifacts. PowerShell — outside the overlay — showed the truth: 30
items, the documented `A834EA90…4AF7` hash, and `The Big O - 01` present with its
exact Japanese record. **Always re-read runtime JSON from a non-sandboxed shell
before drawing any conclusion from it.**

- The `jp-app` MCP server is declared in the project's `.mcp.json`, so it only
  loads when the session's cwd is the project root. This session started one
  directory up and never received it. The proof was driven against the *same*
  HTTP debug bridge that server proxies (`debug/bridge.json` → `127.0.0.1:<port>`
  with a bearer token), so the app-side surface is identical. No
  computer-control tool was used.
- Rank 19 activates on genuine authentic data with **no fixture at all**. The
  Study stream rendered `5 recurring names in The Big O - 01 · 5 recurring
  proper names · 3 min`, and the panel opened with the real five: ドロシー ×17,
  ロジャー ×7, ノーマン ×6, アンドロイド ×5, スミス ×4 — 39 appearances,
  Episode 1, all at knowledge level 0.
- The ≥3-occurrence gate is doing real work on real data. It correctly rejects
  the analyzer's junk proper-noun tags in the same workspace: `ぐ`, `ー`, `フフフ`,
  and the mis-split `ボン`/`クラ` (from ボンクラ) all fall below it.
- Visual QA found two genuine defects, both now fixed and re-verified live:
  redundant furigana (ドロシー rendered with ドロシー above it, because katakana
  names read like themselves) and useless context quotes (ドロシー's only cue is
  the word `ドロシー`). `properNameFurigana` and `properNameContextLine` withhold
  both; cards without a real line show one muted note instead.
- The deck-pollution branch was proved end-to-end through the real UI. With the
  proper-noun filter off *and* the card cap raised so names actually reach the
  selection, the panel reported `5 of them are currently selected as cards` and
  offered `Keep names out of cards`. Clicking it moved the selection 268 → 251
  (all 17 proper-tagged candidates, not just the 5 reviewed — correct filter
  semantics), and `Undo this filter change` restored 268 exactly.
- That test also confirmed the applied-flag guard matters: after applying, the
  live review recomputes `selectedNames` to 0, so a footer driven by the count
  alone would have hidden its own undo.
- `excludeProperNouns: false` alone does **not** imply deck pollution. With the
  user's real filters (`maximumCards: 30`, N5/N4 excluded, frequency-unrated
  ranking) the unranked names still fall outside the top 30. Measuring real
  selection membership rather than the filter flag is what makes the notice
  truthful.
- Everything was restored. Two setup filter changes were unwound through the
  same reversible history back to the exact baseline (30 selected, 3 history
  entries, byte-identical filter object). Telemetry consent — created by this
  session, previously unset — was removed, returning localStorage to its
  original 27 keys. Renderer error logs stayed empty throughout.
- After stopping the dev process tree, `study-orchestrator-v2.json` and
  `media.json` were restored from hash-verified backups and confirmed at
  `4F16DAEB…1A26` and `A834EA90…4AF7` **from PowerShell**, not from the
  sandboxed shell.
- アンドロイド remains the classification's honest edge: a common noun the
  analyzer tagged 固有名詞. It costs nothing in a read-only review set and is
  inherited from the existing `excludeProperNouns` filter, not introduced here.
- Authentic data correctly produced no speech-rate recommendation: only
  `The Big O - 01` has a measured attached Japanese track, below the
  three-canonical-title baseline gate.
- A clearly labelled temporary three-title fixture exercised the positive UI.
  The real Study stream showed `Fast dialogue in The Big O - 01`, 3.20
  words/second at the existing 1× preference versus a 2.00 median, and suggested
  0.6×.
- Pixel and geometry review found the first preview remained mostly below the
  viewport after a stream click. The panel now scrolls itself fully into view:
  top 327px, bottom 698px inside the 821px window, with document width bounded
  at 1,264px and no internal overflow.
- Through the actual Electron bridge controls, Apply changed the existing player
  preference 1× → 0.6× and the resolved opportunity retired from the stream.
  Restore changed 0.6× → 1× and the signal returned. Applying again and closing
  used the guarded close path to restore 1× automatically. Renderer errors
  remained zero.
- The app was stopped, telemetry consent returned to unset/27 localStorage keys,
  and both runtime documents were restored byte-for-byte from PowerShell:
  `media.json` `A834EA90…4AF7`, Study document `4F16DAEB…1A26`.
- Authentic AnkiConnect reported one leech-tagged note (`厳粛`, 114-day
  interval) and zero suspended cards. The production full-collection poll
  returned 87,257 entries with exactly that one `leech: true` flag.
- Authentic Study data correctly showed no rank-21 recommendation because its
  one prepared workspace contains no `厳粛` candidate. No review evidence or
  Anki state was fabricated.
- A clearly labelled runtime-only candidate fixture exercised the positive
  preview against the real Anki flag. The stream showed `Anki trouble spot in
  The Big O - 01`, one exact match, one leech tag, and no suspended state.
- Visual QA found the initial panel fully below the viewport. The reveal now
  scrolls it to top 434px/bottom 821px in the 821px viewport; its first card,
  close control, 0:42 action, and provenance are visible while document width
  remains bounded at 1,264px.
- The actual bridge click opened `The Big O - 01` from the fixture's 0:42 cue
  and playback advanced from that seek normally. It was paused, renderer error
  logs stayed empty, and no Anki mutation endpoint exists in the panel.
- The app and dev servers were stopped. The fixture, telemetry consent and QA
  logs were removed. PowerShell restored all three runtime files to their exact
  baseline hashes: Anki snapshot `D1056B3E…CBB51`, Study document
  `4F16DAEB…1A26`, and media `A834EA90…4AF7`.

### Rank 22 — live proof, and a corrected restoration

**Correction to the previous handoff.** That session reported the runtime files
"restored to baseline hashes". They were not. Its dev app was never stopped, so
the in-memory document was written straight back over any restore, and the QA
fixture was still sitting in the user's live data hours later. **Never read a
runtime hash while the app is running** — stop the process tree first, then hash
from PowerShell. The restoration has now actually been done and verified.

- The fixture removed from the Study document: `qa-series-recurrence-readiness-e2`,
  `qa-series-recurrence-workspace-e2` (a 370-candidate clone of episode 1 stamped
  `検証用の次話:`), and three derived opportunities. What remains is authentic:
  1 workspace, 3 readiness entries, and 3 opportunities all for episode 1.
  482,798 → 245,037 bytes, SHA-256 `FC9E50B9…4490`, zero fixture residue.
- `media.json` had been mutated too, which the earlier session did not notice.
  The app persisted the fixture Japanese subtitle record onto `The Big O - 02`,
  and the panel's exact-scene action bumped `The Big O - 01`'s `lastPlayedAt`
  from 1785142935339 to 1785347373398. Both were undone; `positionSec` never
  moved from 53.267 because the cue is 53.267. 30 items, zero residue,
  SHA-256 `DC2C4E37…1F52`.
- Metadata the app enriched while running was deliberately left alone: there is
  no baseline that would justify reverting it, and it is not fixture data.
- The Anki snapshot carries no fixture residue and was left as its live poll
  wrote it, because that data is authentic. Restoring it to an older hash would
  have discarded a genuine poll.
- Both removers are committed next to this document and are audit-first: they
  confirm the app's exact writer format by round-trip and refuse to write if any
  fixture string would survive.
- The dev app was shared: another track had been editing
  `src/renderer/components/reading-garden` against this same instance, with HMR
  updates from 18:42 to 20:27 and a source edit at 20:40. That work owns the one
  logged renderer error (`Uncaught SyntaxError: Unexpected token ';'`, 20:27),
  which predates this QA. The app exited on its own before cleanup, so nothing
  had to be killed.
- The panel itself was verified live through the debug bridge on the fixture.
  It rendered `The Big O after episode 1`, 30 words return / 1 later episode /
  109 future uses, and 8 lemma cards each carrying the anchor cue, the future
  cue, and both exact-scene actions. Fixture rows are visibly labelled, so the
  synthetic evidence is never mistaken for real recurrence.
- Geometry is sound: with the panel revealed the document stayed at 1,920 px
  with no horizontal overflow, the panel had no internal overflow, and it seats
  at 399–934 inside the 98–934 content region — fully visible.
- **The automatic reveal could not be exercised.** The Electron window reports
  `focused: false` and the bridge has no focus endpoint, so the effect's
  `requestAnimationFrame` never fires and the panel opens below the fold and
  stays there for 100 s. Calling `scrollIntoView` directly moves it to exactly
  the seated position above, which proves the scroll target is right but does
  **not** prove the on-click reveal. That still needs one focused-window pass.
- The exact-scene action did not navigate. This is the already-filed
  `openContext` defect, reproduced rather than newly introduced: this session
  had **two** Media Center windows open, which is precisely the documented cause
  (`takeHandoff` burning the pending context in whichever instance mounts
  first), and `jp-pending-study-context-ref` was null afterwards. The rank-22
  handler uses the same `openContext` payload shape rank 21 proved live. Not
  patched here — it belongs to the legacy player's owner.
- Two stacked Media Center windows also make pixel clicks unreliable: the
  smaller window is z-above the larger, so `elementFromPoint` must be checked
  before every click, and some controls of the lower window are unreachable.
- Zero renderer errors were produced by this QA.

### Rank 23 — no live proof, and why

- **Nothing was proven live, and nothing is claimed.** The app that was running
  this session answered `/eval` with `SEANIME_SIDECAR` **unset**, so
  `MediaWorkspaceHost` renders `null` and `VideoCoreStudyOverlay` — where this
  cue lives, next to ranks 2 and 7 — is not mounted at all. This is the same
  flag that blocks the library/video/music route swap.
- A positive proof needs more than the flag. It needs a subtitle track that
  genuinely drifts at 100 ms/min or worse, plus four manual corrections spread
  across two minutes of real playback. The user's authentic media is not known
  to contain such a track, so a positive run would need a *fabricated drifting
  subtitle fixture* — precisely the class of fixture that leaked into
  `media.json` in the previous two sessions. It was not attempted unattended.
- The rank-7 precedent is the same shape: it reached the adopted Video
  workspace, hit an untouched Windows firewall dialog, and live activation was
  never claimed.
- **Nothing this session wrote to a runtime file.** The dev app exited on its
  own while validation was running. With Electron down, PowerShell confirms
  `media.json` at `DC2C4E37…1F52` and `study-orchestrator-v2.json` at
  `FC9E50B9…4490` — the exact baselines the rank-22 cleanup established, still
  stamped 21:01 and 20:59, both before this session began. No fixture was
  created, so none had to be removed.
- `anki-intervals.json` *was* rewritten, at 21:23:55, by the running app's own
  bounded poll. Nothing here touched Anki, and that data is authentic, so it was
  left exactly as the poll wrote it — the same call the rank-22 cleanup made.
- `debug/bridge.json` is stale on disk: the app did not shut down through
  `stopDebugBridge`. The next `/health` call against it fails with a refused
  connection until a new app start rewrites it. That is the honest signal that
  no app is running; do not read it as a live bridge.

### Rank 24 — full live proof on authentic data, no fixture

- Driven only through the app's own dev debug bridge (`debug/bridge.json` →
  `127.0.0.1:39273` + bearer token): `/health`, `/focus`, `/eval`, `/text`,
  `/logs`, `/screenshot`. No desktop remote control, no synthesized input.
- The panel opened on the user's real workspace: 370 candidates, 30 selected,
  coverage `0% → 17%`. The exported recipe carried the user's genuine filters —
  `["N4","N5"]` excluded, minimum repeats 1, knowledge cutoff 2, internal
  duplicates skipped, proper nouns skipped, 30 cards, `frequency-unrated` — and
  the real title `The Big O - 01` as its display label. Code `15xr5gc`.
- `Copy recipe` put exactly the exported text on the clipboard: 443 characters,
  byte-identical after normalizing the `\r\n` that Windows adds on read. The
  user's previous clipboard contents were captured first and written back.
- A pasted copy with `maximumCards` 12 and `minimumOccurrences` 2 previewed
  `Minimum repeats 1 → 2`, `Maximum cards 30 → 12`, `30 → 12` cards, 0 added,
  18 dropped, with a real sample (見る · 離れる · 助ける · あまり · 頑張る · 当然).
- `Apply these filters` moved the real workspace 30 → 12 and the coverage
  estimate 17% → 13%. It landed as **one** history entry (3 → 4) whose
  before/after filters and removed/remaining counts match the preview exactly,
  and as exactly **one** new action record. The panel then reported itself
  identical and disabled its own apply, so it cannot double-apply.
- `Undo filter` restored 30/370, 17% coverage, history 3, and the filter object
  byte-for-byte — including the original `['N5','N4']` order. The preview
  recomputed itself and offered the same diff again, which is what proves it is
  derived rather than remembered.
- Every rejection was exercised through the real UI and rendered its own
  message: plain text, `[1,2,3]`, a foreign `kind`, `version: 2`, and a filter
  object with no readable field. A hand-trimmed recipe (`maximumCards` 9, one
  unreadable value, one unknown field) reported all three notes with correct
  plural forms and showed the default it would fall back to — `Excluded JLPT
  levels N4 · N5 → None` — before anything was applied.
- Geometry in the user's partially off-screen Media Center window (window rect
  −222,−113 → 1698,896): the whole panel fits one 821px viewport — head 168,
  export box 292–405, paste box 474–588, diff 614–638, delta 671–736, apply
  742–775, footer 785–809 — left-aligned at x=85, right edge 1251 inside a
  1,264px document with zero horizontal overflow, and the apply control passes
  `elementFromPoint`.
- **Visual QA found and fixed one real defect.** The diff rows were laid out with
  `justify-content: space-between`, which pushed every value to x≈1160 against
  the far right edge — the same clipping-risk pattern found in ranks 10, 11, 14
  and 17. Values now sit at x=305 directly after their labels, re-verified live.
- Zero renderer errors and zero error-level bridge log entries across the entire
  pass.

### `/focus` — proven on its first ever call, with the premise demonstrated

- The window was minimized through the app's own `popoutControl('minimize')`, so
  `/health` reported `focused: false, minimized: true, visible: false`.
- A `requestAnimationFrame` armed in that state was **still 0 after 2 seconds** —
  the throttling claim behind rank 22's unprovable reveal, demonstrated rather
  than asserted.
- `POST /focus {"window":"main"}` returned `ok: true, focused: true,
  visible: true`; `/health` confirmed `focused: true, minimized: false`. The
  frame armed while minimized fired immediately, and a newly armed frame fired
  too. A frame armed in the already-focused window fired as well.
- Rank 22's reveal effect is byte-identical to rank 21's live-proven one and its
  scroll target was already proven, so the remaining premise is now closed. What
  is still unproven is only the fixture-dependent panel pass itself.

### Runtime state after the rank-24 pass

- The app was closed through its own window-close path, so it shut down through
  `stopDebugBridge` and removed `debug/bridge.json` — unlike the previous
  session, whose stale file had to be explained. No electron, forge or vite
  process survived; verified from PowerShell.
- **`media.json` was never modified**: still `DC2C4E37…1F52`, 67,474 bytes,
  stamped 21:01:11 — before this session. Nothing navigated, so nothing bumped
  `lastPlayedAt` and no subtitle record was written.
- `study-orchestrator-v2.json` was audited before being touched. The only
  differences from baseline were the two action records this QA created
  (15 → 17) and the three authentic opportunity records the app's own boot sync
  re-stamped; candidates, selection, filters, history, exports, readiness and
  jobs were identical, and there was zero fixture residue (`qa-`, `fixture`,
  `検証用`, `TEMP` all absent). It was then restored byte-for-byte with the app
  down: `FC9E50B9…4490`, 245,037 bytes.
- `anki-intervals.json` was rewritten at 00:52:35 by the app's own bounded poll.
  Nothing here touched Anki and that data is authentic, so it was left exactly as
  the poll wrote it: `2C70FFC4…BB9E`.
- `desktop-layout.json` is the one file with no pre-session baseline: it was
  first backed up at 00:46, after the QA had already opened a window. The layout
  was instead restored *through the app* — the Video window this pass opened was
  closed, the Media window was returned to Library and re-minimized, so the final
  arrangement matches what was found. Back up every file in `userData`, not only
  the three documented ones, before starting the app.
- The two QA screenshots and the dev start log were deleted. The user's clipboard
  was restored to its original contents.

### SM-032 — the Study surface's own chrome is now localized

Every panel this track added since rank 17 was localized on arrival, but the
surface those panels sit in was not: the vocabulary funnel, filter bar, candidate
list, pagination, context rail, card and Anki previews, opportunity actions, the
production line and the episode-readiness rail were all English literals in
`StudyOrchestratorWorkspace.tsx`, plus about thirty status and error messages.
For an app whose UI language can be JA/ZH/RU that is a straightforward
understandability defect, and `CLAUDE.md` treats it as a hard gate for new text.

- Roughly 190 user-visible strings now go through `useT()`. 262 new keys are
  present in EN/JA/ZH/RU, with CLDR plural forms in Russian for every count.
- **One label vocabulary, shared.** The nine filter fields moved to
  `study.filter.field.*` and their values to `study.filter.value.*`, so the
  filter bar's own controls and the rank-24 recipe diff now say the same thing
  about the same filter instead of each carrying its own wording.
- Readiness categories are translated through one renderer helper
  (`readinessCategoryLabel`), so the episode rail and the context rail always
  agree. The shared `readinessLabel` stays English because it also feeds
  main-process evidence strings.
- Pipeline stage *names* are translated by stage **id**, not by the English label
  stored in the persisted job, with the stored label kept as a fallback for an id
  this build does not know.
- Pipeline stage *details* were English sentences written into the job document by
  the main process. `StudyPipelineStage` now also carries an optional
  `detailKey`/`detailVars`; every writer sets them, and the renderer prefers them
  and falls back to the stored sentence. No analyzer version was bumped —
  invalidating every stored analysis over a label would take the other Study
  features down with it.
- Rank 24 gained the connection it was missing. The episode rail can hand you a
  fresh workspace for the next episode, which starts from the app defaults;
  `studyFilterRecipeSource` finds the newest *other* workspace of the same
  canonical series whose filters genuinely differ, and the panel offers it in one
  click. It fills the paste box only — the user still applies explicitly, through
  the same reversible history.

### SM-032, second increment — understandability, not just language

- **The recipe panel no longer asks a learner to read JSON.** It now opens with the
  same nine filters in words, through the same `study.filter.field.*` labels the
  filter bar uses and the same value formatter the diff uses; the JSON textarea is
  still there underneath, because that is what actually travels and what a blocked
  clipboard needs.
- **The evidence panel no longer prints a developer slug.** `Opportunity:
  series recurrence forecast` was the raw type with its dashes swapped for spaces.
  All twenty types now have real names in four languages (`study.type.*`), with the
  readable slug kept as the fallback for a type this build does not know.
- Visual QA caught one more layout risk in the new summary: `auto-fit` with
  `1fr` tracks stretched it to three columns whose right edge landed at x=1473 —
  past the screen in a window positioned like this user's. Columns are now capped
  at 400px and packed from the left, giving two columns ending at x=469, and the
  whole summary reads in the left flow.

### SM-032 live proof, in Japanese

- The whole Study surface reads naturally in Japanese: `N5を除外 · N4を除外 ·
  頻度ランキング · 最小出現回数 · 最大カード数 · フィルターを戻す · レシピ`, the funnel
  `検出 370 / 絞り込み後 30 / 理解度の見込み 0% → 17%`, the rail `選択中のコンテキスト /
  次の操作 / 後回しが無難 · N1 · 信頼度 59%`, the card preview `ローカルカードの確認 …
  カード30枚を作成`, the episode rail `第01話 … 日本語字幕がありません · 字幕を準備`, and
  the stage names `メディアを選択 / 字幕の準備 / 言語解析 / 知識との照合 / 語彙の絞り込み /
  カードの準備 / Ankiへの引き渡し`.
- **Two real defects were found by looking at it, not by reading it.**
  1. The recipe's undo hint quoted the English button label, so in Japanese it
     said 「Undo filter」 while the button said フィルターを戻す. The hint now
     interpolates the same key the button uses: 「フィルターを戻す」で一手で戻せます。
  2. The recipe code rendered `15XR5GC` in the panel header (a CSS uppercase
     transform) but `15xr5gc` in the copy confirmation — one identifier, two
     spellings. The transform is gone; both now read `15xr5gc`.
- The stage *details* still displayed English live, which is the fallback working
  as designed: the user's job document was written before `detailKey` existed. The
  translated details appear the next time a title is prepared, and that path has
  deterministic coverage only — no re-preparation was run, because it would
  rewrite the user's readiness snapshot and workspace for a label.
- The cross-episode recipe offer correctly did **not** appear: the authentic
  document holds exactly one workspace, so there is no earlier episode to reuse.
  Its positive path has deterministic coverage; no fixture was created.
- Zero renderer errors, zero error-level bridge log entries, no document
  overflow. `media.json` untouched at `DC2C4E37…`; the Study document differed
  only by the app's own re-stamped opportunity timestamps (zero QA action records)
  and was restored to `FC9E50B9…` with the app down; `desktop-layout.json` was
  restored from a pre-run snapshot this time.
- One side effect that could not be undone: the clipboard proof overwrote the
  user's clipboard, and its previous contents (138 characters of their own prompt
  text) were not recoverable on the second pass. The app's clipboard-history entry
  the copy created was removed, and `ui-lang` was returned to unset.

## Validation

All numbers below were produced **outside the Bash sandbox**. A sandboxed run of
the same suite reported 284 files / 3,106 tests because the overlay still served
deleted files; that count is wrong.

- SM-032 localization slice: `studyFilterRecipe.test.ts` grew to 29 tests (5 new
  for the cross-episode source: newest-other-workspace selection, the
  already-matching no-op, series/lookup/missing-media exclusion, media without a
  series identity, and a round trip through the paste box), plus a new
  `studyPipelineStageDetail.test.ts` with 5 tests pinning the stage-detail keys,
  the segment counters, that a stale counter never survives a phase change, and
  that every key a writer can name exists in the English catalog.
- Full Vitest after SM-032: 290 files, **3,181 passed / 1 failed** — the previous
  3,171 plus these 10, same known unrelated failure.
- i18n parity after SM-032: **5,961 English keys** in ja/zh/ru, exit 0. 262 of
  them are this slice's.
- Changed-slice ESLint and `tsc --noEmit`: clean, including the shared contract,
  the main-process writers and the renderer.
- Renderer, main and preload production bundles: all three pass.
- Rank-24 portable recipe: 1 file, **24 tests passed** — serialization order and
  byte-stability, round-trip, label normalization, every rejection code, unknown
  and unreadable field reporting, defaults-not-workspace completion, hostile
  value clamping, the diff and selection preview, the bounded sample cap, and the
  apply/undo/idempotence path through the existing filter operation.
- Full Vitest after rank 24: 289 files, **3,171 passed / 1 failed** — exactly the
  previous 3,147 plus this slice's 24, same known unrelated failure. Confirmed
  twice, and the full suite provably writes nothing into `userData`.
- i18n parity after rank 24: **5,716 English keys** present in ja/zh/ru
  (`tools/i18n-check.cjs` exit 0). 45 of them are this slice's; the jump from the
  5,449 recorded at rank 23 is mostly another track's in-flight work.
- Changed-slice ESLint (`studyFilterRecipe.ts`, `studyFilterRecipe.test.ts`,
  `StudyOrchestratorWorkspace.tsx`): exit 0.
- `tsc --noEmit` reports **zero** diagnostics in any line this slice wrote. The
  repository-wide count is now 17, all of them in one other track's file
  (`renderer/assets/reading-garden/audio/fetch-mooncap-music.mjs`, which tsc
  cannot parse). The 278–281 recorded in earlier sessions no longer reflects the
  worktree.
- Renderer, main and preload production bundles: all three pass, re-run after the
  visual-QA CSS fix.
- Rank-23 timing repair and the existing player-signal suite: 2 files, 33 tests
  passed (17 new).
- Full Vitest at rank 23: 288 files, **3,147 passed / 1 failed** — exactly the
  previous 3,130 plus that slice's 17, with the same single known unrelated
  failure.
- Rank-22 forecast projection and renderer opportunity: 2 files, 14 tests
  passed.
- i18n parity: 5,449 English keys present in ja/zh/ru (`tools/i18n-check.cjs`
  exit 0).
- Changed-slice ESLint (`videoCoreStudy.ts`, `VideoCoreStudyOverlay.tsx`,
  `videoCoreTimingRepair.test.ts`): exit 0, zero warnings.
- `tsc --noEmit` reports zero diagnostics in any line this slice wrote. Two
  diagnostics do land in `debugBridge.ts`, at lines 336-337 — the `/key` route's
  `sendInputEvent` modifiers, unchanged HEAD code that `git diff` confirms this
  slice never touched (its only edit is +25 lines for `/focus`). The
  repository-wide count moved 278 → 281 while this session ran; that drift is in
  `ReadingGarden.tsx`, another track's actively-edited file.
- Renderer, main and preload production bundles: all three pass.
- Rank-21 snapshot evidence, detector, signal retirement, opportunity, and
  existing Study regressions: 4 files, 50 tests passed.
- Full Vitest at rank 21: 285 files, **3,116 passed / 1 failed**.
- The one failure is `architectureBaseline.test.ts > has no stale baseline
  entries`, on `test-only-module:src/main/city/assets/validateAssets.ts`. That
  file no longer exists — 215 files under `src/main/city/`, four renderer views,
  the mazii grammar data and some tools are deleted in the working tree. Those
  deletions are **not** from this slice and predate it; the baseline simply now
  lists a finding the audit can no longer emit. Left alone deliberately: it is
  someone else's in-flight work and `HANDOFF.md` forbids reverting the worktree.
  Fix when that work lands by dropping that one baseline entry.
- Renderer production bundle: passed; existing chunk warnings only.
- Main and preload entry bundles: passed.
- Changed-slice ESLint: zero warnings or errors.
- i18n parity: 5,418 English keys present in ja/zh/ru (`tools/i18n-check.cjs`
  exit 0).
- Architecture audit: 1,206 modules, 19 findings, nothing new; three existing
  pending findings.
- Full `tsc --noEmit` still reports 278 broad repository diagnostics; the
  changed-slice filter reports zero diagnostics.

## Remaining limitations

- Microphone capture still needs a deliberate hardware-permission smoke. The
  replay-to-shadowing suggestion itself does not require or request access.
- Recently learned context has deterministic and integration coverage, but
  authentic live activation awaits a genuine future Anki interval change.
- Comprehension rescue has deterministic event-boundary coverage and a clean
  live renderer boot, but its end-to-end media journey awaits a user decision
  on the unrelated Windows firewall prompt.
- Subtitle-track upgrade has deterministic positive-path coverage, but
  authentic live activation awaits a genuinely newer, sufficiently rated local
  Japanese track in the user's existing catalogue.
- Cross-title reinforcement has positive MCP visual and exact-handoff proof,
  but authentic activation awaits two more independently prepared titles that
  share a selected lemma.
- Abandoned-set resizing has positive MCP apply/undo proof, but authentic
  activation awaits two genuine qualifying vocabulary sessions; no synthetic
  evidence remains.
- Missing card-assets repair remains deferred until an authoritative managed
  VideoCore asset write/update path exists.
- Character vocabulary packs remain deferred until subtitle/Study provenance
  includes trustworthy speaker identity.
- Stale queue cleanup has full deterministic coverage and a live apply/undo
  proof, but the proof used labelled temporary fixtures: the authentic queue
  currently holds no genuinely stale item, because the existing sync already
  retires active renderer-signal entries whose media disappears.
- The user's Study workspace and readiness snapshots still reference a media id
  that is no longer in the library. Cleanup deliberately leaves that workspace
  and its candidates in place; only the recommendation was retired.
- The legacy `MediaContent` player remains actively routed for library, video,
  and music. The Study-context handoff is no longer one of those consumers, so
  `MediaCenterView` is now the only surface that names it.
- That route swap is blocked, and not by this track. `MediaWorkspaceHost`
  renders nothing unless `SEANIME_SIDECAR=1` (`shared/seanime.ts:10`), which is
  off in a normal run, so pointing library/video/music at it today would leave
  the app with no media surface. `docs/migration/NEXT_SESSION.md` also puts old
  player retirement behind a G-PLAY asset re-run plus restart/resume/history and
  a microphone hardware proof, both still owed on that track.
- SM-022 is deterministic-only by design: it has no user-visible delta, so no
  live smoke was run and none is claimed. The app was not launched and no
  runtime file was touched.
- Rank 16 has deterministic positive-path coverage and an authentic-state
  audit, but no live UI claim. The real library has 30 items and zero favorites,
  so the recommendation is honestly ineligible. The installed packaged app is
  older than this worktree; neither runtime JSON file was modified or launched.
- Rank 17 has positive Electron-MCP UI and Grammar deep-link proof, but authentic
  activation awaits two genuine recent sessions missing the same pattern. The
  proof used temporary local history and removed it afterward.
- Rank 18 has deterministic positive-path coverage and authentic Electron-MCP
  audio/negative-guard proof. Positive live activation awaits a loaded item
  whose current exact-subtitle readiness is genuinely `ready-now` at 85% or
  higher; the only current prepared title is 0%, so no fixture was fabricated.
- Rank 19 is fully live-verified on authentic data with no fixture, including
  its apply/undo path. Its one unproven branch is cosmetic: no workspace in the
  user's data has more than five qualifying names, so the eight-name display cap
  has deterministic coverage only.
- The rank-19 exclude action exists because **AI Mode can turn
  `excludeProperNouns` off** (`renderer/studyAgentHandlers.ts`); there is no
  other UI control for that filter anywhere in the app. The repeated-lookup
  workspace also sets it false on purpose, but that workspace is `lookup-history`
  and the detector skips it. If the AI filter tool is ever removed, re-check
  whether this branch is still reachable before keeping it.
- Proper-name classification is exactly as good as the analyzer's 固有名詞 tag.
  Katakana loanwords such as アンドロイド are over-tagged. This is inherited from
  the existing `excludeProperNouns` filter and is acceptable for a read-only
  review set; it would need token-level named-entity provenance to fix, which
  the app does not have.
- Rank 20 has authentic negative-guard proof and a positive Electron visual,
  apply, restore, and close-to-restore proof. Authentic positive activation
  awaits two more independently prepared canonical titles; snapshots created
  before this slice deliberately have no speech statistics and remain valid for
  every other Study feature.
- Rank 21 has authentic full-poll and negative-guard proof plus a positive
  Electron preview and exact-cue proof. Authentic positive activation awaits a
  prepared candidate matching the user's current lone leech, `厳粛`; the proof
  fixture was removed and Anki itself was never changed.
- Rank 22 has full deterministic coverage, a live panel/geometry proof on a
  labelled fixture, and a verified cleanup. Two things remain unproven: the
  on-click reveal, which an unfocused window cannot exercise, and the
  exact-scene action, which hit the pre-existing `openContext` defect. Authentic
  positive activation needs a second genuinely prepared episode of `The Big O`;
  the user has one prepared episode.
- Rank 23 is **deterministic-only**. It has 17 focused tests covering every gate
  and the projection maths, but no live proof of any kind, because its surface
  does not mount without `SEANIME_SIDECAR=1`. Both its negative guards and its
  positive path are unproven in a real player.
- Rank 23 shares ranks 2 and 7's home in the adopted player, which is the right
  place for an in-player friction and is this track's own territory per
  `HANDOFF.md` — but it also inherits their reachability problem. The legacy
  `MediaContent` player has the same ±0.1s control and is the one actually
  routed today; it was deliberately not touched, because it belongs to the
  migration track.
- Rank 24 is fully live-verified on authentic data with no fixture, including
  apply, undo, every rejection path and the clipboard round trip. Two things are
  deliberately absent rather than unproven: there is no named recipe library
  (that would be the second filter store this track refuses), and there is no
  file import/export — the clipboard plus a paste box is the whole surface, so
  nothing new touches the filesystem.
- Rank 24's `version` guard has only one live case to prove: a `version: 2`
  recipe is refused. There is no forward migration path yet, by design — when a
  version 2 exists, decide then whether old recipes upgrade or are refused.
- The recipe label is display-only and comes from the media title, so it is
  deliberately **not** translated (i18n scope rule: chrome yes, study content no).
- The `/focus` bridge route is proven: called for the first time this session, it
  restored, showed and focused a minimized window, and a `requestAnimationFrame`
  that had been stalled for two seconds fired immediately afterwards.
- Rank 22's on-click reveal remains formally unproven only for want of its
  fixture; its `requestAnimationFrame` premise is now proven (see the `/focus`
  section above). The gap is narrow. `StudyOrchestratorWorkspace.tsx:275-303` holds three near-identical
  reveal effects for ranks 20, 21 and 22 — same `requestAnimationFrame`, same
  `scrollIntoView({ behavior: 'smooth', block: 'nearest' })`, same
  `focus({ preventScroll: true })`, differing only in the ref and the id.
  Rank 21's was proven live in a focused window, and rank 22's scroll *target*
  was proven directly. What is missing is one focused pass, which `/focus` now
  makes possible without any fixture.
- Running the app for QA is not side-effect-free. This slice showed the app will
  persist a fixture subtitle record into `media.json` and bump `lastPlayedAt`
  from a handoff that did not even navigate. Audit `media.json` as well as the
  Study document after every live proof — the earlier session checked neither.
- `series-recurrence-forecast` **is** registered in `rendererSignalTypes`, so a
  spent forecast retires on its own — unlike the `grammar-weakness-scenes` gap
  filed below.
- Filed separately: `syncStudyOpportunities` never retires a spent
  `grammar-weakness-scenes` entry, because that type is missing from
  `rendererSignalTypes`. Same class of gap that rank 15 fixed for
  `scene-quick-session`. Rank 19's own type was registered there.
- Filed separately, and it affects **every** Study→player action (ranks 8, 10,
  14, 16, 17, 18 and this one): clicking an exact-cue action from a cold player
  lands on an empty `Choose what to watch` screen. Two causes were isolated
  live. `openContext` fires `study:open-media-context` only 80 ms after
  navigating, which a not-yet-mounted Video panel misses; and the
  `jp-pending-study-context-ref` fallback is consumed by `takeHandoff` on first
  read, so with two Media Center windows open the wrong instance can burn it.
  Firing the same event once the player surface existed loaded `The Big O - 01`
  and seeked correctly, which is how both causes were confirmed. Not patched
  here: `MediaContent.tsx` is the actively-routed legacy player and the fix
  belongs with whoever owns that surface.
- Literal matching deliberately withholds one-character surfaces. This avoids
  unsafe cross-word matches such as `方` inside `双方`; it may omit valid short
  grammar until stronger token-level grammar provenance exists.
- Two renderer component test files have never executed — the vitest include
  globs are all `**/*.test.ts`, and `externalPlayerPanel.test.tsx` and
  `mediaTrackingSourcesHistory.test.tsx` are `.tsx`. Filed separately; the fix
  needs a root config change that `CLAUDE.md` puts out of bounds.
- Existing repository-wide TypeScript diagnostics and renderer chunk warnings
  remain outside this isolated slice.

### SM-032, third increment — the opportunity-text contract, and three types on it

The gap below is now half closed, deliberately and visibly rather than all at once.

- `StudyOpportunity` carries optional `titleKey`/`titleVars` and
  `explanationKey`/`explanationVars`; `StudyEvidence` carries `labelKey`/`labelVars`.
  All additive and optional, no schema version bumped, English kept beside them.
- The renderer resolves all three through one helper each — `opportunityTitle`,
  `opportunityExplanation`, `evidenceLabel` — used by **every** surface that shows
  an opportunity: the recommended-next card, the opportunity stream list, the
  `Why this` evidence panel and the resume strip. They cannot disagree.
- Three generators are migrated: `continue-session`, `prepared-unwatched` and
  `subtitle-required` — the types this user's authentic data actually produces —
  plus the resume strip's own `Watch now` / `Resume` labels.
- **Still English, and each one is a five-line change following the same pattern:**
  `recently-learned-context`, `queued-preparation`, `favorite-preparation`,
  `newly-unlocked`, `export-pending`, and the readiness-derived explanations near
  the end of `generateStudyOpportunities`. Ranks 17–23 are unaffected: their
  opportunities are renderer-generated and already carry keys.

## The remaining half of that gap

Opportunity **titles, explanations and evidence labels are still English** for the
main-process types listed just above: `Watch your prepared The Big O - 01`, `Your
vocabulary preview is ready…`, `30 selected words ready`, `No playback since
preparation`. They are generated by `generateStudyOpportunities` in
`shared/mediaStudyOrchestrator.ts` and **persisted into the Study document**, so
the renderer cannot translate them after the fact. The type name, the effort and
the panel chrome around them are now localized, which makes the English sentences
between them look worse, not better.

The contract and the renderer side are done; what remains is filling in the
per-generator keys. Copy any migrated block: add `titleKey`/`titleVars`,
`explanationKey`/`explanationVars` next to the existing English strings and
`labelKey`/`labelVars` on each evidence entry, then add the four catalog entries.
`studyPipelineStageDetail.test.ts` shows the assertion shape, including the check
that every key a generator names exists in the English catalog.

One caveat worth knowing before starting: opportunities are **persisted**, so
existing stored ones keep their English text until they are regenerated. The
renderer sync regenerates most of them on boot, but do not claim a live proof
without seeing the specific type actually re-emitted.

## Exact next action

**1 — Finish the persisted opportunity text** (the half-closed gap directly above):
`recently-learned-context`, `queued-preparation`, `favorite-preparation`,
`newly-unlocked`, `export-pending`, and the readiness-derived explanations. The
contract, the renderer resolution and three types are already done.

**2 — Rank 25, offline preparation bundle**, or rank 26 if the offline surface
turns out to need a service this app does not own. Read the catalogue entry first
and audit before implementing, the way ranks 12 and 13 were audited into honest
deferrals.

**2 — Rank 23's live proof, when the adopted player can be reached.** It needs
`SEANIME_SIDECAR=1`, a subtitle track drifting at 100 ms/min or worse, and four
manual ±0.1s corrections spread over at least two minutes of playback. Verify
both directions: that the cue appears on drift, and that converging on a
constant offset produces nothing. Expect the same Windows firewall dialog rank 7
hit. Audit `media.json` as well as the Study document afterwards.

**3 — Rank 22's panel reveal, only if the fixture is worth it.** The
`requestAnimationFrame` premise is now proven and `/focus` works, so all that
remains is one focused pass over a two-episode fixture. That fixture is the class
of data that leaked into `media.json` twice; both audit-first removers are
committed next to this document if you decide it earns the churn.

Before starting the app for any pass: back up **every** file in
`%APPDATA%\jp-study-app`, not only `media.json`,
`study-orchestrator-v2.json` and `anki-intervals.json`. This session lost the
pre-session `desktop-layout.json` by backing up only the documented three.

Two things that cost the rank-19 session real time — do not re-derive them:

1. **The Bash tool serves a stale filesystem overlay.** It reported a wrong
   `media.json` (wrong hash, wrong item count) and still listed deleted files.
   Read runtime JSON and verify hashes from PowerShell. Writes do pass through
   correctly; only reads were stale.
2. **The `jp-app` MCP server lives in the project's `.mcp.json`**, so it is
   absent unless the session's cwd is `jp-study-app`. When it is missing, drive
   `debug/bridge.json` (`127.0.0.1:<port>` + bearer token) directly — same
   endpoints, no computer control.

Authentic data does support these features: the library has 30 items and
`The Big O - 01` carries its exact Japanese subtitle record.

Do not attempt the library/video/music route swap until the Seanime track closes
steps 2 and 3 of `docs/migration/NEXT_SESSION.md`. The Study side is ready.
