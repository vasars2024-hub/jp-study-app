# Feature parity ledger — L0

Authority: `src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` §5.3 and §10.1. This ledger plus
the protected-system matrix are what the **L0 gate** requires before any Liquid product
code may land.

## Schema

§5.3's row shape, one row per feature:

```text
app | feature | current route/control | standard destination | liquid destination |
keyboard route | data/state owner | automated proof | visual proof | status
```

## Rules, from §5.3 and the rubric's category 6

- **Count behavior, not buttons.** "Mine sentence" is one row only if fields, media
  preview, destination deck, error states and undo/retry are all inside it; otherwise they
  are their own rows.
- A row is closed by an **observable side effect**, never by a button's presence. A parity
  check that has never caught a missing feature has never been shown to work.
- A feature is complete only when **both** standard and Liquid destinations work.
- Every moved control must retain a search/keyboard route.
- New UI cannot land with `pending` parity rows.
- The ledger must cover **settings and recovery paths**, not only happy-path actions.
- Status vocabulary: `pending` (no Liquid destination yet) · `standard-only` (deliberately
  never going Liquid — needs the reason inline) · `both` (verified in each, by side effect)
  · `REGRESSION` (reachable in one and not the other — blocks the wave).

## Status of this ledger

**Machine-readable ledger: `parity-ledger.json` (§5.3 asks for machine-readable; this file is
its narrative). Row set: census DONE. Rows written and DRIVEN: Dictionary, 7 rows. Rows
deferred to their own wave per §5.3's "before an app is redesigned": everything else.**

**The L0 gate is still OPEN, on one thing only — 6 of 9 protected-system rows are unobserved.
See "Gate status" at the end. No Liquid product code may land.**

### Dictionary — 7 rows, each closed by a measured side effect

Driven live through the debug bridge on 2026-08-16; the full rows with their verbatim
observations are in `parity-ledger.json`. Summary of what was actually observed:

| Feature | Observed side effect | Driven |
| --- | --- | --- |
| Look up a word | typed 食べる + `Search`: **38 → 340 DOM nodes, 251 → 2,926 chars**, JMdict entry with pitch, EN + RU glosses | yes |
| Language/source toggle | attribution **`powered by Jisho (JMdict)` ↔ `powered by CC-CEDICT`**, 2,926 ↔ 514 chars, returns to 2,926 exactly | yes |
| Presentation mode | Interlinear **2,926 → 1,428 chars**, adds `Detected scale: word` + an AI-provenance line; returns to 2,926 exactly | yes |
| Per-result actions | the save control is **stateful**: 2 results read `Saved to Flashcards`, 1 reads `Save to Flashcards` | state only — these write user collections |
| Saved searches | `Save search` is **absent** at empty state and **present** after a query | presence only — it persists |
| Notes pane + filter | both render at empty state; list empty on this profile, so filtering has nothing to measure | presence only |
| Window lifecycle | pop out → a **second real BrowserWindow 900×640** (`/health` 1 → 2, url `?popout=dictionary`), in-desk window removed, **the active search did not carry**, and closing the popped window left **neither** window | yes |

Two of these are the kind of thing a button-counting ledger cannot see: the save control
carries real stored state, and pop-out is not state-preserving. The second is L3's problem.

**Trap for anyone driving a controlled input here:** setting `input.value` through the native
`HTMLInputElement` setter and dispatching `new Event('input')` — the usual React workaround —
**silently did not stick**. The field read back empty and `Search` produced zero DOM change,
which looks exactly like a broken search. The bridge's own `POST /type` (real input synthesis
into the focused element) worked first try. Focus the field through the product, then `/type`.

`CENSUS.md` (milestone L0-baseline-1, `da154966`) supplies the row set: **25 Study OS
sections served by 21 distinct root components**, 778 owned files, 255,153 LOC, **4,709
controls**, 464 command references, 5,715 i18n keys. Regenerate with
`node tools/liquid-census.cjs`.

Two census findings change the shape of this ledger and are not optional detail:

- **`note` has no route through `AppSection.tsx`** (24 of 25 sections do). A Liquid
  presentation applied at that seam misses Note entirely, so Note needs its own row set and
  its own entry point — see census finding 1.
- **A row is per component-with-route-variant, not per §7 app.** `player`/`video`/`music`
  are one `MediaCenterView` differing only by `initialTab`; `novels`/`reading` are one
  `ReadingWorkspaceView` differing only by `initialSection`. One change lands on three §7
  rows at once — see census finding 2.

| Component (sections served) | Controls | Commands | Census | Ledger rows | Closed by side effect |
| --- | --- | --- | --- | --- | --- |
| SettingsApp (settings) | 1307 | 83 | done | 0 | 0 |
| MediaCenterView (player, video, music) | 816 | 100 | done | 0 | 0 |
| FlashcardsView (flashcards) | 471 | 33 | done | 0 | 0 |
| AnkiView (anki) | 389 | 36 | done | 0 | 0 |
| ScraperView (scraper) | 367 | 24 | done | 0 | 0 |
| ImmersionView (immersion) | 359 | 49 | done | 0 | 0 |
| AgentWorkspaceShell (agent) | 173 | 24 | done | 0 | 0 |
| LibraryView (library) | 134 | 24 | done | 0 | 0 |
| GrammarView (grammar) | 130 | 2 | done | 0 | 0 |
| ReadingWorkspaceView (novels, reading) | 110 | 18 | done | 0 | 0 |
| DictionaryView (dictionary) | 97 | 24 | done | 0 | 0 |
| YouTubePlaylistsView (youtube) | 70 | 16 | done | 0 | 0 |
| CalendarView (calendar) | 68 | 0 | done | 0 | 0 |
| GameArenaView (games) | 53 | 9 | done | 0 | 0 |
| ResourcesView (resources) | 49 | 9 | done | 0 | 0 |
| TranslateView (translate) | 40 | 5 | done | 0 | 0 |
| StatisticsView (stats) | 26 | 4 | done | 0 | 0 |
| NotebookView (notebook) | 22 | 1 | done | 0 | 0 |
| MusicWidget (musicwidget) | 18 | 3 | done | 0 | 0 |
| ReadingGarden (city) | 10 | 0 | done | 0 | 0 |
| VisualizerWidget (visualizer) | 0 | 0 | done | 0 | 0 |
| **Note (note)** | — | — | **NO SHARED ROUTE** | 0 | 0 |

The `Controls` column is a **ceiling on the row count, not the row count**. §5.3 counts
behavior, not buttons: several controls collapse into one row ("Mine sentence" includes
fields, media preview, destination deck, error states and undo/retry), while one control
that branches on state may become several. Rows are written per app during its own wave,
against the live baseline — never from this table alone.

## Protected-system matrix

§8: these must survive every wave unchanged unless a wave explicitly owns them. A row here
is a **freeze**, not a feature — breaking one is a release blocker, not a parity gap.

"How a break is observed" is a **recipe someone can run**, not a description. `Verified` means
that recipe was run on 2026-08-16 and produced the stated number.

| Protected system | Owner | How a break is observed | Verified |
| --- | --- | --- | --- |
| Taskbar shell | Study OS shell | `.os-taskbar` exists and carries **one entry per open window**. Observed: 3 entries for Scraper, Anki, Dictionary. A break = missing bar, or entry count ≠ `.fwin` count | **YES** — 3 of 3 |
| Window dragging | Shell/window mgr | Pointer-drag the `.fwin-bar` by a known delta and read back **committed** `style.left/top` (state, not a transform). Observed: `128px,84px` → `168px,114px` for a +40/+30 drag — exact | **YES** |
| Pop-outs | Shell/window mgr | Click the pop-out `.fwin-b` and count windows in `/health`. Observed: **1 → 2 windows**, the new one 900×640 at `?popout=dictionary`, in-desk `.fwin` removed | **YES** — plus the state-loss note above |
| Desktop shortcut grid | Study OS shell | Dispatch the shell's own `desktop:add-shortcut` event, count `.os-desk-icon`, then remove via the icon's own `×` and re-count. Observed **0 → 1 → 0**, the icon carrying its label `L0ParityProbe`. A break = the count does not move, or the removal leaves a residue | **YES** — 0→1→0, layout restored |
| Display assignments | Shell/window mgr | Move a window to a second display and confirm the assignment survives a restart | no — **one display on this machine**, so the negative control is impossible here |
| Secret Aero discovery and exit | Aero shell | Perform the discovery gesture, assert the Aero shell mounts, then exit and assert Study OS returns with the same window set | **no — recipe is forbidden as written**, see below |
| Aero safe mode | Aero shell | Force safe mode and assert the reduced shell renders with its exit route intact | **no — same forbidden entry step** |
| Wired lifecycle | Wired shell | Drive `requestWiredArchiveRestart` and assert the boot sequence completes with open modules and desktop layout in place (`DesktopShell.tsx:2294` states that contract) | no — needs an environment switch first, see below |
| Blanc cold-open boundary | Blanc renderer | `blancOpen()`, focus the new window, and assert Study OS chrome is absent **in a call whose selectors are proven live in window 1**. Observed: Blanc `blanc.html?blanc=1` mounts **81** blanc-classed nodes / 253 chars of text with `.os-taskbar` **0**, `.fwin` **0**, `.os-desk-icon` **0**; same selectors in window 1 return **1 / 2 / 0-blanc**. A break = Study OS chrome present, or the selectors read 0 in both windows | **YES** — control inverted cleanly |

## Gate status — L0

Present and populated: **all-app baseline (22 surfaces × 3 sizes)**, **Video baseline**,
**performance baselines incl. the restart leg**, **census**, **this ledger** with 7 driven
Dictionary rows, and **this matrix** with 9 rows each carrying a runnable recipe.

**The gate does not close yet**, but the unobserved set is now **4 of 9**, not 6 — the desktop
shortcut grid and the Blanc cold-open boundary were driven live on 2026-08-16 (see their rows).

The four that remain are **not** four more cheap runs, and the earlier "three of those six are
cheap" estimate was wrong on two of them. Corrected, with the reason each is blocked:

- **Secret Aero discovery/exit** and **Aero safe mode** — the recipe as written is **forbidden**,
  not merely unrun. `.claude/skills/jp-bridge/SKILL.md` §2 bars entering Secret Aero to test
  something: `SecretAeroTrigger.toggle()` calls `armLockscreenOnSecretEntry()`, which can lock the
  app behind the PIN, and the *return* trip fires `restoreStudyEnvironmentAfterAero()`, which
  writes environment state — against a profile with no restore point. These rows need a rewritten
  recipe that observes the Aero shell **without** the live entry gesture (a mounted-component or
  route-level assertion), not a braver agent. Whoever rewrites them owns that decision.
- **Wired lifecycle** — `requestWiredArchiveRestart()` only means anything once `isWiredTheme()`
  is true (`wiredArchiveLifecycle.ts:412`, `:430`), so the recipe silently no-ops from Study OS.
  Reaching it requires an environment switch, which is a persisted write in the same class as the
  Aero one. Cheaper than Aero and genuinely reversible, but it is a state change, not a read.
- **Display assignments** — unchanged hardware blocker: one display on this machine, so the
  negative control cannot exist here at all.

Until these are run, a wave could break a frozen system and nothing here would catch it — which
is the one job this matrix has.

**Instrumentation limit found while closing the grid row, so the next worker does not re-derive
it:** the desk icon's `×` is `display:none` until `.os-desk-icon:hover` (`styles.css:13806`,
`:13822`), and CSS `:hover` responds only to real input. The bridge's `/click` emits
mouseDown/mouseUp with **no mouse-move**, so hover is never established and the control measures
`0×0` — the §8 zero-size guard correctly refuses it rather than scoring a zero. The removal leg
was therefore driven by a programmatic `.click()` on the real `×` element, which still runs the
real React `onClick` → `removeIcon(id)`. This is an instrumentation limit, **not a product bug**;
do not file it as one.

**Restore discipline on the grid row.** The persisted layout was captured before
(`desktopGetLayout()`, 1,829 chars) and compared after: **not** byte-identical, and the single
delta was fully accounted for — window `scraper` `z: 412 → 414`, bumped by the probe's own
coordinate click, not by the add/remove. Normalising `z` to 0 makes the two blobs **exactly
equal**, icon set included. A same-length blob that differs is precisely the case an eyeball
comparison passes, so compare the string and then explain the delta.

Also still outstanding for §10.1: `note`, `visualizer` and `musicwidget` have no baseline
(`ALL_APPS_BASELINE.md`, "Not captured"), and MediaCenter's rows need a real clip.
