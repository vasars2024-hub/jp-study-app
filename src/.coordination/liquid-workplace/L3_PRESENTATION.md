# L3 — opt-in per-window presentation state

Log for `LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` §11 / L3. Append per slice; numbers, not adjectives.

**L3's gate, verbatim:** *an unchanged sample app can switch modes and back with byte-for-byte app
data and equivalent observable state.*

## 2026-08-17 · primary · L3.1 the schema, the commands, the recovery

| Slice | Commit | What landed |
| --- | --- | --- |
| L3.1 | `d844f239` | `shared/liquidWindowState.ts` + `WindowSnapshot.presentation?`, 24 tests |

**Scope, deliberately.** Pure schema, commands, validation and round trip. No shell wiring, no menu
item, no IPC. The gate's second half — an actual app switching and coming back — is L3.2 and needs
`DesktopShell`; landing the reversibility proof first means that wiring has something to be checked
against instead of being its own evidence.

**The four decisions, each a way reversibility is normally lost.**

1. **Conventional is the ABSENCE of the field**, not a stored `mode: 'standard'`. Every layout saved
   before today parses unchanged — the precedent is `WindowSnapshot.pinned` (`shared/desktop.ts:53`),
   optional for exactly this reason.
2. **`makeLiquid` on an already-liquid window returns it untouched.** Without the guard a second call
   records the *liquid* rect as the way home; the original geometry is then gone permanently,
   silently, and only found by a user who switches back.
3. **`returnToStandard` DELETES the key**, so the round trip is key-for-key identical. Asserted three
   ways including `JSON.stringify` equality, because a residual `presentation: undefined` is invisible
   to `toEqual` and still lands in the persisted blob.
4. **A corrupt blob means standard, never half-liquid.** `parsePresentation` is total and returns
   `undefined` for anything it cannot vouch for — including liquid with no geometry to return to,
   which is a window that cannot be reversed and therefore must not be entered.
   `sanitizeWindowPresentation` then drops the key, so corruption is not persisted forward.

**Ownership boundary.** The commands own geometry and the maximize flag only. z-order, pin,
visibility and the separate `restoreRect` belong to the shell and are asserted untouched across a
move-while-liquid round trip — a command that also moved them could not be proven reversible in one
place.

**Numbers.** 24 tests; 13 corrupt shapes, each asserted not to throw AND to be dropped off the
window; ten consecutive toggles land on the original. Existing desktop suites unaffected
(`desktop`, `desktopSchemaV3`, `desktopWindows` = 50/50).

**Mutation: 9 of 9 red, file restored byte-identical.** One SURVIVED the first run and was worth the
exercise: deleting the `mode === 'standard'` check changed nothing, because a bare `{mode:'standard'}`
has no rect and the next guard rejects it anyway. **The case a real store actually produces is
`{mode:'standard', standardRect}`** — a window that WAS liquid and came back — and under that
mutation it reads as liquid, so the window silently re-enters a presentation the user left. Now
tested. *A rejection case that two guards both catch proves neither of them.*

**Next slice (L3.2):** the Make Liquid / Return to standard commands wired to `DesktopShell` +
`shared/desktop.ts` persistence, then drive the gate live — switch a real window, restart, switch
back, and compare the persisted layout blob byte-for-byte. Needs nothing from the user.

## 2026-08-17 · backup · L3.2 the gate, driven live — and the two defects only that could find

| Slice | Commit | What landed |
| --- | --- | --- |
| L3.2 | `20462e3a` | `renderer/liquidWindowPresentation.ts`, `theme/liquid-window.css`, title-bar toggle, `main/desktop.ts` fix, 22+12 tests, i18n ×4 |

**L3's gate now PASSES on a real window.** Persisted layout after Make Liquid → Return to standard
is identical on every field except `z` (21 → 25), which is focus order and deliberately shell-owned.

**DEFECT 1 — `sanitizeWindow` (`main/desktop.ts:149`) is an ALLOWLIST, and main echoes the sanitized
layout straight back into renderer state.** MutationObserver on the live frame: `liquid` at **t+26ms**,
`standard` at **t+630ms**. The window's own persistence was undoing the user's command. That file's
comment already predicted it — *"that is how always-on-top pinning first broke."* It happened again.
**Main does not hot-reload: this was invisible until a full restart.** Now validated there with the
same total `parsePresentation`, so a corrupt blob is dropped in main, not shipped to every window.

**DEFECT 2 — `:where()` contributes ZERO specificity.** The shell's
`:where(html:not(…)) .fwin:where(…) .fwin-bar` scores `.fwin .fwin-bar` = **0,2,0**, a TIE with
`.fwin-liquid .fwin-bar`, and won on import order. Result: window translucent, title bar opaque and
covering it — `backdrop-filter` live in the computed style and **invisible on screen**. Every
override is now a compound `.fwin.fwin-liquid` (0,3,0). *A `:where()` wrapper does not mean the rule
is weak; it means the AUTHOR's other compound selectors decide, and yours must outrank them.*

**Numbers, live, restarted app, `forest-night`, `data-perf=performance`:**

| | body contrast | title contrast | window α | backdrop |
| --- | --- | --- | --- | --- |
| conventional | **17.17** | **15.57** | 1 | none |
| liquid | **16.02** | **14.62** | **0.72** | `blur(8px) saturate(1.25)` |
| back | **17.17** | **15.57** | 1 | none |

Liquid costs **1.15** of body contrast and stays far above AAA, because the body is pinned to the
opaque anchor and the sheet sets no `color`. Controls: forcing the body fill to `#555` moved contrast
**16.02 → 6.85** and restoring returned exactly 16.02, so the probe measures. `high-contrast` and
`battery` both take `--lq-liquid-blur` to **0px**, battery `--lq-motion-scale` to **0**; both restored.
Corrupt `{v:1,mode:'liquid'}` with no rect, committed and reloaded: renders **standard**, key **gone**
from the persisted layout. The user's real layout was captured first and restored byte-identically.

**Traps.** (1) Two probe bugs produced confident wrong numbers here: a `[\\d.]` regex double-escaped
by a bash heredoc parsed nothing and reported contrast **1** everywhere, and the `color(srgb …)`
branch read channels off by one and reported a blue title bar at **9.07**. Both looked like plausible
findings. Parse `color()` by the SAME indices as `rgb()`, scaled — there is no leading token with a
digit in it. (2) Composite walks read `backgroundColor` only, so the liquid title number is measured
over the shell's opaque base, not the wallpaper the blur actually samples.

**Not done, deliberately.** `parity-ledger.json` stays 0 of 7 and nothing is scored on the rubric:
one reversible presentation on a window is not an app migration. `toggleLiquid` raises `z` inside a
state updater, so a click costs +2 under StrictMode — pre-existing shape, `toggleMax` does it too.

**Next slice (L3.3):** the reverse transitions L3 has not exercised — maximize while liquid, drag
across monitors while liquid (`beginDeskDrag` sends a `winToSnapshot`, which now carries the field),
and pop-out, which routes through `main/desktop.ts:2296`-style snapshot rebuilds. Then L4.

## 2026-08-17 · backup · L3.3 the other four rebuild sites, and a suite that proved nothing

| Slice | Commit | What landed |
| --- | --- | --- |
| L3.3 | `68d1a65c` | `__tests__/liquidWindowSnapshotFidelity.test.ts`, 10 tests, 4/4 shell mutations red |

L3.2's defect was a CLASS: an object literal keeps only what it names. `DesktopShell` rebuilds a
`WindowSnapshot` at four more sites — desktop move `:1165`, tear-off `:2296`, cross-monitor drag
payload `:3234`, adopt `:1244`. **No fix was needed: all four spread**, so the field already
survives. What was missing was the guarantee. Also pinned: maximize-while-liquid returns to the
PRE-liquid geometry, and liquid-while-maximized comes back maximized.

**THE FINDING IS ABOUT THE TEST.** The first version mirrored both converters as local fixtures, so
mutating the real `DesktopShell.tsx` moved nothing — it would have passed clean over the exact defect
shipped an hour earlier. *A suite that reimplements the thing it covers measures its own copy.* Three
source-level guards now bind it: both converters carry their presentation half; every `winToSnapshot`
use is a spread or a bare `.map` (**3 and 3**, counted, not assumed); the shell never builds a
`presentation:` literal nor calls `makeLiquid`/`returnToStandard` past the seam.

**Mutations against `DesktopShell.tsx` itself, 4 of 4 red, file restored byte-identical.** A fifth is
recorded **VOID, not passed** — its anchor missed on CRLF line endings, so the mutation never applied
and the green run measured nothing. *Assert the patch applied before believing the test result.*

**Turn gates, shared tree:** vitest **728 files / 10,036 tests / 0 failed** / 6 skipped · i18n exit 0
at **10,544** keys (+2, mine) · architecture exit 0 "Nothing new", 6 pending · eslint clean on all
touched paths (the one `_dropped` warning is the same shape `shared/liquidWindowState.ts` carries at HEAD).

**Next slice (L3.4 or L4):** L3's gate is met and its infrastructure is covered. The remaining L3 work
is `parity-ledger.json`, still **0 of 7** — and it stays 0 until an APP migrates, which is L4 (Media
shell repair and the Video pilot). Recommend going to L4 rather than widening L3.

## 2026-08-17 · primary · boss-audit finding 2: two lists that disagreed by one section

| Slice | Commit | What landed |
| --- | --- | --- |
| audit F2 | (this commit) | `canPresentLiquid()` — one predicate for render, control and converter |

Picked up as INTERRUPTED WORK: `backup` started this after `c50f9814` and died on a usage limit at
16:22 with it uncommitted. Re-derived against the audit text rather than inherited, finished, gated.

The defect (`docs/audit/RELAY_BOSS_AUDIT.md`, 16:15 MSK, finding 2, P3): `DesktopShell:3188-3189`
carried **two hand-written section lists**. `liquid` omitted `isVisualizer`, `canGoLiquid` included
it — so a `visualizer` window with a valid persisted blob rendered `.fwin-liquid` with **no control
to leave it**. An enable flow with no disable path, at the seam L3 exists to guarantee.

Both now derive from `canPresentLiquid(section)` in `renderer/liquidWindowPresentation.ts`, and the
**converter is gated on it too** — `presentationToSnapshot` returns `{}` for a non-presentable
section, so such a blob is dropped on load instead of being re-persisted forever. `winFromSnapshot`
was passing no section and is now handed `win.section`. Decision, reversible: an **absent** section
is presentable, because `PresentableWin` is used structurally by pop-outs and fixtures and defaulting
those to false would strip the field for every one of them — the L3.2 defect pointed the other way.

**LIVE, restarted renderer, forest-night.** Seeded a `visualizer` AND a `dictionary` window on the
active desktop, both carrying the *same* well-formed blob (the only reachable path the audit names:
a hand-edited layout file). Visualizer: `data-presentation="standard"`, no `fwin-liquid`, liquid
button **null** — consistent, where before it was liquid with no way out. Dictionary, the positive
control that proves the gate is not over-broad: `"liquid"`, `blur(8px) saturate(1.25)`, control
labelled *Return to standard window*, `aria-pressed="true"`. After one save cycle the visualizer row
read back from main with **`presentation` ABSENT** and the dictionary row **with it intact**.
User layout restored: window arrays byte-identical to capture, `globalZTop` 10802 → 10802.

**Negative controls, 2 of 2 red for the intended reason**, each anchor asserted unique and each file
asserted changed before the run (CRLF trap): (1) re-expand the two lists in `DesktopShell.tsx` →
`one predicate decides both rendering liquid and offering the way out` fails; (2) delete the
`canPresentLiquid` guard from `presentationToSnapshot` → **3** fail, all three non-presentable
sections. Positive: **79/79** across `liquidWindowPresentation` (33), `liquidWindowSnapshotFidelity`
(11), `liquidWindowState` (24), `main/desktop` (12). Both files restored byte-identical (`===`).

**TRAP for the next worker:** restoring a captured layout with `desktopCommitLayout` *then* reloading
does NOT restore it — the live renderer writes its in-memory windows back over the commit. Close the
probe windows through their real `.fwin-close` controls and let the renderer persist; only that came
back identical.

## 2026-09-01 — L3.2 host FOUR: the Media workspace overlay (`f2619b91`)

Three hosts became four. `.fwin` (desktop window) · `.popout-root` (`?popout=<section>`) ·
`.reader` (full-screen reader) · **`.seanime-host` (the Media workspace overlay)**. The fourth was
found the way the third was: not by looking for surfaces without a toggle, but because
`parity-ledger.json` had **six rows stuck on one recorded blocker** — no window chrome, no
`Make Liquid` control, no `data-presentation`, so per-window presentation state could not reach it
at all. Six of fifty rows, one cause.

**Decision 1, and it has a second reason the reader's does not.** The overlay adopts the INTERIOR
and never the frame. The reader's reason applies — it fills the OS window edge to edge, so a
`backdrop-filter` would sample the desktop compositor and paint nothing, the inert glass rule 2
forbids on `.fwin-bar`. The extra one is in `styles.css`'s own comment on `.seanime-host`: it is
opaque **on purpose**, so that everything numbered below it is HIDDEN rather than merely behind.
A translucent root would not read as material; it would put the desktop grid back on screen
underneath an `aria-modal` dialog. So the root keeps its opaque stage, the bar takes
`ContextualSurface as="header"` (no extra DOM node, landmark preserved), and the body — player,
readiness table, mined review list — stays dense work on its anchor.

**Live, through the product's own controls, `data-presentation` standard → liquid → standard:**

| | conventional | liquid |
| --- | --- | --- |
| overlay class | `seanime-host` | `seanime-host workspace-liquid` |
| root background | `rgb(13, 12, 18)` | `rgb(13, 12, 18)` — unchanged, decision 1 |
| root `backdrop-filter` | `none` | `none` — unchanged, decision 1 |
| bar background | `rgba(0, 0, 0, 0)` | `color(srgb 0.101961 0.0941176 0.137255 / 0.72)` |
| bar border colour | `rgb(45, 43, 55)` | `color(srgb 0.960784 0.956863 0.968627 / 0.14)` |
| bar border width | `0px 0px 1px` | `0px 0px 1px` — the flush-strip exception |
| bar radius / shadow | `0px` / `none` | `0px` / `none` — same exception |
| bar padding | `6px 10px` | `4px 8px` |
| bar height | 51px | 47px |
| toggle `aria-pressed` | `false` | `true` |
| toggle label | `Make Liquid` | `Return to standard window` |
| toggle fill | `rgba(0, 0, 0, 0)` | `color(srgb 1 0.180392 0.301961 / 0.16)` + inset ring at 0.4 |
| `lq.workspace.presentation` | absent | `{v:1,mode:liquid,standardRect:{x:0,y:0,w:1264,h:821}}` |

**ROUND TRIP: byte-identical over all 18 measured properties by `-ceq`, storage included.** The key
is REMOVED on return, not written as `{mode:'standard'}`, so never-toggled and toggled-back are
indistinguishable. `standardRect` is a real 1264x821 and not the clamped `1x1` that `parseRect`
would have accepted.

**RESTART PERSISTENCE, measured in the same run:** entered Liquid, `/reload`ed the renderer, polled
for `.os-taskbar`, reopened the overlay — it came back `seanime-host workspace-liquid`, same tint,
same `4px 8px`, `aria-pressed` still `true`, blob byte-identical. Then returned to standard and
confirmed `'lq.workspace.presentation' in localStorage === false`. **Nothing persisted from this
run.**

**Parity drive in Liquid (row 8):** Library → Readiness hid the library pane (computed `display`
block → none, `hidden` set, box **1264x774 → 0x0**) with `#media-workspace` **and**
`.study-player-slice` still MOUNTED; Readiness → Library restored **1264x774 exactly**. Same
reversibility as the standard half.

**THREE MUTATION CONTROLS, each naming exactly the right case, both files restored byte-identical:**
drop the workspace from every `:is()` → 2 failed (interior paint + flush-strip exception); revert
the bar to a bare `<header>` → 1 (primitive/landmark); drop the opt-in class join → 1
(`data-presentation`).

**A NUMBER AGAINST THIS WORK:** rows 7, 9, 10, 11 and 12 are **not** claimed.
`window.api.seanimeStudyLibrary()` returned `{ok:true, files:[]}` — the media server has scanned
**0 files** here, against the **77** the standard halves were driven on in 2026-08-17. The
readiness pane states it honestly itself. A row measured only on an empty harness is capped, not
skipped. **Re-drive those five on a scanned library; that is all that is left of them.**
