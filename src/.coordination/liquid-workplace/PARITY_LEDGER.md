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
| Display assignments | Shell/window mgr | **Rewritten 2026-08-17** — run `probes/display-assignments-parity.ps1`. Drive `deskwinSetOptions({displayKey, enabled})` (the channel `MonitorsPage.tsx:60` uses), **restart the process**, and count windows whose `bounds.x >= 1920`. Observed on the real second display `vdd-by-mtt\|1920x1080\|1`: enabled → **1** window at x=1920, y=0, 1920×1080, url `?desk=2&displayKey=…`; after restart (pid 47592 → 32212) → still **1**; disabled → **0**; after restart (→ 55184) → **0**. The two shells are distinct, not a clone: `desk=2` / 1 `.fwin` / 0 desk icons vs main / 4 `.fwin` | **YES** — control inverted across two real restarts, assignments blob restored `-ceq` at 370 chars |
| Secret Aero discovery and exit | Aero shell | **Rewritten 2026-08-17** — do NOT perform the gesture. Run `probes/aero-materials-parity.js`: assert the trigger is present *and hit-testable* (`elementFromPoint` at its centre returns it, a point 200px away does not), then force `data-materials='aero'` and assert the Aero material layer paints, then restore and assert every number returns. Observed: `.fwin` backdrop `none` → `blur(14px) saturate(1.38)` → `none`, radius `20px` → `8px` → `20px`, taskbar background `none` → the Aero blue gradient → `none`; window set `2` (Anki, Scraper) unchanged across all 5 legs | **YES** — control inverted, store byte-intact. **Material layer only**, see scope limit below |
| Aero safe mode | Aero shell | **Rewritten 2026-08-17** — force `data-aero-safe-mode='on'` on top of `data-materials='aero'` (attribute, never `setAeroSafeMode()`), assert the reduced shell renders and the exit route survives. Observed: living-layer displayed `3 → 0 → 3`, `.fwin` backdrop `blur(14px) saturate(1.38)` → `none` → `blur(14px) saturate(1.38)`, transition-duration `0s` → `1e-06s` → `0s`; exit route intact in all 5 legs (trigger present, restore-theme `study-os`) | **YES** — reversible both ways, store byte-intact |
| Wired lifecycle | Wired shell | **Rewritten 2026-08-17** — no environment switch needed. Run `probes/wired-lifecycle-parity.js` then `probes/wired-lifecycle-release.js`: set `data-materials='wired'` (which alone satisfies `isWiredTheme()`), dispatch the product's own `shell:wiredRestart`, record every published phase, then restore. Observed: all five phases in order — `preboot → boot → warning → reveal → active` — with `.fwin` **2 → 2** (Anki, Scraper, same titles) and taskbar entries **2 → 2** across the restart | **YES** — desktopSurvived true, 7 of 7 restore assertions true |
| Blanc cold-open boundary | Blanc renderer | `blancOpen()`, focus the new window, and assert Study OS chrome is absent **in a call whose selectors are proven live in window 1**. Observed: Blanc `blanc.html?blanc=1` mounts **81** blanc-classed nodes / 253 chars of text with `.os-taskbar` **0**, `.fwin` **0**, `.os-desk-icon` **0**; same selectors in window 1 return **1 / 2 / 0-blanc**. A break = Study OS chrome present, or the selectors read 0 in both windows | **YES** — control inverted cleanly |

## Gate status — L0

Present and populated: **all-app baseline (22 surfaces × 3 sizes)**, **Video baseline**,
**performance baselines incl. the restart leg**, **census**, **this ledger** with 7 driven
Dictionary rows, and **this matrix** with 9 rows each carrying a runnable recipe.

**The unobserved set is now 0 of 9.** The two Aero rows and the Wired lifecycle row were
rewritten and driven live on 2026-08-17 (see their rows), after the desktop shortcut grid and
Blanc cold-open boundary on 2026-08-16. **Display assignments closed the same day**, once a
virtual display driver was installed on user instruction and gave this machine a second
display — see its own section below.

**All three of 2026-08-17's rows came unblocked the same way**, and the pattern is worth carrying
forward: each was recorded as needing a persisted write, and in each case the shell's material
layer turned out to be keyed off a **DOM attribute** that a probe may set and restore. Before
accepting that a protected-system recipe needs a state change, check whether the gate it trips is
an attribute check.

### Verdict: L0's gate is CLOSED as of 2026-08-17

The gate's own wording is *"no Liquid product code until the baseline and parity ledger exist."*
Both exist and are committed, and the matrix that guards them now stands at **9 of 9 rows
observed** (was 8 of 9 until display assignments closed on 2026-08-17). **L1 may begin.**

Read this as what it is. The gate says the freeze map exists and has been driven — it does **not**
say every frozen system is fully covered. Of the three coverage holes first recorded here, **two
were closed in the same turn** (the Wired row's empty desk-icon set and its throttled timings, both
re-run and re-measured above). **One is carried into L1:** the Aero rows certify the
**material/CSS layer but not the React `useAeroMaterials()` branch**, which re-reads only on
`onThemeChanged` — and reaching that needs the write the whole rewrite exists to avoid. A wave that
changes Aero's React composition is still uncovered by this matrix. Anything else it is trusted for
is trusting something it does not say.

### The Aero rows — how the forbidden recipe was replaced (2026-08-17)

The old recipe was **forbidden, not merely unrun**: `SecretAeroTrigger.toggle()` calls
`armLockscreenOnSecretEntry()` (can lock the app behind the PIN) and the return trip fires
`restoreStudyEnvironmentAfterAero()`, which writes environment state against a profile with no
restore point. **That risk is measured, not theoretical** — `jp-aero-environment-v1` holds a real
populated ~6 KB blob on this machine and `jp-study-environment-backup-v1` another, so the restore
would genuinely overwrite user state.

**`setTheme(AERO_THEME_ID)` is not the way around it.** `installAeroEnvironmentBridge` subscribes
to `onThemeChanged` (`aeroEnvironment.ts:165-171`) and fires the same restore on the way back out.
So does dispatching a synthetic theme-changed event. The theme is not touchable in either direction.

**What the rewritten recipe drives instead:** the DOM presentation attributes the material layer
is keyed off — `data-materials` and `data-aero-safe-mode` — set directly on `documentElement`,
never through `setTheme()` or `setAeroSafeMode()`. Both are runtime-only, and `aeroSafeMode.ts`'s
own header states safe mode "never edits the environment, display, sound, companion, wallpaper, or
study-data stores". Restoration is unconditional (`finally`) and asserted byte-for-byte.

Result: `storeAllIntact` **true** (4 of 4 keys identical), `attrsRestored` **true**,
`controlInverted` **true**, 0 errors in `/logs`, window set unchanged at 2. Re-run reproduced it
from the committed path.

**Scope limit, stated rather than buried.** These two rows now certify the Aero **material/CSS
layer**. They do **not** cover the React `useAeroMaterials()` branch (`AppChrome.tsx:31`), which
re-reads only on `onThemeChanged` — reaching it needs exactly the write above. A wave that changes
Aero's *React* composition is therefore still uncovered by this matrix; a wave that breaks its
material layer is now caught. Do not read these rows as more than that.

### The Wired row — the environment switch was never needed (2026-08-17)

The ledger recorded this row as requiring "an environment switch, a persisted write". **That was
wrong, and re-deriving it cost one grep.** `isWiredTheme()` (`wiredArchiveLifecycle.ts:72-78`) is
satisfied by `data-materials === 'wired'` **OR** the theme id, so the Aero template applied
unchanged. The restart path was then read end to end — `shell:wiredRestart` → `beginEntry
('restart', true)` → `publish()` → `syncDocumentLifecycle()` — and carries **no `setTheme` call**;
`setTheme` lives only on the `shell:wiredEntry` path, which the probe never dispatches.

Three real side effects, each neutralised or captured rather than ignored: `markWiredArchiveBootSeen()`
writes `jp-wired-archive-boot-seen-v1` (captured, restored, asserted `===`); `syncAmbient()` would
start an audio loop, pre-gated off through the `data-wired-ambient='off'` check it already honours;
one transient startup sound, not suppressed and carrying no state.

Result: phases `preboot → boot → warning → reveal → active`, `reachedActive` true,
`desktopSurvived` true, and **7 of 7** restore assertions true including both localStorage keys.

**Both limits this row was first recorded with are now CLOSED — re-run 2026-08-17, same turn.**
They are kept here because the corrections are the reusable part.

- **The empty-harness hole is closed.** The first run scored `deskIcons` **0 → 0** on a desktop
  holding no shortcuts, which passes trivially and is not evidence. Re-run with a real icon added
  through the shell's own `desktop:add-shortcut` event: DOM icons **0 → 1** (label
  `L0WiredIconProbe`, its `×` control present), then the full restart with the icon present —
  `deskIcons` **1 → 1 → 1** across `preboot → boot → warning → reveal → active`, `.fwin` 2 and
  taskbar 2 unchanged. Icon then removed via its own `×`, DOM back to **0**, and the persisted
  layout re-read through `desktopGetLayout()`: **0 icons, blob 1,829 chars — identical to the
  captured baseline.** Trap confirmed still live: the `×` is `display:none` until `:hover` and the
  bridge `/click` sends no mouse-move, so it must be driven with a programmatic `.click()`.
- **The throttling diagnosis was right, and the timings are now real.** The first run's
  2 / 1379 / 1501 / 1501 / 1501 ms was Chromium catching up throttled timers in a backgrounded
  window. Re-run after `/focus`: **0 / 783 / 858 / 858 / 961 ms** against reduced-motion budgets of
  60 / 420 / 760 / 960 — `active` at **961 ms against a 960 ms budget**. Standing rule this
  produced: **`/focus` before any timing measurement, or the number is the throttler's, not the
  product's.** A backgrounded window does not fail loudly; it reports plausible-looking numbers
  roughly 1.5× too large and bunches phases into one tick.
- **An intermediate run reached only `preboot → boot`** because the release leg fired before the
  sequence finished. It is recorded rather than discarded: `reachedActive` false is the correct
  result for that run, and reporting it as a pass on the strength of `desktopSurvived: true` would
  have been exactly the false pass this matrix exists to prevent.

### The display-assignments row — closed 2026-08-17, and what it cost to read

The blocker was real and is now gone: a **virtual display driver** was installed on explicit user
instruction, and `displayList()` reports two entries, **both `virtual:false`** —
`display|1920x1080|1` (primary, x=0) and `vdd-by-mtt|1920x1080|1` (x=1920). This is *not*
`setVirtualDisplayCount`: simulated keys are deliberately stripped on load
(`shared/displayIdentity.ts:43`, `desktop.ts:310`), so a simulation could never have proven
persistence. Electron hot-detected it — the app session under measurement started at 05:27, two
hours before the driver existed, and still enumerated it.

Numbers are in the row. Three things the next worker should not re-derive:

- **`desktopSetAssignment` is the wrong instrument and reads as a product defect.** It writes the
  store and stops; only `deskwin:setOptions` / `deskwin:assign` / `deskwin:sync` call
  `syncDesktopWindows()` (`desktopWindows.ts:410`, `:420`, `:456`). The first probe flipped
  `enabled` to true through it, saw **1** window instead of 2, and the honest reading is
  "store-only back door", not "assignments do nothing". `MonitorsPage.tsx:60` uses the right one.
- **A second desktop window stalls the first window's JS.** Both shells are same-origin, so
  Chromium reuses one renderer process and mounting a whole second Study OS blocks window 1.
  Measured: `/eval` to `main` **timed out at 30 s twice, then answered in 12,072 ms**, then went
  normal; window 2 answered in **464 ms**. `/health` stayed responsive throughout, which is how
  you tell this from a dead app. `deskwinSync()` in the steady state is **8 ms**. Do not read the
  30 s as a hang and do not read it as main-loop blocking — main was answering.
- **The store persists synchronously and correctly** (`atomicWriteJson`, `desktop.ts:50`). An
  apparent "the file never updated" was a misread clock on the measuring side, not the product.

**DEFECT FOUND BY HAVING A SECOND DISPLAY — a display's identity does not survive a resolution
change.** The live store carries **three** assignments for **two** panels: `vdd-by-mtt|800x600|1`
*and* `vdd-by-mtt|1920x1080|1`. `baseDisplayKey()` is `label|WxH|scale`, and its own doc says
`bounds.x/y` are excluded so that rearranging monitors does not orphan an assignment — but
**resolution is in the key**, so changing it does. The user's per-monitor configuration is
silently reset to the `enabled: false` default and the dead row keeps holding a desktop index.
Not hypothetical: it happened on this machine, inside one session, when the new display was set
from 800×600 to 1920×1080. **Fixed in `be731d7e`** — `syncAssignments` now *adopts* the panel's
previous row (rekeying it) instead of pushing a fresh default, but only on an unambiguous 1:1
label match. The orphan row is **left in place** on this machine: `resolveDisplayKey`'s contract
is that an absent display *keeps* its assignment, and the probe's restore discipline is to leave
the store as found.

**Limit of that fix, stated rather than discovered later.** Because this store *already* carries
two stale-or-live rows labelled `vdd-by-mtt`, the very next resolution change on this machine is
ambiguous by the fix's own rule and will create a fresh row rather than adopt. The fix prevents
accumulation going forward; it does not repair a store that already accumulated. The user-facing
remedy exists and needs no code — Settings ▸ Monitors' reset control (`MonitorsPage.tsx:242`)
calls `desktopResetAssignments()` then `deskwinSync()`, which rebuilds every row from the
displays actually present. Not exercised here: it is a persisted write to real user state.

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

## 2026-08-25 · primary — category 6 on the VIDEO window: 8 of 8 in both presentations, and the search box that was dead

The Video window's surface is the **Media Center** (`.mc-root`), and that is a different surface
from the ledger's six `mediaWorkspace` rows. Measured, not assumed: the Media workspace is a
full-screen overlay at `body > div > .seanime-host`, **outside every `.fwin`** — no window chrome,
no `Make Liquid`, no `data-presentation`. Its rows keep `status: pending` and their
`liquidDestination` now carries that reason instead of the blank that read as unfinished work.
L4 gives that surface a presentation, or nothing does.

**Parity, measured on the same component in both presentations in ONE run.** The desktop carries
two Media Center windows — `Video` 1080×700 `liquid` and `Media` 820×580 `standard` — so no toggle
is needed and nothing else can have moved between the two readings. Both on `Recently added` (36
items, 8 titles / 36 files), `en`, `forest-night`.

| | liquid | standard |
| - | - | - |
| rows reachable | **8 / 8** | **8 / 8** |
| railNav | railButtons=8 active=1 | railButtons=8 active=1 |
| shelfFilter | shelves=9 current=1 | shelves=9 current=1 |
| librarySearch | cards 5 → 0 → 5 | cards 5 → 0 → 5 |
| sortAndView | sortOptions=7 viewButtons=2 pressed=1 | same |
| itemActions | menu items 0 → 4 → 0 | 0 → 4 → 0 |
| history | back=false forward=true | back=true forward=true |
| workspaceRoute | `.seanime-host` 0 → 1 → 0 | 0 → 1 → 0 |
| windowLifecycle | chrome=5 ariaPressed=**true** | chrome=5 ariaPressed=**false** |

**The product defect this category found: `89c11473`.** `librarySearch` is the row that was
`false` before the fix. `MediaCenterView` wrote every keystroke into `state.query`, and the only
other reader of that value in the file was the input's own `value` prop — `LibraryPanel` handed
the shell `state.items`. After: "big" → 1 title / 29 files; a term no title carries → 0 cards,
"Nothing here matches the current filter.", **0 import buttons**; cleared → 8 / 36 exactly. The
narrowing is on the SCOPE, never on `items`: the rail footer stayed "36 items" and the shelf
counts 36/2/3/29/4 throughout, because a filtered `items` would make an unmatched search claim
the library is empty — a worse defect than the dead control.

**Round trip, Liquid → Standard → Liquid on the Video window, title-anchored** (during the middle
phase `data-presentation` names two windows). Driven **dirty**: search `big`, Grid view,
`Recently added`. A === C on **every** key, `diffKeys: []` — rect 92,40 1080×700, maximized false,
focused true, zIndex 153, activeRail, activeShelf, searchValue `big`, sortValue `series`,
viewMode `Grid view`, cardCount 1, chars 686, nodes 242, controls 35. **byteForByte true.**

**Three negative controls, each fired and each flipped EXACTLY ONE row 8 → 7 → 8**: a second rail
entry made active (`railNav`), both view buttons pressed (`sortAndView`), `aria-pressed` stripped
off the Liquid toggle (`windowLifecycle`). `exactlyOne: true` on all three, `restoredEqual: true`.

**Video category 6 = 10/10.**

**Two traps paid for here.** (1) `debug/evfile.cjs` sent probe files verbatim and `/eval` takes ONE
EXPRESSION, so every probe ending `})();` failed with the generic "Script failed to execute" — it
reads exactly like a probe with a bug. `l6-parity-dictionary.js` at HEAD failed and succeeded
byte-identical with the trailing `;` stripped; the loader strips it now. That is why this
category's own probe kept going un-re-driven. (2) `ContextMenu` closes on **mousedown** captured
on `window`, not on `pointerdown` or `.click()`; the first pass reported the menu as never closing
and the count accumulating 4 → 8 across the two windows. Product was fine; the probe was not.

## 2026-09-01 — the Media workspace was the fourth host, and 6 rows were stuck on that alone

`parity-ledger.json`: **44 `both` / 6 `pending` → 45 / 5.** Every one of the six was
`mediaWorkspace`, and every one recorded the SAME blocker in its `liquidDestination`, measured
2026-08-25: *"NONE … the Media workspace is a full-screen overlay mounted at
`body > div > .seanime-host`, outside every `.fwin`. It has no window chrome, no `Make Liquid`
control and no `data-presentation`, so per-window presentation state (L3) cannot reach it at
all."* Six of fifty rows, one cause — an enable flow whose destination does not exist, which is
the same defect the pop-out and the reader each fixed one host earlier.

**`f2619b91` gives it one.** `renderer/workspacePresentation.ts` is host four. The overlay adopts
the INTERIOR and never the frame, for the reader's reason plus one of its own: `.seanime-host` is
`inset: 0` and opaque ON PURPOSE — its own rule in `styles.css` records that everything numbered
below it must be HIDDEN rather than merely behind — so a translucent root would not read as
material, it would put the desktop grid back on screen underneath an `aria-modal` dialog.

**Row 8 (segment navigation) CLOSES, driven live in Liquid**, through the product's own controls:
Library → Readiness hid the library pane (computed `display` block → none, `hidden` set, box
**1264x774 → 0x0**) with `#media-workspace` **and** `.study-player-slice` still MOUNTED, and
Readiness → Library restored **1264x774 exactly**. The presentation round trip is byte-identical
over 18 measured properties by `-ceq`, storage included — bar background `rgba(0,0,0,0)` →
`color(srgb 0.101961 0.0941176 0.137255 / 0.72)` → `rgba(0,0,0,0)`, padding `6px 10px` → `4px 8px`
→ `6px 10px`, height 51 → 47 → 51px, `lq.workspace.presentation` null → the blob → null. The root
stayed opaque `rgb(13,12,18)` with `backdrop-filter: none` in BOTH presentations, which is
decision 1 holding rather than an omission.

**Rows 7, 9, 10, 11 and 12 stay `pending`, and the reason changed from CODE to DATA.** Their
Liquid destination now exists; what is missing is a subject. `window.api.seanimeStudyLibrary()`
returned `{ok: true, files: []}` — the media server has scanned **0 files** on this machine,
against the **77** the standard halves were driven on in 2026-08-17. The readiness pane says so
itself and says it honestly ("The media server has no files yet. Set a library folder in the media
server and run a scan."), so this is the product behaving correctly on an empty library, not a
regression. A row measured only on an empty harness is capped, not skipped — so none of the five
is claimed. **Re-drive all five on a scanned library; that is the whole of what is left here.**

The false sentence was REMOVED from all six rows rather than left standing beneath a newer one. A
superseded measurement that still reads as current is how a ledger starts lying.

## 2026-09-01 late (primary2) — the 5 pending rows re-derived: the blocker is data, and it is real

Still **45 both / 5 pending / 0 REGRESSION of 50**. No row moved, and the reason is now proven
rather than reported.

All five are `mediaWorkspace` and all five need a file in the player.
`window.api.seanimeStudyLibrary()` returned `{ok:true, files:[]}` again this turn, measured live
through the bridge. The previous turn recorded that number; what was missing was whether an
empty list meant an empty library or a swallowed failure — the exact ambiguity
`main/seanime/studyLibrary.ts`'s own header warns about for a different endpoint.

It is honest. `src/main/seanime/index.ts:139-145` returns `{ok:false, error}` whenever
`readSeanimeStudyLibrary()` throws, and `seanimeApi` (`main/seanime/client.ts:50`) throws
`SeanimeUnavailableError` unless sidecar status is exactly `ready`. Its comment states the rule
in as many words: "a stopped sidecar has to reach the renderer as an explicit reason, because an
empty list is indistinguishable from an empty library". So `ok:true` means the sidecar answered
and has **0** local files.

Not a missing install either — the 84 MB sidecar is staged at `build/seanime.exe`. Seanime has
no media directory scanned on this machine. Our boundary is read-only by construction (two GETs,
no PATCH), so no agent can scan one. Logged in `needs-user.md` 2026-09-01 22:55.

The Liquid destination itself is **not** the blocker: `f2619b91` built the overlay's own
presentation host and the row text has said so since. These five are one scan away from `both`.
