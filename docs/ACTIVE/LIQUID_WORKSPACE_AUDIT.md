# Liquid Study Workspace — current-state audit and redesign plan

Date: 2026-08-06. Scope: the study video player (`src/media/**`) and everything the
player reaches. Written before any edit, as deliverable 31.1–31.8.

Every line count and every claim about where a feature lives was read out of the tree,
not recalled. Where something is **not** in the player (OCR, notes, bookmarks) that is
stated explicitly rather than folded into the map as if it were.

---

## 1. Current-state audit

### 1.1 The mount chain

```
App.tsx
 └─ MediaWorkspaceHost.tsx        432 ln   launcher button + full-screen host overlay,
    │                                      3 segments (library / readiness / review)
    ├─ MediaWorkspace.tsx           55 ln   LibraryScreen + StudyPlayerSlice
    │   └─ MediaSurfaceShell.tsx   157 ln   query client, base URL, auth token, WS provider
    │       └─ StudyPlayerSlice   1379 ln   directstream open protocol, resume, watch-time,
    │           │                           transcode fallback, subtitle-event bridge
    │           ├─ <VideoCore>              adopted upstream player (vendored)
    │           └─ VideoCoreStudyOverlay   2454 ln  ← the entire study UI
    │               ├─ VideoCoreGrammarPanel     103 ln
    │               ├─ VideoCoreMiningPanel      687 ln
    │               ├─ VideoCoreTranscriptPanel  341 ln
    │               └─ DictionaryPopup (renderer)
    └─ MediaPlayerSurface.tsx       46 ln   same slice without the library (Blanc toolbox)
```

`mediaWorkspace.css` is 1326 lines, all scoped under `#media-workspace`.

### 1.2 The actual defect, measured

`src/renderer/__tests__/videoStudyLayout.test.ts` already records the collision numbers
from the dev harness before the current one-column rail landed:

| window | state | collision |
| --- | --- | --- |
| 1024×622 | everything open | grammar × mining, 12 × 294 px |
| 1280×522 | controls expanded | dock × cue, 644 × 69 px — **subtitle gone** |
| 620×622 | everything open | mining ran through all three panels |

That test guards a *geometry* fix (one rail, published dock height, declared column
width). It does not, and cannot, fix the thing this redesign is about: **five surfaces
are on the picture simultaneously and all of them are peers.**

Concretely, with a file open and the controls expanded the player renders at once:

1. `.study-cue-overlay` (z 90) — subtitle, second line, dictation box, shadowing rig,
   three suggestion cards, translation line;
2. `.study-control-dock` (z 92) — up to **6 rows and ~35 controls**, capped at
   `min(60%, 22rem)` of the picture;
3. `.study-grammar-panel` — 24 rem left column;
4. `.study-side-rail` — 24 rem right column holding mining **and** transcript;
5. the adopted `<VideoCore>` transport bar underneath all of it.

At 1024 px wide, two 24 rem columns plus the subtitle floor is 48 rem of furniture out
of 64 rem. The video is what is left over.

### 1.3 Where complexity actually sits

`VideoCoreStudyOverlay.tsx` is one component holding **~45 `useState`/`useRef` slots and
23 effects**. It owns, in one render function: subtitle rendering, dual subtitles,
translation caching, dictionary lookup, grammar highlight, dictation, shadowing +
`MediaRecorder`, A–B loop, line loop, auto-pause, comprehension telemetry, timing-drift
telemetry and auto-correction, Whisper transcription (worker, model tier, device,
language), external-subtitle mounting, sync-offset measurement, track pickers, audio
track, playback rate, frame stepping, cue navigation, 13 command registrations, and the
layout publication of `--study-dock-height`.

None of that is dead. **That is the problem** — every one of these is real, and they are
all presented at the same altitude.

### 1.4 What is configuration sitting in the player

Four things in the dock are application settings that happen to be rendered over a
video: Whisper **device** (auto/CPU), Whisper **model tier**, transcription
**language**, and subtitle appearance (font family, weight, size, outline, background
opacity). The Whisper trio already persists through `renderer/whisperSettings.ts` and is
already reachable from the real settings system (`settings/pages/TranscriptionPage.tsx`)
— so the dock copy is a duplicate surface, not the only one.

---

## 2. Feature map

Legend for **Level**: F = Focus, C = Context, U = Utility, K = Configuration.
"Functional" = verified in source as wired to a real effect, not a placeholder.

### 2.1 Playback and transport

| # | Feature | Lives in | Functional | State | Deps | Lvl | Block |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Play/pause, timeline, volume, fullscreen | adopted `<VideoCore>` | yes | `vc_*` jotai atoms | vendored player | F | **Video** |
| 2 | Frame step ±1/30 s | overlay dock, primary row | yes | none (direct `video.currentTime`) | `vc_videoElement` | U | **Playback** |
| 3 | Playback speed, 7 presets 0.7–1.5 | overlay dock | yes | `preferences.playbackRate` | `clampStudyPlaybackRate` | U | **Playback** |
| 4 | Seek step slider 1–60 s | overlay dock, appearance row | yes | `preferences.seekStepSec` | commands 12/13 | U | **Playback** |
| 5 | Previous / replay / next **line** | dock primary row + cmds | yes | derived from `allCues` | `adjacentStudyCue` | F | **Playback** |
| 6 | Resume position per file | `StudyPlayerSlice` `ResumeTracker` | yes | `localStorage jp-video-core-resume-v1` | `videoCoreResumeKey` | — | **Video** |
| 7 | Watch-time ledger flush | `ResumeTracker` | yes | `seanimeWatchTime` state machine | `renderer/stats` | — | **Statistics** |
| 8 | Transcode fallback (HEVC+FLAC) | `StudyPlayerSlice` | yes | `TRANSCODE_MEMO_STORAGE_KEY` | `mediastreamTranscode` | — | **Video** |
| 9 | Directstream open + recovery watchdogs | `StudyPlayerSlice` | yes | module-scoped channel + generations | `directstreamOpenChannel` | — | **Video** |

### 2.2 Subtitles

| # | Feature | Lives in | Functional | State | Deps | Lvl | Block |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | Primary subtitle line | overlay `.study-cue-text` | yes | `activeCues` | `SubtitleCueLine` | F | **Subtitles** |
| 11 | Primary subs on/off | dock display row | yes | `preferences.primarySubs` | — | U | **Subtitles** |
| 12 | Subtitle track picker | dock track row | yes | `selectedTrack` (local) | `manager` / `mediaCaptionsManager` | U | **SubtitleTrack** |
| 13 | Secondary track picker | dock track row | yes | `secondaryTrack` (local) | same | U | **SubtitleTrack** |
| 14 | Dual subtitles | overlay `.study-cue-secondary` | yes | `preferences.dualSubs` | translator fallback | C | **Subtitles** |
| 15 | Secondary language (8 codes) | dock track row | yes | `preferences.secondarySubLang` | `translateTo` | U | **Subtitles** |
| 16 | Subtitle delay ±0.1 / ±0.5 | dock + 4 commands | yes | `subtitleDelaySec` (local, **not persisted**) | `manager.setSubtitleDelay` | U | **Subtitles** |
| 17 | Measured sync offset (ffmpeg) | overlay `resolveSubtitleSyncOffset` | yes | promise cache per path | `window.api.subtitleSyncOffset` | — | **Subtitles** |
| 18 | External subtitle auto-mount | overlay, 800 ms grace | yes | `externalSubtitleForRef` | `window.api.subtitleForPath` | — | **Subtitles** |
| 19 | Font family / weight / size / outline / bg opacity | dock appearance row | yes | 5 preference keys | `SUBTITLE_FONT_STACKS` | K | **Configuration** |
| 20 | Cue timing readout | dock appearance row | yes | `preferences.cueTimingReadout` | — | U | **StudyHUD** |
| 21 | Furigana | dock display row + cmd | yes | `preferences.furigana` | `SubtitleCueLine` | U | **Subtitles** |
| 22 | Audio track picker | dock track row | yes | `selectedAudioTrack` (local) | `vc_audioManager` | U | **AudioTrack** |

### 2.3 Subtitle generation (Whisper)

| # | Feature | Lives in | Functional | State | Deps | Lvl | Block |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 23 | Generate subtitles | dock whisper row | yes | `whisperState/Message/Progress/Error` | `whisperWorker`, `seanimeExtractAudio` | U (action) | **Subtitles** |
| 24 | Model tier picker | dock whisper row | yes | `whisperSettings` (global) | `WHISPER_MODEL_SPECS` | K | **Configuration** |
| 25 | Device auto/CPU | dock whisper row | yes | `whisperSettings` (global) | worker `prefer` | K | **Configuration** |
| 26 | Transcription language ja/zh | dock whisper row | yes | `studyEnvironment` (global) | `setStudyLang` | K | **Configuration** |
| 27 | Stop generation | dock whisper row | yes | `whisperGenerationRef` | — | U | **Subtitles** |

### 2.4 Study / comprehension

| # | Feature | Lives in | Functional | State | Deps | Lvl | Block |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 28 | Transcript rail | `VideoCoreTranscriptPanel` | yes | `preferences.transcriptPanel` | tokenizer, `posCategory` | F/C | **Transcript** |
| 29 | Transcript search | same, `query` | yes | local | — | U | **Transcript** |
| 30 | Transcript auto-follow + toggle | same, `follow` | yes | local | `scrollIntoView` | U | **Transcript** |
| 31 | Per-row translate | same, `translations` | yes | local map | `renderer/translator` | C | **Transcript** |
| 32 | Reading line (kana) | same, `readingLine` | yes | `tokenRows` chunked 40/frame | `renderer/tokenizer` | C | **Transcript** |
| 33 | Mining destination readout | same, `useMiningDestination` | yes | local | `resolveProfileMatch` | C | **Transcript** |
| 34 | Dictionary lookup on word click | overlay → `DictionaryPopup` | yes | `popup` | `renderer/wordLookup` | C | **Dictionary** |
| 35 | Pause on lookup | dock display row | yes | `pauseOnLookup` (local, **not persisted**) | — | U | **Dictionary** |
| 36 | Grammar highlight (colour-coded cue) | overlay + `SubtitleCueLine` | yes | `preferences.grammarHighlight` | `useCueAnalysis` | U | **Grammar** |
| 37 | Grammar explanation panel | `VideoCoreGrammarPanel` | yes | `cueAnalysis.state` | `SentenceAnalysisView` | C | **Grammar** |
| 38 | Analyze-now / retry | same | yes | — | `useCueAnalysis.analyzeNow` | U | **Grammar** |
| 39 | Translate line | dock practice row | yes | `translation` | `translateTo` | C | **Translation** |
| 40 | Auto-pause at cue end | dock display row + cmd | yes | `preferences.autoPause` | `isCueEndTransition` | U | **Playback** |
| 41 | Loop line | dock display row + cmd | yes | `preferences.loopLine` | `resolveStudyLoopSeekSec` | U | **Playback** |
| 42 | A–B loop (set A, set B, clear) | dock loop row | yes | `abStartSec/abEndSec/abLoop` (local) | same | U | **Playback** |

### 2.5 Practice

| # | Feature | Lives in | Functional | State | Deps | Lvl | Block |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 43 | Practice mode radio off/dictation/shadowing | dock practice row | yes | 2 preference booleans projected to 1 enum | — | U | **QuickActions** |
| 44 | Dictation input + check + reveal | overlay `.study-dictation` | yes | `dictationInput/Result/Revealed` | `evaluateVideoCoreDictation` | F | **Dictation** |
| 45 | Shadowing rig (record / stop / replay / discard / playback) | overlay `.study-shadowing` | yes | `MediaRecorder`, 60 s cap | `getUserMedia` | F | **Shadowing** |
| 46 | Shadowing suggestion card (≥3 replays) | overlay | yes | `replaySignal` | `shouldSuggestVideoCoreShadowing` | C | **Shadowing** |
| 47 | Comprehension rescue card (loop the scene) | overlay | yes | `comprehensionSignal` | `videoCoreRescueScene` | C | **Listening** |
| 48 | Timing-repair card + drift tracking | overlay | yes | `timingSignal`, `driftTracking` | `videoCoreTimingDrift` | C | **Subtitles** |

### 2.6 Mining / Anki

| # | Feature | Lives in | Functional | State | Deps | Lvl | Block |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 49 | Card draft (kind/term/reading/meaning/sentence/translation/deck) | `VideoCoreMiningPanel` | yes | `draft` | `videoCoreMining` | F | **CardEditor** |
| 50 | Deck datalist from Anki | same | yes | `decks` | `window.api.ankiStatus` | C | **CardEditor** |
| 51 | Screenshot capture with burned cue | same, `captureFrame` | yes | canvas → base64 | — | U | **Screenshot** |
| 52 | Cue audio capture | same → `cueAudioCapture` | yes | `MediaRecorder` off element | — | U | **CardEditor** |
| 53 | Video clip cut (ffmpeg, main) | same | yes | — | `window.api.extractVideoClip` | U | **CardEditor** |
| 54 | Asset previews (img/audio/video) | same | yes | base64 data URIs | — | C | **CardPreview** |
| 55 | Mine → Anki | same | yes | — | `window.api.ankiMineNote` | F | **CardEditor** |
| 56 | Already-mined notice | same | yes | history lookup | `findMinedCueEntry` | C | **CardPreview** |
| 57 | Mining history (last 5) + Undo | same | yes | `localStorage` history key | `window.api.ankiDeleteNotes` | C | **MiningQueue** |
| 58 | Mine-current-line shortcut | overlay → `mineSignal` | yes | counter | command 11 | U | **QuickActions** |
| 59 | Collapse mining panel | same, `expanded` | yes | local | — | U | **CardEditor** |

### 2.7 Reachable from the player but owned elsewhere

| # | Feature | Lives in | Note |
| --- | --- | --- | --- |
| 60 | Library / media selection | `MediaWorkspaceHost` library segment, `LibraryView` | separate segment, not composable with the player today |
| 61 | Study readiness | `SeanimeStudyLibraryPanel` | host segment |
| 62 | Review (watch-loop) | `SeanimeWatchLoopPanel` | host segment; **the review card surface already exists** |
| 63 | Command palette | `renderer/components/CommandPalette.tsx`, 307 ln | app-wide; has no player/workspace commands yet |
| 64 | Keyboard shortcuts | `renderer/keyboardShortcuts.ts` — 14 `video.*` rows | 13 registered by the overlay, `video.resumeLast` by the shell |
| 65 | Pop-out windows | `App.tsx` `?popout=<section>` + `POPOUT_LABEL_KEYS` | a real mechanism, **no player/block section uses it** |
| 66 | Mini mode | `renderer/miniMode.ts`, `MiniShell.tsx` | app-level, not a player mini-player |
| 67 | OCR | `MangaOcrOverlay`, `BookOcrPanel`, `main/screenOcr.ts` | **not in the video player at all** |
| 68 | Notes / bookmarks | `renderer/bookmarks.ts`, `NotebookView` | **not in the video player at all** |
| 69 | Statistics | `renderer/stats.ts` | player writes to it; renders nowhere in the player |
| 70 | MAL / AniList metadata | `playbackInfo.media`, `seanimeLibrary` | consumed for titles/ids only |

**Honest gaps.** The prompt's block list includes Notes, Bookmarks, OCR, Playlist,
Media Information, Pronunciation and Waveform. Of these, only Pronunciation-adjacent
audio capture exists (shadowing recording, with **no** waveform and **no** comparison
scoring). Notes, Bookmarks and OCR exist in the app but have never been wired to the
player. Playlist and Waveform do not exist. These will be registered as blocks with
honest states rather than shipped as decorative placeholders — see §7.

### 2.8 Storage keys in play

| Key | Owner | Contents |
| --- | --- | --- |
| `jp-media-player-preferences-v1` | overlay | the 18 `VideoCoreStudyPreferences` keys |
| `jp-video-core-resume-v1` | `ResumeTracker` | per-file resume positions, cap 100 |
| `VIDEO_CORE_MINING_HISTORY_KEY` | mining panel | mined-card history |
| `TRANSCODE_MEMO_STORAGE_KEY` | slice | paths known undecodable |
| `DIRECTSTREAM_OPEN_GENERATION_STORAGE_KEY` | slice | open-generation counter |

The workspace layout will get its **own** key. Preferences are not moving.

---

## 3. Proposed Study Block registry

One definition shape, one registry module, blocks added without touching the engine.

```ts
type StudyBlockId =
  | 'video' | 'playback' | 'subtitles' | 'subtitleTrack' | 'audioTrack'
  | 'transcript' | 'dictionary' | 'grammar' | 'translation'
  | 'aiWorkspace' | 'sentenceAnalysis'
  | 'cardPreview' | 'cardEditor' | 'miningQueue' | 'review'
  | 'shadowing' | 'dictation' | 'listening' | 'pronunciation' | 'waveform'
  | 'notes' | 'bookmarks' | 'ocr'
  | 'mediaInfo' | 'playlist' | 'library' | 'screenshot' | 'statistics'
  | 'studyHud' | 'quickActions' | 'commandPalette';

type StudyBlockDefinition = {
  id: StudyBlockId;
  titleKey: string;                       // i18n key, resolved at render (CLAUDE.md rule 7)
  category: 'focus' | 'context' | 'utility' | 'configuration';
  supportedSizes: BlockSize[];            // 'xs'|'s'|'m'|'l'|'xl'|'auto'
  supportedPlacements: BlockPlacement[];  // center|left|right|bottom|floating|overlay|detached
  canPin: boolean; canAutoHide: boolean; canDetach: boolean;
  minimumSize?: { width: number; height: number };
  /** Honest capability state — nothing renders as a fake panel. */
  availability: 'implemented' | 'app-owned' | 'planned';
};
```

`availability: 'app-owned'` means the feature is real but lives outside the player
(Notes, Bookmarks, OCR, Library, Statistics); the block routes to the owning surface
instead of re-implementing it. `'planned'` (Playlist, Waveform, Pronunciation scoring)
is registered so layouts can name it, and is **not offered in the block library** until
implemented — a hidden definition, not a dead button.

## 4. Proposed workspace state model

```ts
type BlockSize      = 'xs' | 's' | 'm' | 'l' | 'xl' | 'auto';
type BlockPlacement = 'center' | 'left' | 'right' | 'bottom'
                    | 'floating' | 'overlay' | 'detached';
type BlockPresence  = 'hidden' | 'contextual' | 'collapsed' | 'compact'
                    | 'expanded' | 'fullscreen';

type WorkspaceBlockInstance = {
  blockId: StudyBlockId;
  placement: BlockPlacement;
  size: BlockSize;
  presence: BlockPresence;
  pinned: boolean;
  autoHide: boolean;
  order: number;                 // within its dock
  /** Present only while a contextual block is temporarily open. */
  temporary?: { openedBy: ContextualTrigger; sinceMs: number };
  detached?: { windowId: string; displayHint?: 'primary' | 'secondary' };
};

type ContextualTrigger =
  | 'word-click' | 'grammar-click' | 'sentence-select' | 'mine'
  | 'practice-start' | 'recording-done' | 'screenshot' | 'manual';

type ContextualRule = {
  on: ContextualTrigger;
  open: StudyBlockId;
  /** Blocks that must recede while this one is up. */
  recede?: StudyBlockId[];
  preferred: BlockPlacement[];   // tried in order; first non-disruptive wins
  size?: BlockSize;
};

type ResponsiveRule = {
  maxWidth?: number; minWidth?: number;
  /** Docks that collapse to bottom sheets / tabs at this width. */
  collapse?: BlockPlacement[];
  overlayInsteadOfDock?: boolean;
  iconsOnly?: boolean;
};

type StudyWorkspace = {
  id: string; name: string; icon?: string;
  mode: 'watch'|'transcript'|'mining'|'practice'|'review'|'listening'|'immersion'|'custom';
  practiceMode?: 'shadowing'|'listening'|'dictation'|'repetition'|'pronunciation'|'comprehension';
  primaryBlockId: StudyBlockId;
  blocks: WorkspaceBlockInstance[];
  contextualRules: ContextualRule[];
  responsiveRules: ResponsiveRule[];
  builtIn: boolean;
};

type WorkspaceDocument = {
  schemaVersion: number;         // starts at 1, migrations keyed off it
  activeWorkspaceId: string;
  workspaces: StudyWorkspace[];  // built-ins are re-seeded, user copies persisted
  customizing: boolean;
};
```

**Resolution order** (prompt §11), implemented as one pure function
`resolveLayout(workspace, context, viewport)`:

1. temporary task-critical behaviour (a practice mode that is running now);
2. explicit user pin;
3. saved workspace layout;
4. preset defaults;
5. responsive fallback.

Semantic only — no pixel coordinates are persisted, so a layout saved on an ultrawide
restores correctly on a laptop.

## 5. Migration plan

| Phase | Change | Preservation rule |
| --- | --- | --- |
| 1 | This document + baseline test run | no source edits |
| 2 | `shared/studyWorkspace.ts` — types, reducer, persistence, migration, repair | new file only; nothing imports it yet |
| 3 | `media/studyBlockRegistry.ts` + `StudyWorkspaceProvider.tsx` | provider mounted around the existing overlay, rendering **unchanged** children |
| 4 | Extract the dock into `StudyBottomBar` + tool surfaces; extract cue layer, practice layer, suggestion layer into block components | every control keeps its exact handler; `data-study-*` hooks preserved for the harnesses |
| 5 | Contextual engine + 7 presets; transcript hierarchy rewrite | transcript keeps search/follow/translate/reading/destination |
| 6 | Customize mode, block menus, non-drag move, detach via existing `?popout=` mechanism, export/import | customize is opt-in; playback never drags |
| 7 | Motion, a11y, perf, contract tests updated | `videoStudyLayout.test.ts` rewritten against the new contract, not deleted |

**Hard preservation list** (checked at every phase): 13 command registrations, 18
preference keys and their storage key, subtitle delay behaviour, external-subtitle
mount, sync-offset correction, transcode fallback, directstream watchdogs, resume +
watch-time ledger, mining draft/assets/history/undo, Whisper pipeline, the
`data-study-action`/`data-study-pref` attributes the harnesses assert on.

## 6. Files expected to change

**New**
```
src/shared/studyWorkspace.ts               model, reducer, persistence, migration
src/shared/__tests__/studyWorkspace.test.ts
src/media/studyBlockRegistry.ts            block definitions
src/media/StudyWorkspaceProvider.tsx       context + hooks
src/media/StudyBottomBar.tsx               5-category adaptive bar
src/media/blocks/*.tsx                     one wrapper per extracted block
src/media/StudyWorkspaceCustomizer.tsx     customize mode chrome
src/media/studyWorkspace.css               liquid layer, motion, docks
docs/ACTIVE/LIQUID_WORKSPACE_AUDIT.md    this file
```

**Modified**
```
src/media/VideoCoreStudyOverlay.tsx        becomes a composition root, not a monolith
src/media/VideoCoreTranscriptPanel.tsx     hierarchy + size states
src/media/VideoCoreMiningPanel.tsx         size states, no self-anchoring
src/media/VideoCoreGrammarPanel.tsx        block contract
src/media/mediaWorkspace.css               panel anchoring replaced by workspace layer
src/renderer/keyboardShortcuts.ts          new workspace.* command rows
src/renderer/components/CommandPalette.tsx workspace/block commands
src/shared/i18n/catalogs/{en,ja,zh,ru}.ts  new chrome strings, all four languages
src/renderer/__tests__/videoStudyLayout.test.ts   contract updated
```

**Explicitly not touched**: `StudyPlayerSlice.tsx` open protocol, `MediaSurfaceShell`,
`seanimeSocketPool`, `directstreamOpen*`, `mediastreamTranscode`, anything under
`vendor/` or `patches/`.

## 7. Risk assessment

| # | Risk | Severity | Mitigation |
| --- | --- | --- | --- |
| R1 | Refactoring a 2454-line file drops a wired handler | **high** | extract by move, never by retype; per-phase grep that all 13 `registerCommandHandler` ids and all 18 preference keys still appear |
| R2 | Unmounting `<VideoCore>` kills the directstream | **high** | the slice's existing rule stands: the player is never conditionally mounted, only CSS-hidden. Workspace changes must not gate its mount |
| R3 | Heavy blocks mounted while hidden cost playback | med | `presence: 'hidden'` unmounts; `collapsed`/`compact` keep state via the reducer, not via a mounted subtree |
| R4 | Saved layout referencing a removed block breaks the screen | med | `repairWorkspace()` drops unknown ids, re-seeds required blocks, falls back to the Watch preset; never renders empty |
| R5 | Harness selectors break | med | keep every `data-study-action` / `data-study-pref` attribute on the same control |
| R6 | i18n regression (memory: a new catalog module is invisible until wired) | med | add keys to the **already-wired** `catalogs/en.ts` etc.; no new catalog module |
| R7 | Two mounted surfaces (host + Blanc) share one `#media-workspace` id | med | workspace state is per-surface (React context), never a global singleton; persistence key includes the surface kind |
| R8 | Detached windows desync | med | detach reuses `?popout=` and the existing event bus; a detached block that cannot sync closes back into its dock rather than showing stale data |
| R9 | `tsc --noEmit` noise (327 pre-existing errors) | low | prove "no new errors" by set-difference on file+message, per project memory |

## 8. Testing strategy

1. **Baseline first** — record the current vitest result *before* editing, so
   "known-failing" is a measurement rather than a claim.
2. **Pure model** — `studyWorkspace.test.ts`: reducer transitions, resolution order,
   contextual least-disruption choice, responsive collapse, schema migration, repair of
   a corrupted document, export/import round-trip.
3. **Preservation** — a source-level contract test (same technique as
   `videoStudyLayout.test.ts`, which exists because the overlay cannot be imported into
   jsdom) asserting: all 13 command ids registered, all 18 preference keys present, all
   `data-study-action`/`data-study-pref` hooks present, `<VideoCore>` unconditionally
   mounted.
4. **Layout contract** — rewritten `videoStudyLayout.test.ts`: Watch Mode declares no
   permanent side column; contextual placements are declared in CSS custom properties;
   the subtitle band never overlaps a dock.
5. **i18n gate** — `node tools/i18n-check.cjs` exit 0, and the catalog-hygiene block in
   `src/shared/__tests__/i18n.test.ts`.
6. **Live verification** — through the app's MCP server / debug bridge only (never
   mouse-and-keyboard control of this app), per project rules.

---

*Deliverables 31.1–31.8 complete. Implementation proceeds from Phase 2.*
