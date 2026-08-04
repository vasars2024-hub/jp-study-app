# HANDOFF P4 — Manga reader and reading surfaces, probed live

Written incrementally during the run (`jp-dispatch` §7). Findings table:
`docs/audit/FINDINGS_P4_MANGA_READING.md`.

---

## 1. Scope and ownership

| | |
|---|---|
| Branch | `audit/a-evidence` — **no branch cut, no commit, no `git add`**, per the dispatch |
| Base commit | `7bab0fb` (`audit(stage-b): B7 box census — 46 families paint 2+ containment cues`) |
| Owned paths | `docs/audit/FINDINGS_P4_MANGA_READING.md`, `docs/audit/HANDOFF_P4_MANGA_READING.md` — nothing else |
| Foreign paths | everything else. Nothing outside the two files above was written. |
| Fix policy | **document-don't-fix.** No source file was modified. |

The dispatch overrides `jp-dispatch` §2 (branch first) and `jp-bridge` §2 (back up
`%APPDATA%\jp-study-app` before a live run) for this run, and says so explicitly:
*"Do not commit, branch or `git add`"* and *"never open `%APPDATA%\jp-study-app` (8.7 GB of real
data)"*. Per `jp-dispatch` §1 the dispatch wins and it is recorded here.

**The real profile was never opened, and that was verified rather than assumed.** After launch,
`C:\Users\Arseniy\AppData\Local\Temp\jp-p4-scratch` was listed and found to contain
`library.json`, `profiles.json`, `desktop-layout.json`, `Local Storage`, `IndexedDB`, `yomitan/`
and `models/` — i.e. Electron honoured `--user-data-dir` and every state file this run can touch
is inside the scratch root.

## 2. Running the app

```
npx electron-forge start -- --user-data-dir=C:\Users\Arseniy\AppData\Local\Temp\jp-p4-scratch
```

`%TEMP%\jp-p4-scratch` was deleted before launch (`ls` confirmed absent), so this is a genuine
fresh-install view. Bridge came up at port 39273 after ~45 s
(`debug/bridge.json`, pid 33700).

First screen was the full-viewport consent gate as the dispatch predicted; dismissed with
**No thanks** via `click.ps1 -Selector '.consent-no'` (`hitTest: match`). **No telemetry was
sent.** After dismissal: `.fwin` count **0**, desktop icon count **0** — the fresh desktop the
dispatch described.

### Instrument defect found immediately — recorded, not fixed (foreign path)

`.claude\skills\jp-bridge\scripts\*.ps1` **cannot be run under Windows PowerShell 5.1**
(`powershell.exe`). `_common.ps1:37` contains a U+2014 em dash inside a double-quoted string;
under 5.1's default ANSI decoding it arrives mangled and the file fails to parse:

```
_common.ps1:37 char:76  Unexpected token 'it' in expression or statement.
_common.ps1:20 char:25  Missing closing '}' in statement block or type definition.
```

Under `pwsh` 7 the same call works. Every measurement in this run was taken through `pwsh`.
This is `.claude/skills/**`, owned by S0 — recorded in §9, not fixed.

### Selector helper used throughout

`click.ps1` resolves with `document.querySelector`, so it needs a **unique** selector, and most
of these surfaces are lists of same-class buttons. The pattern used everywhere below is: tag the
intended element with a temporary `id` in one eval, then click `#p4t`.

```powershell
.\.claude\skills\jp-bridge\scripts\eval.ps1 -Js "(() => { const prev=document.getElementById('p4t'); if(prev) prev.removeAttribute('id'); const el=<finder>; if(!el) return 'not-found'; el.id='p4t'; return 'tagged'; })()"
.\.claude\skills\jp-bridge\scripts\click.ps1 -Selector '#p4t' -Window main
```

The tag is removed on the next use, so no two elements ever carry it, and the hit-test guard
still runs against the real element.

## 3. The fixture — dimensions, and why they suffice

`jp-dispatch` §9.5 and the dispatch's §3 both name the 1×1 GIF that cost this project two
sessions. This run's fixture is stated in full so the same question can be answered about it.

**Built from the repo's own tool, unmodified:**

```
node docs/migration/tools/make-manga-fixture-pages.mjs --out %TEMP%\jp-p4-fixture-pages
  -> page-1.png (89,752 bytes), page-2.png (76,562 bytes), manifest.json
  -> font: C:/Windows/Fonts/YuGothM.ttc
```

Both pages are **1200 × 1700**, drawn as four ruled panels with 6px black borders, three flat
grey tone blocks, and 2–3 white ellipse speech bubbles with 5px black outlines carrying real
**vertical Japanese at 50px** (`猫が窓辺で寝ている。`, `とても静かだね。`, `本を読もう。` on page 1;
`今日は本当にいい天気ですね。`, `公園へ行きませんか。` on page 2). The rendered page-1.png was
opened and looked at, not merely assumed correct.

**Wrapped into a 6-page archive** by
`<scratchpad>/make-p4-cbz.mjs` (kept out of the repo — it is a fixture builder, not a
deliverable; the manifest it writes is reproduced below):

- 6 pages, each 1200 × 1700, alternating the two source pages,
- each stamped `P1`…`P6` in 150px bold in the top-left tone block, well clear of every bubble,
- output `%TEMP%\jp-p4-fixture\P4 Fixture Volume 1.cbz`, manifest at
  `%TEMP%\jp-p4-fixture\manifest.json`.

**Why 6 and why stamped.** The repo tool emits exactly 2 distinct pages. Paging, spreads, the
seek slider, first/last-page buttons and preload all need more than 2, and *a page turn between
two identical pages is unobservable in pixels* — it would have to be inferred from React state,
which is exactly the kind of inference this audit is supposed to refuse. The stamp makes a page
turn visible in a screenshot.

**Why these dimensions suffice.** At 1200×1700 a page fills the reader stage, so a fit mode that
crops, a zoom that does not apply, a spread that overlaps or a region rectangle that lands in the
wrong place are all visible rather than sub-pixel. The bubbles are the same shapes the repo's own
OCR harness was tuned against (`make-manga-fixture-pages.mjs:77-90` explains the column-gap
threshold `detectRegions`/`mergeNearbyRegions` reacts to), so an OCR miss on this fixture is a
real result and not an expected non-result.

### Seeding it into the library

`+ Import file(s)` opens a **native OS file dialog**, which `jp-bridge` §11 forbids driving. The
fixture was therefore seeded through `window.api.importPaths([...])` — **the exact IPC the
drag-and-drop entry point calls** (`DesktopShell.tsx:1334`, inside the window-level `drop`
listener registered at `:1341`). That is fixture setup on a real entry point's code path, not a
substitute for driving the reader.

```
window.api.importPaths(['…\\P4 Fixture Volume 1.cbz'])
  -> [{ id: 374fbb52-0050-40fb-82b4-7b4b2bee9924, title: 'P4 Fixture Volume 1',
        kind: 'manga', pageCount: 6, coverPath: 'pages/0004.png' }]
```

