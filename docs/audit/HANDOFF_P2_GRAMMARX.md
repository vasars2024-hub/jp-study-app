# HANDOFF P2 — GrammarX, driven live

**Status: in progress, written as I go.** Anything not yet measured is absent from this file
rather than guessed at.

---

## 1. Scope and ownership

| | |
|---|---|
| Branch | `audit/a-evidence` — **not cut, not committed**; the dispatch forbids branching, committing and `git add` |
| Base commit at start | `00db8e5` |
| Owned | `docs/audit/FINDINGS_P2_GRAMMARX.md`, `docs/audit/HANDOFF_P2_GRAMMARX.md` — **nothing else was written** |
| Foreign (read-only to me) | all of `src/**`, all other `docs/**`, `grammar-audit.json` |

**Dispatch overrides `jp-dispatch` §3.** That skill says the dev app belongs to the user and must
not be started. This dispatch explicitly hands me the live queue and gives the launch command, so
the dispatch wins for this run — recorded here as §1 of that skill requires.

**No `src` file was modified at any point** (`jp-bridge` §9 — HMR under measurement invalidates a
run). Two measurements injected a `<style>` element into the live DOM as a *positive control* and
removed it in the same eval; both are flagged in place and the removal was asserted.

### The app I drove

```
npx electron-forge start -- --user-data-dir=%TEMP%\jp-p2-scratch
```

- Profile: `C:\Users\Arseniy\AppData\Local\Temp\jp-p2-scratch` — **fresh, outside the repo**.
- `%APPDATA%\jp-study-app` was **never opened**.
- Consent gate dismissed with **No thanks** (`.consent-no`).
- Bridge: port 39273, pid 23080.

`node tools/grammar-audit.cjs` **was run, twice, with `--out` redirected to my scratchpad**, so the
repo's `grammar-audit.json` was not rewritten. Verified after each run — `git diff --stat
grammar-audit.json` still shows the same `5 insertions(+), 5 deletions(-)` it showed before I
started. **That pre-existing modification is not mine and I did not touch it.**

---

## 2. How I opened the surface

Fresh profile = zero windows, zero desktop icons, **87 DOM nodes** in the whole viewport.

I opened GrammarX the way a user would: **taskbar Start button → Start menu → "Grammar"**
(`.os-start-app`, 4th tile). No `os:open` dispatch, no `?popout=` URL — those would have proved a
code path rather than an entry point.

---

## 3. Counts re-derived this run

Every figure below was measured by me. Nothing is repeated from a plan doc.

### 3.1 Corpus (`node tools/grammar-audit.cjs --out <scratch>`, 2026-08-04)

| Figure | Measured | Agrees with |
|---|---:|---|
| Total points (raw) | **2,744** | B6 |
| ja / zh | **2,145 / 599** | B6 |
| Uncategorized records | **0 (0.0%)** | B6 — plan's 852 / 38.3% is dead |
| Canonical categories declared / populated / empty | **82 / 82 / 0** | B6 |
| "title + gloss only" | **1,820 (66.3%)** | B6 — plan's 50.0% is wrong |
| N5 / N3 | **50 / 675** | B6 |
| Duplicate groups after dedupe | **0** | B6 |
| **Verification: verified** | **64 (2.3%)** | B6 — plan's "the count stays 0" is wrong |
| Verification: missing / imported-unreviewed / partial | 1,573 / 706 / 401 | — |

### 3.2 What the Explorer actually lists

**2,410 points**, read off `.gram-x-count` with no filters. That is the deduped corpus:
2,744 − 334 duplicates = 2,410. ✔

**Two code comments carry stale numbers for this.** `GrammarExplorer.tsx:47-49` says both old
explorers "listed all 2,227 rows including the 334 duplicate ones", and `GrammarView.tsx:70-73`
says "a status bar claiming 2,227 next to a list of 1,893". The **334 is still exactly right**;
2,227 and 1,893 are both obsolete (now 2,744 and 2,410). Comments only — no user sees these.

### 3.3 DOM node count — the dispatch's 19,336

**Re-derived: 19,443** with one Grammar window open on the default theme, no filters.
`document.getElementsByTagName('*').length`. Empty desktop = **87**, so GrammarX alone contributes
**~19,356**. The prior 19,336 reproduces to within 0.6%.

**The number is not incidental — see finding `P2-F1`.** It is almost entirely the Explorer list
rendering all 2,410 rows at once because `VirtualList`'s windowing is defeated.

---

## 4. Standing claims — the live verdict

| §7.1 | Defect | B6 static | **My live verdict** |
|:-:|---|---|---|
| 1 | "No category" chip vs 852 uncategorised | number obsolete | *pending* |
| 2 | Filter-sidebar label/count collisions | fixed in CSS, unproven | **FIXED — proven live, with a positive control** |
| 3 | Raw `· ja` leaking into copy | structurally fixed | *pending* |
| 4 | Saved-filter dropdown resets its label | still live | **CONFIRMED still live** |

### Defect 2 — settled, and the fix is load-bearing

Measured all **24** `.gx-filters-group-head` rows at **five window widths** (820 / 940 / 700 / 560
/ 420 px), setting `.fwin`'s inline width and restoring it in the same eval (`css-measure` §5):

```
820px {sidebarW:257, heads:24, minGap:6, collisions:0, clipped:0, overflow:0, wrapped:0}
940px … 700px … 560px … 420px  — byte-identical
```

**That invariance is expected here and I checked why rather than trusting it** (`claim-check` §2):
`.gx-filters` is `width:268px; flex:0 0 auto` (`styles.css:6859-6861`), so the sidebar never
narrows and the window width genuinely cannot move this number.

**Positive control.** I injected `.gx-filters-group-head{display:block}` to remove the fix,
re-measured, and removed the style:

```
armed    : {minGap:6, collisions:0,  firstSample:"Time & sequence284"}
control  : {minGap:0, collisions:24, firstSample:"Time & sequence284"}   <- the reported defect
restored : {minGap:6, collisions:0}
styleGone: true
```

The control reproduces **exactly** the shape §7.1 reported — `Time & sequence` followed
immediately by its count at gap 0. The label is identical; only the number moved (168 → **284**)
as the corpus grew. So the fix is real, it is doing the work, and the instrument can fail.

### Defect 4 — confirmed still live

`GrammarExplorer.tsx:337` pins `value=""` on the preset `<select>`.

Driven: saved a preset "P2 N5 probe" at levels `["N5"]` → added N4 so the list read **456 points**
→ picked "P2 N5 probe" from the dropdown.

```
before : {value:"",  label:"Saved filters…", count:"456 points"}
after  : {value:"",  label:"Saved filters…", count:"50 points",
          activeChips:["N5×"], persistedLevels:["N5"]}
```

**The preset applies correctly and persists.** The control's *displayed state* is what is wrong:
having just loaded a named preset, the dropdown still reads the placeholder `Saved filters…`, so
nothing on screen says which preset is active. `MIXED`, minor.

---

## 5. Probe E — filter presets and saved state

**LIVE.** Set state, then `/reload`, then re-read. Everything survived:

| Key | Before | After reload |
|---|---|---|
| `jp-grammarx-explorer-filters-v1` | `levels:["N5"]` | `levels:["N5"]`, list `50 points` |
| `jp-grammarx-explorer-presets-v1` | preset "P2 N5 probe" | present in dropdown |
| `jp-grammarx-explorer-favorites-v1` | `["n5-ato-de"]` | `["n5-ato-de"]`, ★ on the row |
| `jp-grammarx-explorer-study-v1` | `["n5-ato-de"]` | `["n5-ato-de"]`, ＋ on the row |
| `jp-grammarx-familiarity-v1` | `{l:2, m:1}` | badge `F` on the row |

Channel tested: **renderer `localStorage`** (all five keys). Not the main-process JSON channel.

**Not persisted, and this is ordinary rather than a defect:** the filter panel's open/closed state
and the mode tab both reset on reload (React state, never written). Recorded so a later reader does
not file it.

---

## 6. What I could not verify

*(filled in as the run proceeds)*

---

## 7. Defects noticed in code I do not own

*(filled in as the run proceeds)*

---

## 8. Gate results

*(not yet run)*
