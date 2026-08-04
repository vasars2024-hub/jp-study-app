# CENSUS_NAVIGATION — how many paths reach each surface

**Wave B0. Static analysis only.** Measured against `5ae927d` on `audit/a-evidence`, 2026-08-04.

This is the graph Probe C (dead handoffs) and Probe F (entry points) both need, built once.
**Nothing here is resolved or judged** — a path counted below is a path that exists in code, not
a path proven to work. Whether a handoff selects anything at the far end is wave 3.

---

## 0. Headline

| | |
|---|---|
| Sections with **zero** entry points | **0 of 24** |
| Sections with exactly **one** entry point | **1** — `visualizer` |
| `os:open` dispatch sites (non-excluded) | **24** |
| Distinct navigation registries | **6**, and they disagree — see §5 |
| Navigation paths reaching the **visual-novel** feature | **2 in code; 1 outside excluded themes** |

**No surface in the app is unreachable.** That is a real result and it is the opposite of what
the highest-value row shape looks for. The nearest thing to it is `visualizer`, reachable by one
button whose pop-out twin opens a different app entirely (§3).

---

## 1. The bus

Cross-surface navigation runs on a `window` `CustomEvent` named **`os:open`**, carrying a section
id as `detail`.

| Role | Site |
|---|---|
| Listener (the shell) | `DesktopShell.tsx:1089-1093` → `openRef.current(detail)` |
| Second listener | `media/MediaWorkspaceHost.tsx:121` (claims `player` / `video`) |
| Sound hook | `renderer/shellSounds.ts:43` |

`DesktopShell`'s handler casts `detail` to `WinSection` **without validating it**
(`:1090`). An unknown id reaches `open()` and falls through to `APPS.find(...)` returning
`undefined` (`:398`). Recorded, not resolved.

---

## 2. Entry points per section

Path types: **S** Start menu · **P** command palette · **K** keyboard shortcut · **O** pop-out ·
**X** cross-surface `os:open` · **E** extension bridge · **M** Media Center handoff ·
**W** widget · **D** desktop / direct.

| Section | S | P | K | O | Other | **Total** |
|---|:-:|:-:|:-:|:-:|---|:-:|
| `settings` | ● | ● | ● | ● | X×4, E×3 | **11** |
| `grammar` | ● | ● | ● | ● | X×2, E×1 | **7** |
| `video` | ● | ● | ● | ● | X×3 | **7** |
| `anki` | ● | ● | ● | ● | X×1, E×1, M×1 | **7** |
| `flashcards` | ● | ● | ● | ● | X×2 | **6** |
| `library` | ● | ● | ● | ● | E×1 | **5** |
| `notebook` | ● | ● | — | ● | X×1, M×1 | **5** |
| `games` | ● | ● | ● | ● | X×1 | **5** |
| `stats` | ● | ● | ● | ● | M×1 | **5** |
| `calendar` | ● | ● | ● | ● | W×1 | **5** |
| `youtube` | ● | ● | ● | ⚠ | E×1 | **5** |
| `novels` | ● | ● | ● | ● | — | **4** |
| `dictionary` | ● | ● | ● | ● | — | **4** |
| `translate` | ● | ● | ● | ● | — | **4** |
| `player` | ● | ● | ● | ● | — | **4** |
| `music` | ● | ● | ● | ● | — | **4** |
| `resources` | ● | ● | ● | ● | — | **4** |
| `city` | ● | ● | ● | ● | — | **4** |
| `immersion` | ● | ● | ● | ● | — | **4** |
| `reading` | ● | ● | ● | ● | — | **4** |
| `scraper` | ● | ● | — | ● | — | **3** |
| `note` | — | — | — | — | D×3 | **3** |
| `musicwidget` | — | — | — | ● | D×2 | **3** |
| **`visualizer`** | — | — | — | — | **D×1** | **1** |

⚠ `youtube`'s pop-out is registered in the main process but not in the renderer — see §5.

### The `os:open` dispatch sites (X), by target

| Target | Sites |
|---|---|
| `settings` | `games/GameArenaContent.tsx:111`, `shell/QuickSettings.tsx:72`, `environment/CompanionLayer.tsx:1007`, `views/MediaCenterView.tsx:116` |
| `video` | `media/MediaContent.tsx:935`, `media/StudyOrchestratorWorkspace.tsx:831`, `views/YouTubePlaylistsView.tsx:68` |
| `grammar` | `immersion/VisualNovelSentenceAssist.tsx:166`, `media/StudyOrchestratorWorkspace.tsx:999` |
| `flashcards` | `novels/NovelsContent.tsx:96`, `views/NotebookView.tsx:24` |
| `anki` | `media/StudyOrchestratorWorkspace.tsx:3571` |
| `notebook` | `views/TranslateView.tsx:76` |
| `games` | `settings/pages/SpecialPage.tsx:345` |
| `calendar` | `widgets/productivity.tsx:117` |
| `games` | `shell/AeroFindingOverlay.tsx:115` — **`EXCLUDED`** (Aero) |
| dynamic | `blanc/BlancReadyToolPanels.tsx:144` — **`EXCLUDED`** (Blanc) |

### Dynamic dispatchers — resolved

| Site | Detail | Resolution |
|---|---|---|
| `CommandPalette.tsx:77` | `id` | The 21 ids in `SECTIONS` (`:52-74`) |
| `keyboardShortcuts.ts:1261` | `appId` | 19 distinct via `openApp('…')`, `:1387-1494` |
| `extensionBridgeUi.ts:9` | `section` | `grammar` `:18`, `settings` `:26/:43/:55`, `anki` `:67`, `library` `:203`, `youtube` `:207`, plus `route.section` `:185` |
| `views/MediaCenterView.tsx:572` | `app` | `STUDY_HANDOFFS` = `notebook`, `anki`, `stats` (`:88-92`) |
| `notebook/NotebookContent.tsx:165` | `href` | Per-entry href; `'clipboard'` is intercepted at `:160` |
| `environment/buddyRoutines.ts:390` | `step.appId` | **`UNRESOLVED-STATIC`** — comes from routine step data, not a literal set |

`buddyRoutines` is the one dispatcher whose target set static analysis cannot close. It is
**not** counted in any section's total above, so every total is a **floor**.

---

## 3. `visualizer` — one entry point, and an asymmetric twin

| Path | Site | What it does |
|---|---|---|
| Settings ▸ Visualizer, in-desktop | `DesktopShell.tsx:1969` — `onOpenVisualizer={() => open('visualizer')}` | Opens the `visualizer` section |
| Settings ▸ Visualizer, **pop-out** | `AppSection.tsx:59` — `onOpenVisualizer={() => void window.api.popOut('music')}` | Opens **`music`** |

The same prop, on the same button, in the two render paths of the same Settings app, targets two
different sections. And `visualizer` is absent from `POPOUT_SECTIONS` (`main.ts:1282-1286`), so
`popOut('visualizer')` would return early at `main.ts:1308` regardless.

**Enumerated, not resolved.** Whether the pop-out target is deliberate (the visualizer needs the
desktop wallpaper layer, so a pop-out may be meaningless) is a wave-3 question.

`musicwidget` has the matching pair and they agree: `DesktopShell.tsx:1970` → `open('musicwidget')`,
`AppSection.tsx:60` → `popOut('musicwidget')`, and `musicwidget` **is** in `POPOUT_SECTIONS`.

`note` is reachable at `DesktopShell.tsx:1023` (`open('note')` → `openNote()`), `:1519` (desktop
icon with `action === 'note'`) and `:2465` (desktop context menu, "New sticky note").

---

## 4. The visual novel — the case the dispatch asked to settle

**Answer: 2 navigation paths exist in code. Exactly 1 is outside an excluded theme.**

| # | Path | Site | Gate |
|---|---|---|---|
| 1 | Immersion ▸ "Visual Novel Library" button | `views/ImmersionView.tsx:346` | `showChrome` |
| 2 | Immersion ▸ `AppChrome` menu ▸ "Visual Novel Library" | `views/ImmersionView.tsx:76` | `aero && showChrome` — **`EXCLUDED`** |

Both set the same state: `setVisualNovelsOpen(true)` (`:47`). When true, `ImmersionView` replaces
its whole body with `<VisualNovelPanel>` (`:126-136`). `VisualNovelPanel` is imported only by
`ImmersionView` (`:33`).

So the feature sits at **depth 3** — desktop → Immersion (depth 1) → VN panel — behind one button
that only renders when Immersion's chrome is showing (i.e. not in `focus` mode).

### Corrections to the dispatch's description

The dispatch's inventory was close but three items are wrong, and two of them change the reading:

| Dispatch said | Measured |
|---|---|
| "seven renderer panels under `components/immersion/`" | **10** `VisualNovel*.tsx` panels (plus `ImmersionContent.tsx`), `ls src/renderer/components/immersion/` |
| "eight test files" | **8** — `CONFIRMED` (`shared/__tests__/visualNovel*.test.ts`) |
| "i18n keys" | **Zero of its own.** The only key matching `visualNovel` is `blanc.agent.operations.group.visualNovel` (`catalogs/en.ts:5420`) — a **Blanc** key, `EXCLUDED`. |
| "a `settingsRegistry` entry" | **No entry.** `'visual novel'` at `settingsRegistry.ts:566` is one **search keyword** inside the `reading-lens` card's keyword array, routing to `pageId: 'study'` — the Reading Lens settings, not the VN feature. |

The i18n point is the consequential one: the button's label is the **raw string literal**
`Visual Novel Library` (`ImmersionView.tsx:348`), not a `t()` call. Under `CLAUDE.md`'s i18n
workflow ("never a raw string literal in JSX") the feature's entire UI is untranslated. Recorded
as a defect in the handoff; not fixed.

Backing code that exists regardless: `main/immersion/visualNovels.ts` (registered at
`main/immersion/index.ts:25`), 9 `shared/visualNovel*.ts` modules, 10 renderer panels, 8 test
files. **This census makes no claim about whether any of it works.**

---

## 5. Where the registries disagree

Six registries describe "which sections exist". They are not the same set.

| Registry | Size | Site |
|---|---|---|
| `DesktopWinSection` | 24 | `shared/desktop.ts:8-32` |
| `AppSection` switch | 23 | `AppSection.tsx:47-132` |
| `APPS` (Start menu) | 21 | `DesktopShell.tsx:118-145` |
| `SECTIONS` (palette) | 21 | `CommandPalette.tsx:52-74` |
| `POPOUT_SECTIONS` (main) | 22 | `main.ts:1282-1286` |
| `POPOUT_LABELS` (renderer) | 21 | `App.tsx:126-148` |

### Disagreement 1 — `youtube` can be popped out but not rendered *(consequential)*

`POPOUT_SECTIONS` contains `'youtube'` (`main.ts:1285`). `POPOUT_LABELS` does **not**
(`App.tsx:126-148`). And `popoutSection()` gates on membership of `POPOUT_LABELS`:

```
// src/renderer/App.tsx:152-155
function popoutSection(): DesktopWinSection | null {
  const raw = new URLSearchParams(window.location.search).get('popout');
  return raw && raw in POPOUT_LABELS ? (raw as DesktopWinSection) : null;
}
```

Statically: `createPopoutWindow('youtube')` passes the main-process guard (`main.ts:1308`) and
opens a borderless window at `?popout=youtube`; the renderer then resolves `popout` to `null`,
so `App` falls through to the **full desktop shell** (`App.tsx:702`) rather than the YouTube app
alone. **Needs a live check to confirm the rendered result** — filed as static-only.

### Disagreement 2 — three sections exist but no launcher lists them

`note`, `visualizer`, `musicwidget` are in `DesktopWinSection` but absent from both `APPS` and
`SECTIONS`. Deliberate for `note` (desktop-coupled, `AppSection.tsx:36-38`) and defensible for
the two widgets; recorded because it is why `APPS` is 21 and the union is 24.

### Disagreement 3 — `scraper` and `notebook` have no keyboard shortcut

`openApp('…')` covers 19 sections (`keyboardShortcuts.ts:1387-1494`). `scraper` and `notebook`
are in `APPS`, the palette and pop-outs, but have no bound command.

### Disagreement 4 — a stale comment claims 15

`DesktopShell.tsx:116-117`: *"Reuses CommandPalette's `palette.section.*` keys — same 15 app
names"*. The array immediately below it holds **21**. Cosmetic; recorded because the next reader
will quote it.

---

## 6. The other registries

| Registry | Size | Site |
|---|---|---|
| `COMMAND_CATALOG` (commands + shortcuts) | **125** | `renderer/keyboardShortcuts.ts` |
| `WIDGETS` (desktop widget types) | **27** | `renderer/widgets/registry.tsx` |
| `START_GROUPS` (Start-menu grouping) | **5** groups covering all 21 `APPS` | `DesktopShell.tsx:347-357` |
| `START_PRIMARY_SECTIONS` (pinned row) | **9** | `DesktopShell.tsx:147-157` |
| `SETTINGS_NAV` | **20** | `settingsRegistry.ts:11-150` |
| `SCRAPER_PAGE_IDS` | **17** | `shared/scraperShell.ts:34-52` |
| `SEED_CITY_ICONS` | **0** — empty by design | `shared/desktop.ts:129` |

Desktop icons are user-placed: `DESKTOP_LAYOUT_SCHEMA_VERSION = 2` is documented as
*"pin-from-start: default empty desktop; apps added via Start menu"* (`shared/desktop.ts:110`).
So on a fresh profile **the desktop contributes zero entry points** and every path in §2 marked
**S** is the real first step. A later wave measuring discovery depth should count from Start,
not from a populated desktop.

---

## 7. Method

- `os:open` sites: `grep -rn "os:open" src --include=*.ts --include=*.tsx`, tests excluded — 38
  hits, hand-separated into listeners, dispatchers, and comments.
- Registry sizes read from their declarations; every one carries its `file:line` above.
- Entry-point totals **exclude** `buddyRoutines`' unresolvable dispatcher, so each is a floor.
- No path was driven. "Reaches" here means "dispatches the id"; whether the target selects
  anything is exactly what Probe C exists to measure, and it is not measured here.
