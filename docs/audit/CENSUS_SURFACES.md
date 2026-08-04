# CENSUS_SURFACES — every distinct thing a user can be looking at

**Wave B0. Static analysis only; the app was never started.** Measured against `5ae927d` on
`audit/a-evidence`, 2026-08-04.

This document is a **denominator**, not a verdict. Nothing here is audited, judged or ranked —
that is wave 3. Where static analysis cannot resolve a value it is marked `UNRESOLVED-STATIC`,
which is a finding about the codebase rather than a gap in the count.

---

## 0. Totals

| Depth | What lives there | Count |
|---|---|---|
| 0 | Window / shell modes — the whole viewport | **13** (+1 `EXCLUDED`) |
| 1 | `DesktopWinSection` apps | **24** |
| 2 | Nested tabs / pages / modes inside an app | **77** |
| 3 | Sub-tabs, drawer categories, view modes | **35** |
| — | Settings search-index cards (anchors within a depth-2 page) | **81** |

**Primary total: 149 surfaces** (depths 0–3), **plus 81 settings search cards** as addressable
sub-targets = **230** addressable destinations.

> **Why two numbers.** The 81 entries in `SETTINGS_REGISTRY` with a `pageId` are search-index
> cards that scroll to an anchor inside an already-counted settings page; they are not separate
> screens. Counting them as surfaces inflates the denominator, and omitting them silently hides
> 81 things a search box can navigate to. Both numbers are stated so a later wave can pick the
> one its probe actually applies to.

**Depth ≥3 is 35 surfaces + 81 cards.** This is where the dispatch predicted later probes would
under-reach, and the prediction is supported: **19 of the 35 are the Scraper's settings-drawer
categories, and 7 more are its result tabs** — 26 of 35 sit behind one app.

### Excluded by ruling

| Surface | Where | Status |
|---|---|---|
| Blanc window | `App.tsx:590` (`isBlancWindow()`) | `EXCLUDED` |
| Frutiger Aero theme paths | `AERO_THEME_ID`, `aero && showChrome` branches | `EXCLUDED` |
| Wired / `wired-archive` | `WIRED_ARCHIVE_THEME_ID`, `terminalModeSettings.ts` | `EXCLUDED` |
| Secret-mode surfaces | `secretLifecycle.ts`, `secretHistory.*` i18n | `EXCLUDED` |

Aero and Wired are **themes that re-render existing surfaces**, not separate sections; they are
excluded as render paths, and the surfaces they re-skin are still counted once at their own
depth. This matters for one finding — see the visual-novel entry in `CENSUS_NAVIGATION.md`.

---

## 1. Depth 0 — window and shell modes

Selected in `src/renderer/App.tsx`, in the order the component checks them.

| id | owning app | selected by | file:line |
|---|---|---|---|
| `companion-host` | shell | `?companionHost=1` | `App.tsx:157`, rendered `:561` |
| `miniwidget-window` | shell | `?miniWidget=1` | `App.tsx:162`, rendered `:566` |
| `lockscreen-window` | shell | `?lockscreen=1` | `App.tsx:167`, rendered `:576` |
| `blanc-window` | Blanc | `isBlancWindow()` | `App.tsx:590` — **`EXCLUDED`** |
| `lockscreen-overlay` | shell | `locked` state | `App.tsx:620` |
| `focus-shell` | shell | focus-mode state | `App.tsx:630` |
| `mini-shell` | shell | `mini.enabled && !popout && !reading` | `App.tsx:642`, `:120` |
| `reader-novel` | Library/Novels | `reading` item is EPUB/text | `App.tsx:656` |
| `reader-manga` | Library | `reading` item is manga | `App.tsx:658` |
| `popout` | any of 22 sections | `?popout=<section>` | `App.tsx:152`, `:668` |
| `bootscreen` | shell | cold launch / reboot nonce | `App.tsx:697`, `:698` |
| `consent` | shell | consent not yet given | `App.tsx:699` |
| `desktop-study` | shell | `DESKTOP_STUDY` (index 0) | `shared/desktop.ts:4`, `App.tsx:702` |
| `desktop-city` | shell | `DESKTOP_CITY` (index 1) | `shared/desktop.ts:5` |

`DESKTOP_COUNT = 2` (`shared/desktop.ts:3`); the two desktops share one app catalog but hold
independent window/pin layouts (`DesktopShell.tsx:332`), so they are two surfaces.

---

## 2. Depth 1 — the 24 `DesktopWinSection` apps

Defined as one union at **`src/shared/desktop.ts:8-32`**. Selected by `os:open` detail string,
by a Start-menu / taskbar click, or by `?popout=<id>`.

| # | id | rendered by | `AppSection.tsx` | in `APPS` (Start) | in palette | pop-out |
|---|---|---|---|---|---|---|
| 1 | `library` | `LibraryView` | `:67` | yes | yes | yes |
| 2 | `novels` | `NovelsView` | `:70` | yes | yes | yes |
| 3 | `dictionary` | `DictionaryView` | `:97` | yes | yes | yes |
| 4 | `grammar` | `GrammarView` | `:109` | yes | yes | yes |
| 5 | `notebook` | `NotebookView` | `:112` | yes | yes | yes |
| 6 | `translate` | `TranslateView` | `:94` | yes | yes | yes |
| 7 | `player` | `MediaWorkspaceSectionView` | `:73` | yes | yes | yes |
| 8 | `video` | `MediaWorkspaceSectionView` | `:79` | yes | yes | yes |
| 9 | `music` | `MediaCenterView` | `:85` | yes | yes | yes |
| 10 | `anki` | `AnkiView` | `:100` | yes | yes | yes |
| 11 | `flashcards` | `FlashcardsView` | `:103` | yes | yes | yes |
| 12 | `games` | `GameArenaView` | `:106` | yes | yes | yes |
| 13 | `stats` | `StatisticsView` | `:115` | yes | yes | yes |
| 14 | `resources` | `ResourcesView` | `:118` | yes | yes | yes |
| 15 | `settings` | `SettingsApp` | `:48` | yes | yes | yes |
| 16 | `note` | — (desktop-coupled) | **absent** | **no** | **no** | **no** |
| 17 | `visualizer` | `VisualizerWidget` | `:88` | **no** | **no** | **no** |
| 18 | `musicwidget` | `MusicWidget` | `:91` | **no** | **no** | yes |
| 19 | `city` | `ReadingGarden` | `:64` | yes | yes | yes |
| 20 | `immersion` | `ImmersionView` | `:121` | yes | yes | yes |
| 21 | `calendar` | `CalendarView` | `:124` | yes | yes | yes |
| 22 | `reading` | `ReadingFinderView` | `:127` | yes | yes | yes |
| 23 | `youtube` | `YouTubePlaylistsView` | `:82` | yes | yes | **yes, but broken** |
| 24 | `scraper` | `ScraperView` | `:76` | yes | yes | yes |

Registry sizes, each measured from its own declaration:

- `DesktopWinSection` — **24** (`shared/desktop.ts:8-32`)
- `AppSection` switch — **23** cases (`AppSection.tsx:47-132`; `note` is deliberately absent,
  see the comment at `:36-38`)
- `APPS` (Start menu / desktop pin catalog) — **21** (`DesktopShell.tsx:118-145`)
- `SECTIONS` (command palette) — **21** (`CommandPalette.tsx:52-74`)
- `POPOUT_SECTIONS` (main process) — **22** (`main.ts:1282-1286`)
- `POPOUT_LABELS` (renderer) — **21** (`App.tsx:126-148`)

The disagreements between these six registries are enumerated in
`HANDOFF_B0_CENSUS.md` §4 — three of them are consequential.

---

## 3. Depth 2 — nested tabs, pages and modes (77)

| App | Surface set | Count | Selected by | file:line |
|---|---|---|---|---|
| `settings` | Nav pages | **20** | `SettingsPageId` | `settingsRegistry.ts:11-150` |
| `scraper` | Rail pages | **17** | `ScraperPageId` | `shared/scraperShell.ts:15-52` |
| `music`/`player`/`video` | Media Center tabs | **7** | `MediaCenterTab` | `MediaCenterView.tsx:60-67`, `NAV` at `:73` |
| `notebook` | Notebook views | **6** | `NotebookViewId` | `renderer/notebook/views.ts:3-17` |
| `flashcards` | Modes | **5** | `Mode` | `flashcards/FlashcardsContent.tsx:86` |
| `grammar` | Modes | **4** | `Mode` | `views/GrammarView.tsx:24` |
| `calendar` | View modes | **4** | `ViewMode` | `calendar/CalendarContent.tsx:33` |
| `immersion` | Browser modes + VN panel | **4** | `ImmersionMode` (3) + `visualNovelsOpen` | `shared/immersion.ts:5`; `views/ImmersionView.tsx:47` |
| `player`/`video` | Media workspace host views | **3** | `HostView` | `media/MediaWorkspaceHost.tsx:50` |
| `music` ▸ Discover | Discovery tabs | **3** | `DiscoveryTab` | `discover/DiscoverContent.tsx:112` |
| `translate` | Tabs | **2** | `TranslateTab` | `translate/TranslateContent.tsx:31` |
| `youtube` | Main tabs | **2** | `MainTab` | `views/YouTubePlaylistsView.tsx:39` |

**Total depth 2: 77.**

Apps with **no** nested tab state found statically — a single surface at depth 1:
`library`, `novels`, `dictionary`, `anki`, `stats`, `resources`, `reading`, `games`, `city`,
`note`, `visualizer`, `musicwidget`. (`library` has a `levelFilter` at `LibraryView.tsx:124`,
which filters a list rather than switching surface, so it is not counted.)

---

## 4. Depth 3 — sub-tabs, drawer categories, view modes (35)

| Parent | Surface set | Count | Selected by | file:line |
|---|---|---|---|---|
| `scraper` ▸ Settings drawer | Categories | **19** | `ScraperSettingsGroupId` | `scraper/settings/fields.ts:92-111`; list at `:123-144` |
| `scraper` ▸ Results | Result tabs | **7** | `ScraperResultTab` | `shared/scraperShell.ts:54-71` |
| `reader-manga` | View modes | **5** | `MangaViewMode` | `manga/MangaViewModeSwitcher.tsx:3` |
| `flashcards` ▸ Overview | Overview tabs | **2** | `OverviewTab` | `flashcards/FlashcardsContent.tsx:87` |
| `music` ▸ Discover ▸ YouTube | Views | **2** | `YoutubeView` | `discover/YoutubeDiscoveryPanel.tsx:52` |

**Total depth 3: 35.**

### Plus: 81 settings search-index cards

`SETTINGS_REGISTRY` (`settingsRegistry.ts:172`) holds **100** entries: **19** page entries
(spread from `SETTINGS_NAV` minus `home`, at `:177-188`) and **81** cards carrying a `pageId`.

Measured: `grep -oE "pageId: '[^']+'" src/renderer/components/settings/settingsRegistry.ts | sort | uniq -c`

| pageId | cards | | pageId | cards |
|---|---|---|---|---|
| `study` | 14 | | `special` | 5 |
| `display` | 13 | | `companions` | 4 |
| `atmosphere` | 7 | | `desktop-layout` | 4 |
| `memory` | 7 | | `motion` | 4 |
| `appearance` | 6 | | `lockscreen` | 3 |
| `scraper` | 5 | | `visualizer` | 2 |
| `wallpaper` | 2 | | `profile-rules`, `reading`, `shortcuts`, `storage`, `transcription` | 1 each |

**`mini` is the one nav page with zero search cards** — reachable from the rail and from its own
page entry, but no card-level search target. Recorded, not judged.

---

## 5. `UNRESOLVED-STATIC`

| Item | Why static analysis cannot close it |
|---|---|
| `ScraperShellState.drawerCategory` | Typed `string`, not `ScraperSettingsGroupId` (`shared/scraperShell.ts:126`), and validated only for length — "validated against the drawer nav at render" per its own comment. The *rendered* category is clamped to the 19 at `ScraperSettingsDrawer.tsx:87` (`groupMeta(...)?.id ?? 'network'`), so the reachable set is 19; the persisted set is unbounded. Counted as 19. |
| Scraper `groupBy` | Free `string` capped at 40 chars (`scraperShell.ts:275`). Not a surface; noted so a later wave does not read it as one. |
| Widget instances | `WidgetSnapshot.type` keys into the renderer widget registry at runtime (`shared/desktop.ts:73-85`). The registry is static (`widgets/registry.tsx`) but instances are user-placed, so the *count on screen* is unresolvable statically. Widget **types** are enumerated in `CENSUS_NAVIGATION.md` §4. |
| Aero / Wired render branches | Excluded by ruling, so not traced. Note that some surfaces render **only** in those branches — see the visual-novel finding. |

---

## 6. Method

- Registries read directly from source; every count above carries its `file:line`.
- Tab/mode enumeration came from `grep -rnE "^(export )?type [A-Za-z]*(Tab|Mode|Panel|View|Screen|Step|Pane|Section|Route)[A-Za-z]* ="`
  over `src`, which returned **70** union types. Those were then hand-separated into *surface
  switchers* (counted here) and *setting enums* (a stored value, not a screen — e.g.
  `ScraperCacheMode`, `WeatherMode`, `MotionModeId`). The separation is judgement and is the
  most likely place this census is wrong; the raw 70 is stated so it can be re-derived.
- No surface was driven. Every row is "exists in code and is selected by X", never "works".
