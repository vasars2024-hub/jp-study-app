# Storage reconciliation — audit item 6.1

Generated 2026-08-07T17:45:03.628Z by `docs/migration/tools/storage-reconcile.mjs`, joining
`docs/migration/tools/storage-key-census.mjs` (source, 1482 files) against a
live snapshot of the running profile (74 keys, 1,420,554 chars).

Regenerate both halves with:

```
node docs/migration/tools/storage-key-census.mjs
# snapshot the live store through the debug bridge, then:
node docs/migration/tools/storage-reconcile.mjs --live <snapshot.json>
```

## Summary

| Measure | Value |
|---|---|
| Keys named by a literal or constant in source | 183 |
| Dynamic key patterns in source | 8 |
| Keys live in the profile | 74 |
| Live and over-encoded (6.A defect) | 0 |
| **Dead defaults** — read, never written, no migration role | **1** |
| Legacy inboxes — read for a one-way migration | 18 |
| **Dead controls** — written, never read | **2** |
| Present but written by nothing | 0 |
| Declared, writable, simply not exercised here | 98 |
| Live orphans — in the store, named nowhere | 6 |
| Live, explained by a dynamic pattern | 4 |
| **Confirmed defects after adjudication** | **1** |
| **Flags still unruled** | **0** |

### Dead defaults — 1 flagged, 0 unruled

Read by source, written by nothing, so the key can only ever hold its compiled-in default.
Rows carrying a ruling were read by hand and recorded in `docs/audit/STORAGE_ADJUDICATIONS.json`;
only the unruled ones need attention.

| Key | Ruling | Read sites |
|---|---|---|
| `jp-study.blanc.toolbox.workspaces.v1` | **benign** — Workspace-launcher is retired in favour of the App Drawer. BlancReadyToolPanels.tsx:1551-1554 documents that the App Drawer migration reads this key non-destructively and never writes it again. A migration inbox that predates the LEGACY_ naming convention. | src/renderer/components/blanc/BlancReadyToolPanels.tsx:1573 |

### Legacy inboxes — 18 keys read only to migrate an older shape

Not defects. Each is read by current code, written by none, and either removed after
consumption or deliberately left in place. Listed so they are not re-flagged next pass.

| Key | Present live | Constant | Removed after read |
|---|---|---|---|
| `jp-anki-deck` | no | `LEGACY_DECK_KEY` | no |
| `jp-anki-model` | no | `LEGACY_MODEL_KEY` | no |
| `jp-desktop-notes` | no | `LEGACY_NOTES_KEY` | yes |
| `jp-grammarx-practice-filters-v1` | no | `LEGACY_PRACTICE_FILTERS_KEY` | no |
| `jp-multi-source-search` | no | `LEGACY_UNIFIED_SEARCH_STORAGE_KEYS` | no |
| `jp-novels-planned` | no | `PLAN_KEY` | yes |
| `jp-os-icons` | no | `LEGACY_ICONS_KEY` | yes |
| `jp-os-wall` | no | `LEGACY_WALL_KEY` | yes |
| `jp-os-wins` | no | `LEGACY_WINS_KEY` | yes |
| `jp-saved-words` | no | `LEGACY_SAVED_KEY` | no |
| `jp-study-stats-v1` | no | `LEGACY_STATS_KEY` | no |
| `jp-unified-search` | no | `LEGACY_UNIFIED_SEARCH_STORAGE_KEYS` | no |
| `jp-verified-sites-v1` | no | `LEGACY_VERIFIED_SITES_STORAGE_KEYS` | no |
| `jp-verified-sites-v2` | no | `LEGACY_VERIFIED_SITES_STORAGE_KEYS` | no |
| `jp-verified-sites-v3` | no | `LEGACY_VERIFIED_SITES_STORAGE_KEYS` | no |
| `jp-video-server-profiles-v1` | no | `LEGACY_VIDEO_SERVER_PROFILES_STORAGE_KEYS` | no |
| `jp-video-server-profiles-v2` | no | `LEGACY_VIDEO_SERVER_PROFILES_STORAGE_KEYS` | no |
| `jp-word-knowledge` | no | `LEGACY_KNOWLEDGE_KEY` | no |

### Dead controls — 2 keys written by source and read by nothing

A control that persists a value no code ever loads. The write succeeds, so nothing looks
wrong, and the setting silently does not survive anything.

| Key | Ruling | Present live | Write sites |
|---|---|---|---|
| `jp-study-whisper-lang` | **defect** — setStudyLang writes it beside STUDY_LANG_KEY (studyEnvironment.ts:40-41) and nothing reads it. Its only other mention is settingsCatalog.ts:180, which lists it for byte accounting, not as a functional read. Behaviour comes from setWhisperModelTier instead. Same shape as audit item 3.3. | yes | src/renderer/studyEnvironment.ts:41 |
| `sea-server-auth-token` | **scope** — Written by seanimeBootstrap.ts:26 and read by the vendored Seanime frontend at vendor/seanime-web/app/(main)/_atoms/server-status.atoms.ts:11 via atomWithStorage. The census scans src/ only, so a key handed across that boundary always looks write-only. | yes | src/media/seanimeBootstrap.ts:26 |

### Present but written by nothing — 0

_None._

### Live orphans — 6

Present in the profile, named by no key or pattern in `src/`. A ruling of **scope** means
the owner was found outside `src/` — the vendored Seanime frontend, or another build sharing
this Chromium profile origin.

| Key | Chars | Type | Ruling |
|---|---|---|---|
| `seanime-client-id` | 36 | scalar-text | **scope** — Owned by vendor/seanime-web/lib/server/client-id.ts. |
| `sea-mediastream-active-on-device` | 5 | boolean | **scope** — Owned by vendor/seanime-web/app/(main)/mediastream/_lib/mediastream.atoms.ts. |
| `sea-media-core-preferences` | 188 | object | **scope** — Owned by vendor/seanime-web/app/(main)/_features/media-core/media-core-preferences.ts. |
| `noctis-session-queue-v2` | 347 | object | **scope** — Declared in the sibling project jp-study-app-noctis-beta (src/renderer/cityPagesQueue.ts:7), not in this repo. A different build of the app writes into the same Chromium profile origin. |
| `sea-video-core-anime4k` | 5 | string | **scope** — Owned by vendor/seanime-web/app/(main)/_features/video-core/video-core-anime-4k.ts. |
| `noctis-pages-queue-v1` | 119 | object | **scope** — Same as noctis-session-queue-v2 — owned by the jp-study-app-noctis-beta build sharing this profile origin. |

### Live keys with a named reader and writer — 62

| Key | Chars | Type | Layers | Reads | Writes | Top-level fields |
|---|---|---|---|---|---|---|
| `jp-flashcard-deck` | 1320982 | object | 1 | 3 | 3 | cards, folders |
| `jp-level-lists` | 39345 | object | 1 | 1 | 1 | lists, updatedAt, version |
| `jp-scraper-settings-v1` | 20840 | object | 1 | 1 | 1 | activeProfileId, profiles, siteOverrides, version |
| `jp-book-level-cache-v1` | 6139 | object | 1 | 1 | 1 | 02f12ce9-283b-4f11-a67e-4e18a312ffb0, 05d06e9a-77f0-459b-b0c3-c07157ae2152, 0785616f-ee62-4cf0-b8dc-2c322ae3569c, 078d8fa0-ef33-4127-a8cf-e40089869d2a, 151a85cc-6d5e-4e16-894a-ae83435c82b4, 4b25bb16-516e-4309-8eef-5ab8ab9ceb94, 4cbd1e61-09fd-43e8-8edf-355762f8f98d, 70931740-9100-45fc-8af2-db64b52c146a, 7cc53a32-8803-45a2-93de-31722bd406af, 87258c38-1493-4326-b3bb-bb286e06e3d8, 8d3a79ac-0f94-41d7-8724-882c8b7c8559, 92f37374-72e2-4eef-9dac-fec6eb2a96d8, 93807d45-8557-4da2-ab66-1e0a0bf067da, a388efff-917e-4384-8c7e-4f3ef18d5cbd, a8ff8fbb-6919-428b-9c78-8136710043c3, a96b9315-ba39-485f-a55b-9a87c15eac2d, b41ef962-176a-41da-be3e-d6217671684f, d29d9cbe-9181-4a2c-bdf5-ffd5605e8d14, d6fcd3bb-f4cd-4635-8b61-eeb093d59e9c, e73b0f47-7caf-41c6-af9e-ec1cbac61655 |
| `jp-os-environment-v1` | 5681 | object | 1 | 2 | 2 | achievementCelebrations, activePlaylistId, ambientAudio, buddyRoutines, calendarWallsEnabled, companionActiveness, companionCelebrate, companionPauseWhenStudying, companionReactivity, companionTypes, companions, companionsEnabled, companionsOnOsDesktop, dayCycleLighting, enabled, environmentPresetId, lightingIntensity, matchParticleSuggestions, particleDensity, particleIntensity, particlePresets, particleSize, particlesEnabled, performanceTier, playlists, rotationEnabled, rules, snowAccumulation, weather |
| `jp-aero-environment-v1` | 5465 | object | 1 | 2 | 1 | achievementCelebrations, activePlaylistId, ambientAudio, buddyRoutines, calendarWallsEnabled, companionActiveness, companionCelebrate, companionPauseWhenStudying, companionReactivity, companionTypes, companions, companionsEnabled, companionsOnOsDesktop, dayCycleLighting, enabled, environmentPresetId, lightingIntensity, matchParticleSuggestions, particleDensity, particleIntensity, particlePresets, particleSize, particlesEnabled, performanceTier, playlists, rotationEnabled, rules, snowAccumulation, weather |
| `jp-study-environment-backup-v1` | 5457 | object | 1 | 1 | 1 | achievementCelebrations, activePlaylistId, ambientAudio, buddyRoutines, calendarWallsEnabled, companionActiveness, companionCelebrate, companionPauseWhenStudying, companionReactivity, companionTypes, companions, companionsEnabled, companionsOnOsDesktop, dayCycleLighting, enabled, environmentPresetId, lightingIntensity, matchParticleSuggestions, particleDensity, particleIntensity, particlePresets, particleSize, particlesEnabled, performanceTier, playlists, rotationEnabled, rules, snowAccumulation, weather |
| `jp-ui-customization-v1` | 2048 | object | 1 | 1 | 1 | activeProfileId, developerMode, preview, profiles, version |
| `jp-lookup-history` | 1801 | array | 1 | 1 | 1 | at, context, count, firstAt, lang, lemma, lookupTimes, meaning, query, reading |
| `jp-study-stats-v1-ja` | 1084 | object | 1 | 1 | 1 | books, days, shows |
| `jp-clipboard-history` | 1055 | array | 1 | 2 | 2 | createdAt, id, text, type |
| `jp-discovery-shortlist-v1` | 1024 | array | 1 | 1 | 1 | addedAt, candidate, id |
| `jp-video-core-mining-history-v1` | 859 | array | 1 | 6 | 6 | createdAt, destination, id, noteId, provenance, sentence, status, term |
| `jp-deck-level-cache-v1` | 693 | object | 1 | 1 | 1 | 48dcfd84-7581-431e-bc1e-bcf0eb94901b::容疑者Ｘの献身, e0eed414-3840-4b1c-96d9-32baf9a51519::メインページ |
| `jp-scraper-shell-v1` | 592 | object | 1 | 1 | 1 | columnOrder, compact, density, drawerCategory, drawerOpen, groupBy, page, pageSize, railCollapsed, recentPages, resultTab, sortColumn, sortDir, version, visibleColumns |
| `jp-video-core-resume-v1` | 527 | array | 1 | 3 | 3 | key, positionSec, updatedAt |
| `jp-media-player-preferences-v1` | 524 | object | 1 | 2 | 2 | autoPause, cueTimingReadout, dictationMode, dualSubs, furigana, grammarHighlight, loopLine, playbackRate, preferredAudioLanguage, primarySubs, secondarySubLang, seekStepSec, shadowingMode, subtitleBgOpacity, subtitleFontFamily, subtitleFontSize, subtitleFontWeight, subtitleOutline, subtitleOverlay, subtitleOverlayBackground, subtitlePosition, transcriptPanel, volumeNormalization |
| `jp-os-notifications-v1` | 468 | array | 1 | 1 | 1 | id, kind, message, read, ts |
| `jp-reader-settings` | 330 | object | 1 | 1 | 1 | contentWidth, flow, font, fontSize, fontWeight, hideFurigana, hyperlinksEnabled, justify, kerning, lineHeight, paragraphIndent, prettyWrap, prioritizeStyles, sideMargin, theme, vpal, wordHighlight, writingMode |
| `jp-study-csv-editor-v1` | 288 | object | 1 | 2 | 2 | hiddenColumns, savedAt, table, title |
| `jp-os-desktop-prefs-v1` | 282 | object | 1 | 1 | 1 | clock24h, clockSeconds, clockShowDate, companionHostDisplays, iconLabel, iconSize, iconTextColor, iconsLocked, restoreSessionWindows, singleClickOpen, snapGrid, startColumns, taskbarSize |
| `jp:mediastream-transcode-paths` | 229 | array | 1 | 1 | 1 | — |
| `jp-os-personalization-v1` | 224 | object | 1 | 2 | 2 | accentMode, accentPreset, autoTheme, chrome, customAccent, customCssEnabled, density, fontFamily, radius, shadow, wallpaperDim |
| `jp-grammarx-explorer-filters-v1` | 209 | object | 1 | 1 | 1 | categories, excludeCategories, familiarity, functions, lang, levels, query, registers, requireExamples, sort, studyReadyOnly, verifiedTagsOnly |
| `jp-reading-garden-v1` | 179 | object | 1 | 1 | 2 | bankedPages, lastBookId, lastEvolutionAt, lastEvolutionDay, lastReadAt, pagesRead, stage, version |
| `jp-os-settings-recent-v1` | 151 | object | 1 | 1 | 1 | pages, queries |
| `jp-os-motion-prefs-v1` | 83 | object | 1 | 2 | 2 | companionWeight, motionMode, rewardParticles, velocity |
| `jp-os-achievements-v1` | 73 | object | 1 | 1 | 1 | dayKey, lastDailyCharsBucket, lastStreakCelebrated |
| `jp-study.onboarding.v1` | 72 | object | 1 | 1 | 1 | completedAt, lastStepId, replays |
| `jp-discovery-prefs-v1` | 70 | object | 1 | 1 | 1 | feed, hideOwned, level, mediaType |
| `jp:directstream-open-generation` | 67 | object | 1 | 1 | 1 | clientId, generation |
| `jp-widget-gallery` | 47 | object | 1 | 1 | 1 | favorites, recent |
| `jp-os-display-prefs-v1` | 34 | object | 1 | 1 | 2 | remapLayoutProportionally |
| `jp-mooncap-music-v1` | 27 | object | 1 | 1 | 1 | enabled, volume |
| `jp-medialib-scope` | 14 | scalar-text | 0 | 1 | 1 | _shelf:continue_ |
| `jp-study-whisper-model` | 14 | scalar-text | 0 | 1 | 1 | _kotoba-whisper_ |
| `jp-release-last-check` | 13 | number | 1 | 1 | 1 | _1786101231668_ |
| `jp-os-theme` | 12 | scalar-text | 0 | 2 | 1 | _forest-night_ |
| `jp-os-perf-tier` | 11 | scalar-text | 0 | 1 | 1 | _performance_ |
| `jp-aero-restore-theme-v1` | 8 | scalar-text | 0 | 1 | 1 | _study-os_ |
| `jp-study-epub-translate-mode` | 8 | scalar-text | 0 | 1 | 1 | _original_ |
| `jp-manga-view-mode` | 7 | scalar-text | 0 | 1 | 1 | _regions_ |
| `jp-music-sort` | 6 | scalar-text | 0 | 1 | 1 | _recent_ |
| `jp-extension-last-local-version` | 5 | scalar-text | 0 | 1 | 1 | _3.2.0_ |
| `jp-os-wall-fit` | 5 | scalar-text | 0 | 1 | 1 | _cover_ |
| `jp-medialib-view` | 4 | scalar-text | 0 | 1 | 1 | _grid_ |
| `jp-os-accent` | 4 | scalar-text | 0 | 1 | 1 | _mint_ |
| `jp-telemetry-consent` | 3 | scalar-text | 0 | 4 | 3 | _yes_ |
| `jp-grammarx-explorer-favorites-v1` | 2 | array | 1 | 1 | 1 | — |
| `jp-grammarx-explorer-presets-v1` | 2 | array | 1 | 1 | 1 | — |
| `jp-grammarx-explorer-study-v1` | 2 | array | 1 | 1 | 1 | — |
| `jp-media-collapsed` | 2 | array | 1 | 1 | 1 | — |
| `jp-music-collapsed` | 2 | array | 1 | 1 | 1 | — |
| `jp-study-dict-lang` | 2 | scalar-text | 0 | 1 | 1 | _ja_ |
| `ui-lang` | 2 | scalar-text | 0 | 1 | 1 | _en_ |
| `jp-aero-discovered` | 1 | number | 1 | 2 | 1 | _1_ |
| `jp-os-reduce-motion` | 1 | number | 1 | 1 | 1 | _0_ |
| `jp-os-theme-engine-v` | 1 | number | 1 | 1 | 1 | _1_ |
| `jp-reading-adult` | 1 | number | 1 | 1 | 1 | _0_ |
| `jp-settings-advanced-v1` | 1 | number | 1 | 1 | 1 | _1_ |
| `jp-study-epub-auto-translate` | 1 | number | 1 | 1 | 1 | _0_ |
| `jp-telemetry-pinged` | 1 | number | 1 | 2 | 1 | _1_ |

### Declared and writable but absent on this profile — 98

Expected for an inventory this size: a setting nobody has changed has no reason to exist.
These are listed for completeness, not as defects.

`jp-aero-legacy-features-v1`, `jp-app-border-settings`, `jp-app-zoom`, `jp-blanc-memory-v1`, `jp-blanc-mode-v1`, `jp-calendar-events`, `jp-clipboard-settings`, `jp-connection-profiles-v1`, `jp-extension-seen-remote-version`, `jp-external-player-preferences-v1`, `jp-finding-summon-restore-v1`, `jp-fmhy-directory-snapshot-v1`, `jp-game-arena-seen-v1`, `jp-game-arena-settings-v1`, `jp-game-progress-v1`, `jp-global-lookup-v1`, `jp-global-lookup-v1-last`, `jp-grammarx-curation-v1`, `jp-grammarx-familiarity-v1`, `jp-grammarx-notebook-timeline-v1`, `jp-grammarx-session-history-v1`, `jp-grammarx-session-options-v1`, `jp-grammarx-translation-history-v1`, `jp-level-threshold`, `jp-lyrics-settings`, `jp-manga-reader-settings`, `jp-media-hub-item-state-v1`, `jp-media-providers-v1`, `jp-media-sections-collapsed`, `jp-media-study-database-v1`, `jp-media-tracking-sources-audit-retention-v1`, `jp-media-tracking-sources-audit-v1`, `jp-media-tracking-sources-v1`, `jp-media-tracking-v1`, `jp-mini-frame-scale-v1`, `jp-music-liked`, `jp-music-player`, `jp-os-custom-css-v1`, `jp-os-dnd`, `jp-os-filedrop-prefs-v1`, `jp-os-music-widget`, `jp-os-secret-history-v1`, `jp-os-secret-leaf-v1`, `jp-os-sound-category-volume`, `jp-os-sound-enabled`, `jp-os-sound-muted`, `jp-os-sound-volume`, `jp-os-trinkets-v1`, `jp-os-user-wallpapers-v1`, `jp-os-visualizer`, `jp-perf-overlay`, `jp-pillarbox-settings`, `jp-reader-collection-prefs-v1`, `jp-release-seen-version`, `jp-saved-words-ja`, `jp-scraper-advanced-v1`, `jp-scraper-recent-queries-v1`, `jp-shortcuts-v1`, `jp-study-blanc-theme-history-v1`, `jp-study-ex-display`, `jp-study-ex-langs`, `jp-study-focus-mode-v1`, `jp-study-focus-settings-v2`, `jp-study-lens-mode`, `jp-study-lens-tier`, `jp-study-local-agent-automations-v1`, `jp-study-local-agent-memory-v1`, `jp-study-local-agent-profiles-v1`, `jp-study-local-agent-settings-v1`, `jp-study-local-agent-task-queue-v1`, `jp-study-lockscreen-v1`, `jp-study-mini-mode-v1`, `jp-study-translate-source`, `jp-study-translate-target`, `jp-study-whisper-auto-device`, `jp-study-whisper-device`, `jp-study-whisper-downloaded`, `jp-study.blanc.quickNotes`, `jp-study.blanc.toolbox.favoriteTools`, `jp-study.blanc.toolbox.lastTool`, `jp-study.blanc.toolbox.openTabs`, `jp-study.blanc.toolbox.recentTools`, `jp-study.blanc.toolbox.workspaces.v1.migrated`, `jp-study.toolbox.settings.v1`, `jp-subtitle-management-v1`, `jp-subtitle-providers-v1`, `jp-unified-search-history-v1`, `jp-unified-search-management-v1`, `jp-unified-search-v1`, `jp-verified-sites-v4`, `jp-video-server-profiles-v3`, `jp-vn-lens-capture-target-v1`, `jp-wired-archive-boot-seen-v1`, `jp-wired-archive-settings-v1`, `jp-wired-discovered-v1`, `jp-wired-restore-theme-v1`, `jp-word-knowledge-ja`, `jp-youtube-discovery-prefs-v1`
