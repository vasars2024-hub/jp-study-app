# Manga download + Chrome extension — live verification, 2026-08-02

Driven against the running dev app through `debug/bridge.json` (no mouse, no keyboard)
and against a real browser through CDP. Target title throughout:
`https://myanimelist.net/manga/1668/Black_Jack_ni_Yoroshiku` — chosen because Shuho Sato
released it for free redistribution, so it is one of the few titles where exercising the
acquisition path is unambiguous.

---

## 1. The MAL manga path — what works, and the one thing that does not

| Step | Result |
|---|---|
| Catalogue search (`readingMangaSearch`) | **works** — AniList `31668`, `Black Jack ni Yoroshiku` / ブラックジャックによろしく, 127 chapters, 2002, FINISHED |
| Identity join (`readingMangaEntry`) | **works** — returns `malId: 1668`, i.e. the app resolves the user's MAL URL to the same work |
| Discover → Manga → search, in the real UI | **works** — 2 rows, correct native titles, N2, 127 / 70 chapters |
| Download dialog opens on the manga branch | **works** — real cover art, Chapters / Releases shelves |
| **Chapters shelf** | **blocked** — see below |
| **Releases shelf** (nyaa Literature) | **works** — a live index search returned `新ブラックジャックによろしく 完全版 第01-09巻 [Shin Black Jack ni Yoroshiku vol 01-09]`, Batch, 1.1 GB, 3 seeders |

Nothing was sent to a torrent client. The release found is the sequel, not the target work.

### Why the Chapters shelf was blocked

The only manga provider the sidecar has is Seanime's **built-in `local-manga`**, which
serves what is already on this disk. Asked to enumerate chapters for an arbitrary
catalogue title it does not merely return empty — it **panics**:

```
|ERR| go > Runtime error in "manga/GetMangaChapterContainer"
|ERR| runtime error > invalid memory address or nil pointer dereference
seanime/internal/manga.(*Repository).GetMangaChapterContainer  chapter_container.go:69
|TRC| method=POST status=500 uri=/api/v1/manga/chapters
```

That is upstream (Seanime 3.10.2), not ours. **Ours was what the user saw**: the dialog
rendered the transport string verbatim —

> Could not list anything to download — /api/v1/manga/chapters -> HTTP 500: fatal error
> occurred, please report this issue

— and offered no way forward, on a machine where the Releases shelf could have answered
immediately.

### Fixed

- `renderer/components/reading/mangaSourcePresentation.ts` — `isLocalOnlyMangaProvider()`
  excludes the built-in local provider from the *chapter* shelf (it stays valid everywhere
  the reader opens something already downloaded), and `isProviderCrash()` tells a 5xx apart
  from "this title has no chapters", which are different answers.
- `renderer/components/discover/MalDownloadDialog.tsx` — with no real chapter source the
  dialog now takes the graceful path it already had for "no provider installed": Chapters
  disabled, Releases selected, and a note that says what to install. If a chapter provider
  *does* exist and crashes, it falls through the same way and keeps the raw text under a
  sentence that explains it (`malDownload.note.mangaProviderFailed`, all four languages).

Verified live afterwards: shelf reads `Chapters[disabled] / Releases*`, note reads
*"No chapter provider is installed, so this is showing the torrent index instead. Install a
manga provider extension in the media server to download individual chapters."*

**Still open:** to download this title by chapter, an online manga-provider extension has to
be installed in the sidecar. That is a user configuration decision — installing third-party
provider code was not done unprompted.

---

## 2. Discover UI — measured defects, fixed

Measured in the running app, not read off the source.

| Defect | Evidence | Fix |
|---|---|---|
| The page's most prominent block was **fabricated** | "Explore the current catalogue" rendered three hard-coded series from `data/fixtures` with invented counts — *"1,122 episodes · 2,234 mirrors"*, *"StreamSB"* — and three anime regardless of media type. `page.discover` is registered `ready`. | Replaced with **"Ready to scrape"**, built from the user's own shortlist: real poster, real native title, unit count stated only when the catalogue published one. Honest empty state. Also drops a fabricated *"7 active sources"* pill. |
| Anime wording in manga mode | subtitle *"Find anime worth studying"* and placeholder *"Search anime by title"* with `mangaActive: true` | both switch on media type |
| 5 icon-only buttons with **no accessible name** | `disc-searchclear`, `disc-pin` ×4 carried a `title` only — a screen reader reads unlabelled buttons, 25 rows deep | `aria-label` naming the row: *"Download Black Jack ni Yoroshiku"*. Measured after: **0 unlabelled buttons** |
| Active segment signalled by colour alone | `.disc-seg-btn.active` | `aria-pressed` |
| Raw English literals in JSX | against the Scraper's own deferred-i18n rule in `strings.ts` | all through `sx()`/`sxn()`/`sxs()` |

Gates: `vitest` 38/38 on the two touched suites, `eslint` 0 problems,
`node tools/i18n-check.cjs` clean (6,436 keys, all four languages).

**Reported, not fixed:** `.seanime-host-launcher` (`src/media/MediaWorkspaceHost.tsx`) is
`position: fixed; z-index: 9998`, so the "Media workspace · ready" pill sits on top of
whatever app window is beneath it — it was covering the Discover inspector's text. It is
load-bearing for `mediaWorkspaceHostIsMounted()` and three harnesses, and the layering call
belongs to the media track, so it was left alone.

---

## 3. The Chrome extension — verified working on the same page

`extension/` (GrammarX — Reader Companion, MV3, v3.2.0) loaded unpacked, driven over CDP.

| Check | Result |
|---|---|
| Background service worker registered | **pass** — `chrome-extension://…/background.js`, type `service_worker`, manifest name `GrammarX — Reader Companion` |
| Content script injected on the MAL page | **pass** — `#jp-study-fab` present, 4 `jp-study*` nodes |
| App bridge reachable from the worker | **pass** — `GET http://127.0.0.1:18765/v1/health` → 200, `{"ok":true,…,"sentenceAnalysis":true}` |
| `extension/` vs bundled mirror `src/main/chrome-extension/` | **byte-identical**, all 12 files, SHA-256 |

The corner panel renders on the live page (Theme / Highlight / Known tint / OCR / Hide here).

### One thing that will bite the next person

**Branded Chrome stable no longer honours `--load-extension`.** On Chrome 150 the switch is
gone rather than feature-gated; neither
`--disable-features=DisableLoadExtensionCommandLineSwitch` nor
`--enable-unsafe-extension-debugging` brings it back. A run against branded Chrome reports
"no chrome-extension:// target, no content script" **on a healthy extension** — the first
run of this harness did exactly that. Verification used the Playwright Chromium build
(`%LOCALAPPDATA%\ms-playwright\chromium-1228\chrome-win64\chrome.exe`, 149.x), which still
accepts it. The README's manual `chrome://extensions` → Load unpacked path is unaffected and
remains the way a user installs it.

The extension is **not** currently installed in either real Chrome profile.

Three harness traps worth keeping: put the Chromium profile in the OS temp dir (a profile
under the Vite-watched repo kills the dev server with `EBUSY` on `Network/Cookies`);
`chrome.kill()` does not kill the browser tree, so a leftover instance keeps port 9222 and
the next run silently measures the *previous* browser; and identify the extension by
`chrome.runtime.getManifest().name`, because Chrome's own component extensions expose
`…/background.html` targets and one was reported as a pass.
