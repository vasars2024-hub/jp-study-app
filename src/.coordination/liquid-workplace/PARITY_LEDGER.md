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

## 2026-09-02 (primary) — 45 -> 47 `both`, and a fourth Liquid host the harness could not see

**The blocker was cleared by re-checking it, not by anyone doing anything.** All five remaining
`pending` rows were `mediaWorkspace`, parked since 2026-09-01 on an empty media library.
Re-measured live this turn: `seanimeStudyLibrary()` returns `ok:true` with **80 files** against
the `{ok:true, files:[]}` recorded a day earlier, and the sidecar's own log names the cause —
status `ready`, three watched directories, `Library size updated: 48 GiB`. The needs-user entry
was DELETED rather than amended. Standing instruction to re-check parked blockers each turn:
this is what it is for.

### The instrument was wrong first, and that is the durable half

`l6-parity.js` resolved this surface as `host: 'chromeless'` — and said so in a docstring, as
though it were a fact about the product. It had not been true since `f2619b91`: `.seanime-host`
carries `data-presentation`, `.workspace-liquid` is the opt-in class, and `.seanime-host-liquid`
is a real toggle with `aria-pressed`. So `toggleLiquid` REFUSED on a host that has a working
toggle, exactly the defect trap 8 was written for twice already (pop-out `6c16653f`, reader
`2026-08-26`) — using this very surface as its counter-example each time. Fixed as the FOURTH
host, `workspace`, with the same shape as the other three, plus its chrome analogue
(`.seanime-host-close`, `need = 1`, the reader's case: `inset: 0` owns no minimize/maximize).

Second, smaller instrument fix found by the first: `check()` coerced a feature's own `ok: null`
through `!!out.ok` and published it as **false**. A row that knows it is inapplicable — this
surface has three views and only one mounts the readiness pane — would have been reported as
"unreachable", **in both presentations**, so the parity comparison would still have read equal
while both halves were wrong. `na` is now honoured when DECLARED, never inferred from a falsy
`ok`, or a genuinely broken row could hide by returning nothing.

### The numbers

`check('mediaWorkspace')` — **2 reachable / 2 total / 0 na in BOTH presentations**, identical
evidence strings: `filters=6 pressed=1 claims=79 rows=79` and `rows=79 covered=79 opens=123
enabled=123`. Host resolves `workspace`, matched by root-selector. Round trip standard ->
liquid -> standard **byte-identical** on the full snapshot: chars 31515, nodes 4639, controls
700, same rect and fields. Driven by hand as well, and agreeing: view segment Readiness ->
Library, `.study-player-slice` **0x0 -> 1264x821**, `<video>` 0 -> 1; `Ready` narrows
`.study-lib-row` **79 -> 1** onto the same Big O row the standard half found in 2026-08-17, and
79 + 1 = 80 reconciles with the library call.

NEGATIVE CONTROLS, both firing on **exactly their own row and nothing else**: detach the pressed
filter -> `readinessFilters` false (`filters=5 pressed=0 claims=NaN`), `readyOpen` still true;
detach one open action -> `readyOpen` false (`covered=78 opens=122`), `readinessFilters` still
true. Both restore to baseline, 0 detached nodes left.

`opens >= rows` rather than `===` is measured, not sloppy: 79 rows render 123 open actions.

### What is NOT claimed

Three rows stay `pending` and their reason CHANGED — recorded in the rows themselves so the old
empty-library sentence is not left standing as current state. The transcript rail needs a loaded
subtitle track (panel honestly empty, "No subtitle track is loaded.", with the video mounted);
the two detach rows need the Study Block menu driven. Neither was driven this turn.

App restored and measured: presentation back to `standard`, overlay closed, 0 windows /
0 dialogs, `desktop-layout.json` sha256 **9DFB6E2F2361...**, byte-identical to the banked
baseline before and after.

## 2026-09-02 (primary2) — the ledger stops being hand-transcribed

`33b3a10b`. 19 of the 24 apps `l6-parity.js` declares SPECS for have a driven, controlled
cat6 harness and no ledger row, because the only writer was `l6-parity-write-rows.cjs` —
hand-written, one `observed` string copied out of a console log at a time. Transcription was
also the one step of the chain carrying no control: nothing here could tell a mistyped
`rows=2410` from the real one.

`probes/l6-parity-rows.cjs` keeps the two halves apart by construction:

| half | fields | source |
| --- | --- | --- |
| measured | `observed`, `status` | verbatim from the run's `rowEvidence` + `control.mutations`; the writer never composes a number |
| authored | feature, currentRoute, keyboardRoute, dataStateOwner, both destinations | `parity-row-metadata.json`; an id with no entry REFUSES BY NAME |

`rowEvidence` is new in `cat6-feature-parity.cjs` (same commit): `out.parity` answers the
rubric's question ("are the counts equal") and throws the evidence away, which is right for
a score and useless for a ledger row.

**Four refusals, all fired, ledger byte-untouched after each.** The first is against a REAL
banked artifact — `cat6-notebook-final-20260827`, a genuine PASS 10/10 — which predates
`rowEvidence` and is refused rather than written with an empty `observed`. The other three
reach later branches from that same artifact used as a **labelled fixture, not a
measurement**: no metadata block for `notebook`; a VOID verdict writing nothing; an unknown
row id refused by its own name.

**The dictionary block is a regression test, not just seed data.** It was copied
mechanically out of the seven dictionary rows already here, in the spec's own id order, by a
node read of this ledger — not retyped. The seventh row, *Window lifecycle*, has no spec id
and is deliberately absent. So the first live `cat6 --app dictionary` run must re-derive
those six features and add **zero** rows; if it adds one, the derived and hand-written halves
disagree and one of them is wrong.

**State: 0 rows written.** The writer is landed and UNARMED until a live cat6 run banks a
`rowEvidence` artifact. That run is the next turn's opening slice.

## 2026-09-02 — the writer is ARMED, and arming it found the instrument reading too early

`ff63d811`, `1ec440ab`, `ba0d1070`, `e272640b`. Ledger **50 rows / 7 apps -> 62 rows /
9 apps**, 57 `both` / 5 `pending`; `notWritten` **19 -> 17** root components.

### The armament run found a real defect in cat6, not in the writer

The opening slice was "re-derive Dictionary's rows and add ZERO". The live run came back
**FAIL** — `lookup` unreachable at `chars=275 nodes=47`, `resultActions` at `actions=0`.
Reading the SAME window through the SAME expression after the run: `chars=2345 nodes=262
hasTaberu=true hasJMdict=true actions=20`. Both rows were live the whole time.

A FIXED SLEEP IS NOT A SETTLE. `step()` returns as soon as it has clicked; the effect
arrives later. And the two parity checks are not simultaneous, so the standard half can read
pre-resolve and the liquid half post-resolve — which is a **fabricated parity regression**,
and `REGRESSION` is a status this writer would have written into the ledger.

`settle()` polls `chars|nodes|controls` until two consecutive reads agree, before the parity
check and before each round-trip snapshot. It excludes `fields` on purpose: the fields are
what the round trip COMPARES, and settling on them would make the instrument wait for its
own answer. An unconverged settle costs `roundTripHeld` only.

| run | settling | standard | liquid | verdict |
| --- | --- | --- | --- | --- |
| `--step-ms 0 --settle-tries 0` | off | **5/7** | **7/7** | FAIL on all three bars |
| `--step-ms 0` | on | 7/7 | 7/7 | PASS 10/10, zero round-trip diffs |

Same window, same profile, same command; the only difference is `--settle-tries 0`. The
settle's own trace is the proof it did something: `275|47|16 -> 2345|262|50 -> 2345|262|50`.
`--settle-tries 0` DROPS the bar term rather than scoring it false, because zero tries can
never produce two agreeing reads and failing a control by arithmetic proves nothing.

Naturalistic half, with its rate rather than an adjective: the race bit **2 of the first 3**
runs and **0 of the 6** after. It is a COLD-START race — once the dictionary DB is open the
query resolves inside 700 ms — which is why it survived every previous cat6 run.

### What was written

| app | rows | added | how the authored half was obtained |
| --- | --- | --- | --- |
| dictionary | 7 | **0** | back-derived from the 7 hand-written rows; the zero IS the test |
| calendar | 5 | 5 | authored from source; first app with no prior ledger row |
| settings | 7 | 7 | authored from source |

**The dictionary zero is stronger than it looks.** The dedupe key is `app|feature`, so one
mistyped feature string writes an EIGHTH row instead of matching. `added: 0` therefore also
certifies that all seven authored strings match the hand-written ledger verbatim — the one
link in this chain that had never had a control on it.

**A false claim in `parity-row-metadata.json` was corrected, not left.** Its provenance note
said the dictionary `windowLifecycle` row "has NO spec id and is deliberately absent".
`l6-parity.js` declares `{ id: 'windowLifecycle', f: lifecycle }` for EVERY app, and the
live run refused by that name — the refusal working. Six of seven had been written; the
seventh existed in the ledger and was missing only its authored half.

Writer self-control: **6 armed / 6 fired** across the two new runs
(liquid-unreachable -> REGRESSION, unknown row id -> REFUSED by name, VOID -> writes nothing).

### Not a defect, checked rather than assumed

Settings' drive log shows `closeSearch -> expanded:"true"`, which reads as an Escape that
did not close the panel. Reading the same input afterwards: `expanded:"false"`, no panel,
value empty. The step reads the attribute in the SAME synchronous `/eval` as the keydown, so
its return value is one React render behind. The product is correct; the STEP's report is
stale. Same class as the defect above, one layer out.

### What b2 still needs, exactly

15 of the 24 specs still have no metadata block, and the 5 `pending` rows are still
mediaWorkspace's — they have a destination now but no SUBJECT, because
`seanimeStudyLibrary()` returns `{ok:true,files:[]}` on this profile. The next apps to
author are the data-independent ones (`scraper`, `resources`, `city`, `shell`); the
data-dependent ones (`flashcards`, `statistics`, `library`, `music`, `video`, `youtube`)
need a profile with real content or they measure an empty harness, which is capped, not
skipped.

### Scraper: a VOID, and inside it a probe that asks a question the product deliberately stopped answering

`cat6 --app scraper` on this profile: **VOID**, 4/7 both presentations, `drawerCategories`,
`settingsFields` and `reverseControls` all unreachable, 2 driven refusals, control VOID.
The writer refused it, which is correct — a VOID run writes no ledger row.

The proximate cause is an EMPTY HARNESS and the instrument said so on both halves at once:
the settings drawer is closed on a fresh profile, `switchDrawer` REFUSED with `drawer
categories unavailable`, and the two mutations that own those rows could not be armed
(`no current drawer category`, `no settings field control`) so `exactlyOwnRow` came out
false and the control VOIDed. `l6-parity.js`'s scraper drive is
`['switchDrawer', 'restoreDrawer', 'toggleRail', 'restoreRail', 'closeSearch']` — it has no
step that OPENS the drawer, so it assumes a state a fresh profile does not have.

**But `reverseControls` has a second, independent defect, and this one would survive opening
the drawer.** The row reads:

    const opener = qa(w, '.scr-topbar-actions button[aria-pressed="true"]');

`.scr-topbar-actions` is ScraperTopBar.tsx:38-105, and it contains exactly ONE
`aria-pressed`, at :91 — the **advanced-mode** toggle. The drawer opener at :78-86 carries
`aria-expanded` + `aria-controls` instead, and the source comment says why in as many words:
"A disclosure, not a toggle button… `aria-pressed` was the wrong contract twice over: a
screen reader announced 'not pressed' for a panel that is closed, and nothing in the DOM
linked the control to the region it opens."

So the product was CORRECTED and the probe still asks the old question. The consequence is
not a false negative, it is a latent **false positive**: with the drawer shut and advanced
mode ON, `pressedOpeners` counts the advanced toggle and `reverseControls` would score a
reversal affordance that is not on screen. Same class as the banked "control must attack the
scored term" trap, one layer out.

FIX, named rather than taken, because it needs a live re-run to verify: add an `openDrawer`
step at the head of the scraper drive (click `.scr-topbar-actions [aria-controls]` when
`aria-expanded` is false) with a matching `undo` that closes it only if the drive opened it,
and re-point `reverseControls` at `aria-expanded="true"` on the disclosure that actually
owns the drawer. Artifact: gitignored `debug/_p2f-cat6-scraper.json`.

## 2026-09-02 — the scraper finding is FIXED and MEASURED (primary2, `ddeb97f3`)

The fix named above was taken, and the re-run it needed happened. Both halves landed in
`probes/l6-parity.js`.

**The false positive, proven at one instant on one DOM.** Drawer SHUT and advanced mode ON,
both expressions read over the same window in the same `/eval`:

| expression | reading | scores a reversal affordance? |
| --- | --- | --- |
| OLD `.scr-topbar-actions button[aria-pressed="true"]` | `pressedOpeners=1` | **yes — falsely** |
| NEW `.scr-topbar-actions button[aria-controls]` + `aria-expanded="true"` | `disclosures=1 expanded=0` | no |

The single element the OLD expression counted reports `aria-label` **"Advanced controls
shown"**. Advanced mode was captured (`aria-pressed=false`), driven ON for the reading, and
restored to `false`, verified after.

**The drive, with a discriminating control.** HEAD's `l6-parity.js` was copied into
`debug/_p2g-ctrl/` at the same directory depth and run through the *same* cat6 harness
against the *same* window and profile — the only difference is the spec file:

| spec | verdict | parity | drive refusals | failing rows |
| --- | --- | --- | --- | --- |
| pre-fix (HEAD) | **VOID** — negative control did not falsify | 4/7 both | 2 | `drawerCategories` (categories=0 fields=0), `settingsFields` (fields=0), `reverseControls` (drawerClose=false pressedOpeners=0) |
| post-fix | **PASS 10/10** | **7/7 both**, rowsAgree, 0 onlyInOne | **0** | none |

All seven mutations flip exactly their own row and restore (`exactlyOwnRow` true ×7); round
trip `standard -> liquid -> standard` held with **0 diffs**, `fieldsHeld` and `shellHeld`
true, dirtied field `scr-search-input` returned.

**`drawerReady` is a wait, not a sleep, and the number is why it exists.**
`ScraperSettingsDrawer` is `lazy()` (ScraperApp.tsx:68). Measured on this profile: **403 ms**
cold after a renderer reload, **113 ms** warm — but on the run where the dev server had never
transformed the chunk, `.scr-drawer-cat` was still absent 1,400 ms after the click and both
drawer steps refused. RATE, not an adjective: **2 refusals on that cold run, 0 on both warm
re-runs.** `/eval` is synchronous, so a busy-wait in the renderer would block the very import
it waits for; a step that spends one more step-interval and reports `cats` is the honest shape.

**Ledger.** `scraper` is the third app authored from source with no prior row, so all seven
are new: **62 rows / 9 apps -> 69 rows / 10 apps**, `both` 63 -> **66**, `pending` **3**
unchanged. Validated rather than trusted: **0 duplicate `app|feature` keys**. The writer's own
negative control fired 3 of 3 on this artifact — a one-presentation row comes out
`REGRESSION`, an unknown row id refuses by name, and a `VOID` verdict writes nothing.
## 2026-09-02 (backup) — the two detach rows CLOSE, and driving them found a defect

**49 `both` / 1 `pending` of 50**, up from 47 / 3. The Study Block menu was driven for the first
time, in both presentations, on the now-scanned library.

### Route

Readiness -> `Ready` (1 row, THE Big O ep 1) -> `Open` -> `Toggle study controls` ->
`Customize workspace` -> the Transcript block's `⋯`. The menu offers `Open in its own window`
(`data-study-action="detach-block"`), `Remove from workspace`, and a **Send to display** group
carrying all three real monitors — `window.api.displayList()` returns three entries, every one
`virtual: false`.

### Row 12 — detach and return

| | window count | detached rect | panel in host |
| --- | --- | --- | --- |
| standard, detached | 1 -> 2 | 730,106 460x820 | gone |
| standard, returned | 2 -> 1 | — | back at 384x424 |
| liquid, detached | 1 -> 2 | 730,106 460x820 | gone |
| liquid, returned | 2 -> 1 | — | back at 384x424 |

Identical in both. The detached window is the real panel at
`/?studyBlock=transcript&surface=workspace` with its own `Return to the player`.

**Finding, recorded not repaired:** the detached window has **no presentation of its own** —
`data-presentation` null, 0 nodes matching `[class*="liquid"]` — while its host is Liquid and
`lq.workspace.presentation` is set in the same origin. Probably correct (a detached Transcript
is entirely dense work, which §2.3 keeps on an anchor) but currently *silent* rather than
decided. The honest shape is a `standard-only` row with its reason, which needs a row written
for a host the ledger does not yet cover.

### Row 13 — send to another monitor, and the defect it found

`Send to display` on a block that is **still docked** means "detach it *there*", so it routes
through `openStudyBlockWindow(..., displayKey)` — not through the `moveToDisplay` handler the
2026-08-22 run exercised, which is the only path that called `rememberBounds`.

| | placed | after close/reopen |
| --- | --- | --- |
| before `321d5f63`, liquid | 2090,20 460x512 | **730,106 460x820, primary** |
| after `321d5f63`, standard | 2090,20 460x512 | 2090,20 460x512 |
| after `321d5f63`, liquid | 2090,20 460x512 | 2090,20 460x512 |

2090,20 460x512 is `centreOnWorkArea` exactly, derived from the formula rather than assumed:
x = 1920 + (800-460)/2, height = min(820, 552-40) = 512, y = (552-512)/2 = 20.
`study-block-windows.json` then held
`{x:2090,y:20,width:460,height:512,displayKey:"vdd-by-mtt|800x600|1"}`.

**Correction, published rather than buried.** `321d5f63`'s message says the store file was
"ABSENT in userData both before and after". Every *node* read of that path this turn was VOID —
shell escaping collapsed `process.env.APPDATA + "\jp..."` into `Roamingjp-study-app...`, which
`existsSync` answers `false` for. Only the first check, from PowerShell before any detach,
stands. The finding does not rest on it: the reopened **rectangle** is the discriminating
measurement, because `openingBounds` returns a saved rectangle whenever one exists, so a
primary-centred reopen proves nothing was saved.

### The row that stays pending, and why it is a different reason again

The transcript rail is mounted and honest in both presentations (384x424, "No subtitle track is
loaded.", mining destination named) but has no **cues**, because the one file classified `Ready`
does not play: opened through its own `Open` action and again through the product's
`seanime:media-workspace-open` channel with an explicit `localFilePath`, the stage rendered
`playback-error-container` — "The media server accepted this file and then stopped preparing
it" — with 0 `<video>` elements. Cues come from the subtitle manager, which has tracks only once
the file is playing. **Second finding:** the readiness pane says `Ready — Nothing to do` about a
file that will not open.

App and profile restored: overlay closed, presentation `standard` with the storage key removed,
1 window, `study-block-windows.json` deleted (it was absent before), `desktop-layout.json`
sha256 **9DFB6E2F2361...** unchanged across the whole turn including the restart.

## 2026-09-02 (primary2) — `resources` joins, and one row is deliberately NOT written

**69 rows / 10 apps -> 76 rows / 11 apps**, `both` 68 -> **75**, `pending` **1** unchanged;
0 duplicate `app|feature` keys. `resources` declares EIGHT rows and **seven** were written.

### The eighth row, and why the ledger does not claim it

`collectedSections` guards the two optional landing strips. Its mutation detaches
`.mytool-card .mytool-remove` — and **nothing is collected on this profile**, so the mutation
did not run. It REFUSED.

cat6 scored that identically to a mutation that ran and flipped the wrong row, so the run came
back **VOID** with 8/8 in both presentations, all three bars passing and 7 of 8 mutations
flipping exactly their own row. That is an instrument defect in the opposite direction from
the usual one: it *discards* seven proved rows over a data gap. But quietly passing it would be
worse — the row would enter the ledger with nothing having falsified it, and "verified by side
effect" is the only thing a ledger row claims.

So the two cases are now separated. cat6 reports `armed: false` with the refusal text,
the run stays scorable, and `l6-parity-rows.cjs` skips **that row by name**:

    "skipped": ["collectedSections (control unarmable: no collected tools)"]

**DISCRIMINATING CONTROL on the relaxation itself, live and on the same window.**
`catalogueCount`'s mutation was re-pointed at `.res-group .res-card .res-name` — an element
that EXISTS, so the mutation arms, but whose removal flips `resourceCards` instead:

| run | control verdict | run verdict |
| --- | --- | --- |
| unarmable mutation only | `7 of 8 armed, every one exact; UNARMABLE: collectedSections` | **PASS 10/10** |
| armed-but-wrong mutation planted | `VOID - a mutation did not flip exactly its own row` | **VOID** |

An armed mutation that misbehaves still voids the run, with an unarmable one present. The
plant was reverted and the file verified byte-identical (sha256 equal, `git status` empty).

`resources` itself: **8/8 reachable in both presentations**, rowsAgree, 0 onlyInOne, round trip
`standard -> liquid -> standard` with 0 diffs, drive 8 steps / 0 refusals. Writer self-control
3 armed / 3 fired.

## 2026-09-02 (primary2) — `city` joins, and it is the first app with NO Liquid half

**76 rows / 11 apps -> 85 rows / 12 apps**, `both` **75** unchanged, `pending` 1 -> **10**;
0 duplicate `app|feature` keys. All nine new rows are `pending`, and that is a derivation
rather than an omission: Mooncap is not Liquid-presentable, so there is no second
presentation to compare, and `pending` is the status vocabulary's own word for it.

**The absence is a MEASUREMENT, taken at one instant over every open window.** The harness's
`noLiquid` branch refuses outright unless some other window can take the trip, so the reading
is discriminating by construction:

| | reading |
| --- | --- |
| `targetHasLiquidControl` | **false** |
| `targetChromeButtons` | **3** — a real chrome cluster, so this is not "no title bar" |
| `targetPresentation` | `standard` |
| `othersWithLiquidControl` | **`["Resources"]`** — open beside it, rendering `.fwin-b-liquid` |

That control is the whole point: without it, "this window has no toggle" and "no window has
one" read identically. L12 bullet 1 independently records the same three sections —
`city`, `musicwidget`, `visualizer` — as offering no presentation toggle, so two instruments
now agree on the same product fact from different directions.

The round trip that stands in for the presentation flip is **minimize -> restore through the
taskbar** (the taskbar button is a toggle, so it is driven twice), and `rankHeld` was true.
Rows **9/9 reachable**, drive 1 step / 0 refusals, and **all nine mutations armed**, each
flipping exactly its own row and restoring. Writer self-control: 2 armed / 2 fired, and the
third plant reports `NOT ARMABLE — no row is reachable in both presentations`, which is
correct on this branch and is said rather than counted as a pass.

`notWritten` is now **re-derived mechanically** instead of decremented by hand: 25 declared
specs, 12 apps with rows, **14 specs still with no row at all**, each named, plus the one
ledger app (`mediaCenter`) that has rows but no spec and so cannot be re-derived by this
route at all.
## 2026-09-02 (primary) — 49 → **50 `both` of 50, 0 pending**

Every written row in this ledger is now closed. The bullet L12 b2 does **not** close with it:
its words are "every feature-ledger row", and `notWritten` still names 19 root components that
have no rows at all. What changed is the *kind* of work left — b2 is now purely a coverage
problem, with nothing written-but-unproven behind it.

### The last pending row closed by fixing something else first

`Transcript rail: cue list, active-cue follow, per-cue translate, card preview` had been
pending for three turns under three different reasons, the last being "the one file the
readiness pane classifies `Ready` does not play". **That is not reproducible on this build.**
THE Big O - 01 (mediaId 567), opened through `seanime:media-workspace-open` with an explicit
`localFilePath`, renders 1 `<video>` and plays.

What *does* reproduce is a different file's failure, and its report was a fabrication —
`0a3418b5`. 47 of this profile's 80 library files carry `mediaId: 0`; the sidecar refuses them
with `abort-open local file has not been matched to a media: <path>`, and `StudyPlayerSlice`
threw that payload away, leaving the racing POST's `status >= 500` sentence on screen: *"It is
usually a codec or container it cannot read — try another episode to confirm the file is the
problem."* Advice that fails identically for all 47. That sentence is very likely why the
previous turn stopped looking for a playable file.

### The four clauses, standard then Liquid, same seek

Paused at exactly **396,000 ms** both times, driven with `debug/_pr3-transcript.js`:

| | standard | liquid |
| --- | --- | --- |
| cue rows / with text / seek buttons | 267 / 267 / 267 | 267 / 267 / 267 |
| active cue (`[data-active="true"]`) | 71, `aria-current="true"`, 20 chars | 71, `aria-current="true"`, 20 chars |
| card preview (`[data-study-mining]`) | `Cue 72 · track 0 · 395,617–398,083 ms` | identical |
| panel box | 384x517 | 384x517 |
| translations present | 1 | 1 (survived the switch) |
| Translate buttons | 267 | 266 |

`translateBtns` 267 → 266 is arithmetic, not a gap: the one cue translated in standard no longer
offers the button, and 266 + 1 translation = 267.

**Active-cue follow has its own discriminating control**, and it is the checkbox rather than the
seek: from the identical 396,000 ms position, Follow **off** leaves `activeInView` **false** at
`listScrollTop` 4488; Follow **on** makes it **true** at 3693. **Per-cue translate** was driven,
not counted: clicking Translate on cue 71 took `.study-transcript-translation` 0 → 1 and the row
read back its Japanese, its furigana, and *"Without past history, culture can still be
manifested."* The card-preview string is the 2026-08-17 observation **re-derived**, not quoted.

Round trip: `Return to standard window` reproduces every field above and **removes**
`lq.workspace.presentation` (null, not the string `"standard"`).

### Recorded, not repaired — it is not this row's words

The presentation switch reflows the transcript list, the panel's own *"scrolling away suspends
following"* rule sees that scroll, and **Follow silently turns itself off** (`listScrollTop`
3693 → 4552, `followChecked` true → false). A layout change is not a user scrolling away.
Re-enabling it in Liquid restores every number, so today it costs one click rather than a
feature.

## 2026-09-02 (primary) — L12 b2 coverage: `flashcards`, the first data-dependent app

`notWritten` names apps with **no rows at all**, and that is what b2's "every row" now turns
on. The split with the concurrent worker is by DATA, not by alphabet: their profile has an
empty media library and no Anki collection, so they take the data-independent apps and this
tree — 3,235 cards, 80 media files, real statistics — takes the ones that would otherwise be
scored on an empty harness and capped.

**`flashcards`: 8 rows, `both` 8, `pending` 0.** `cat6-feature-parity.cjs --app flashcards`
= **PASS 10/10**: parity **8/8 standard and 8/8 liquid**, `onlyInOne` empty, round trip
`standard -> liquid -> standard` with `flash-search-input` dirtied first — fields held, shell
held, **0 diffs**, box `820x580` in both. All **8 mutations** flipped exactly their own row
(8/8 -> 7/8 each, `unexpectedRows` empty every time) and all 8 restored. 0 drive refusals.

Every row's evidence is byte-identical across the two presentations except `windowLifecycle`,
which correctly reads `liquidAriaPressed` false then true. Deck arithmetic held on the real
collection: `all=3235` = `unfiled+folders=3235`, badge sum 3235 over 5 groups, 49 rendered
rows all worded/meaninged/removable, 24 strip cards.

### The instrument was wrong, and the surface was right

`virtualizedList` read **false on a correct list**. Its term was
`expect > clientHeight ? declared > rendered : true` — any group taller than its pane must
render fewer rows than it declares. A 5-card group is 540px in a 420px pane, so it qualified,
and `VirtualList` rendered all 5 — correctly, because its window is derived from the
**viewport**, not from the collection. Measured live: rendered **5/5/7/16/16** against
declared **5/5/7/144/3074**, which is `min(declared, cap)` exactly. A second read after a
re-mount gave `cap=12` with the same identity holding, so the cap is not even a constant and
hardcoding 16 would have been the next wrong answer.

What virtualization actually promises is that the rendered count stops growing while the
declared count does not. The row now reads the cap off the DOM and **requires it to be
demonstrated**: some collection must exceed it. **CONTROL ON THE RELAXATION**, run live —
detach the two groups larger than the cap and the row still FAILS
(`cap=7 maxDeclared=7 ceilingProven=false`), so a desk where every group is small cannot buy
a 10. Both bodies re-attached; 5 bodies, row true, `cap=16 maxDeclared=3074`.

## 2026-09-02 (primary2) — `shell` joins, and the row it needed first was wired-only

**102 rows / 14 apps.** `shell` contributes **9**, all `both`, from a `PASS 10/10` run:
9/9 reachable in BOTH presentations, round trip 0 diffs, 8 of 8 declared mutations armed and
each flipped exactly its own row.

The shell is the first subject that is the CONTAINER rather than a hosted window. `shq`
excludes anything inside `.fwin`, so a taskbar of 2 buttons is never confused with a desktop
of 300 controls, and the parity claim is the useful one: **a window going translucent must not
cost the shell a capability**, since the taskbar is the only route back to a window that is
behind another. The harness does not raise this host — there is nothing to raise — and POSTs
`/focus` instead.

### The `shellIdentity` row was wired-only on two counts, and aero proved both (`d9f1c213`)

It scored `!!mat && theme.indexOf(mat) === 0 && owned > 0`. Measured live on `frutiger-aero`,
not reasoned:

1. the Aero theme's id is `frutiger-aero` and its materialSet is `aero`, so `indexOf` is
   **9, not 0**. A correctly stamped Aero shell failed the stamp half outright.
2. `.${mat}-wall-atmosphere, .${mat}-tray-lamps` are rendered only under `wired`
   (DesktopShell.tsx:2748, :3502). On aero the shell renders **0** `aero-`prefixed elements
   outside `.fwin`, against **178** inside the hosted Resources window — so there was nothing
   to widen the selector to, and widening it would have scored the shell from a window's
   contents.

Aero's identity is CSS scoped to `[data-materials='aero']` restyling the same `.os-*`
furniture. What both material sets own in the DOM is the secret start surface,
`.os-start-aero-menu` (DesktopShell.tsx:683, `aero || wired`), which exists only while the
menu is open — so `readStartOpen` records it and the row reads it back. On the base theme the
row is now `na` (no material set stamped = no material identity to verify), never false.

**CROSS-MATERIAL CONTROL, same harness / window / profile, three themes:**

| theme | verdict | `shellIdentity` carried by |
| --- | --- | --- |
| `study-os` (before the fix) | **FAIL**, 8/9 reachable, mutation UNARMABLE | — |
| `frutiger-aero` | **PASS 10/10**, 9/9 both | `materialStartMenu=1`, `identityElements=0` |
| `wired-archive` | **PASS 10/10**, 9/9 both | `identityElements=2` AND `materialStartMenu=1` |

Two materials, two different pieces of evidence, one row. The ledger rows were written from
the `wired-archive` run deliberately: on `study-os` that row is `na` and eight rows would have
been the whole ledger.

### A second self-claim: 45 of 102 rows never named a control

`controlCoverage` is new in `parity-ledger.json` and is derived from the rows themselves.
**55 named / 1 NONE DECLARED / 45 silent of 102.** The 45 are older rows written before
`l6-parity-rows.cjs` said anything when a spec declared no mutation for a row — dictionary 7,
mediaCenter 8, flashcards 8, mediaWorkspace 5, grammar 5, agent 5, translate 4, captures 3.
They are not disproved; the ledger simply never recorded a control for them, and that is a
fact about the ledger rather than about the product. New rows now state
`negative control: NONE DECLARED` explicitly, so `silent` can only shrink.

`shell` > `desktopSurface` is the live NONE-DECLARED case and the reason is real: its subject
is the shell ROOT, and `restore()` sweeps `qa(win, '*')`, which does not include `win` itself
— a falsification there could not be guaranteed undone, and shrinking the desk risks the
window-clamp path persisting geometry. That belongs in the row, not in a commit message.

## 2026-09-02 (primary2) — `blancShell` joins: the second shell, and a route-scoped control

**110 rows / 15 apps.** `blancShell` contributes **8**, all `both`, from a `PASS 10/10` run:
8/8 reachable in BOTH presentations, round trip 0 diffs with an INPUT dirtied first, 8 of 8
mutations armed and each flipping exactly its own row.

Blanc is a genuinely separate shell — its own BrowserWindow (`blanc.html?blanc=1`) hosting
**0** `.fwin`, reached with `--win blanc`. Its presentation axis is chrome REDUCTION
(`.blanc-root.is-taskbar-hidden`, toggled by `.blanc-taskbar-toggle` and reversed by
`.blanc-taskbar-reveal`), not a palette and not native fullscreen; both rejected candidates
are recorded in the spec and the reasons stand.

### `workspaceToggleHonest` was scoring a deliberate product decision as a lying label

The row read the fullscreen control at CHECK time and returned `control=null` → **FALSE**.
Measured live: the Blanc window renders exactly **ONE** `.blanc-icon-btn` ("Search Blanc") on
the `Read` route, because the fullscreen control is route-scoped —
`canExpandWorkspace = book || tab ∈ {mine, flashcards, media, stats, tools}`
(BlancShell.tsx:430). The drive visits a qualifying route and then correctly RESTORES the
user's own route, so by check time the control is legitimately gone.

The reading is now taken WHERE THE CONTROL EXISTS (`readNav`, on the visited route) and read
back at check time — the same act-then-read shape the driven rows already use — with a second
chance on the restored route, and the row is `na` **naming both routes** if neither offers it.
Its mutation falsifies the recorded label rather than the element, so it arms on exactly the
runs the row can still score:

```
BEFORE  control=null exitAffordance=false                        -> FAIL 7/8, mutation UNARMABLE
AFTER   readOnRoute="Mine" workspaceFull=false
        control="Fullscreen workspace" exitAffordance=false      -> PASS 10/10, 8/8 both
CONTROL recorded label "Fullscreen workspace" -> "Exit fullscreen workspace"
        against workspaceFull=false -> 7/8, fell=[workspaceToggleHonest], restored 8/8
```

### The finding worth keeping about Blanc's state

`dataStateOwner` is mostly COMPONENT state here, and deliberately: `taskbarHidden`,
`compactToolsOpen`, `masterSearchOpen` and `workspaceFull` are all unpersisted, so a reduced
or fullscreen Blanc cannot be inherited by the next launch. Only the route survives, and only
when the user has asked Blanc to remember it (`jp-blanc-mode-v1` / `jp-blanc-memory-v1`,
renderer/blancMode.ts). `blancMain.tsx` additionally strips `data-materials` on boot and keeps
a MutationObserver on it, so a Study OS material pack cannot leak into this window — which is
what `shellIdentity`'s `osDesktopPresent=false` half is checking from the other side.

`notWritten` re-derived: **11** declared specs still have no row at all (was 14 at the start of
this turn) — notebook, statistics, games, library, immersion, novels, manga, vn, music, video,
youtube. `controlCoverage`: **63 named / 1 NONE DECLARED / 45 silent of 110**.

## 2026-09-02 (primary2) — `games`, and an empty profile that still scores 10/10

**120 rows / 16 apps.** `games` contributes **10**, all `both`, from a `PASS 10/10` run: 10/10
reachable in BOTH presentations, round trip 0 diffs, 10 of 10 mutations armed and each flipping
exactly its own row, **0 driven refusals**. It was driven end to end rather than inspected — a
round was STARTED, `"ro"` was typed, submit moved `disabled true -> false`, and the round was
ABORTED back to a ready state the harness then re-read.

### The empty-harness warning does not apply here, and that is worth stating

The standing warning is real: a surface whose rows need content scores an empty harness as
CAPPED rather than skipped. Games is not one of those, because four of its rows are written to
score **honest empty state** rather than content:

| row | reading on this empty profile |
| --- | --- |
| `sourceMaterial` | `pct=noList scaleX=0 agrees=true`, with "No word list uploaded for this level" |
| `exposureTracking` | `seen=0/59`, stated pct 0, derived pct 0, bar scale 0 |
| `roundHistory` | `rows=0 complete=0`, against "No rounds recorded for this game yet" |
| `materialScope` | `mode=auto scripts=0 groups=0 shapeHeld=true` |

A bar that agrees with a zero is as real a reading as one that agrees with a 60. What an empty
profile costs here is not the row, it is the *range* — `exposureTracking` cannot show the bar
moving, only that all three statements of it are the same number.

`dataStateOwner` names FIVE stores for this one app and they are not interchangeable:
`jp-game-arena-settings-v1` (length, language, kana scope), `jp-game-arena-seen-v1` (exposure),
`jp-game-progress-v1` (last 30 results and the high scores), `jp-level-lists` (the word lists
coverage is computed against) and `renderer/levelService.ts` (the level). The round session
itself is deliberately unpersisted, which is exactly what makes the abort recovery safe for a
harness to drive against a real profile.

`notWritten` re-derived: **10** declared specs still have no row — notebook, statistics,
library, immersion, novels, manga, vn, music, video, youtube. It was **14** at the start of
this turn. `controlCoverage`: **73 named / 1 NONE DECLARED / 45 silent of 120**.
## 2026-09-02 (primary) — L12 b2 coverage: `statistics` and `library`

**`statistics`: 9 rows, `both` 9.** `cat6 --app statistics` = **PASS 10/10** — parity **9/9
and 9/9**, `onlyInOne` empty, all **9 mutations** flipped exactly their own row and restored,
0 drive refusals, box `820x580`. The round trip is the WEAKER kind and says so: this surface
has **no editable text field**, so `dirtiedField` is `null`; shell held, 0 diffs.

`resetRecovery` is scored for reachability and its default-closed `<details>`, and is
deliberately **not driven** — it deletes study history in the user's real profile and this
ledger has no undo for it. Same reasoning keeps `library.cardActions` un-driven.

**The drive comes before the read, and it cost a row.** `recentActivity` claims the jump
*works*, so it compares `scrollTop` before and after. Read without the spec's own step
sequence, on a surface already scrolled, it reports `scrolled=false` and a live feature
reads dead. Under the drive: **before 0 → after 814, moved true.** The authoring tool now
runs `__LQP.__drive()` in each presentation before `check()` — and, after one run that did
not, calls `__LQP.restore()` afterwards, because the drive is a mutation of view state and
every spec with steps declares an `undo` for that reason.

**`library`: 9 rows, `both` 9.** `cat6 --app library` = **PASS 10/10** — parity **9/9 and
9/9**, **6 mutations** each flipping exactly its own row (9/9 → 8/9) and all restored, 0
refusals. Drive: folder `Unfiled 21` (from 24 cards), sort `date-desc → title`, group
`none → lang`, scroll 240 of 1547. Restored and read back: `date-desc`, `none`, `All 24`.

### A second instrument that had one profile's data written into it — and a row with no control

`inboxFilters` read **false on a correct rail**: `chips=5 active=2` against a bar of
`chips.length >= 6 && active === 2`. The chip SETS are derived —
`LibraryView.tsx:1165/1175` maps `filterOptions.langs` and `.levels` from what the library
actually holds — so a library with three languages and **one** level renders 3 + 2 = 5 and
can never reach 6. Live: `All | Japanese | Unknown | All | L7`.

The rail is now split at its own `All` heads, matched against the **first chip's own text**
rather than the English word (the label is translated — trap 4), and the invariant is stated
per group: two groups, each offering `All` plus at least one real value, each with exactly
one active. That is strictly **stronger** than `active === 2`, which two actives in one group
and none in the other satisfied. Live: `groups=2 sizes=[3,2] activePerGroup=[1,1]`.

**It had no mutation at all** — one of the four library rows the control set never named, so
its bar had never been falsified in either direction. The new one makes a second chip active
inside the first group, the exact exclusivity loss the row exists to catch, and it flips
**exactly** this row: 9/9 → 8/9, `unexpectedRows` empty, restored.

## 2026-09-02 (primary) — L12 b2 coverage: `music`, and five rows that had no subject

**`music`: 10 rows, `both` 10.** `cat6 --app music` = **PASS 10/10** — parity **10/10 and
10/10**, `onlyInOne` empty, all **10 mutations** flipping exactly their own row (10/10 → 9/10)
and all restored, 0 refusals, box `1080x700`, round trip field held / shell held / 0 diffs.

It did not start there. The first run scored **5/10 in BOTH presentations** on a library
holding two real songs, and the five failures — `playerSelection`, `transport`, `like`,
`lyricsRecovery`, `queueMirror` — share one cause: **the drive never selected a track**, so
every row that reads the PLAYER was scoring an empty player. Five live features read as
missing. Measured one click later on the same window:

| | before | after |
| --- | --- | --- |
| now-playing | `Choose a track` | `e2e-audio-ja` |
| `.music-song.active` | 0 | 1 |
| `.mc-track-queue > .is-active` | 0 | 1 |
| `.mc-player-seek` max | 1 | 90 |
| `.mc-player-like` `aria-pressed` | absent | `false` |
| `.music-hint` recovery actions | 0 | 2 |

`seek.max` 1 → 90 is the discriminating one: an unloaded transport still renders, and only a
real duration separates it from a loaded one.

### The fix refused once, for a second reason, and the refusal was right

A `pick` step was added FIRST in the drive — and refused: *"no songs in the library to
select"*, on a library holding two. The driver dirties the first visible text field **before**
it drives, deliberately, so the round trip has real state to lose; on this surface that field
is the music search, which filters the list to nothing. Measured: with the mark typed,
`.music-song` = **0** and `.mc-track-queue > button` = **2**.

So the step falls back to the queue, which is the same action and not a workaround —
`MediaCenterView.tsx:1250` is `onClick={() => void state.play(item)}`, exactly what the
library row calls. The same run then proved the difference by itself: parity phase **5/10**
with `pick` REFUSED, control phase baseline **10/10** after the search dirt had cleared.

Selecting is `play(s)` (`MusicContent.tsx:404`) and there is **no select-without-playing
affordance**, so this starts playback in the real profile. Disclosed rather than pretended
away: the undo pauses it, and the pause is read off the control's own **label** — this player
has no `<audio>` element at all (0 media elements while the seek advanced, so Web Audio) and
the control carries no `aria-pressed`. Left paused at seek 68.1, `e2e-audio-ja` selected,
search empty, sort back to `recent`.

## 2026-09-02 (primary) — L12 b2 coverage: `video`

**`video`: 10 rows, `both` 10.** `cat6 --app video` = **PASS 10/10** — parity **10/10 and
10/10**, `onlyInOne` empty, all **10 mutations** flipping exactly their own row (`stageHonesty`
taking its declared cascade with it and nothing beyond) and all restored, 0 refusals, box
`1080x700`, round trip field held / shell held / 0 diffs.

Three of these rows are category-8 questions asked inside category 6, and all three read
honest on a stage with nothing loaded: `stageHonesty` — 2 empty states, both **titled**, 2
enabled entry actions, `video=0`; `topbarActions` — `explained=2` equals `disabled=2`, every
disabled action carrying its own reason; `inspectorHonesty` — `coherent=blank`, no score row,
no meta, no MAL link, and empty copy that says so. A blank inspector is fine; one showing a
MAL link for nothing is the state that row exists to catch.

`upNextShelf` is one of the rows the concurrent worker's empty profile would have scored on
an empty harness and had capped: **7 cards** off this profile's 80-file library.

Un-driven on purpose, each with its reason: `watchFolder` opens a native OS folder dialog the
bridge cannot see or dismiss; the YouTube import reaches the network and writes the library.
Both are scored for reachability and say so.

### Trap: `os:open` does not choose the Media Center's tab

Opening section `video` gave a window titled **Video** whose body was the Media Center on the
**Library** tab, and `.mc-video-page` did not exist. cat6 refused — *"no video surface"* —
rather than scoring the wrong page, which is the right failure. The rail's own `Video` entry
has to be clicked first. After that: `navReach` reads 9 rail items, 1 active, label `Video`,
page `mc-page mc-video-page`, window title `Video` — all three agreeing.

## 2026-09-02 (primary) — L12 b2 coverage: `youtube`, and the gap re-derived

**`youtube`: 10 rows, `both` 10.** `cat6 --app youtube` = **PASS 10/10** first run — parity
**10/10 and 10/10**, `onlyInOne` empty, all **10 mutations** flipping exactly their own row
(10/10 → 9/10) and all restored, 0 refusals, box `980x640`, round trip field held / shell
held / 0 diffs. Driven: tools disclosure `false → true`, folder draft, News → Playlist, row
selection `0 → 1`.

Three of its rows score a REFUSAL rather than an action, which is the honest shape:
`addPlaylist` requires the submit to be **disabled** while the field is empty
(`field="" submitDisabled=true expected=true`); `selectionActions` requires both bulk actions
disabled while nothing is selected; `rowActions` requires `openImpliesDownloaded` on every row
— offering Open for a file that is not on disk is a control that cannot do what it says. None
of the row or bulk actions is executed: they download, delete, or write the user's study data.

### The gap, re-derived instead of quoted

`notWritten` said "the other **19** root components". That number is now computed rather than
carried: `window.__LQP.apps()` = **25** specs, against the distinct `app` keys in `rows[]`,
both read live and banked into the ledger as `notWritten.derived`.

**13 of 25 specs have no row in this tree** — notebook, calendar, games, immersion, novels,
manga, vn, city, scraper, resources, settings, shell, blancShell — and three of those
(`city`, `scraper`, `resources`) are written in the concurrent worker's tree and arrive by
merge. `mediaCenter` carries 8 rows from the pre-spec `__L6M` instrument and has no `SPECS`
entry, which is why ledger apps (13) exceeds specs-with-rows (12).

**Ledger this turn: 50 → 106 rows, 7 → 13 apps, 106 `both` / 0 `pending`, 0 duplicate
`app|feature` keys — validated after every write, not asserted.**

## 2026-09-02 (primary2) — the merge falsified this ledger's own claim about itself, and 53 controls were recovered rather than re-run

The two concurrent b2 waves used **two different row writers**, and only one of them wrote
down the controls it ran. `probes/l6-parity-rows.cjs` (this tree) copies both `rowEvidence`
**and** `control.mutations` into a row's `observed`. The main tree's `debug/_pr4-rows.cjs`
copies only `rowEvidence`. Same harness, same per-row mutations, same `PASS 10/10` verdicts —
one writer simply does not transcribe the control.

So the merge moved a number **against** this ledger: `controlCoverage` went **45 silent of 120
→ 93 of 168**, and the block's own closing sentence — *"New rows now say NONE DECLARED
explicitly, so `silent` can only shrink"* — was false the moment the two halves met. That
sentence is now **retracted in the block itself**, not quietly dropped, and `silentByCause`
splits the number by the two causes because they have two different remedies.

### The controls were never lost, only unwritten

cat6 banks its whole run. `debug/_pr4-<app>*.json` in the main tree carries
`control.mutations` for every row: the mutation name, `preBaseline`, `reachable` after it was
applied, `fellRows`, `exactlyOwnRow`, `afterRestore` and `returned`. `debug/_p2i-transcribe.cjs`
copies those into the ledger through an identity chain that is **verified, not assumed**:

| link | how it is established | measured |
| --- | --- | --- |
| receipt → run | the receipt is chosen **by its own content** — the unique file whose `verdict` is `PASS 10/10`, whose control verdict is `CONTROL FAILED AS REQUIRED`, and **every** one of whose mutations has `exactlyOwnRow` and `returned` true | 1 of 1 per app; the pre-fix `VOID`/`FAIL` receipts sitting beside them (`_pr4-flashcards.json`, `_pr4-library.json`, `_pr4-music.json`, `_pr4-music2.json`) are correctly **not** picked up |
| mutation → row id | every `mutation` name must be a row id declared in that app's meta | 53 of 53, 0 unknown |
| row id → ledger row | the meta's `feature` string must match **exactly one** ledger row of that app | 56 metaIds ↔ 56 ledger rows, 1:1, 0 duplicates, 0 unmatched either way |

**Result: 53 rows given a transcribed control, 3 explicitly none-declared** (`library` declares
6 mutations for 9 rows), 56 touched. `controlCoverage` **93 silent → 37**, `withNamedControl`
**73 → 126 of 168**, and `silentByCause.b2WaveNotTranscribed` is **0** — the whole recoverable
class is recovered. The 37 that remain genuinely pre-date any writer saying anything about
controls; they are a different problem and the block now says so.

### Provenance is part of the clause, because this process did not run these controls

Every transcribed clause ends `-- TRANSCRIBED 2026-09-02 (primary2) from the banked cat6
receipt \`debug/_pr4-<app>.json\` (<mtime>), not re-run here`. A control someone else ran must
never read like one this turn ran. The clause names the file and that receipt's own timestamp
so the next worker can go back to the source.

### The transcriber's own negative control — three plants, three refusals, restored

Run against a **copy** of the youtube receipt+meta in `debug/_p2i-ctrl/` (`PR4_DIR` exists only
for this), baseline **10 of 10 transcribed**:

| plant | attacks | result |
| --- | --- | --- |
| meta `playlistRail.feature` changed to a string no ledger row carries | row id → ledger row | `REFUSED: youtube/playlistRail: feature matched 0 ledger rows, expected exactly 1` |
| `mutations[3].exactlyOwnRow = false` | receipt → run | `REFUSED: youtube: expected exactly 1 qualifying PASS receipt, found 0` — the receipt stops qualifying at all |
| `mutations[2].mutation = "notADeclaredRowId"` | mutation → row id | `REFUSED: youtube: mutation "notADeclaredRowId" is not a declared row id` |

Baseline restored after each: **10 of 10** again. The writer also refuses to overwrite a row
that already carries a control clause, so it cannot silently replace one worker's measured
control with another's transcription.

**Ledger after this turn: 168 rows / 21 apps, 0 duplicate `app|feature` keys, 126 named
controls / 4 none-declared / 37 silent.** `notWritten` re-derived: **5 of 25 specs still have
no row at all** — notebook, immersion, novels, manga, vn.

## 2026-09-02 (primary2) — `notebook` is not an unwritten spec, it is a spec whose subject this branch deleted

`notWritten` counted **5** specs with no rows — notebook, immersion, novels, manga, vn — as
one bucket. That bucket was hiding two different things. Four of them genuinely await
authoring. `notebook` cannot be authored at all here, because `wt/files-app` **deletes the
section the spec measures**, on purpose, at `FILES_APP_PLAN` gate 7b.

Read from source first: `AppSection.tsx` has no `case 'notebook'`;
`LEGACY_WIN_SECTION_ALIASES` (`shared/desktop.ts:76`) maps `notebook -> files`; and
`NotebookContent.tsx` is imported by exactly one file on this branch,
`components/blanc/BlancStudyPanels.tsx` — the Blanc shell, not the Study OS desktop.

### Driven live, one instant, one DOM — with both controls

Desk found at **0 windows / 0 dialogs** and returned to **0 / 0**.

| dispatched `os:open` | window title | body root | `app-section-unavailable` |
| --- | --- | --- | --- |
| `notebook` | **Files** | `DIV.lq-scaffold.fa-shell`, 52 buttons, 1,704 chars, "Everything 34" | false |
| `dictionary` — **control: a section that exists and is not aliased** | Dictionary | `DIV.dict-view` | false |
| `notAKnownSection` — **control: must fail** | notAKnownSection | `DIV.app-section-unavailable` | **true** |

`.gx-notebook` — the spec's own `rootSel` — is **0 across the whole document**, searched over
`document` rather than one window so a miss cannot be an artifact of looking in the wrong
place.

The two controls are what make this a measurement rather than an observation. Without the
`dictionary` row, "notebook opened Files" is equally consistent with *`os:open` always opens
Files*; without the unknown-id row it is equally consistent with *every unrecognised id falls
through to Files*. Dictionary opening its own distinct surface kills the first, and an unknown
id honestly reaching `unavailable` kills the second. The alias is doing real work.

### What changed, and what deliberately did not

`notWritten.derived.noRowsByCause` now splits the five: `noSubjectOnThisBranch: [notebook]`
with the measurement inline, and `awaitingAuthoring: [immersion, novels, manga, vn]`. **The
denominator did not move** — it is still 5 of 25, because reclassifying work is not doing it.

The spec is **annotated, not deleted**. On a tree where the Notebook section still exists it is
still a correct spec, and this branch is the one that is unusual. The annotation carries the
three-row control table so the next worker does not spend a run discovering that
`cat6 --app notebook` refuses — it refuses correctly, and now says why.

### Addendum, same day: the gap reproduced within the hour, which is the argument for fixing the writer

A second sync-down landed while this turn was running: **168 → 184 rows / 21 → 23 apps**,
`novels` (9) and `manga` (7) joining from the main tree. Auto-merged, and **validated rather
than trusted** — 0 duplicate `app|feature` keys, all **53** transcribed clauses still present,
the `notebook` spec annotation intact and `l6-parity.js` still parsing.

`silent` went **37 → 53** immediately, and `silentByCause` names the cause without anyone
having to guess: `predatingTheClause: 37`, `b2WaveNotTranscribed: 16`, `b2WaveApps:
[novels, manga]`. The 16 new rows have the same shape as the 53 this turn recovered, for the
same reason — they came through the same non-transcribing writer.

So the recovery is a **mop, not a fix**. `debug/_p2i-transcribe.cjs` is now written to survive
the next wave rather than being a one-shot: its app list is **derived** from the ledger (every
app with a control-less row that has a `_pr4-meta-*` block), and an app whose cat6 receipt is
not banked yet is **skipped with a reason** rather than refused, because "that run is not
finished" is not a defect. Run against the merged ledger it correctly reports:

    SKIPPED (not a defect):
      manga: no qualifying PASS receipt banked yet -- run cat6 for it first
      novels: no qualifying PASS receipt banked yet -- run cat6 for it first
    DRY RUN: 0 rows ... Considered apps: manga, novels.

— it finds the two new apps, declines to invent anything, and leaves the already-transcribed
rows alone. **The durable fix is one line in the other writer**: `debug/_pr4-rows.cjs` should
copy `control.mutations` into `observed` the way `probes/l6-parity-rows.cjs` already does. Until
it does, every wave adds silent rows and someone transcribes them afterwards.
## 2026-09-02 (primary) — L12 b2: the two readers and the browser, and three instrument defects

Commits: `62097cc9` (novels chapter row), `8663391e` (novels rows), `0e618fe0` (manga drive +
row + undo), `a442b6ec` (manga rows), `24abb4a4` (immersion rows).

**Ledger 106 → 129 rows, 13 → 16 apps, 129 `both` / 0 `pending`, 0 duplicate `app|feature`
keys** — validated after every write, not asserted. Every app PASS 10/10 on
`cat6-feature-parity.cjs`, parity equal in both presentations, every mutation flipping exactly
its own row and restoring, 0 drive refusals.

### novels — 9 rows. Recovered from an interrupted turn, and its control ran by accident

The previous run died on its session limit with the work measured and uncommitted.
`chapterNavigation` had asked whether the current page's first 240 characters contained one of
the TOC labels — true only on a chapter's opening page. The TOC has **9** entries at part
indices 5/30/50/81/149/160/161/163/165 over a book of ~166 parts, and the reader sat at
`p:7:0.0000`, between the first two. A working chapter select therefore scored dead on ~157 of
166 parts.

There is nothing passive left to read: `.chapter-select` is an ACTION select
(`NovelReader.tsx:3308-3311` pins `value=""`, `onChange` calls `goTo`), so its own value never
names the chapter you are in. The row is now DRIVEN in three legs, because `/eval` is
synchronous. The jump WRITES the user's reading position (`goTo` → `saveNow` →
`window.api.setProgress`, `NovelReader.tsx:731`), so `chapterPrep` captures
`p:<part>:<fraction>` off `listLibrary()` first and the undo writes it back through the same
call; the seek is permille and restoring 18 → 18 returned a different page.

**THE NEGATIVE CONTROL WAS THE DEAD TURN'S OWN PLANT.** It had rewritten TOC option 165's
label to `lqp-never-in-this-book` and never reverted it. The first authoring run read
`landedOnIt=false moved=true` and scored the row PENDING **in both presentations**. Reverted by
a renderer reload (React owns that option; a DOM patch would not have held), book reopened from
the Library at the same `p:7:0.0000`, and the identical run reads
`jumpedTo="蓮実聖司を愛する者として" landedOnIt=true`, seek 18 → 986 → 18. So the repaired row
demonstrably fails when the landing does not match.

Measured: content 1516x712 / 1946 chars; seek 0..1000 with the trip returning its exact page
signature; three reading tools all `docked`; canvas 1264 = doc 384 + 3 docked + gutters,
covered=false; lifecycle 1/1 (a reader owns no minimize/maximize — counting `.fwin-b` would
score a complete host 0). Five mutations, all `exactlyOwnRow`, every undo carrying
`progress=p:7:0.0000`.

### manga — 7 rows. The drive reported its own write back to itself

Three defects, all in the instrument, and the reader was right every time.

1. **The step never committed the jump.** `.reader-seek` is a SCRUBBER: `onChange` only sets
   `scrub`, a preview, and the page changes on `onPointerUp` / `onKeyUp`
   (`MangaReader.tsx:2069-2086`). The step wrote `.value = 3` plus `input`/`change` into a
   controlled input, React ignored it, and the step returned that same number as `page`.
   Measured live: seek reading **12** while the stage rendered `pages/0001.png` with `alt`
   "Page 1" and `First page` still DISABLED. Clicking the product's own `Next page` DID move
   it. Now `typeInto` (the native-setter route) plus the product's own `keyup`, exactly as
   `novels.chapterSettle` does it.
2. **`pageRender` passed the defect its own comment names.** The comment promised the rendered
   page was "cross-checked against the seek's declared position"; the predicate asked
   `declared >= 1`, comparing the seek to the number 1. The page is now read from the image's
   own identity — `alt` is `t('manga.pageAlt',{n})`, so the numeral survives all four locales,
   and `pages/000N` is the fallback — as a MEMBERSHIP test, because the spread layout renders
   two pages at once.
3. **The undo's baseline was rewritten by another mutation.** It captured the page off the
   seek, and `pageTransport` sets `max="1"`, which clamps that value to 1; the cycle's undo
   then compared 1 to 1 and left the reader where the drive had put it. Capture and comparison
   now read the STAGE.

Three receipts discriminate, same window / volume / profile, 17 pages: PASS 10/10 on the
broken drive → **VOID** once the row cross-checked (`pageTransport` fell `pageRender` too,
undeclared) → PASS 10/10 with the cascade DECLARED. Clamping the transport genuinely stops it
declaring the page on screen, so the cascade is true and is written down rather than engineered
away — a row nothing can falsify is the other way this instrument goes wrong. `page` now reads
`from:"1" renderedBefore:[1]` → page 3, and `page=3->1` appears on **every** undo cycle where
before it appeared on **zero**.

Measured: `seekPage=3 of 17 rendered=[3] agree=true`; painted 502x714; 5 OCR segments with
exactly 1 active; the OCR tool `lq-liquid` over a page ROLED `lq-anchor`; canvas 1264 = doc 952
+ 1 docked + gutter. `first=1 last=1` is read from `aria-label`/`title` — both are icon buttons
with no text node, and reading `textContent` scored a live transport dead.

### immersion — 7 rows. The VOID was a live page still loading

At cat6's **default `--step-ms 700`** this surface scored **VOID, 5/7 both**, with
`readerExtraction` reading `readerChars=0` and `modeSwitch` reading `composed=false` — because
a REAL public page (NHK Easy) had not finished loading, exactly as the `open` step's own note
warns. The receipt heals mid-run: the first mutation's pre-baseline is 5/7 and the second's
afterRestore is 7/7. Same window, same profile, `--step-ms 3500`: **PASS 10/10, 7/7, 0
refusals**, all five mutations `exactlyOwnRow`. **A slow live page is not a dead control**, and
this is the one surface in b2 where the default step budget is not enough.

Measured: bar == webviewSrc on `https://news.web.nhk/news/easy/`; mode `reader` composed
`webview=true reader=true`; 322 extracted characters with no starter state; 20 rendered rail
rows, 20 complete (a `VirtualList`, so never `rendered === total`); canvas 782 = doc 550 + 1
docked + gutter; 5/4 chrome; round trip standard → liquid → standard with `.immersion-url`
dirtied first held with 0 diffs at 820x580 in both.

### vn — NOT written, and the reason is a data gap, not a defect

The panel mounts and its whole workspace renders, but the library is **empty** on this profile:
"Add a local visual novel to begin capturing Japanese dialog". A row measured only on an empty
harness is capped rather than skipped, and adding an entry would write to the user's real
library, which that spec's own safety note forbids. Recorded here so the absence is a decision
rather than a silence.

### The gap, re-derived again

`window.__LQP.apps()` = **25** specs against the distinct `app` keys in `rows[]`, both read
live, re-banked as `notWritten.derived`.

**10 of 25 specs have no row in this tree** — notebook, calendar, games, vn, city, scraper,
resources, settings, shell, blancShell — of which five (`city`, `scraper`, `resources`,
`shell`, `blancShell`) are the concurrent worker's and arrive by merge. `mediaCenter` still
carries 8 rows from the pre-spec `__L6M` instrument and has no `SPECS` entry, which is why
ledger apps (16) exceeds specs-with-rows (15).

**sampled-out:** `vn` (no subject on this profile, above); `city`, `scraper`, `resources`,
`shell`, `blancShell` (owned by the concurrent worker); `notebook`, `calendar`, `games`,
`settings` (not reached this turn — they are the next turn's opening slice).
