> **Coordinator note (2026-10-15):** Codex wrote this plan in a read-only pass, using gpt-6.1-sol on xhigh. It follows the repo rule "changes inside `src/` only" (AGENTS.md/CLAUDE.md). For this release, the owner has directed work on the headless e2e harness (`tools/e2e/**`) and on the Chrome extension (`extension/`). So:
>
> - The packages **do** update their e2e flows under `tools/e2e/flows/`.
> - P6 edits the extension source in `extension/` directly. It does not create a parallel `src/main/study-extension/` copy.
>
> Root configs (forge, vite, tsconfig) stay off-limits. P0 starts only after the Snip/OCR-router agent has committed, because both touch `src/shared/studyLang.ts`.

# Gum multi-language plan for v1

**Status:** Read-only design audit, 15 October 2026. No files were modified, and no installs, git writes, or tests were run.

**Release outcome:** A learner can study Japanese, Chinese, and Russian in the same Gum profile. Switching the active language changes defaults for new work; existing content, ongoing sessions, and background jobs retain their own language.

V1 supports any nonempty combination of the three implemented study languages. Adding further languages remains capability work: dictionaries, segmentation, OCR, speech, grammar, and level scales must support them first.

## 1. Data model

### Study set

Add a pure shared model in `src/shared/studySet.ts`:

```ts
interface StudySetV1 {
  version: 1;
  languages: StudyLang[]; // unique, ordered, nonempty
  active: StudyLang;     // always belongs to languages
  revision: number;     // assigned by main
}

type StudyLanguageFilter = 'all' | StudyLang;
```

Keep these concepts separate:

| Concept | Purpose |
|---|---|
| Studied languages | Switcher membership, setup assets, default study queues, reminders |
| Active language | Default for new work and ambiguous content |
| Item language | Language of a card, book, capture, track, conversation, or job |
| View filter | Which languages a particular collection displays |
| UI language | Language of application controls and explanations |
| Translation target | Language into which particular content is translated |
| Chinese script | Preferred Chinese display script; Chinese remains one study language |

The current study-language union already contains all three languages (`src/shared/levelScale.ts:13`). A study set does not require duplicating profiles, decks, or the desktop workspace.

### Storage and migration

| Storage | V1 treatment |
|---|---|
| New `gum-study-set-v1` | Renderer cache of the committed study set |
| Existing `jp-study-dict-lang` | Compatibility mirror of `active` |
| Existing `jp-study-zh-script` | Retain the Chinese script preference |
| Existing main `study-language.json` | Extend to a versioned study set plus script and revision |
| New `gum-study-view-filters-v1` | Filters keyed by stable view identifier |
| New `gum-whisper-tiers-v1` | Preferred Whisper tier by study language |
| New `gum-study-goals-v1` | Shared or per-language goal configuration |

Today the renderer reads one key (`src/renderer/studyEnvironment.ts:28,43`), and main persists only `{ lang, script }` (`src/main/studyLanguage.ts:24,26`).

Migration order:

1. Use a valid versioned main record if one exists.
2. Otherwise import a valid versioned renderer record.
3. Otherwise migrate the valid legacy renderer language into `{ languages: [lang], active: lang }`.
4. If renderer storage has no choice, use main’s legacy language; otherwise use Japanese.
5. Preserve the Chinese script preference.
6. Write the new record before marking migration complete. Keep legacy keys for compatibility and recovery.

Normalize unknown language values, remove duplicates, and repair an invalid active language to the first selected language. Never infer additional enrollment from old cards or installed assets.

Existing language partitions remain intact:

- Known words: `jp-word-knowledge-{lang}` and durable `word-knowledge-{lang}` (`src/renderer/knownWords.ts:34,186`).
- Statistics: `jp-study-stats-v1-{lang}` (`src/renderer/stats.ts:27`).
- Saved-word migration already accepts a language (`src/renderer/savedWords.ts:97`).
- Unsuffixed legacy knowledge and statistics remain Japanese, matching existing migrations (`src/renderer/knownWords.ts:68`; `src/renderer/stats.ts:33`).

Do not redetect or relabel historical cards during this migration. An existing card without `studyLang` remains Japanese, as its documented format requires (`src/renderer/studyEnvironment.ts:84`).

Register every new key in settings reset, backup, and transfer handling. Today those paths explicitly enumerate the single language key (`src/renderer/storage/settingsCatalog.ts:215`; `src/renderer/storage/settingsTransfer.ts:529`).

### API and events

Retain compatibility helpers:

```ts
getStudyLang(): StudyLang; // active-language alias
setStudyLang(lang: StudyLang): Promise<void>; // change active membership only
```

Add:

```ts
getStudySet(): StudySetV1;
getStudiedLangs(): readonly StudyLang[];
setActiveStudyLang(lang: StudyLang): Promise<void>;
addStudyLanguage(lang: StudyLang): Promise<void>;
removeStudyLanguage(lang: StudyLang, replacement?: StudyLang): Promise<void>;
useStudySet(): StudySetV1;
```

Adding a language is explicit. Changing a dictionary filter or opening foreign-language content must not silently enroll that language or change the active language.

Events:

| Event | Payload and behavior |
|---|---|
| New `study-set-changed` | Committed snapshot, previous snapshot, and changed fields |
| Existing `study-lang-changed` | Active language only; emit when `active` actually changes |
| Existing `study-zh-script-changed` | Preserve script notifications |
| Knowledge changes | Add language to the event payload |
| Statistics changes | Add language to activity deltas |
| View-filter changes | Include view ID and its filter; never emit an active-language change |

The present setter emits on every call and replaces the Whisper tier when the language changes (`src/renderer/studyEnvironment.ts:125`). Switching languages must preserve each language’s chosen tier.

### Main-process synchronization

Keep `syncStudyLangToMain` as the synchronization entry point, but make synchronization acknowledged and versioned.

Currently preload fires an unawaited invocation, and the public API returns `void` (`src/preload.ts:3914`; `src/renderer/window.d.ts:2393`). Extend the bridge with:

- Reading the committed state.
- Committing an update with an expected revision.
- Subscribing to committed changes.
- Returning the accepted snapshot or a revision conflict.

Main serializes commits, assigns revisions, persists atomically, and broadcasts to all renderers. Renderers update their local cache and legacy mirror from the committed result before dispatching local events.

On conflict, reapply the intended operation—add, remove, or activate—to the newest state. Do not retry a stale full snapshot unchanged.

`syncStudyLangToMain` must:

1. Reconcile migration at initial boot.
2. Receive main’s committed snapshot in secondary, Blanc, and companion windows.
3. Avoid allowing a stale opening window to overwrite a newer selection.
4. Suppress synchronization echo loops.
5. Surface failed persistence instead of presenting an uncommitted selection as saved.

Existing boot calls are in `src/renderer/main.tsx:308` and `src/renderer/blancMain.tsx:138`. Main must still have a usable persisted default before those windows start.

Keep `getMainStudyLang()` as the active-language compatibility getter; add a studied-language getter. Background work must receive its own resolved language instead of repeatedly consulting either getter.

### Item language

Use existing fields wherever possible:

- Cards: `studyLang`.
- Media: `MediaItem.lang`.
- Subtitle tracks: their language tags.
- Conversations and captures: persisted language.
- Requests and queued jobs: their existing `lang` or `studyLang` field, made explicit at creation.

Add a canonical, editable `LibraryItem.contentLang?: string`, preserving BCP-47 tags and unsupported source languages such as English. Update `libraryItemLangTag()` to prefer it.

Books currently have no canonical language field; the helper reads provider, inbox, and level metadata (`src/shared/libraryLevel.ts:25`). Both library metadata unions omit Russian (`src/shared/types.ts:630,646`).

Store language provenance where a default or detection was used: user choice, metadata, detection, or active fallback. That makes correction possible without rerunning detection during every render.

### What remains single-active

The following still need one language at a time:

- A new blank conversation or writing exercise.
- A language-specific game round or grammar exercise.
- A new capture or recording without source metadata.
- A particular OCR recognizer or transcription job.
- A default dictionary interpretation for ambiguous Han text.
- One language’s proficiency scale and placement assessment.

Each operation snapshots that language when it starts. A global switch affects subsequent work.

This keeps Han ambiguity predictable and avoids trying to combine JLPT, HSK, and CEFR into a single proficiency level.

## 2. Language resolution rules

### Resolution order

Use one shared resolver and thin adapters for each source:

1. **Explicit operation override:** a user-selected source language.
2. **Persisted item language:** card, book, capture, conversation, or selected track.
3. **Source context:** declared page language, import mapping, or enclosing content language.
4. **Text detection:** when the content is untagged.
5. **Captured active language:** when the remaining evidence is ambiguous.

Resolve once when importing, capturing, or creating a request. Persist the result. Correcting an item’s language invalidates its language-dependent caches.

For selections inside a known book or track, inherit the source language. A selection-specific override can handle a foreign-language quotation.

An existing card with missing `studyLang` uses the legacy Japanese rule before text detection. New cards should store their language explicitly, including Japanese.

### Text detection

Replace the current Han fallback in `src/shared/studyLang.ts:121` with these rules:

| Evidence | Resolution |
|---|---|
| Kana in the relevant text span | Japanese |
| Cyrillic in the relevant span | Russian |
| Han-only text with vetted simplified-Chinese-only characters/forms | Chinese |
| Han-only text with vetted kokuji or Japanese-only forms | Japanese |
| Other Han-only text | Supplied source context, otherwise active language |
| No decisive supported-language script | Context or active fallback for a study operation |
| Empty text | No content operation |

Examples for tests:

- `食べる` → Japanese.
- `книга` → Russian.
- `这` → Chinese.
- `峠` → Japanese.
- `猫` → context or active language.
- `学校`, `日本`, and `学` must remain ambiguous where shared orthography provides no distinction.

Use small, reviewed character/form sets. “Changed by a Simplified conversion” is insufficient: forms such as `学` are shared with Japanese. Conflicting signals in mixed text require span-level resolution or a visible operation language choice.

For raw text, “otherwise active” includes Russian. Do not retain the current special case that turns ambiguous Han into Japanese whenever active is not Chinese (`src/shared/studyLang.ts:125`).

Do not use dictionary success, installed dictionaries, or the studied-language list as proof of content language.

Preserve English and unknown classifications in reader/import metadata. Unsupported content must not become Japanese merely because a normalizer defaults to Japanese.

### Filters

Collection views get independent **All languages / 日本語 / 中文 / Русский** filters:

- Decks and SRS.
- Known words and saved words.
- Statistics and calendar.
- Library and media collections.
- Grammar collections, game materials, and resource lists.

“All languages” displays language-tagged rows and totals. Operations requiring one language ask for or derive that language from their selected item.

Persist filters by view. A global switch must not change an open reader, selected track, pinned filter, or running review session.

Retained data from a removed language remains available through explicit filters and combined history. Default work queues and reminders use the current studied set.

## 3. Consumer audit

The checkout contains **174 direct calls across 81 non-test files**, plus six lazy callback references. Five callback files are additional to those 81.

Every call or assumption below has exactly one classification:

- **A:** Use the item, source, partition, or operation’s explicit language.
- **B:** Detect from text when no explicit language exists.
- **C:** Use an independent per-view filter.
- **D:** Retain the active language as a default or configuration state.

Paths below are relative to `src/`. Comma-separated line numbers identify separate occurrences in the same file. Package ownership is defined in section 7. **X** denotes the separate Snip/OCR work already in progress.

### Direct calls and lazy callbacks

| File:line | Class | Change | Owner |
|---|---|---|---|
| `renderer/studyEnvironment.ts:80,115,127` | D | Retain active defaults; synchronize the full study set and stop resetting Whisper preferences. | P0 |
| `renderer/studyEnvironment.ts:103` | B | Use the shared text resolver and its explicit fallback. | P0 |
| `renderer/studyEnvironment.ts:144,148,152` | A | Require a bundle language; add a deduplicated asset union for the study set. | P0 |
| `renderer/useStudyLanguage.ts:27` | D | Keep the active-language hook; add a separate study-set hook. | P0 |
| `renderer/agentToolRegistry.ts:711` | B | Accept explicit tool language; otherwise resolve the term and context. | P7 |
| `renderer/ankiSync.ts:37` | A | Fold language-tagged interval groups into their matching knowledge stores. | P1 |
| `renderer/apkgImport.ts:253,292` | A | Capture import language and use it for level-slot selection and normalization. | P1 |
| `renderer/bookLevelEstimate.ts:64,139,151,176,209,249` | A | Pass each book’s language through estimates, batching, fingerprints, and cache access. | P3 |
| `renderer/bookLevelEstimate.ts:190` | B | Replace independent script heuristics with the shared resolver. | P3 |
| `renderer/cedictMissingPrompt.ts:121,157` | A | Check the Chinese asset requirement when Chinese belongs to the study set. | P2 |
| `renderer/clipboardHistory.ts:283` | B | Resolve language at capture time and retain it in history. | P3 |
| `renderer/companionMine.ts:52,92` | A | Honor the draft’s captured language; detect only when creating an untagged draft. | P3 |
| `renderer/comprehensibility.ts:35` | A | Require the source language and bind knowledge reads to it. | P1 |
| `renderer/data/grammar/practiceFilters.ts:189` | C | Initialize and persist a grammar-view language filter independently. | P7 |
| `renderer/deckLevelEstimate.ts:104,118,145,169` | A | Partition mixed decks by card language and cache one estimate per language. | P1 |
| `renderer/environment/achievements.ts:76` | A | Use the language of the credited activity or streak calculation. | P5 |
| `renderer/flashcardDeck.ts:1737,1752,1763,1781,1790,1822,1825,1875` | A | Use card language for knowledge, sentence nudges, deferred work, and undo; remove active-language exclusion gates. | P1 |
| `renderer/games/contentStore.ts:43,64,103,137,203` | A | Bind normalization, readings, sentence pieces, and knowledge checks to session language. | P7 |
| `renderer/games/contentStore.ts:147,179,291,364` | C | Build pools and availability counts from the game view’s selected language. | P7 |
| `renderer/inboxEnrich.ts:30` | A | Profile the article in its own language. | P3 |
| `renderer/knownWords.ts:34,159,160,170,186,271,285,327` | A | Replace the active-only cache and APIs with explicit language partitions. | P1 |
| `renderer/levelService.ts:35` | D | Keep the active-language convenience getter; calculation callers pass language explicitly. | P1 |
| `renderer/mediaStudyWorkflow.ts:122,142,237` | A | Carry source language through corpus extraction, configured lists, and level estimation. | P4 |
| `renderer/mineTarget.ts:94` | B | Resolve the word plus source context before dictionary lookup. | P3 |
| `renderer/savedWords.ts:38,97,145,158` | A | Pass language through migration, starring, duplicate checks, and removal. | P1 |
| `renderer/savedWords.ts:117,131` | C | Accept a language filter and preserve language on returned rows. | P1 |
| `renderer/stats.ts:27` | A | Make partition selection explicit for every recorded activity. | P5 |
| `renderer/storage/settingsTransfer.ts:529,736` | D | Export, preview, and restore study-set configuration instead of one language. | P2 |
| `renderer/studyBackgroundJobs.ts:132,151,333,346` | A | Preserve request/page language and bind snapshot/annotation knowledge reads to it. | P6 |
| `renderer/studyBackgroundJobs.ts:428` | B | Resolve page language without gating detection on the active language. | P6 |
| `renderer/studyCoachAgentHandlers.ts:60,176,381` | C | Accept explicit language scope for deck, knowledge, and grammar collection tools. | P7 |
| `renderer/studyCoachAgentHandlers.ts:134,159,389` | B | Resolve sentence/term language once and bind downstream services to it. | P7 |
| `renderer/studyMining.ts:482,522,626` | A | Preserve resolved request/draft language; store it explicitly on new cards. | P3 |
| `renderer/studyMiningRoutes.ts:129,220` | A | Carry book/import-row language into mining adapters. | P3 |
| `renderer/studyTokens.ts:42,47,171,224,240,245` | A | Require operation language and bind Japanese reading-index access to Japanese knowledge. | P1 |
| `renderer/useUnifiedSearchSession.ts:61` | C | Search subtitle availability for the search scope, expanding All into selected languages. | P4 |
| `renderer/visualNovelMining.ts:111` | A | Preserve game/capture language through mining. | P3 |
| `renderer/vnAiTranslate.ts:60` | A | Prefer the VN capture/game language over redetection against current active state. | P7 |
| `renderer/whisperTranscribePcm.ts:90` | A | Receive the job’s frozen language and resolve a compatible model for it. | P4 |
| `renderer/wordHighlight.ts:74,79` | A | Take the content root’s language and include it in highlight invalidation. | P3 |
| `renderer/wordLookup.ts:253` | B | Centralize script resolution; accept enclosing content language for Han. | P3 |
| `renderer/wiredMechanics/terminalRuntime.ts:53,196` | B | Resolve terminal lookup/mining text and retain the result. | P7 |
| `renderer/wiredMechanics/terminalRuntime.ts:279` | D | Report active language plus studied languages in terminal status. | P7 |
| `renderer/components/anki/DeckWorkbenchAiPanel.tsx:198` | A | Use selected notes’ languages; partition mixed-language AI batches. | P7 |
| `renderer/components/blanc/BlancAiAssist.tsx:124` | A | Receive the analyzed material’s language. | P7 |
| `renderer/components/blanc/BlancCaptureInboxPanel.tsx:49,90,320` | A | Read persisted capture language for lookup, mining, and rendering. | P3 |
| `renderer/components/blanc/BlancDeckPanel.tsx:145` | B | Resolve the new manually entered card once; persist explicit language. | P3 |
| `renderer/components/blanc/BlancDictionaryPanels.tsx:31` | C | Make dictionary language local to the panel. | P3 |
| `renderer/components/blanc/BlancFlowRunner.tsx:433` | A | Render the stored card language, including legacy Japanese cards. | P1 |
| `renderer/components/blanc/BlancMediaPanels.tsx:75` | A | Transcribe the current media item in its selected source language. | P4 |
| `renderer/components/blanc/BlancShell.tsx:780` | B | Resolve command text once through the shared resolver. | P2 |
| `renderer/components/blanc/BlancStudyNativePanels.tsx:1298,1299` | D | Keep active defaults for an empty transcription form; freeze language after source selection. | P4 |
| `renderer/components/blanc/BlancStudySettings.tsx:32` | D | Replace the single choice with study-set management and active selection. | P2 |
| `renderer/components/companion/CardPreview.tsx:82,196` | A | Use draft language consistently for lookup and content tags. | P3 |
| `renderer/components/DictionaryPopup.tsx:161` | B | Preserve explicit source language; otherwise resolve query and context. | P3 |
| `renderer/components/DictionaryResults.tsx:378` *(callback)* | C | Use dictionary query/filter state instead of following global changes. | P3 |
| `renderer/components/discover/YoutubeDiscoveryPanel.tsx:878` | A | Pass the candidate/pre-study source language. | P4 |
| `renderer/components/filesapp/FilesApp.tsx:2578,2605` | A | Label mining results with their recorded source languages. | P3 |
| `renderer/components/filesapp/filesMineChain.ts:75` | A | Resolve each file separately in mixed-language selections. | P3 |
| `renderer/components/grammar/GrammarCurationPanel.tsx:72` | A | Use import-row metadata or an explicit import language. | P7 |
| `renderer/components/grammar/GrammarReviewPanel.tsx:128` *(callback)* | C | Keep the grammar collection filter independent of global active state. | P7 |
| `renderer/components/immersion/ImmersionContent.tsx:247` *(callback)* | C | Use an independent browsing/catalog language scope. | P3 |
| `renderer/components/immersion/ImmersionContent.tsx:481` | B | Use page declarations and shared detection; persist page language. | P3 |
| `renderer/components/immersion/VisualNovelAiAssist.tsx:48` | A | Use the capture/game language for AI requests. | P7 |
| `renderer/components/knownWords/KnownWordsManager.tsx:103` *(callback)* | C | Add independent All/one-language filtering and tagged rows. | P5 |
| `renderer/components/lens/LensAnalysisPanel.tsx:56` | B | Accept capture language; otherwise resolve OCR text before analysis. | P3 |
| `renderer/components/lens/LensReaderPanel.tsx:122` | B | Resolve query with OCR-line context and retain it for every action. | P3 |
| `renderer/components/library/BookOcrPanel.tsx:68` | A | Use canonical book language and require a choice for an unresolved image-only source. | P3 |
| `renderer/components/LockscreenStudy.tsx:47` | A | Derive content tags from the displayed card. | P3 |
| `renderer/components/MangaHandwritingPopup.tsx:98` | A | Receive page/operation language before selecting the recognizer. | P3 |
| `renderer/components/media/gum/GumTitlePage.tsx:165` | A | Describe the item’s source/study-track language. | P4 |
| `renderer/components/media/library/MediaDetailPanel.tsx:443` | A | Pass item language into transcription. | P4 |
| `renderer/components/media/MediaContent.tsx:447,451` | D | Retain active defaults only for a new, unbound operation. | P4 |
| `renderer/components/media/MediaContent.tsx:1528` | A | Translate the selected cue using its track language. | P4 |
| `renderer/components/MiningCataloguePanel.tsx:259,270` | A | Use per-source or per-language mining receipt information. | P3 |
| `renderer/components/music/useMusicMining.ts:83` | A | Use selected lyric language; resolve only untagged lyrics. | P4 |
| `renderer/components/notes/NotesManager.tsx:678` | B | Resolve the correction selection/body and allow an explicit source override. | P7 |
| `renderer/components/notes/NoteViewer.tsx:107` | B | Resolve the correction selection/body instead of using active language. | P7 |
| `renderer/components/onboarding/FirstRunSetup.tsx:107,191` | D | Manage a study set and separate starting language. | P2 |
| `renderer/components/ReaderCollectionPanel.tsx:382` | A | Carry book language into translation and mining. | P3 |
| `renderer/components/sentenceDeck/SentenceDeckDialog.tsx:132` | A | Use selected source-track/request language rather than a mount-time active snapshot. | P4 |
| `renderer/components/SentenceTranslatePopup.tsx:67` | B | Accept source context; otherwise resolve the selected text. | P3 |
| `renderer/components/settings/pages/StudyLanguageSection.tsx:31` *(callback)* | D | Manage enrollment, active language, script, and all selected-language asset states. | P2 |
| `renderer/components/settings/pages/TranslatorDefaultsCard.tsx:56` | D | Retain active language as the default source for a new translation. | P2 |
| `renderer/components/speak/ConversationPartner.tsx:138` | D | Keep active as the new-conversation default; expose an explicit session language choice. | P7 |
| `renderer/components/SystemDictOverlay.tsx:87,106` | B | Resolve once with source context and reuse for dictionary and mining. | P3 |
| `renderer/components/translate/TranslateContent.tsx:167` | D | Retain active as the initial source default. | P7 |
| `renderer/components/translate/TranslateContent.tsx:433` | A | Mine using the translation operation’s explicit resolved source. | P7 |
| `renderer/views/DictionaryView.tsx:38` | C | Keep dictionary language/filter separate from active language. | P3 |
| `renderer/views/MangaReader.tsx:439,440,2563` | A | Use book/page language for OCR availability, errors, and mining. | P3 |
| `renderer/views/YouTubePlaylistsView.tsx:140` | A | Opening/transcribing an item must not change the global language. | P4 |
| `renderer/views/YouTubePlaylistsView.tsx:410` | D | Default a new playlist to active, then persist its language. | P4 |
| `renderer/views/YouTubePlaylistsView.tsx:442` | A | Download captions using each playlist/video’s stored language. | P4 |
| `renderer/widgets/aeroStudyGadgets.tsx:173` | A | Use card language; missing historical card language means Japanese. | P2 |
| `renderer/widgets/study.tsx:250` | A | Preserve the chosen saved row’s language in the word-of-the-day widget. | P2 |
| `media/StudyPlayerSlice.tsx:821` | A | Seed subtitle preference from media/session language. | P4 |
| `media/VideoCoreMiningPanel.tsx:237,570` | A | Use selected source-track language, with detection for untagged cues. | P4 |
| `media/VideoCoreStudyOverlay.tsx:508,514,689,780,1313,1388,1389,1646,2441` | A | Use player/track/job language for models, analysis, selection, labels, fonts, and translation. | P4 |

### Other single-language assumptions found

| File:line | Class | Change | Owner |
|---|---|---|---|---|
| `shared/studyLang.ts:121` | B | Implement the common Han heuristics and contextual fallback. | P0 |
| `shared/profileRules.ts:213` | B | Stop treating every Han-only expression as Chinese. | P0 |
| `shared/profileRules.ts:115` | A | Preserve language-aware profile routing; resolve content language before routing. | P0 |
| `shared/inboxMeta.ts:8,31,85` | B | Add Russian and contextual Han resolution to article classification. | P0 |
| `shared/pageLevelDetect.ts:26` | B | Detect supported page language independently of active language; support Russian. | P0 |
| `shared/types.ts:630,646` | A | Include Russian in item metadata and add canonical book content language. | P0 |
| `shared/libraryLevel.ts:10,31,42` | A | Include Russian, prefer canonical book language, and map CEFR through Russian slots. | P0 |
| `shared/bookOcrIpc.ts:134` | A | Resolve canonical book language before OCR fallback. | P0 |
| `shared/readingLens.ts:247` | B | Stop assigning Japanese to every untagged adopted text capture. | P0 |
| `preload.ts:3914` | D | Add acknowledged study-set synchronization and change notifications. | P0 |
| `renderer/window.d.ts:2393` | D | Declare the versioned bridge and language-bearing request contracts. | P0 |
| `main/studyLanguage.ts:26,57,73,101` | D | Persist and validate the study set while preserving active getters. | P0 |
| `renderer/main.tsx:308` | D | Reconcile main state before language-dependent startup work. | P0 |
| `renderer/blancMain.tsx:138` | D | Hydrate committed state rather than pushing a stale local default. | P0 |
| `renderer/knownWords.ts:40,252,364,368,432,451,553,560` | A | Partition caches, pending writes, reads, mutations, counts, and events by language. | P1 |
| `renderer/firstRunSeed.ts:91,97,111,121` | A | Bind seed and undo knowledge operations to their supplied language. | P1 |
| `renderer/levelLists.ts:18,64,85,283` | A | Store list language, migrate from slot/kind, and use language-specific knowledge keys. | P1 |
| `renderer/levelService.ts:109,115` | A | Filter custom lists and read counts for the requested language. | P1 |
| `shared/anki.ts:310,336` | A | Preserve language and attribution before interval aggregation. | P0 |
| `main/anki/intervals.ts:665,699,721,737` | A | Retain note-language mapping and aggregate/optimistically cache by language plus expression. | P1 |
| `main/anki/index.ts:212` | A | Carry resolved card language into audio and created-note interval evidence. | P1 |
| `renderer/flashcardDeck.ts:1900,2149,2173,2597,2703` | A | Include language in review undo/logging and preserve session budgets across switches. | P1 |
| `renderer/components/blanc/BlancFlowRunner.tsx:148` | C | Build Flow’s queue from an explicit language scope. | P1 |
| `renderer/components/blanc/blancFlow.ts:76` | A | Apply new-card limits to the captured session pool. | P1 |
| `renderer/aeroMechanics/useAeroDeck.ts:36` | C | Expose a language-scoped deck snapshot. | P1 |
| `renderer/firstRunSetup.ts:40` | A | Persist placement/seed state by selected language. | P2 |
| `renderer/components/onboarding/FirstRunSetup.tsx:161,245,434` | A | Seed and display download readiness for every selected language. | P2 |
| `renderer/components/onboarding/firstRunDownloads.ts:17,24,89` | A | Build per-language rows while deduplicating shared download jobs. | P2 |
| `shared/assetRegistry.ts:878` | A | Preserve per-language starter definitions and expose study-set union planning. | P0 |
| `renderer/storage/settingsCatalog.ts:215,905` | D | Register study-set keys and configuration reset behavior. | P2 |
| `renderer/components/settings/settingsRegistry.ts:683,822` | D | Index study-set, active-language, and per-language asset settings. | P2 |
| `renderer/components/DesktopShell.tsx:4006` | D | Mount the shared active-language switcher in the existing tray. | P2 |
| `renderer/components/blanc/BlancShell.tsx:872,942` | D | Add a study-language chip distinct from the existing UI-language control. | P2 |
| `renderer/keyboardShortcuts.ts:628,907` | D | Preserve existing bindings; add the unassigned switcher binding. | P2 |
| `renderer/views/DictionaryView.tsx:113` | C | Remove global language mutation from dictionary filter changes. | P3 |
| `renderer/components/blanc/BlancDictionaryPanels.tsx:57` | C | Remove global mutation from Blanc dictionary filtering. | P3 |
| `renderer/components/DictionaryResults.tsx:538` | C | Stop replacing an explicit query language on active-language changes. | P3 |
| `renderer/components/blanc/blancCaptureInbox.ts:15,161` | B | Resolve and store language when capture text enters the inbox. | P3 |
| `renderer/bookProfiles.ts:178,189,222` | A | Use book language for profiling and bind scoring to `profile.lang` knowledge. | P3 |
| `renderer/views/NovelReader.tsx:168,1217,1921,1951` | A | Use book language consistently for translation, highlighting, statistics reads, and writes. | P3 |
| `renderer/views/MangaReader.tsx:1223` | A | Credit reading to the book/page language. | P3 |
| `renderer/components/immersion/ImmersionContent.tsx:339` | A | Credit reading to the page’s persisted language. | P3 |
| `renderer/visualNovelStudyTime.ts:21` | A | Include VN session language in reading activity. | P3 |
| `shared/bookOcr.ts:153,186` | A | Export source XHTML with the book language instead of hard-coded Japanese. | P3 |
| `main/bookOcrJob.ts:80` | A | Freeze the resolved book/request language for the entire job. | P3 |
| `main/mangaOcr.ts:929,1234` | A | Pass page/job language into crop and region recognition. | P3 |
| `main/readingLens.ts:404,678` | B | Preserve declared capture language; detect clipboard text using the common resolver. | P3 |
| `main/mining.ts:669,2182` | B | Use common contextual text/list detection. | P3 |
| `main/mining.ts:1036,1052` | A | Provision frequency assets for each studied language, asynchronously. | P3 |
| `renderer/components/media/MediaContent.tsx:675` | A | Stop global switches from changing an operation already bound to media. | P4 |
| `renderer/whisperSettings.ts:14,58` | A | Store model preference by operation language; share installed model files. | P4 |
| `media/StudyPlayerSlice.tsx:664` | A | Record watch activity with the player session’s language. | P4 |
| `media/VideoCoreMiningPanel.tsx:604` | A | Attribute mining activity to the created card’s language. | P4 |
| `media/VideoCoreStudyOverlay.tsx:869,875,932` | A | Attribute study time and studied lines to the source track. | P4 |
| `media/StudyBottomBar.tsx:309` | A | Use the player’s language for source controls and labels. | P4 |
| `media/VideoCoreTranscriptPanel.tsx:549,550` | A | Derive Chinese script tags without requiring Chinese to be active. | P4 |
| `renderer/components/SubtitleCueLine.tsx:47,281,282,283` | A | Bind knowledge reads and content tags to the cue language. | P4 |
| `renderer/components/media/MediaStudyAssistantPanel.tsx:93,176` | A | Send the media/cue language to AI. | P4 |
| `renderer/components/media/gum/GumTitlePage.tsx:369,627` | A | Use item/selected-track context instead of global source assumptions. | P4 |
| `renderer/views/MediaCenterView.tsx:580,1260` | C | Add independent collection/discovery language scopes. | P4 |
| `renderer/components/music/useMusicMining.ts:150` | A | Attribute lyric mining to the mined language. | P4 |
| `renderer/components/music/MusicContent.tsx:347` | A | Attribute studied lyric lines to lyric/session language. | P4 |
| `renderer/recorder/recordingStudyTag.ts:60` | A | Credit the recording’s captured language. | P4 |
| `main/media.ts:1184,1711,1793,1810` | A | Rank sidecars using item or selected-track language. | P4 |
| `main/mediaStudyOrchestrator.ts:133,439` | A | Use media/job language for transcription and subsequent mining. | P4 |
| `main/sentenceDeckIpc.ts:138,364` | A | Select tracks and create cards using request/source language. | P4 |
| `main/subtitleDiscoveryAuto.ts:124,133,148` | A | Resolve language per media item; remove Japanese-only activity labeling. | P4 |
| `main/subtitleDiscovery.ts:1309,1964` | A | Use per-item discovery targets; preserve explicit preferences when active changes. | P4 |
| `main/regionRecorder.ts:1420,1447,1475` | A | Persist recording language and check readiness separately for each waiting job. | P4 |
| `main/systemAudioCapture.ts:184,269,535` | D | Snapshot active as the default for a newly started unbound capture. | P4 |
| `main/systemAudioCapture.ts:495,702` | A | Transcribe and mine using the captured slice/draft language. | P4 |
| `main/transcriptionJobs.ts:1154` | A | Resolve from request/media once before queue persistence. | P4 |
| `renderer/components/settings/pages/SubtitleProviderPanel.tsx:44` | D | Edit defaults for an explicitly selected language; initialize that selection from active. | P4 |
| `renderer/stats.ts:294,306,444,498,546,570,625,634` | A | Pass language into storage and every activity writer. | P5 |
| `renderer/stats.ts:854,873,892,913,934,939,958` | C | Accept scope for summaries, calendar data, sync summaries, and reset. | P5 |
| `shared/reviewLog.ts:28,86` | A | Preserve language in review rows and normalization. | P0 |
| `renderer/reviewLog.ts:28` | A | Forward row language into statistics and retain it through archival. | P5 |
| `renderer/dailyGoal.ts:22,44,85,109` | C | Calculate targets/progress for shared or explicit language scope. | P5 |
| `renderer/components/DailyGoalPanel.tsx:39,102` | C | Display and edit the selected goal scope. | P5 |
| `renderer/components/DailyGoalSuggest.tsx:25` | C | Apply suggestions to the requested goal scope. | P5 |
| `renderer/components/stats/StatsContent.tsx:300,316,338` | C | Add combined statistics and separate proficiency panels per language. | P5 |
| `renderer/components/stats/StatsGames.tsx:25,71` | C | Filter results and label them using each session’s language. | P5 |
| `renderer/components/calendar/CalendarDayPanel.tsx:71,247` | C | Filter calendar activity; retain each result’s language for rendering. | P5 |
| `renderer/components/LevelMeter.tsx:220,226` | C | Make proficiency inspection independent of active-language changes. | P5 |
| `renderer/components/agent/AgentStudyAnswer.tsx:30,38` | A | Store/render answer-line language instead of retagging old answers after a switch. | P7 |
| `renderer/components/games/GameArenaContent.tsx:378,397` | C | Select material language independently; show grouped availability in All. | P7 |
| `renderer/components/games/GameArenaContent.tsx:1659,1813` | A | Freeze round/exercise language and its reading aids. | P7 |
| `renderer/games/arenaStudyBridge.ts:181` | A | Credit results and study time to session language. | P7 |
| `renderer/grammarMatch.ts:12,17` | B | Accept resolved text language and include Russian grammar. | P7 |
| `renderer/components/speak/ConversationPartner.tsx:139` | A | Retain the stored conversation’s language through replies, speech, knowledge, and retries. | P7 |
| `renderer/components/resources/ResourcesContent.tsx:132,289,330` | C | Filter/order resources by view scope, including All. | P7 |
| `renderer/components/resources/OwnResourceControls.tsx:29` | D | Keep active as an editable default for a newly created resource. | P7 |
| `main/extensionServer.ts:182,2004,2113,2172,2233,2283,2465` | B | Apply one contextual resolver across lookup, annotation, translation, and capture routes. | P6 |
| `main/extensionServer.ts:1782` | A | Transcribe using recording/page language captured earlier. | P6 |
| `main/extensionServer.ts:2018,2025` | A | Accept snapshot language and include it in version/cache identity. | P6 |
| `main/extensionServer.ts:2344,2396,2433,2520,2798` | A | Remove Japanese defaults and Russian-dropping branches from source-aware routes. | P6 |
| `main/extensionBridgeHost.ts:411,463` | A | Carry language in snapshot requests, waiters, and replies. | P6 |
| `main/extensionRecordingFinalizer.ts:62` | A | Retain recording language through finalization and transcription. | P6 |
| `main/extensionAiRoutes.ts:262` | B | Resolve missing language from request text/context instead of defaulting to Japanese. | P6 |
| `renderer/extensionAnnotate.ts:24,41,64` | A | Bind knowledge callbacks to the annotation request’s language. | P6 |
| `main/chrome-extension/shared.js:813,830,851` | B | Replace divergent client heuristics with parity-tested contextual resolution. | P6 |
| `main/chrome-extension/content.js:1946,1962,1972` | B | Resolve spans using element/page context and active fallback from Gum. | P6 |
| `main/chrome-extension/background.js:1648,1666,1675,1718` | A | Partition memory, IndexedDB, TTL, and snapshot requests by language. | P6 |
| `main/chrome-extension/background.js:2959,2977,2996` | A | Preserve the request’s source language through forwarding/retry. | P6 |
| `main/extensionInstall.ts:98,112,123` | D | Materialize the v1 client assets consistently in development and packaged installs. | P6 |
| `main/snipToCards.ts:473` | B | Separate agent handles capture detection and freezes its result. | X |
| `main/screenOcr.ts:535,682` | D | Separate agent preserves active as the unbound capture hint and honors explicit hints. | X |
| `renderer/snipToCards.ts:215,229,231` | A | Still needs language-bound knowledge callbacks after the store API changes. | X |

The dictionary, grammar, and game services already contain useful language-aware code. Preserve those implementations and pass the correct context into them; this does not require replacing all Japanese-specific algorithms.

## 4. UI and setup

### Setup step 1

Replace the current single-language control (`src/renderer/components/onboarding/FirstRunSetup.tsx:232`) with:

- Checkboxes for **日本語**, **中文**, and **Русский**.
- A separate **Start with** radio choice restricted to checked languages.
- At least one required selection.
- Chinese script controls whenever Chinese is selected.
- Explicit separation from interface-language selection.

Selecting a second language must not change the starting language. Deselecting the starting language selects the first remaining choice.

The level step needs one placement/seed choice per selected language. Existing seeding accepts a language, but its knowledge operations still use the active store (`src/renderer/firstRunSeed.ts:107,121`).

Persist per-language placement and seed state so Back, Later, and restart resume correctly. Existing scalar placement belongs to the migrated active language.

### Downloads step

Display one section per chosen language:

| Language | Dictionary | Optional OCR |
|---|---|---|
| Japanese | Bundled JMdict provisioning status | Manga OCR and/or general Japanese OCR |
| Chinese | CC-CEDICT | Chinese Paddle OCR |
| Russian | Russian Wiktionary | Russian Paddle OCR |

Reuse `dictionaryAssetFor()` and `ocrAssetFor()` (`src/renderer/components/onboarding/firstRunDownloads.ts:17,24`).

Plan downloads as the union of dependency closures:

- Count shared detector/model bytes once.
- Reuse installed multilingual Whisper models.
- Show which selected languages a shared model covers.
- Preserve per-language model choices.
- Keep pause, resume, retry, and per-language readiness visible.
- Allow continuing with missing optional assets; keep unmet capabilities visible in settings.
- Keep downloads independent of the active switcher.

Japanese provisioning must remain observable while its bundled dictionary is importing, matching the existing setup behavior (`src/renderer/components/onboarding/FirstRunSetup.tsx:447`).

Do not eagerly load every dictionary index into the renderer. Use existing asynchronous imports, workers, bounded batches, and virtualized lists.

### Quick switcher

Implement one reusable `StudyLanguageSwitcher`:

| Shell | Placement |
|---|---|
| Study OS | Existing taskbar tray, near Quick Settings and clock |
| Aero | Same tray component, using Aero tokens |
| Wired | Same tray component, using Wired typography/materials |
| Blanc | Visible top-bar chip beside existing session chips; separate from UI language |

Mount points are `src/renderer/components/DesktopShell.tsx:4006` and `src/renderer/components/blanc/BlancShell.tsx:872`.

Behavior:

- Show the active native language name.
- Menu lists enrolled languages and asset readiness.
- Include **Manage languages**.
- Switching changes active defaults immediately after commit.
- Preserve open items, filters, windows, and running operations.
- Announce the change accessibly and restore focus when the menu closes.

**Shortcut: `Ctrl+Shift+U`**, registered as `study.switchLanguage`, opens the same picker. It is unassigned in the inspected shortcut catalog.

Preserve `Ctrl+Shift+L` for Immersion URL focus and `Ctrl+Alt+Shift+L` for caption mining (`src/renderer/keyboardShortcuts.ts:628,907`). Respect shortcut remapping, IME composition, and existing modal handling.

Use clean text and vector icons, existing Fluent materials, and the deep-red accent. Add no decorative emoji or large internal window headings. Do not restructure desktop shortcuts, dragging, or taskbar window management.

### Settings: add and remove

Add language:

1. Add it to the study set without changing active.
2. Show its dictionary and optional capability downloads.
3. Offer placement/known-word seeding.
4. Offer **Make active** separately.

Remove language:

- Remove it from the switcher, default study queues, automatic provisioning, and reminders.
- Preserve cards, schedules, known words, books, media, conversations, statistics, Anki links, and installed assets.
- If active, choose a remaining replacement as part of the same transaction.
- Prevent removing the final studied language.
- Let existing jobs finish with their captured language.
- Keep retained data accessible through explicit filters.

Language removal is not data deletion. Existing data-management and asset-uninstall controls remain separate, scoped actions.

## 5. Statistics, known words, and SRS

### Known words

Replace the single `cacheLang/cache` with language-indexed stores (`src/renderer/knownWords.ts:40`). Expose a bound service:

```ts
knowledgeFor(lang).getLevel(word);
knowledgeFor(lang).setLevel(word, level);
knowledgeFor(lang).bulkSetFromAnki(levels);
knowledgeFor(lang).counts();
```

All deferred work captures that bound service. It must never consult active language after awaiting a tokenizer, dictionary, or Anki response.

Preserve:

- Manual-level precedence.
- Chinese Traditional-to-Simplified key folding.
- Japanese tokenizer-dependent key migration.
- Durable IDB reconciliation.
- Per-language pending writes and invalidation.

Combined known-word totals count **language plus normalized key**. Japanese `猫` and Chinese `猫` are separate knowledge entries. All-language imports require tagged rows or an explicit import language; plain text export/import remains language-specific.

### SRS and review history

A mixed deck already has per-card language. Keep schedules attached to card IDs.

Required changes:

- Filter queues independently from active language.
- Freeze queue scope and scheduler settings when starting a session.
- Normalize and update knowledge using each reviewed card’s language.
- Include language in undo and delayed sentence nudges.
- Include language in review-log rows and statistics events.
- Keep new-card budgets stable across language switches and reopening views.

The current implementation skips knowledge updates for cards outside the active language (`src/renderer/flashcardDeck.ts:1763,1822`). Remove those gates only after the knowledge API is partitioned.

Preserve the existing scheduling owner and profile-level new-card cap for migration. A language switch must never grant a fresh daily allowance. Per-language goal targets are separate from that cap.

Review-log migration:

1. Recover language from a surviving card or grammar-point ID.
2. Apply the historical Japanese-card rule where appropriate.
3. Retain otherwise unassignable historical rows as legacy/unassigned.
4. Include unassigned history in combined totals without inventing a language.

The current log schema has no language field (`src/shared/reviewLog.ts:28`).

### Anki sync

Anki interval snapshots currently lose language before renderer folding: they contain expressions but no language (`src/shared/anki.ts:310`), and main merges by expression (`src/main/anki/intervals.ts:721`).

V1 must:

1. Resolve language per note before aggregation.
2. Prefer Gum provenance, explicit deck/model/query mappings, and unambiguous text.
3. Treat broad overlapping queries such as `deck:*` as insufficient language evidence.
4. Keep conflicting/unresolved mappings visible rather than writing their intervals into every language.
5. Persist a confirmed fallback assignment for ambiguous notes so later switches do not relabel them.
6. Aggregate by `(language, expression)`.
7. Partition renderer folding, manual sync, deferred pushes, and optimistic created-note entries.
8. Preserve manual knowledge precedence, suspension behavior, stale-sync reporting, and note links.

Repoll to rebuild old expression-only snapshots; lost cross-language distinctions cannot be reconstructed reliably from the merged cache.

Keep explicit mining-rule/profile overrides. Use resolved card language before choosing a default language-compatible profile.

### Statistics and goals

Every activity writer receives language from its source/session. Current statistics writers select storage implicitly at write time (`src/renderer/stats.ts:294,306`).

Provide per-language and combined views:

| Metric | Combined behavior |
|---|---|
| Reviews, cards mined, studied lines | Sum attributed counts |
| Known words | Sum distinct `(language, key)` entries |
| Time | Sum credited activity once, preserving activity channels |
| Retention/accuracy | Recalculate from total numerator and denominator |
| Active days/streak | Union qualifying study dates; recompute |
| Characters | Show raw combined count with per-language breakdown |
| Reading speed | Keep language-specific measurements |
| Proficiency | Separate JLPT, HSK, and CEFR panels |

Do not sum streak lengths or average percentages without weights. Preserve the shared study-day boundary.

Existing historical statistics stay in their recorded partitions. Do not automatically reattribute old totals from text guesses.

Support two goal modes:

- **Shared**, the migration default: one daily target across studied languages.
- **Per language**: independent targets and progress for each enrolled language.

Preserve current customized goal values when migrating `jp-daily-goal-v1` (`src/renderer/dailyGoal.ts:22`). Mode changes retain both configurations, with only one mode driving completion/reminders.

Goal suggestions, widgets, calendar, and AI coaching must use the selected scope. Switching active language never resets progress.

## 6. Remaining Snip/OCR handoff

Assume the separate agent completes detection and OCR engine choice in `snipToCards.ts`, `screenOcr.ts`, and `paddleOcr.ts`. Reserve those files from overlapping implementation.

It still needs these integration contracts:

- Use the shared resolver’s simplified-only, Japanese-only, and ambiguous-Han rules.
- Store resolved language and provenance on the capture/result.
- Carry that language through retry, editing, enrichment, mining, and Anki routing.
- Bind known/manual-level callbacks to capture language. The current renderer passes active-store callbacks despite receiving `lang` (`src/renderer/snipToCards.ts:215,229`).
- Include language in capture/cache identity where results depend on recognition language.
- Resolve OCR before recognition from an explicit source hint or captured active default; text detection can refine the result afterward.
- Keep missing-model prompts tied to the requested recognizer.
- Test switching active language while OCR, enrichment, or review is pending.
- Preserve explicit language when a capture is adopted by Lens, clipboard history, or Blanc.

Book/page OCR and manga crop processing remain separate work in P3; fixing free-screen Snip does not fix those consumers.

## 7. File-disjoint implementation packages

The audit tables form the ownership manifest: **every listed file belongs to its named package**, including multiple rows for the same file. Additional owned files are named below. Package-local unit tests and fixtures remain under `src/`.

No two packages edit the same file. Cross-package changes go through its owner. This is an implementation schedule; no agents were spawned for this audit.

### Execution order

| Wave | Packages | Integration gate |
|---|---|---|
| 0 | P0 | Shared contracts, migration, bridge, and resolver established |
| 1 | P1, P2, P6 | Partitioned knowledge, study-set UI, extension protocol |
| 2 | P3, P4, P5 | Source-aware content, media, statistics |
| 3 | P7 | Games, grammar, AI, and cross-feature acceptance |

Run at most three packages concurrently. P6 can develop against P0 contracts and mocked P1 services, then integrate after P1 lands.

Effort: **S** localized change; **M** several connected modules; **L** cross-workflow migration and integration.

### P0 — Shared state, resolution, and bridge — L

**Owned files:** All P0 audit rows. New `src/shared/studySet.ts`, `src/shared/studyLanguageContext.ts`, and reviewed Han-hint data under `src/shared/`.

**Hotspots:** Exclusive owner of `src/preload.ts`, `src/renderer/window.d.ts`, study-environment state, and main study-language persistence.

Establish all bridge payload changes needed by other packages upfront, including snapshot language, item language fields, review-row language, and committed-state subscriptions.

**Vitest:** Migration precedence, malformed/duplicate sets, membership invariants, revision conflicts, stale-window startup, event counts, bridge round trips, script retention, legacy-card Japanese behavior, and Han resolver parity fixtures.

**Headless e2e plan:** `00-boot.cjs`, `10-setup.cjs`, `97-lens.cjs`; restart and multi-window synchronization, including Blanc.

**Risks:** Migration precedence, startup races, event loops, and treating unsupported content as a supported study language.

### P1 — Knowledge, deck/SRS, and Anki — L

**Owned files:** All P1 audit rows. Extend their existing tests under `src/renderer/__tests__/` and `src/main/__tests__/`.

**Vitest:** Same Han spelling in Japanese and Chinese stores; concurrent pending writes; nonactive restore/migration; mixed-deck review and undo; deferred tokenizer work; seed/undo outside active language; language-scoped level lists; Anki collisions, mapping conflicts, deferred pushes, suspension, and manual precedence.

**Headless e2e plan:** `45-anki.cjs`, `50-srs.cjs`, `70-known-words.cjs`; review a ja/zh/ru deck while switching active language and verify exact store destinations after restart.

**Risks:** Corrupting knowledge through an unbound callback; dropped legacy review evidence; expression-only Anki caches; changing existing daily caps.

### P2 — Setup, switcher, settings, and catalogs — L

**Owned files:** All P2 audit rows. New shared switcher component, its stylesheet, and `src/renderer/useStudySet.ts`. Own new application strings in `src/shared/i18n/**`.

**Hotspots:** Exclusive owner of `BlancShell.tsx`, `DesktopShell.tsx`, application i18n catalogs, `settingsRegistry.ts`, shortcut registration, and settings transfer/catalog handling.

Other packages submit required string keys to P2 instead of editing catalogs.

**Vitest:** Multi-select/start-with behavior; per-language placement persistence; deduplicated downloads; unavailable optional capabilities; removal/re-add; script retention; switcher accessibility; shortcut conflicts; settings transfer/reset round trips; catalog parity.

**Headless e2e plan:** `10-setup.cjs`, `00-boot.cjs`, `96b-lockscreen.cjs`; ja+zh setup, ru addition, active removal, restart, and switcher operation in all four shells.

**Risks:** Regressing shell focus/dragging, conflating UI and study language, duplicate asset downloads, and inaccessible compact layouts.

### P3 — Dictionary, readers, capture consumers, and book OCR — L

**Owned files:** All P3 audit rows. Preserve external ownership of all Snip/OCR files marked X.

**Vitest:** Book-language precedence; explicit corrections; Han lookups in known source context; language-preserving captures; cross-language highlighting; mixed-file mining; language-aware OCR export; unsupported/unknown book metadata; cache invalidation after correction.

**Headless e2e plan:** `20-dictionary.cjs`, `30-epub.cjs`, `31-library.cjs`, `40-manga.cjs`, `60-translate.cjs`, `89-immersion.cjs`, `97-lens.cjs`, `98-visual-novel.cjs`.

Required flow: open Japanese and Chinese sources together, switch active to Russian, then look up, highlight, translate, mine, and credit reading in each original source language.

**Risks:** Legacy metadata gaps, wrong Han interpretation, stale highlight caches, and synchronous profiling during window dragging.

### P4 — Media, subtitles, speech models, and recording — L

**Owned files:** All P4 audit rows, including media consumers in `src/media/` and main recording/transcription services.

**Vitest:** Track/item/default precedence; per-language Whisper preference migration; compatible shared models; language-preserving queue serialization; retry after restart; subtitle labels/fonts; discovery preference retention; recording readiness grouped by language.

**Headless e2e plan:** `90-video.cjs`, `91-youtube.cjs`, `92-music.cjs`, `94-recorder.cjs`, `88b-speak.cjs`.

Required flow: queue different-language media, switch active during processing, and verify generated tracks, translations, mined cards, and activity retain their source languages.

**Risks:** Wrong-language transcription, relabeling imported tracks, global discovery settings overwriting explicit choices, and model downloads repeated across languages.

### P5 — Statistics, goals, known-word management, and calendar — L

**Owned files:** All P5 audit rows. Add pure aggregation helpers under `src/shared/` and package-specific statistics/goal tests.

**Vitest:** Per-language attribution; weighted combined ratios; union-based streaks; legacy/unassigned history; shared/per-language goal migration; scoped reset; removed-language history; concurrent activity; stable study-day boundaries.

**Headless e2e plan:** `72-stats.cjs`, `70-known-words.cjs`, `95-calendar.cjs`, `96b-lockscreen.cjs`.

Required flow: record activity in all three languages, verify individual totals and combined totals, change goal mode, remove/re-add a language, and restart.

**Risks:** Double counting review-log and statistics evidence, misleading combined proficiency, incorrect historical attribution, and broad reset operations.

### P6 — Chrome extension and renderer bridge — L

**Owned files:** All P6 audit rows, plus source-owned extension client assets described below.

Protocol changes:

- Expose supported, studied, and active languages plus Chinese script.
- Carry source language through lookup, capture, annotation, AI, recording, and retry payloads.
- Accept `lang` on known-level and snapshot requests.
- Partition snapshots, versions, TTLs, offline lookup caches, and retry records by language.
- Preserve compatibility for older clients that omit language.
- Keep UI locale independent of page/study language.

**Source ownership constraint:** `tools/sync-extension-mirror.cjs:10,11,53` copies root `extension/` into `src/main/chrome-extension/`. Editing only that mirror would be overwritten.

For the `src/`-only implementation:

1. Put maintained v1 replacement client assets in a new `src/main/study-extension/` directory.
2. Import them explicitly in `extensionInstall.ts`.
3. Materialize them after copying the base extension, overriding the changed client files and locales.
4. Distribute/test the installed folder returned by Gum.
5. Keep the old root client supported by server compatibility behavior.
6. Do not depend on regex patching generated JavaScript.

The mirror rows in the audit identify existing behavior; implement their replacements in the new owned directory.

**Vitest:** Resolver parity using the extension harness; language-scoped snapshot/cache/version behavior; two simultaneous tabs in different languages; request retries across active switches; Russian page levels/grammar/AI; installed-asset generation and override order.

**Headless e2e plan:** `99-extension.cjs`; two language tabs, same-spelling independent knowledge, offline cache recovery, active switching, recording, and Anki mining.

**Risks:** Packaged/dev asset drift, cache contamination, older clients without language, and tests accidentally exercising only the root client.

### P7 — Grammar, games, AI, notes, conversation, and resources — L

**Owned files:** All P7 audit rows. Own corresponding language-context changes in `src/shared/agentStudyCoach.ts` and feature-specific shared AI types. Application catalog edits remain P2-owned.

Behavior:

- Collection tools accept All/one-language scope.
- Single-language drills and game rounds capture a language at start.
- All-language game material is grouped; each round has one language.
- Japanese-only exercises remain Japanese capabilities.
- Mixed-language deck AI runs partitioned requests and recombines tagged results.
- AI inputs retain source language; explanations retain their separate answer/UI language.
- Cache identity includes language, material, and relevant level context.
- Persisted AI answers retain language after switching.
- Conversation histories remain language-specific; switching active does not rewrite a conversation.

**Vitest:** Round-language stability; mixed-deck AI partitioning; language-specific known-word callbacks; Russian grammar matching; scoped coach tools; writing-selection detection; retries and cached answers after active changes.

**Headless e2e plan:** `80-grammar.cjs`, `82-games.cjs`, `88-ai-study.cjs`, `88b-speak.cjs`, `88c-speak-write.cjs`, `96-agent.cjs`, `98-visual-novel.cjs`.

**Risks:** Active language leaking through closures, reusing cached answers across languages, mixing level scales, and changing running game/conversation content.

### E2E scope boundary

The flow names above identify future headless regression runs and required scenario additions. None were run during this audit.

Existing flows are not already sufficient:

- Setup assumes a single-language radio button (`tools/e2e/flows/10-setup.cjs:31`).
- Known-word flows mutate the legacy language key directly (`tools/e2e/flows/70-known-words.cjs:94`).
- Extension flow copies root `extension/` (`tools/e2e/flows/99-extension.cjs:151`), bypassing the proposed installed v1 assets.

Keep implementation, Vitest tests, and fixtures inside `src/`. Updating these flow scripts is a separately scoped tooling follow-up outside the current source-only rule. Before release signoff, the owner’s test run must exercise the new setup controls, committed state API, and installed extension folder. Passing unchanged legacy flows alone is insufficient evidence.

## 8. V1 acceptance gate

Release requires all of these outcomes:

1. Fresh ja+zh setup provisions both languages and resumes correctly after restart.
2. Russian can be added and removed without deleting or relabeling its data.
3. The switcher works in Study OS, Aero, Wired, and Blanc.
4. A Japanese book, Chinese video, and Russian conversation work simultaneously while another language is active.
5. Mixed-deck reviews update the correct knowledge partitions, including undo and deferred work.
6. Lookups and captures distinguish decisive text and apply the documented Han fallback.
7. Queued OCR, transcription, translation, and AI work retain their original language.
8. Combined statistics reconcile with per-language totals; goals survive switching and restart.
9. Extension tabs retain independent language/knowledge context, including offline caches.
10. Anki sync preserves language before expression aggregation.
11. Desktop shortcuts, dragging, taskbar behavior, and responsiveness pass regression checks.
12. The headless scenarios test the distributed v1 extension and new setup behavior, with no unresolved language-attribution failures.