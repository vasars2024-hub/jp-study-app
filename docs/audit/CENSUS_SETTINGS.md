# CENSUS_SETTINGS — every setting key, and which ones nothing reads

**Wave B0. Static analysis only.** Measured against `5ae927d` on `audit/a-evidence`, 2026-08-04.

Probe E failure mode 2 (**orphan**: writes, but no code reads the key) is resolvable statically,
and this document resolves it. Failure modes 1 (writes nothing) and 3 (startup-only) need a live
flip and a restart — **they are not attempted here and no row below claims either way.**

---

## 0. Totals

| | Count |
|---|---|
| Settings **documents** (defaults/schema objects) enumerated | **30** |
| Keys in the Scraper settings document exposed as a UI control | **166** |
| Top-level keys across the other 29 documents | **267** |
| **Total keys enumerated** | **433** |
| **Orphan candidates — zero read sites anywhere in `src/`** | **34** |
| Keys with a consumer but **no UI write site** | **1** |

All 34 orphans are in the Scraper. The other 29 documents produced **zero** orphans.

---

## 1. The claim the dispatch handed me: CONFIRMED

Six keys were reported to have **zero** references in `src/main/`. All six confirmed.

```
for k in maxParallelDownloads memoryBudgetMb cpuThrottlePercent \
         reuseBrowserContext prefetchNextPage mergeStrategy; do
  echo "$k :: $(grep -rn "$k" src/main/ | wc -l)"
done
```

| key | refs in `src/main/` | refs in all of `src/` |
|---|---|---|
| `maxParallelDownloads` | **0** | 8 |
| `memoryBudgetMb` | **0** | 8 |
| `cpuThrottlePercent` | **0** | 8 |
| `reuseBrowserContext` | **0** | 6 |
| `prefetchNextPage` | **0** | 6 |
| `mergeStrategy` | **0** | 8 |

The non-zero whole-tree counts are **not reads**. For every one of the six they decompose into:
a type declaration + a default + a validator line in `shared/scraperOutputSettings.ts`, one
rendered control in `scraper/settings/fields.ts`, a comment in `featureStatus.ts` naming the key
as inert, a line in `src/PHASE_4_SEANIME_SCRAPER_STATE.md`, and (for four of them) a validator
test. **No consumer.**

> **The repo already knows.** `featureStatus.ts:187-188` reads
> *"Inert, with no consumer to wire them to: maxParallelDownloads, memoryBudgetMb,
> cpuThrottlePercent, reuseBrowserContext, prefetchNextPage."*
> `catalogue.ts:654` reads *"`fetchStaff` is deliberately not read."*
> These are documented decisions, not discoveries. What was *not* documented is how many there
> are in total — that is §2.

---

## 2. The full Scraper orphan set — 34 of 166

Enumeration command:

```
grep -oE "path: '[^']+'" src/renderer/components/scraper/settings/fields.ts \
  | sed "s/path: '//;s/'//" | sort -u          # 163 distinct paths
grep -oE "toPath: '[^']+'" ...                  # + 3 range second-paths
                                                # = 166 exposed paths
```

`SCRAPER_FIELDS` holds **164** field entries over **163** distinct paths (`network.userAgent`
appears twice by design — a preset `select` and a free-text box editing the same string, see
`fields.ts:163-167`), plus 3 `toPath` values for range controls.

Each key was then resolved by hand across the whole tree, excluding tests, the three schema
modules and the field-definition file. A key is an **orphan** when the only remaining hits are
comments.

| Group | Orphans | Keys |
|---|---|---|
| `logging` | **7** | `captureHar`, `captureScreenshotsOnError`, `maxFileSizeMb`, `persistToDisk`, `redactCookies`, `redactCredentials`, `retentionDays` |
| `export` | **7** | `destinationRef`, `filenameTemplate`, `includeColumns`, `includeSubtitleColumn`, `openAfterExport`, `prettyPrint`, `splitBySeason` |
| `performance` | **5** | `cpuThrottlePercent`, `maxParallelDownloads`, `memoryBudgetMb`, `prefetchNextPage`, `reuseBrowserContext` |
| `developer` | **4** | `recordNetworkTrace`, `showRawHtml`, `showSelectorOverlay`, `verboseTimings` |
| `validation` | **2** | `rejectDuplicateHashes`, `verifyEpisodeCount` |
| `metadata` | **2** | `fetchStaff`, `mergeStrategy` |
| `images` | **2** | `namingTemplate`, `skipDuplicatesByHash` |
| `sources` | **2** | `maxFallbackDepth`, `skipUnhealthy` |
| `torrents` | **2** | `protocols`, `verifyInfoHash` |
| `scheduler` | **1** | `requireUnmeteredNetwork` |

**`logging` and `export` are the two groups where every single orphan in the group is an
orphan** — 7 of `logging`'s 9 exposed keys and 7 of `export`'s 8. `performance` is 5 of 7.

Six of the 34 carry an explicit in-repo comment explaining *why* they are not read
(`export.destinationRef` at `exports.ts:9`, `images.namingTemplate` and
`images.skipDuplicatesByHash` at `imageSet.ts:26-29`, `metadata.fetchStaff` at
`catalogue.ts:654`, `scheduler.requireUnmeteredNetwork` at `scheduler.ts:195`,
`sources.skipUnhealthy` at `sources.ts:133`). **The remaining 28 carry no such note at their
declaration** — only the two block comments in `featureStatus.ts` that name 6 of them.

### Not orphans, despite a zero-count on first pass

Twelve keys returned zero under a `src/main/`-only grep and are nonetheless consumed. Recorded
because a later wave re-running the naive command will hit the same false positives:

| key | actually read at |
|---|---|
| `notifications.onComplete` / `onError` / `onNewEpisode` / `onScheduleRun` / `onStudyReady` | `shared/scraperNotices.ts:51-55` — a `NOTICE_KIND → setting-key` map. **Indirect string lookup; no grep for the key name will find the read site.** |
| `episodeProcessing.detectMissingNumbers` / `keepHighestQuality` / `mergeDuplicateSources` / `renameEpisodes` / `languagePriority` | `shared/episodeProcessing.ts:121-160` |
| `extraction.attribute` / `regexFlags` | `shared/episodeProcessing.ts:82-88` |
| `developer.allowScriptConsole` / `mockMode` / `pluginIds` | `ToolPages.tsx:360`, `ScraperApp.tsx:105`, `ipcScraperPort.ts:142` — renderer-side |
| `qbittorrent.connectionStatus` | `TorrentManagerPage.tsx:236` (written `:139`) — a status field, not a preference |

**The lesson for the next wave:** `src/main/` is the wrong denominator. Scraper settings are
consumed in three places — `src/main/scraper/**`, `src/shared/**` (pure helpers), and the
renderer itself. A key is only an orphan when all three are empty.

---

## 3. The other 29 settings documents — 267 keys, 0 orphans

| Document | file:line | Keys | UI write site | Consumer |
|---|---|---|---|---|
| `DesktopPrefs` | `renderer/desktopPrefs.ts:38` | 13 | `DesktopLayoutPage.tsx` | `desktopPrefs.ts:93-97` → `dataset`/CSS vars |
| `DisplayPrefs` | `renderer/displayPrefs.ts:44` | 17 | `DisplayPage.tsx` | `displayPrefs.ts:151-180` |
| `MotionPrefs` | `renderer/motion/motionPrefs.ts:43` | 4 | `MotionPage.tsx` | `motionPrefs.ts`, `CompanionLayer.tsx:34` |
| `MiniModeSettings` | `renderer/miniMode.ts:122` | 11 | `MiniModePage.tsx` | `MiniShell.tsx` |
| `LockscreenSettings` | `renderer/lockscreenSettings.ts:23` | 3 | `LockscreenPage.tsx` | `lockscreenSettings.ts:74-187` |
| `FocusModeSettings` | `renderer/focusMode.ts:30` | 6 | `StudyPage.tsx:82-155` | `focusMode.ts:139-266` |
| `VizSettings` | `renderer/visualizerSettings.ts:25` | 8 | `VisualizerPage.tsx` | `VisualizerContent.tsx` |
| `ReaderSettings` | `renderer/readerSettings.ts:62` | 18 | `ReaderSettingsPanel.tsx` | `NovelReader.tsx` |
| `MangaReaderSettings` | `renderer/mangaReaderSettings.ts:65` | 24 | `MangaReader.tsx` | `MangaReader.tsx` |
| `EnvironmentSettings` | `renderer/environment/types.ts:168` | 28 | `AtmospherePage`, `CompanionsPage` | `environment/**` |
| `GameArenaSettings` | `renderer/games/settings.ts:29` | 8 | `SpecialPage.tsx` | `GameArenaContent.tsx` |
| `ToolboxSettings` | `shared/toolboxSettings.ts:105` | 36 | Blanc toolbox — **`EXCLUDED`** | Blanc — **`EXCLUDED`** |
| `LocalAgentSettings` | `shared/localAgentSettings.ts:28` | 17 | `StoragePage.tsx` (models) | `main/localAgent.ts` |
| `PlayerPreferences` | `shared/playerPreferences.ts:22` | 14 | `MediaContent.tsx:472-547` | `MediaContent.tsx:1296-1725` |
| `SubtitleDiscoverySettings` | `shared/subtitleDiscoveryIpc.ts:77` | 5 | `SubtitleProviderPanel.tsx` | `main/**` subtitle discovery |
| `SentenceAnalysisPrefs` | `shared/sentenceAnalysisPrefs.ts:104` | 6 | `AiAnalysisSection.tsx` | `SentenceAnalysisView.tsx` |
| `OsPersonalization` | `renderer/osPersonalization.ts:51` | 11 | `AppearancePage.tsx:213-225` | `osPersonalization.ts:149-236` |
| `GlobalLookupSettings` | `renderer/globalLookupSettings.ts:26` | 2 | `ShortcutsPage.tsx` | `GlobalDictionaryOverlay.tsx` |
| `ClipboardSettings` | `renderer/clipboardHistory.ts:55` | 4 | `ClipboardHistoryPanel.tsx` | `clipboardHistory.ts`, `App.tsx:44` |
| `PillarboxSettings` | `renderer/pillarboxSettings.ts:16` | 2 | `AppearancePage.tsx` | `WallpaperStage.tsx:10` |
| **`AppBorderSettings`** | `renderer/appBorderSettings.ts:18` | 4 | **3 of 4 only** | `appBorderSettings.ts:41-44` |
| `AeroLegacySettings` | `renderer/aeroFeatureSettings.ts:72` | 3 | Aero — **`EXCLUDED`** | Aero — **`EXCLUDED`** |
| `WiredArchiveSettings` | `renderer/terminalModeSettings.ts:73` | 10 | Wired — **`EXCLUDED`** | Wired — **`EXCLUDED`** |
| `BlancModeSettings` | `shared/blancMode.ts:22` | 4 | Blanc — **`EXCLUDED`** | Blanc — **`EXCLUDED`** |
| `SystemDictionarySettings` | `main/systemDictionary.ts:52` | 2 | `SystemDictionarySection.tsx` | `main/systemDictionary.ts` |
| `ReadingLensSettings` | `main/readingLens.ts:57` | 2 | `ReadingLensSection.tsx` | `main/readingLens.ts` |
| `MusicWidgetSettings` | `renderer/musicWidgetSettings.ts:10` | 1 | `MusicWidget.tsx:10` | `MusicWidget.tsx` |
| `LyricsSettings` | `renderer/lyricsSettings.ts:9` | 1 | `SettingsApp.tsx:30` | `liveLyrics.ts:20`, `lyrics.ts:6` |
| `UiComponentSettings` | `shared/uiCustomization.ts:143` | 3 | — | `uiCustomization.ts` |

**Excluded documents: 4** (`ToolboxSettings` 36, `WiredArchiveSettings` 10, `BlancModeSettings`
4, `AeroLegacySettings` 3 = 53 keys). Recorded, not analysed.

### The one inverse case: a setting with a consumer and no way to change it

| key | schema | write sites | read sites |
|---|---|---|---|
| `AppBorderSettings.cornerRadius` | `renderer/appBorderSettings.ts:13`, default `8` at `:21` | **0** | `appBorderSettings.ts:44` → `--app-border-radius` |

`AppearancePage.tsx` imports the module and exposes `style` (`:324`), `blurAmount` (`:339-341`)
and `borderWidth` (`:357-359`). **`cornerRadius` has no control anywhere in `src/`.** It is
persisted, applied to a CSS custom property on every boot, and unreachable to the user.

And the custom property it sets is itself unused:

```
grep -c 'app-border-radius' src/renderer/styles.css   ->   0
```

So the chain is: no writer → applied to `--app-border-radius` → **no CSS rule consumes it**.
This is *not* an orphan by the §2 definition (it has a read site), and it is not a dead control
(there is no control). Recorded as its own shape. `AppBorderSettings` is Aero-associated per its
own header comment (`appBorderSettings.ts:1`), but it is written from the **Appearance** settings
page, which is not excluded — so a later wave must decide which ruling applies.

---

## 4. Method, and where it is weakest

**Instrument correction, stated because it changes how the numbers should be read.** The first
sweep counted bare leaf names (`grep -rn "\bmode\b" src/main`). It returned 113 hits for
`cache.mode` and 885 for the renderer — it was counting the English word "mode", not reads of the
setting. Those counts are discarded and appear nowhere above. The reported figures come from a
qualified property-access pattern plus **hand resolution of every zero-hit key across the whole
tree**, which is what caught the 12 false positives in §2.

**Two known limits, both real:**

1. **Indirect key access defeats grep entirely.** `shared/scraperNotices.ts:51-55` maps notice
   kinds to setting names as *string values*. Nothing in a read of `notifications.onComplete`
   would ever find it. There may be other such maps; I found one. A key marked orphan above is
   orphan *as far as name-based static analysis reaches*, and that is the honest ceiling.
2. **Nested keys below the top level are not counted** for the 29 non-scraper documents. The
   267 figure is **top-level keys only**. Documents like `EnvironmentSettings` (28 top-level)
   contain nested objects (`companions`, `buddyRoutines`, `playlists`, `rules`, `weather`) whose
   sub-keys are not in the total. The true key count is higher; **267 is a floor, not a
   measurement of every key.**
3. **A key-extraction bug was caught in read-back and is corrected above.** The extractor parsed
   newline-terminated keys, so a defaults object written on **one line** yielded exactly 1 key
   regardless of its contents. `ReadingLensSettings` (`main/readingLens.ts:57`,
   `{ enabled, hotkey }`) was counted as 1 and is 2. It was the only one-liner in this set with
   more than one key; the corrected totals are 267 and 433.

**Not attempted, and therefore not claimed:** whether any of the 399 non-orphan keys actually
persists to disk, and whether any takes effect live or only at startup. Both need a flip, a
file diff and a restart on a copied profile.
