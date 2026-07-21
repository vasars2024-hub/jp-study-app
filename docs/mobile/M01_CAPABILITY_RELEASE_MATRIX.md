# M01 — Capability and Release Matrix

**Status:** Drafted, awaiting human approval (Lane P requirement)
**Phase:** M01 of `MOBILE_EXPANSION_MASTER_PLAN.md` — Program A, Product and Governance
**Depends on:** M00 (approved 2026-07-20)
**Exit condition (from the master plan):** *"Every known feature has one release classification and no feature-parity assumption remains implicit."*

**Method:** Classification is code-derived, not recalled. The feature inventory below was
enumerated from three sources in the working tree at commit `a31fd8a`:

- `src/renderer/components/AppSection.tsx` — 25 registered app sections
- `src/renderer/widgets/registry.tsx` — 26 registered desktop widgets
- `ipcMain.handle/on` call sites across `src/main/` — ~200 IPC channels, which define
  the actual platform-service surface (the part that determines portability)

Anything in those three sources appears in a table below. Nothing was classified from memory.

---

## 1. Interpretation note — the "one classification" rule

The master plan names five buckets: *shared, Android v1, Android post-v1, desktop-only,
iOS-later*. These are not mutually exclusive as written — a review scheduler is both
**shared** (extracted to `packages/study-core`) and **Android v1** (it has a mobile
surface). Classifying on a single axis would force a false choice and reintroduce exactly
the implicit parity assumption M01 exists to remove.

**Resolution — two explicit axes, one value each:**

- **Release** (the "exactly one" rule): `v1` · `post-v1` · `desktop-only` · `ios-later`.
  Where does a *user-facing* capability appear, and when.
- **Reuse**: `shared` · `adapter` · `client-only`. What happens to the *code*.
  `shared` = extracted to `packages/*`. `adapter` = portable core, platform I/O behind an
  adapter. `client-only` = reimplemented per client, or desktop-only and never extracted.

`iOS-later` is used only where a capability is Android-blocked for platform reasons
(AnkiDroid intents, Android background work). Everything else Android-bound is assumed to
follow to iOS at M51–M52 and is **not** separately tagged — noted here so its absence
isn't read as an oversight.

**This split needs your sign-off.** If you'd rather force a single axis, say so and I'll
collapse it — but the matrix will lose the code-reuse signal that M03 and M12–M15 consume.

---

## 2. App sections (25 registered)

| # | Section | Desktop capability | Release | Reuse | Rationale |
|---|---|---|---|---|---|
| 1 | `anki` | AnkiConnect link, note add/delete, model management, interval + known-word query | **v1** | adapter | Charter §4: AnkiDroid mode is first-class. Desktop uses AnkiConnect over HTTP; Android uses AnkiDroid intents. Same contract (M08), different adapter (M09). |
| 2 | `flashcards` | Study OS native decks, scheduling, grading, deck export | **v1** | shared | Charter §4 "Full review sessions, offline-capable". Scheduler → `packages/study-core` (M13). |
| 3 | `grammar` | GrammarX explorer, curation, familiarity, presets, session history | **post-v1** | shared | Newest desktop subsystem (Phase 3 landed at `a31fd8a`). Charter §4 does not list grammar in v1. Core is portable; defer the mobile surface until v1 ships. |
| 4 | `dictionary` | Yomitan import/manage, offline + online lookup, multi-language, Chinese dict | **v1** | adapter | Charter §4 "Popup lookup, script-aware". Dictionary *resource management* (import/move/remove) is **desktop-only** — see §5 row D3. |
| 5 | `library` | Book import (files/folders/paths), covers, folders, progress, watch folder | **v1 (reduced)** | adapter | Charter §4: library management stays desktop; mobile gets M33's local import + explicit transfer only. Folder/watch-folder management is desktop-only. |
| 6 | `novels` | Novel catalog + `NovelReader` | **v1** | adapter | Part of the companion reader (M34). |
| 7 | `reading` | `ReadingFinderView`, readable-article extraction, content fetch | **post-v1** | adapter | Web-article discovery is not in charter §4's reading row. Reader itself is v1; the *finder* is not. |
| 8 | `notebook` | Notes, timeline | **post-v1** | shared | Not in charter §4. Capture (M36) covers the v1 need; full notebook does not. |
| 9 | `stats` | Statistics, counts, heatmaps, streaks | **v1** | shared | M30 (Home, Goals, Statistics) is an explicit v1 phase. |
| 10 | `calendar` | Calendar view | **desktop-only** | client-only | Charter §4 lists Calendar under "Not in v1 (desktop-only)". |
| 11 | `city` | Noctis simulation + full presentation | **v1 (view only)** | shared | Charter §4: "Simplified, non-authoritative view only". Engine → `packages/noctis-core` (M15); mobile renders a projection (M11, M38). Desktop retains simulation authority. |
| 12 | `games` | Game Arena, arcade games, mirror writing | **desktop-only** | client-only | Charter §4 lists Game Arena under "Not in v1 (desktop-only)". |
| 13 | `immersion` | Immersion browser, site list, session + visit metrics | **desktop-only** | client-only | Charter §4 lists Immersion browser as desktop-only. Embedded-browser model does not port. |
| 14 | `music` | Music library, liked songs, lyrics, live lyrics | **desktop-only** | client-only | Charter §4 lists Music/Media as desktop-only. |
| 15 | `musicwidget` | Music widget surface | **desktop-only** | client-only | Follows §14. |
| 16 | `player` | Player bus, playback control, snapshot/publish | **desktop-only** | client-only | Follows §14. |
| 17 | `visualizer` | Audio visualizer | **desktop-only** | client-only | Follows §14. |
| 18 | `video` | `VideoPlayerView`, subtitles, sub offset, extract audio | **desktop-only** | client-only | Charter §4: Media desktop-only. Subtitle mining is a post-v1 question, not a v1 one. |
| 19 | `youtube` | Playlist management, auto-update, folders | **desktop-only** | client-only | Follows §14/§18. |
| 20 | `translate` | Translate view, AI provider client, translation history/analysis | **post-v1** | adapter | Not in charter §4. Dictionary lookup (v1) covers the reading need; full translation does not. |
| 21 | `resources` | Resource catalog, asset install/download management | **v1 (reduced)** | adapter | Mobile needs dictionary/OCR resource *download*, not the full catalog UI. See M27. |
| 22 | `settings` | Full settings surface | **v1 (minimal)** | client-only | Charter §4: "Minimal (account, sync, notifications only)". Explicit non-goal: no settings parity. |
| 23 | `preset` | Layout/environment presets | **desktop-only** | client-only | Desktop window/layout concept. Explicit non-goal: no desktop window management. |
| 24 | `void` | Void mode surface | **desktop-only** | client-only | Desktop shell concept; no touch analogue. |
| 25 | `react` | Dev/harness surface | **desktop-only** | client-only | Not a product capability. |

## 3. Readers (sub-surfaces of §2)

| Reader | Release | Reuse | Rationale |
|---|---|---|---|
| `BookReader` (EPUB) | **v1** | adapter | M34. Positions, bookmarks, annotations sync. |
| `NovelReader` | **v1** | adapter | M34, same contract. |
| `MangaReader` (pages, bubble fill, page fit) | **post-v1** | adapter | Manga OCR is a 14-channel desktop subsystem (`mangaOcr:*`). Camera OCR (M37) is the v1 OCR path; volume-scan OCR is not. |

## 4. Widgets (26 registered)

Charter §4 lists widgets under "Not in v1 (desktop-only)", and M50 (Widgets and Larger
Form Factors) is explicitly post-v1. **All 26 are `post-v1` / `client-only`** — Android
widgets are a different platform primitive (RemoteViews/Glance), so none of this code ports;
only the *data* behind them does, via the shared cores.

`clock-digital` · `clock-analog` · `calendar` · `pomodoro` · `stopwatch` · `world-clock` ·
`daily-goals` · `habit-tracker` · `countdown` · `todo` · `study-streak` ·
`today-study-time` · `reading-progress` · `vocab-progress` · `level-progress` ·
`word-of-the-day` · `learning-heatmap` · `learner-map` · `mini-player` · `calculator` ·
`recent-lookups` · `clipboard` · `cpu-usage` · `memory-usage` · `battery` · `network`

Exception to flag: `daily-goals`, `study-streak`, `today-study-time` and `level-progress`
surface data that M30 puts on the mobile **home screen** in v1. The *widget* is post-v1;
the *data* is v1. Recorded so M30 doesn't inherit a "widgets are post-v1, so goals are
post-v1" misreading.

## 5. Platform services (IPC surface)

The part that decides portability. Grouped by channel prefix.

| ID | Channels | Capability | Release | Reuse | Rationale |
|---|---|---|---|---|---|
| P1 | `profile:*`, `profileRules:*` | Profiles, switching, legacy migration | **v1** | shared | Identity/data authority — M06, M19. |
| P2 | `library:*` | Book import, list, read, progress, covers | **v1 (reduced)** | adapter | See §2 row 5. `importFolder`/`setFolders`/watch-folder are desktop-only. |
| P3 | `dict:*` | Lookup (online/offline), Yomitan management | **split** | adapter | `lookup`/`lookupTerm*` → v1. `importYomitan`/`move`/`remove`/`setEnabled` → desktop-only (resource curation stays on the command center). |
| D3 | `assets:*`, `catalog:*` | Asset install, free space, pause/resume/cancel | **v1 (reduced)** | adapter | Mobile needs download + free-space for dictionary/OCR models. Full catalog UI is desktop. |
| P4 | `anki:*`, `apkg:import` | AnkiConnect operations, .apkg import | **v1** | adapter | M09/M32. Android replaces AnkiConnect HTTP with AnkiDroid intents. `apkg:import` is **post-v1** on mobile. |
| P5 | `mangaOcr:*` (14 ch), `paddleOcr` | Volume scan, regions, corrections, translate cache | **post-v1** | adapter | v1 OCR is camera-single-capture (M37), not volume analysis. |
| P6 | `media:*`, `yt:*`, `player:*` | Media library, conversion, playback, playlists | **desktop-only** | client-only | Charter §4. |
| P7 | `desktop:*` (wallpaper, layout, launch, shortcuts) | Desktop shell, wallpaper, icon layout | **desktop-only** | client-only | Explicit non-goal: no desktop window management. |
| P8 | `shell:*`, `popout:*`, `mini:*`, `blanc:*`, `lockscreen:*` | Window chrome, borderless, popouts, mini/blanc/lock modes | **desktop-only** | client-only | Desktop window concepts. No touch analogue. |
| P9 | `companionHost:*` | Companion overlay, displays, click-through, routines | **post-v1** | client-only | Related to M40 (Reader Second Screen) / M48 (Remote Command Panel) — both explicitly post-v1. |
| P10 | `extension:*`, chrome-extension server | Browser extension bridge, token, status | **desktop-only** | client-only | Desktop-local HTTP server; Android has no equivalent surface in v1. |
| P11 | `clipboard:readText` | Clipboard read | **post-v1** | adapter | M42 (Vocabulary and Clipboard Relay) is post-v1 and privacy-gated. Charter forbids background clipboard surveillance. |
| P12 | `net:*`, `reading:fetchContent` | Article extraction, JSON/page fetch | **post-v1** | adapter | Follows §2 row 7. |
| P13 | `jiten:*` (12 ch) | Deck store, search, download, plans, covers | **post-v1** | adapter | Deck acquisition is a command-center activity; not in charter §4's v1 rows. |
| P14 | `immersion:*` | Site list, sessions, visit metrics | **desktop-only** | client-only | See §2 row 13. |
| P15 | `stats:*`, `system:getMetrics` | Study counts/ping; CPU/memory/battery/network | **split** | shared / client-only | `stats:*` → v1 shared (M30). `system:getMetrics` → desktop-only (host telemetry, no mobile meaning). |
| P16 | `tools:*`, `toolbox:*` | Collected tools, automation builder, folder pick | **desktop-only** | client-only | Explicit non-goal: no CSV/toolbox parity. |
| P17 | `translate:status`, AI provider client | Translation + AI provider | **post-v1** | adapter | See §2 row 20. |
| P18 | `buddyScheduler:*` | Companion scheduling, test fire | **post-v1** | shared | Ties to M38/M49 companion work. |
| P19 | `i18n:setLang` | Language switching | **v1** | shared | M45 requires localization coverage. |
| P20 | `release:check`, `app:version`, `app:relaunch` | Update check, relaunch | **v1** | client-only | Mobile uses Play Store update semantics — capability is v1, implementation shares nothing. |
| P21 | `diagnostics:logRendererError`, `errorLog` | Error capture | **v1** | adapter | M29 requires crash reporting. |
| P22 | `config:*WatchFolder` | Watch-folder configuration | **desktop-only** | client-only | Filesystem-watching model does not port to scoped Android storage. |
| P23 | `examples:*` | Offline example sentences, search, import | **v1** | adapter | M35 lists examples as part of dictionary/audio. |
| P24 | `novels:*` | Novel catalog refresh | **v1** | adapter | Supports §2 row 6. |
| P25 | `epubMeta`, `manga:getPages/readPage` | Format parsing | **split** | adapter | EPUB → v1 (M34). Manga page reads → post-v1 (follows P5). |

## 6. Capabilities with no desktop equivalent (mobile-new)

Recorded so they aren't lost by an audit that only looks at existing code:

| Capability | Release | Phase | Note |
|---|---|---|---|
| Camera OCR capture | **v1** | M37 | Charter §4 calls it a core v1 feature. No desktop counterpart. |
| Device pairing / trusted devices | **v1** | M19, M28 | No desktop equivalent today (desktop is single-device). |
| Cloud sync + account | **v1** | M17–M24 | The capability that makes mobile useful at all. |
| Explicit encrypted book transfer | **v1** | M23 | Replaces "same filesystem path" assumption. |
| Push notifications / background work | **v1** | M29 | Android-specific; `ios-later` variants at M51. |
| Live study handoff | **v1** | M39 | Cross-device, no single-device analogue. |

## 7. Parity assumptions made explicit

The exit condition requires that *no feature-parity assumption remains implicit*. The five
that were implicit before this matrix:

1. **"Mobile reader ≈ desktop reader."** False. Vertical-text handling is an open decision
   (M34), and manga reading is post-v1 while EPUB/novel reading is v1.
2. **"Dictionary on mobile means the whole dictionary subsystem."** False. Lookup is v1;
   Yomitan resource curation stays desktop (P3).
3. **"Noctis on mobile means Noctis."** False. Mobile is a non-authoritative projection;
   the desktop keeps simulation authority (§2 row 11, M11).
4. **"Widgets are post-v1, therefore goals/streaks are post-v1."** False. The home-screen
   *data* is v1 via M30; only the widget *surface* is post-v1 (§4).
5. **"Anki support is one feature."** False. Two independent scheduling authorities with
   separate histories (M08), reached through two different transports (AnkiConnect vs.
   AnkiDroid intents, P4).

## 8. Exit-condition mapping

- **Every known feature has one release classification →** §2 (25 sections), §3 (3 readers),
  §4 (26 widgets), §5 (25 IPC groups covering ~200 channels), §6 (6 mobile-new). Each row
  carries exactly one `Release` value. Four rows are marked `split` and name the exact
  channel-level boundary rather than hiding the split.
- **No feature-parity assumption remains implicit →** §7 names the five that existed, plus
  §1 on the classification-axis ambiguity and §4 on the widget/data distinction.

---

## Approval

- [ ] Approved as-is
- [ ] Approved with changes (list below)
- [ ] Not approved — needs rework

**Decisions that most need your judgment:**

1. **The two-axis split** (§1) — accept, or collapse to one axis and lose the reuse signal.
2. **Grammar (GrammarX) as post-v1** (§2 row 3) — it's your newest and most active
   subsystem, and the charter doesn't list it in v1. If you want it in v1, that changes
   M13's extraction scope and adds a v1 product phase that doesn't exist in M30–M42.
3. **Manga reading + volume OCR as post-v1** (§3, P5) — this is the largest single
   desktop subsystem being deferred (14 IPC channels). Confirm that camera OCR alone
   satisfies the v1 OCR story.

Notes:
