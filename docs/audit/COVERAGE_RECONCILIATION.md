# Coverage reconciliation — what this audit has actually opened

**2026-08-04, orchestrator.** The per-area coverage table in `AUDIT_2026-08.md` §0 is accurate and
reads as thorough: *26/26 depth-3 Scraper surfaces, 17/17 rail pages, 5/5 flashcard modes, 3/3 EPUB
sub-modes*. Every one of those denominators is real.

**They are also all denominators of the areas that were probed.** This file states the denominator
nobody had stated: of the app's own `DesktopWinSection` union, **how many apps has this audit ever
opened?**

---

## 0. Method, and one method rejected

`src/shared/desktop.ts:8-32` defines `DesktopWinSection` as exactly **24** members. That is the
authoritative list — not the census's derived count, not the Start menu's rendering of it.

**Rejected method:** grepping the `FINDINGS_*.md` files for each section name. It returns
`note` = 7 files and `reading` = 9, because it matches *"noted"*, *"nothing"*, *"reading the code"*
and *"already read"*. A mention is not a visit. Using it would have manufactured coverage out of
prose — the same error class as counting `AppChrome` line-matches as consumers, which this audit
already committed once.

**Method used:** a section counts as driven only where a findings file records the app being
**opened as a window and interacted with**, with an observable.

---

## 1. Result — 10 of 24

| # | Section | Driven? | Evidence |
|---|---|---|---|
| 1 | `scraper` | **YES** | `FINDINGS_P1_SCRAPER.md` — 17/17 rail pages, 26/26 depth-3 |
| 2 | `dictionary` | **YES** | `FINDINGS_P7_DICT_ANKI.md` — driven under JA, 36 `t()` calls counted live |
| 3 | `anki` | **YES** | `FINDINGS_P7_DICT_ANKI.md` — 3 read-only AnkiConnect calls, 84 decks verified unchanged |
| 4 | `flashcards` | **YES** | `FINDINGS_P7_DICT_ANKI.md` — 5/5 modes |
| 5 | `grammar` | **YES** | `HANDOFF_P2_GRAMMARX.md`, `FINDINGS_P2B_GRAMMARX_CLOSE.md`, `FINDINGS_V6_VIRTUALLIST.md` |
| 6 | `reading` | **PARTIAL** | `FINDINGS_P4_MANGA_READING.md` — 5/5 manga view modes; the **reading half is unfinished** |
| 7 | `games` | **YES** | `FINDINGS_SHELL_FIRSTRUN.md` — Game Arena, 0 CJK / 872 Latin under a JA UI |
| 8 | `player` | **YES** | `FINDINGS_MEDIA.md`, `FINDINGS_MEDIA2_WORKSPACE.md` |
| 9 | `video` | **YES** | `FINDINGS_MEDIA2_WORKSPACE.md` |
| 10 | `music` | **YES** | `FINDINGS_MEDIA2_WORKSPACE.md` — `.mc-root` = 1 |

### Never opened — 14 of 24

`library` · `novels` · `notebook` · `translate` · `stats` · `resources` · `settings` · `note` ·
`visualizer` · `musicwidget` · `city` · `immersion` · `calendar` · `youtube`

**None of these has been opened as a window by any probe in this audit.**

---

## 2. What that does and does not mean

**It does not mean they are broken.** Nothing here is a verdict on any of the 14. They are
`NOT-PROBED`, which is a statement about this audit, not about the app.

**It does mean the headline coverage reads better than it is.** *"149 surfaces censused"* is a
static enumeration. *"26/26 depth-3"* is 26 of the 35 depth-3 surfaces — and 26 of those 35 sit
behind `scraper` alone, which the census itself flagged. Depth-2 is **77 surfaces**, and the probes
that reached any of them touched a minority.

**Three of the 14 are load-bearing for findings already in the register:**

| Section | Why it matters |
|---|---|
| `settings` | `F5` says 34 orphan settings keys exist and 16 are user-changeable. The **Scraper's** drawer was driven; the main Settings app — and the census's **81 settings search cards** — was not |
| `immersion` | `ImmersionView.tsx:346` is the single un-i18n'd button that is the *only* entry point to the ~4,789-line visual-novel platform. `B6-P22` is `SHIPPED-UNVERIFIED` and names this surface as the one a probe must drive |
| `resources` | Hosts `WorldHeatMap`, the consumer of the CC-BY-4.0 `worldMapPaths` asset whose attribution exists only in a source comment. The attribution obligation is a **publication** item |

`notebook` is a fourth near-miss: `B7` measured ~40 `.gx-notebook-lineage-btn` controls as a real
WCAG 2.5.8 failure statically, and the app was never opened to confirm it.

---

## 3. Disposition

This does **not** invalidate any finding. Every verdict in the FIX register was driven, and each
cites its observable.

It bounds what the audit may claim as a whole. The correct summary sentence is:

> *Ten of the app's twenty-four apps were opened and driven; within those, coverage was deep and is
> stated per area. Fourteen were never opened.*

Not:

> *The app was audited.*

**Recommended next probes, in value order:** `settings` (largest unexamined surface area, and F5
depends on it), `immersion` (settles the audit's own `SHIPPED-UNVERIFIED` VN row), `resources`
(a licence-attribution obligation), `notebook` (confirms or refutes a statically-measured a11y
failure).
