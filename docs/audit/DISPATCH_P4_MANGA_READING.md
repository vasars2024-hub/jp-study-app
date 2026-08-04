# DISPATCH P4 — Probe the manga reader and reading surfaces, live

Cold agent, `jp-study-app`. You hold the **live queue exclusively**.

## 0. Read first

`.claude/skills/jp-dispatch/SKILL.md` · `.claude/skills/jp-bridge/SKILL.md` (use its `scripts/`)
· `.claude/skills/honesty-probe/SKILL.md` (**emit its row schema exactly**) ·
`.claude/skills/claim-check/SKILL.md` · `.claude/skills/css-measure/SKILL.md` for any geometry ·
`docs/audit/CENSUS_SURFACES.md` for your denominator · `docs/audit/FINDINGS_P1_SCRAPER.md` and
`FINDINGS_P7_DICT_ANKI.md` for the shape of a good findings table.

**The user named the manga reader explicitly** when commissioning this audit. It is the reason
this dispatch exists.

## 1. Ownership

Only `docs/audit/FINDINGS_P4_MANGA_READING.md` and `docs/audit/HANDOFF_P4_MANGA_READING.md`.
**Do not commit, branch or `git add`.** **Do not fix anything** — document-don't-fix.

## 2. Running the app

```
npx electron-forge start -- --user-data-dir=%TEMP%\jp-p4-scratch
```

- `npm start -- --user-data-dir=X` **fails** — npm's `--` goes to forge; the second `--` is required.
- Never put the profile in the repo; never open `%APPDATA%\jp-study-app` (8.7 GB of real data).
- Bridge ~40 s. If you watch a log for readiness, **truncate it first**.
- **Fresh profile opens behind a full-viewport consent gate** — dismiss with **No thanks**. Do not
  send telemetry on the user's behalf.
- Zero windows, zero desktop icons. Open your own surface via the Start menu the way a user
  would — **not** via `os:open` or `?popout=`, which prove a code path rather than an entry point.
- Shut down with `eval.ps1 -Js "(() => { setTimeout(()=>window.close(),200); return 'closing' })()"`
  and **confirm `bridge.json` is gone**. A previous run died at its limit and left the app orphaned.

## 3. ⚠ The fixture trap that has already cost this project two sessions

**Two prior sessions of manga proofs ran on a 1×1 GIF** and proved nothing while appearing to
pass. Before you conclude anything about rendering, zoom, region drawing, OCR or page geometry:

> **Ask whether the fixture is capable of showing the thing you are testing.**

A page image must be large enough and have enough structure that a failure would be *visible*. If
you build a fixture, state its dimensions and why they suffice. If you cannot build an adequate
one, the verdict is `NOT-REACHABLE — no adequate fixture`, which is a result, not a gap.
`docs/migration/tools/make-manga-fixture-pages.mjs` and `fixture-manga-cdn.mjs` exist — read them
before writing your own.

## 4. Surfaces

**Manga:** the reader itself, `MangaReaderSettingsPanel`, `MangaSidebar`, `MangaViewModeSwitcher`,
`MangaCompareView`, `MangaCleanTextView`, `MangaRegionDrawLayer`, `RegionEditorModal`, and the
OCR path (`main/mangaOcr.ts`, `paddleOcr.ts`, `bookOcrJob.ts`).

**Reading:** Reading Finder, the Reading Garden, the book/EPUB reader, Novels, Resources,
`MangaProviderBrowser`.

Report `visited / enumerated` per area against the census.

## 5. Standing claims to settle

| Claim | Notes |
|---|---|
| **The chapter shelf is blocked by design on a fresh install** — the only manga provider the sidecar ships is the built-in `local-manga`, which serves what is already on disk, and asked to enumerate chapters for an arbitrary catalogue title it **panics** (upstream nil-pointer, HTTP 500). A fix made the dialog take a graceful path: Chapters disabled, Releases selected, and a note naming what to install | Verify the graceful path renders **and reads honestly**. `isLocalOnlyMangaProvider()` and `isProviderCrash()` in `renderer/components/reading/mangaSourcePresentation.ts` are the mechanism |
| **Reading Finder shipped without the visual/click pass it owes.** `TASKS.md` records "User visual/click test in the running app still pending" | This dispatch is that pass. Drive the level chips, filters, Surprise Me, the Continue Reading strip, and the paste-a-chapter-URL flow |
| **The 24-site seed catalogue** (`data/readingSites.ts`) carries a last-verified date per site because of site rot | Do **not** mass-fetch 24 external sites. Check the data's shape and honesty — does the UI disclose staleness? |
| **`.seanime-host-launcher` is `position: fixed; z-index: 9998`** and was reported covering other windows' content | Confirm whether it still overlaps anything. This was reported-not-fixed and left to another track |

## 6. Probes

Apply A–F. Particular attention:

- **Probe B on a fresh profile:** the novels/resources catalogues are bundled study content and are
  *legitimately* non-empty — that is the rule's exception, not a fabrication. But a **fabricated
  count or a fake "recently read"** is not.
- **Probe D:** the manga/reading cluster is full of paths that can only fail (no provider, no
  library, no OCR model). **A surface that fails silently is the finding.** Does each explain
  itself and offer a way forward?
- **Probe F:** the region editor and compare view are prime "built but unreachable" candidates.
  How many entry points does each have? `AppChrome` conformance is measured against **23 render
  sites** — that is the verified figure; an earlier count of 42 was a line-count artifact.

## 7. Evidence discipline

- A control that prints success is not passing — assert a side effect that **survives a reload**.
- **`/screenshot` lags one frame**; insert a second call between click and capture.
- **`/eval` re-evaluates your expression if the result fails to serialize** (`debugBridge.ts:236`)
  — a side-effecting expression returning a DOM node **double-applies**. Return primitives.
- **Wait for async loads.** P1 twice read a surface one round-trip after navigating and saw empty
  lists that were still loading — two findings that would have been fabricated.
- Use `click.ps1`; if its hit-test guard refuses, **believe it** — it already caught a
  full-viewport overlay that would have produced a false "the control does nothing".
- **Write the handoff as you go.** The previous run hit its session limit mid-probe; everything it
  had written survived and everything it had not was lost.

## 8. Handoff

`FINDINGS_P4_MANGA_READING.md` (rows, schema, `visited / enumerated`) and
`HANDOFF_P4_MANGA_READING.md` — what you drove and how, every fixture's dimensions and why they
suffice, what you could not reach and why, every count re-derived, and defects noticed in code you
do not own.
