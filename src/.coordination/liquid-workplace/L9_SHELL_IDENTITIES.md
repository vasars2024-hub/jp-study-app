# L9 — Shell, widgets, and alternate identities

## 2026-08-30 — Taskbar presentation entry point

L9 opened from the measured L8 close at `02d46d61`. The first product gap was an
asymmetric entry point: a presentable window could switch Standard/Liquid only from its
title bar, while right-clicking the same taskbar entry offered lifecycle commands but no
presentation command.

The taskbar menu now uses the same `canPresentLiquid`, `isWinLiquid`, and
`toggleWinPresentation` path as the title bar. It adds exactly one reversible item:
`Make Liquid` in Standard and the catalog's `Return to standard window` in Liquid. The
existing EN/JA/ZH/RU keys are reused. Note, City, and Visualizer remain excluded by the
shared predicate; no window is forced into Liquid and the default remains Standard.

Live on Resources, populated with 51 cards: menu rows were 5 before and 5 after; Standard
→ Liquid changed only the `fwin-liquid` class. The reverse restored the exact captured
snapshot: style `left 162 / top 114 / 820x580 / z 173`, query empty, All selected, 51
cards, scroll 0, focus true. Focused tests: 40/40 across the new menu guard and the existing
presentation round-trip/presentability suite.

L9's first bullet remains OPEN: this closes the taskbar presentation route, not the whole
taskbar/context/command entry-point inventory. Next: desktop context-menu and command-palette
language/identity gaps, then score the entry-point group rather than declaring it from source.

## 2026-08-30 — Shared entry-point localization

The desktop context menu's five shell actions and the command palette's Toolbox prompt no
longer bypass shared i18n. Six explicit keys now cover EN/JA/ZH/RU; application code resolves
them with `t()` and does not import the combined catalog.

Focused verification passed 2/2 source/catalog guards plus the repository i18n gate at
11,782 English keys with complete JA/ZH/RU coverage. Live Electron rendered the real desktop
menu as six rows, including the five catalog-backed labels and the existing Close-all action.
This is an entry-point completeness slice, not an L9 timeline-bullet close.

## 2026-08-30 — Command-palette focus restoration

The shared command palette now captures its launcher before focusing the search field and
restores that exact connected element when Escape or the backdrop closes the overlay. Command
execution remains deferred until after unmount, so destination commands can still take focus.

Focused verification passed 10/10 across the new two-path focus suite and the existing palette
action suite. Live Electron used the Search tray button as the launcher: Toolbox opened with
the input focused and localized prompt, Escape removed the dialog, and focus returned to that
same tray element. L9's first timeline bullet remains OPEN pending the full entry-point rubric.

## 2026-08-30 — Turn-gate predicate correction

The full suite exposed one new guard failure: the original fidelity test equated “one shared
predicate” with “one call site.” The taskbar is now a legitimate second consumer of the same
`canPresentLiquid` predicate. The guard permits exactly those two calls and asserts the second
targets `taskCtx.win.section`; hand-written eligibility lists remain forbidden. Focused fidelity,
taskbar, and presentation suites pass 52/52 after the correction.

## 2026-08-30 — Quick Settings taskbar localization

The L9 entry-point inventory found the taskbar Quick Settings button still carried raw English
in both its tooltip and accessible name, despite the complete `quickSettings.title` catalog key.
Both attributes now resolve that shared key, so EN/JA/ZH/RU stay aligned without new catalog data.

Focused verification passed 2/2 shell localization tests and the repository i18n gate at 11,782
English keys with complete JA/ZH/RU coverage. Live renderer read back the localized English title
and accessible name from the real taskbar button. The first L9 bullet remains open for its full
controlled rubric receipt.

## 2026-08-30 — Note reversible Liquid palette and safe deletion

Note now remains conventional by default but is eligible for the same explicit Standard/Liquid
command as other windows. Liquid reveals a compact five-color edge palette; the paper textarea
stays opaque. Color, text, position and size persist through the reverse transition. Every close,
close-others and close-all path now serializes destructive Note confirmations instead of deleting
immediately or stacking dialogs.

Focused verification passed 56/56 across presentation, snapshot fidelity, taskbar and i18n guards;
i18n passed 11,783 keys; touched-path ESLint had 0 errors. Live: Standard palette 0 -> Liquid 5 ->
Standard 0; text stayed `L9 note reverse path`, geometry stayed `380,172,260x220`, blue persisted;
Cancel kept 1 note and Remove left 0, with Cancel initially focused. Note remains open for the
related-item dock decision and its controlled 80/80 receipt.

## 2026-08-30 — Visualizer idle recovery action

Visualizer's idle hint was raw English and described an action without offering one. The shared
stage now resolves the existing four-locale `commands.nav.open.music` key; Study OS injects a real
button that opens Music, while Blanc may keep its own injected navigation and presentation.

Focused verification passed 2/2 and touched-path ESLint had 0 errors; i18n remains complete at
11,783 keys. Live Electron rendered one focusable BUTTON labelled `Open Music`; focusing and
activating it opened a real Music floating window while Visualizer remained mounted. Visualizer's
style/settings edge controls and full rubric receipt remain open.

## 2026-08-30 — Note host-boundary correction

The broad suite caught Note's desktop eligibility leaking into the manually addressable pop-out
helper. Presentability is now host-aware: Note is eligible only on the desktop that owns its state;
pop-out and reader helpers reject it, while all other prior policies are unchanged. The exact
presentation boundary suite passes 93/93 after correction.

## 2026-08-30 — Every degradation trigger reaches the Liquid role

§8's last two rows have four triggers in this shell and all four are hand-written
selector lists: `a11y.css:100` (high-contrast theme), `perf.css:33` (battery tier),
`styles.css:1280` (Settings > Display > Transparency) and `aero-safe-mode.css:21`.
Two were answered by `liquid-tokens.css`; two were not. The transparency one was
worse than unanswered — its list contains `.fwin`, and a Liquid window IS a `.fwin`,
so `off` stripped that window's blur with `!important` while its background stayed
`var(--glass-tint)`: see-through and unblurred, less legible than either endpoint.

Answered at token level, not with three more lists. The guard DERIVES the trigger
set from the shared sheets and asks whether the Liquid role answers each, so the
next list written without `.lq-liquid` in it goes red instead of going quiet.

Live on the Music window, Standard→Liquid→Standard: `full` 0.72 / blur(8px)
saturate(1.25), `reduced` 0.88 / blur(6px), `off` opaque rgb(18,28,23) / none,
reverse byte-identical, geometry 230,174,1032x589 unchanged throughout. Control:
the standard Settings `.fwin` byte-identical across full/off, anchor and work blur
0px in both. Guard mutation-checked — removing the two blocks names exactly the two
triggers. Commit `27bcbf36`.

## 2026-08-30 — Notifications, in both shells

L9 bullet 2's `notifications` surface. Three dishonest states, each from source:
`err`/`warn` are dispatched for real by `DropRouter` but only `.ok` and `.muted`
had rules and one `aria-live="polite"` region carried everything, so a failure read
and sounded like a success for 2,800 ms; no toast had a close; and the 9 s Undo
counted down while the pointer travelled to it. Deadlines are now wall-clock,
`role="alert"` nests inside the polite region for the urgent kinds, every toast has
a labelled dismiss, and hover/focus-within holds the countdown. Only an actioned
toast opts back into hit-testing, so an informational toast still never swallows a
desktop click.

Blanc mounts the same `ToastHost` and loads neither `styles.css` nor
`multiMonitor.css`: its toasts were unstyled divs in the document flow, styled only
after a ported panel lazily pulled `studyos-compat.css` and then from
`@layer(studyos)`. Given a Blanc-native block scoped to `html.blanc-shell` rather
than an import of Study OS chrome, per §8.

Live: `err` → role=alert, aria-live=assertive, danger inset edge; control `ok` →
none of the three. Held 14.2 s against a 9 s budget, then honoured the ~9 s it still
owed rather than restarting. Guard mutation-checked. Commit `87b8da35`.

## 2026-08-30 — The in-app Transparency control reaches what it names

`data-display-transparency` is a shipped, localized three-way control and **38**
translucent surfaces ignored it — command palette, dictionary popup, clipboard
history, mini mode, lockscreen, widgets, all five `ui-*` primitives. Graded through
the `--glass-blur`/`--blur-*` tokens `perf.css` already grades by tier, placed last
so an explicit accessibility request outranks the machine's perf tier; verified live
that it beats the active `data-perf='performance'`. Media Center keeps its own
`--mc-glass-*` tokens and had handled `prefers-reduced-transparency` but not the
in-app control; given the same ladder.

Whole-app painted-blur scan at `off`: **1 of 5 regions → 4 of 5**. The remainder is
`.fwin-bar`, which hardcodes `blur(6px)` in the foreign-dirty `styles.css` — named,
not claimed. Sidebar measured full 0.94/blur(24px), reduced 0.94/blur(6px), off
opaque/none, restored byte-identical. Commit `b77a3b08`.

Open, deliberately: this ladder has no committed source guard of its own. L9 bullet
2 still owes Music widget, City, onboarding and help; bullet 1 still owes its
controlled entry-point receipt.

## 2026-08-30 — The Music widget, and the route its recovery button needed

Eleven raw English literals in a four-language app, while the Music app itself
already resolved `music.controls.*` for the identical controls — the widget was a
second hand-written copy, not an un-localizable surface. Nine reuse the shipped
keys; four are new. `.music-play` and `.mwidget-play` had NO accessible name in
either host — icon-only, no title, no label, so both announced as "button". The
three real toggles took `aria-pressed` and keep a CONSTANT name; repeat is a
three-way cycle and correctly took neither.

"Nothing playing — pick a song in Music" named an action and offered none. The
Visualizer's equivalent got a real button last slice — dispatching a bare
`os:open`, which is the DESKTOP bus. Both widgets also render in `?popout=`
windows that mount no DesktopShell, so that fix was dead where the widget lives.
`renderer/sectionSurface.ts` dispatches `cancelable`; the two shells that own the
event mark it handled where they actually act, and `dispatchEvent`'s return value
picks the pop-out fallback. No side registry to drift from its listeners.

Live in `?popout=musicwidget`, `desktopShell:false`. CONTROL: the pre-fix bare
`os:open` left the window list at `2:/?popout=musicwidget , 1:/`; the real button,
focused first, produced `3:/?popout=music`. NOT measured live and named rather
than claimed: `.music-play`'s rendered name — Media Center only mounts the
transport once a track is current, and making one current writes a resume position
into the user's library. Guarded at source in both hosts. Commit `17473824`.

## 2026-08-30 — Help stops claiming a tour that is not in the branch

Settings > Help > "Replay tour" printed "The tour will start again now." while
`.tour-root` stayed at **0** and the store went `replays` 8 → 9. `TourOverlay`
reads `shouldRunTour()` once, at mount.

Then the tree said something worse. `git cat-file -e
HEAD:src/renderer/components/onboarding/TourOverlay.tsx` **FAILS**. The overlay,
`onboarding.css`, `shared/onboarding/tourScript.ts` and the `App.tsx` mount are
untracked, stranded since 2026-08-05, on no branch — only on archive snapshot
`c41e78b8`. `b63846ea` committed `HelpPage.tsx` and `onboardingStore.ts` WITHOUT
them, so the shipped branch has a Replay button nothing can answer.

So the fix is a receipt, not a flag: an overlay that actually put itself on screen
answers with `announceTourStarted`, and the page reports what happened. The
success line is earned; otherwise it says armed. True at HEAD, true in a
popped-out Settings, and it needs no second change when the overlay lands.

Live, one gesture: from `?popout=settings` (no overlay — HEAD's situation in a
real window) status = "The tour is armed…", `.tour-root` 0 there, while the
desktop window started it for real from the cross-window `storage` path,
`.tour-root` 1, step `welcome`. Store restored byte-identical to `replays` 8.
Commit `78893ce3`.

NOT committed, deliberately: the stranded overlay files, the `App.tsx` mount hunk
and the `tour.back` key. Their improvements sit in the working tree for whoever
lands them — `Back` (Esc is an exit, not an undo, so one mis-click was
unrecoverable), a polite live region on the step text, `flex-wrap` on the
three-button row, and the `announceTourStarted` call. **Trap for the next worker:
the onboarding directory is untracked. Do not "clean" it.**

## 2026-08-30 — City's dossier answers the contract it advertises

The mushroom is an `aria-expanded` disclosure over a `role="dialog"` and kept
neither half: Escape did not close it, and closing dropped focus on `body`.
Handled on the garden's own `onKeyDown` — React bubbles it from both the trigger
and the panel, the only two places focus can be — never on `window`, which would
race the shell's Escape in every host this mounts in.

Live: open from the focused trigger, `aria-expanded` false → true; Escape from
the trigger and again from inside the panel both closed it and returned
`document.activeElement` to `BUTTON.reading-garden-mushroom-hitbox`. CONTROL: the
City window survived both, 7 `.fwin` before and after, so the garden is not eating
the shell's key; a fifth test pins that a CLOSED dossier still lets Escape through.
Mutation control: deleting the prop fails exactly the two Escape cases.
Commit `5d13f920`.

L9 bullet 2's seven named surfaces are now all migrated — Note, Visualizer, Music
widget, City, notifications, onboarding, help.

## 2026-08-30 — Bullet 1's third entry point, which did not exist

The bullet is "taskbar/context/command entry points". Two shipped: the title-bar
button and the taskbar context item, both of which HIDE the affordance on a
section `canPresentLiquid` refuses. The COMMAND one was absent — grep for Liquid
in `CommandPalette.tsx` returned nothing — so the one entry point a keyboard user
reaches without pointing at a particular window could present nothing.

`window.togglePresentation` joins the Window family on the same single `os:window`
event the other twelve use. **No default chord**: conventional is the default and
Liquid is entered deliberately, so a stray key must not present a window. A command
list cannot hide per-window, so it REFUSES OUT LOUD — `canPresentLiquid(topWin
.section)` first, then a localized dismissible toast naming the reason.

Live through the palette itself: "liquid" → exactly 1 row, category Windows;
Enter → Video gains `.fwin-liquid` at rect `[40,19,711,562]`; Enter again → back
to standard at `[40,19,711,562]`, identical across all three readings, so the round
trip is presentation only. CONTROL: with the garden on top the same gesture left
`.fwin-liquid` at **0** and raised the refusal. Commit `b1e35170`.

TRAP: `keyboardShortcuts.ts` is foreign-dirty — another track's monitor commands
and a whole "Liquid Study Workspace" block sit in it uncommitted. `git add` on the
path would have committed both ahead of their owner. Staged as a HEAD+edit blob;
the reconstructed file parses with 0 TypeScript parse diagnostics.

Still open in L9: bullet 1's full controlled rubric receipt across all three entry
points, bullet 3 (Aero/Wired/Blanc-native adapters), bullet 4 (Secret Aero/Wired
lifecycle and Blanc cold-open boundaries), and the §8 theme/mode gate.

### Same turn, after the last slice — the full suite caught one of my own

`liquidWindowSnapshotFidelity` pinned `canPresentLiquid(` at exactly **2** call sites in
`DesktopShell.tsx`, so the command entry point turned it red by calling the very predicate
the guard exists to enforce. The count was a proxy; the invariant is "one predicate, no
second hand-written section list". The call-site SET is asserted by name now — chrome,
taskbar item, command. Mutation control: substituting
`topWin.section !== 'city' && topWin.section !== 'visualizer'` fails exactly that case, 13
others green. A blanket "no `!== 'city'` anywhere" was tried and reverted in the same pass:
window cycling legitimately reads that section at `DesktopShell.tsx:1696` to decide
maximization, which is not presentability. Commit `3f310b51`.

Gates after it, app idle: full `npx vitest run` **exit 0 — 12,162 passed / 6 skipped /
0 FAILED** (12,133 at the start of this turn); i18n exit 0 at **11,791** English keys
complete in ja/zh/ru; `node tools/architecture-audit.cjs` exit 0, 2,378 modules, 26
findings, **nothing new**; touched-path ESLint 0 errors.

## 2026-08-31 — Bullet 3: the third adapter, which was never written

The bullet is "Complete Aero, Wired, and Blanc-native Liquid adapters". Aero and
Wired have had theirs since L2 as `:root[data-materials='aero'|'wired']` in
`liquid-tokens.css`. **Blanc had none, and could not have had one there:**
`blancMain.tsx` strips `data-materials` on purpose (plus a MutationObserver to
re-strip it), so an attribute variant can never match; and Blanc's palette is on
`.blanc-root`, a descendant, while `liquidTokens.test.ts` forbids that sheet any
non-`:root` selector. Adapter lives in `theme/blanc-liquid.css` — the same seam
`blanc.css` already uses to remap the shared `--accent`. Commit `3f47bfa1`.

Worse than un-adapted: `liquid-tokens.css` was imported by `main.tsx` ALONE, so
Blanc had no Liquid vocabulary at all. 7 of 7 sampled tokens resolved in the
Study OS window and **0 of 7** in the Blanc window of the same running app.

| rendered evidence | before | after |
| --- | --- | --- |
| Blanc `.cal-context-toolbar` gap | `normal` (0px) | 16px |
| its 7 controls' `min-height` | `auto` x6, `0px` x1 | 32px x7 |
| smallest control box | 28x30 | 32x32 |
| Wired `.fwin-liquid` blur/sat/radius | 8px / 1.25 / 16px | 6px / 1 / 0px |
| Aero `.fwin-liquid` blur/sat/radius | 8px / 1.25 / 16px | 14px / 1.38 / 8px |

CONTROL: blanking the two remapped tokens on `.blanc-root` drove gap to 0px and
min-height to 0px on all seven and shrank the icons to 28; restore returned every
number and left no inline style (`inlineLeft: "(none)"`). Materials restore was
byte-identical in every leg. `--lq-anchor-blur` stayed `0px` in all three shells —
the anchor never picks up glass, which is §2.3's invariant.

**Bullet 3 CLOSES.** Three adapters, each measured on a rendered surface, no
identity leakage, geometry preserved across every materials switch.

The coverage test found 4 `--lq-*` reads NOTHING declares — dead in every shell
since they landed, each measured `""` live: `--lq-border-subtle` +
`--lq-radius-control` (gameArena: the whole `border` shorthand dropped, radius 0),
`--lq-radius-sm` x2 (stats panels hard-square), `--lq-radius-pill` (a pill that
was a rectangle), and `--lq-focus-ring` — the pressed note-colour swatch had **no
ring at all**. All repaired against tokens that exist. `--lq-reading-measure` is
NOT one: it carries a `none` fallback. New suite scans all 14 shared liquid
sheets for a bare `var()` of an undeclared token.

TRAP 1: the bridge's `/eval` window key is **`window`**, not `win`. An unknown key
does not error — it silently falls back to the FOCUSED window, so a two-window
comparison reads identical and looks like a shared defect. It cost me a wrong
"Study OS is broken too" reading before the control caught it.
TRAP 2: **Aero scales the desk** — `DIV.os-viewport-frame` carries
`matrix(0.855…)`. `getBoundingClientRect` therefore reports a fabricated geometry
change across a materials switch. `offsetWidth/Height/Left` and the inline style
are the app's real numbers and were identical (711x651 @ left 40) in all legs.

## 2026-08-31 — backup — bullet 1's rubric receipt opens: category 1 on both sampled surfaces

RULE C pair, and why these two: **Video** is the densest presentable surface (816
controls, 100 commands in `CENSUS.md`) and **City / Mooncap Garden** is the most
different — the sparsest window AND the section `canPresentLiquid` refuses, which
is the only place bullet 1's "without forcing Liquid" half is observable.
`sampled-out:` settings, scraper, anki, flashcards, immersion, agent, library,
grammar, novels, dictionary, youtube, calendar, games, resources, translate,
statistics, notebook, musicwidget, visualizer, note.

**The "without forcing" half is OBSERVED, live, and it holds.** One `/eval` over
both windows at once: Video is `.fwin` with a `.fwin-bar` and buttons
`[Pop out, Make Liquid, Minimize, Maximize, Close]`; City is `.fwin-frameless`
with **no `.fwin-bar` at all** and `[Pop out, Minimize, Close]` — the affordance is
absent, not disabled, on the section the predicate refuses. Both read
`data-presentation="standard"`.

**Category 1 · Video · PASS 10/10 — after two product fixes (`e863fbdb`).** It
FAILED first, on two bars, and both defects were in the media library rather than
in the entry points. `minRatio` **1.79 → 4.24** on `div.medialib-card__fallback`,
`belowFloorByHit` **2 → 0** on `button.medialib-chip`. Control fired all five bars:
`[0,6,0,0,0] → [1,8,2,1,2] → [0,6,0,0]`, `rectDrift` 0.

**Category 1 · City · FAIL, and it is a big one — 0/10, not repaired here.**
Control fired all five bars, `[7,11,0,0,11] → [8,13,2,1,13] → [7,11,0,0]`, so the
numbers are measurements:
- **7 contrast failures**, all 8–10 px body text: `small "Last:"` 3.54, four at
  3.90–3.91 (`dt "Age"`, `dt "Lifetime pages read"`, `dt "Condition"`,
  `span "Garden music"`), `span "Observation"` 3.91, `small "endless dream"` 4.49
  — that last one misses the 4.5 bar by 0.01.
- **11 of 12 controls below the 32 px pointer floor**, worst first:
  `.reading-garden-info-close` 28.5x**16** (and it is the one `stolenCount: 1`,
  shrunk 10.5 px by `aside.reading-garden-info`),
  `.reading-garden-sky-console-toggle` 22.5, the volume input 20.5, the four sky
  console buttons and `button.is-active` at 29.5, and 3 `.fwin-b` at 24.5.

**The frameless `.fwin-b` is a SEPARATE defect from the framed one.** On Video the
chrome buttons own a 32x32.5 pointer region through the inset `::after` and pass at
exactly 32.0. Inside `.fwin-frameless-controls` the same class measures **30.5x24.5**
— the expander does not survive that host. Bullet 1's own chrome entry point is
therefore at zero margin where it exists, and the expander is missing where the
container differs.

TRAPS. (1) `--surface` by TITLE cannot address a frameless window: it has no
`.fwin-title`, and the harness correctly REFUSED rather than scoring another window.
Use `@.fwin-frameless`. (2) The first City run came back `VOID — 12 of 12 controls
occluded`, because Video sat on top and the harness cannot raise a window with no
title bar to click. Minimize the other window first; the VOID is the instrument
working, not a probe bug. (3) Video's category-1 contrast passed on the very first
run and failed on the second: `medialib` cards paint asynchronously, so a run that
starts too early scores a surface whose worst element has not rendered.

**Bullet 1 stays OPEN at 2 of 16 cells.** Next: repair City's 18 category-1 defects
above, re-score, then categories 2–8 on both surfaces.

## 2026-08-31 — primary — category 1 · City repaired: FAIL 0/10 → PASS 10/10

All 18 defects closed, measured on the same window (`@.fwin-frameless`, 680x739,
`forest-night`, `standard`). Re-scored AFTER the fix, in the fix's own commit.

| bar | before | after |
| --- | --- | --- |
| `minRatio` | 3.54 (`small "Last:"`) | **4.62** (`p "Force sky events"`) |
| `failingCount` | 7 of 31 | **0** |
| `belowFloorByHit` | 11 of 12 | **0** |
| `stolenCount` | 1 (`-close`, shrunk 10.5) | **0** |
| `smallestHit` | 28.5x**16** | **32.0** (`button.fwin-b.lq-hit`) |
| verdict | FAIL 0/10 | **PASS 10/10** |

Control fired all five bars: `[0,10,0,0,0] → [1,12,2,1,2] → [0,10,0,0]`, `rectDrift 0`,
`backToBaseline true`. `belowFloorByRect` is 10 and is NOT the bar — the rect is the
recorded 98-false-failure mistake.

**THE ROOT CAUSE WAS ONE LINE, AND IT WAS NOT IN THE GARDEN.** `main.reading-garden`
carries `isolation: isolate` for its blended sky, which makes it a stacking context — so
the info chrome's `z-index: 16` and the sky console's `18` are trapped BELOW
`.fwin-drag-strip`'s `2`, which lives in the WINDOW's context. Measured:
`elementFromPoint` down the close button's centre returned `DIV.fwin-drag-strip` at y+0,
+4 and +8, and `BUTTON` only from y+12. That is a 34px invisible band over the top of
every frameless window, and it is why `-close` was the single `stolenCount`.

`z-index: 2` on the root alone is a REGRESSION and was caught before shipping: the root
paints an opaque `#050711`, so it swallowed the drag band —
`elementFromPoint(400,40)` became `MAIN.reading-garden` and the window could no longer be
dragged. `pointer-events: none` on the root gives the band back; all three interactive
groups already re-enable `auto` explicitly against a `none` ancestor, so all 9 controls
still own their own centres. Verified live before and after, with restore.

**`.fwin-b`'s expander did not "fail to survive" `.fwin-frameless-controls` — it was
never applied there.** The framed bar tags every button `lq-hit` (`DesktopShell.tsx`
~3536); the frameless branch, added later, tagged none. One class each, and the frameless
buttons now measure the identical 32x32.5 the framed ones do.

Contrast: five declarations, each sized by solving for the minimum alpha of the SAME hue
that clears 4.5 composited onto the garden's opaque `#050711`, then taking headroom.
The three 0.52 rules (`dossier dt`, `observation > span`, `music-heading > span`) were
inconsistent with their own family — `.reading-garden-info > p` uses the identical hue at
0.58 and measures 4.62 — so 0.62 is that value plus margin, not an invention.

Hit floors, all L2 primitives, no visual growth: `lq-hit-scope` on
`.reading-garden-sky-console` (toggle + actions) and on `.reading-garden-info-music-toggle`;
`lq-hit-placed` on `.reading-garden-info-close` (already `position: absolute` — plain
`lq-hit` would have dropped it into flow); `min-height: var(--lq-hit-target)` on the volume
`input[type=range]`, because a replaced element generates no `::after` and a scope over it
reads as fixed while moving nothing.

TRAP for the next worker: the WCAG relative-luminance divisor is **1.055**, not 2.055. A
transposed digit made every ratio read ~2.4x too low and turned two PASSING elements into
fabricated failures. The check that caught it: the corrected walk reproduces the harness's
own 3.54 / 3.90 / 3.91 / 4.49 exactly. Reproduce a known number before trusting a
hand-rolled contrast walk.

**Bullet 1 is at 4 of 16 cells** — category 1 now PASSES on both RULE C surfaces.
Next: categories 2–8 on Video and City.

## 2026-08-31 — primary — category 2 · City: PASS 10/10, after one product fix and three harness corrections

Task driven: `click:.reading-garden-mushroom-hitbox >> wait:700` (open the organism
dossier — City's dominant task; the window has no other multi-step flow).
`deadEnds 0 · modalTraps 0 · scrollTraps 0 · worstRecv 19.9 ms, overBar100 0 · cost 1 click`.
Control fired all three bars: `[0,0,0] → [1,1,1] → [0,0,0]`, `backToBaseline true`.

**Product fix, and it is visible: the organism title was clipping its own descenders.**
`.reading-garden-game-title` is 36px italic Palatino at `line-height: 0.95`, and the
`overflow: hidden` that serves its ellipsis was cutting the glyph box — measured
`clientHeight 34` against `scrollHeight 41`, so **7px of "Mooncap" was cut off the bottom**.
`padding-bottom: 0.2em` rather than a bigger `line-height`: the painted baseline does not
move, which is the whole point of choosing tight display leading. 7 → **0**.

It is also why the first control run VOIDed. The clipped title is state-dependent — it only
exists while the dossier is open — so `scrollTraps` read 2 in the base and 2 in the dirty leg
(root + title, then root + plant, title gone), the plant's `+1` was invisible, and
`backToBaseline` was false. A transient defect hides the control that would have caught it.

**Three harness corrections, all in `cat2-clunkiness.cjs`, none of them a way to skip a bar.**

1. *Fifth scroll-trap exclusion — a clipped ART PLATE is not unreachable content.*
   `main.reading-garden` reports 129px of overflow and every element crossing its clip line
   is an out-of-flow parallax plate (`world-back`, the background master IMG, the sky-events
   and life canvases, the foreground mask), deliberately taller than the window because the
   camera pans them. The test is two-part so the real case survives: every overflowing
   descendant must be out of flow, AND no control may have its top edge past the fold. The
   two halves are asked separately because `world-front` crosses the clip line *and* holds
   the mushroom hitbox, which sits in the middle of the visible scene — the naive
   "does it contain a control" form fails on exactly that. The control's own plant is an
   in-flow `div` and still counts. **Excluded rows are REPORTED in `decorativeClips`**, and
   this run's reads `main.reading-garden 129px — out-of-flow plates, no control past the fold`.
2. *The control plant needs `pointer-events: auto`.* City's root is now `pointer-events: none`
   (see the category-1 entry), so an appended plant inherits `none` and becomes unreachable —
   and an unreachable button "changes nothing when clicked", so the dead-end bar would move
   for the wrong reason and the control would read as fired. One declaration.
3. *`costParity` on a window that refuses Liquid.* The term has no second operand: City's
   `.fwin-frameless` has no `button.fwin-b-liquid` at all. Read factually through the existing
   `PRESENT_READ` (`pressed: null` — ABSENT, not disabled) and recorded as the same
   `N/A-single-path` the root-surface case already used, with the read stored beside it.

TRAP: `--undo "click:.reading-garden-info-close"` VOIDs here and the message is misleading —
`no match in surface` means the panel was already closed at undo time, because the mushroom
hitbox is a TOGGLE and the run's starting state decides which way it goes. Assert the starting
state in the same call that launches the run; this one started from a verified `open: false`.

**Bullet 1 is at 5 of 16 cells.**

## 2026-08-31 — backup — category 2 · Video: FAIL on latency alone, and a COUNT CORRECTION

**Count correction first, because the three entries above inflate it.** A cell is one
surface × one category, so 2 surfaces × 8 = 16. Cells CLOSED = pairs holding a banked
`PASS 10/10`. Counted by the only method that cannot drift —
`ls baselines/ | grep l9` — that is **3**: `cat1-l9-video`, `cat1-l9-city`, `cat2-l9-city`.
The "2 → 4 → 5" running total above counted measured cells and passing cells in the same
column. **Bullet 1 is at 3 of 16, not 5.** The number moved against us; it is published.

Category 2 · Video (`--surface "Video" --win main --both-presentations --control`,
1080x700, the same window category 1 scored). Task: `click:.mc-nav > button:nth-of-type(2)
>> wait:1400 >> type:.mc-global-search input=jojo >> wait:1200`; undo returned the surface
(`restored true`, hash `2q3mbt` both sides).

Four bars PASS: `deadEnds 0 · modalTraps 0 · scrollTraps 0 · costParity 5 = 5`. The Liquid
leg ran and reversed — standard 5 / liquid 5, `restoredTo pressed:false`, box unchanged.
Control fired all three: `[0,0,0] → [1,1,1] → [0,0,0]`, `backToBaseline true`.

**`latency` FAILS: worstRecv 110.6 ms against the rubric's 100 ms bar, `overBar100 1`.**
The whole `inputRecv` series is `[110.6, 80.2, 54.4, 28.3]` — four characters that resolve
at ONE frame, so the first is billed the whole burst.

**Reproduced four times: 117.2 / 119.3 / 110.3 / 110.6.** Two negative controls say the
instrument is not the cause. (a) `inertClickRecvMs 0.2` — the harness's own floor on an
element that repaints nothing is a fifth of a millisecond, so 110.6 is app work.
(b) Every other `type:`-driven surface banked with THIS harness clears the bar with room:
captures 26.2, resources 32.4, settings 35.6, novels 55.9, vn 66.1, `overBar100 0` on all
five. Same instrument, same burst shape, 2–4x the cost here.

A third control ran because City was still mounted from the interrupted turn and its
reading-garden animates: closing it moved worst from 119.3 to 110.3. **~9 ms, not the
cause** — City is exonerated and the defect is the Media Center's own.

**Root cause, measured not guessed.** Synthetic bursts spaced 350 ms apart bill each
keystroke separately: **~30 ms per keystroke with the list populated, ~17–19 ms with zero
cards rendered** (`emptyList [19.4,19.2,17.2,17.5]` vs `fullList [32.4,26.8,18,16.2]`).
So ~13 ms is the cards and ~18 ms is Media Center chrome that re-renders regardless.
MutationObserver counts only 26/8/7/5 mutations per keystroke and PerformanceObserver
records **zero** long tasks — few DOM writes, so this is React reconciling a large tree,
not layout or paint. `displayedItems` is already a `useMemo` on `debouncedQuery`
(`MediaContent.tsx:586`) and `useDebouncedValue(query, 80)` at `:575` already protects the
FILTER; what is unprotected is the JSX. `query` state lives in `useMedia`, called at
`MediaCenterView.tsx:1537`, so every keystroke reconciles the entire Media Center.

TRAP, and it cost two VOIDs: `.mc-nav`'s first child is a `SPAN.mc-nav-label`, so
`button:nth-child(2)` is **Home**, not Library. Use `nth-of-type`. The VOID reads
`undo did not restore the surface`, which points at the undo and not at the task.
Second trap: the harness's baseline is whatever the surface is at launch, so a probe that
left the nav on Library makes the correct undo look broken. Assert the resting tab first.

**NOT FIXED THIS TURN, and named so the next turn opens on it rather than re-deriving.**
The fix is memoization, and the two obvious boundaries are both defeated by prop identity
as the code stands: `MediaTile` (`MediaCenterView.tsx:387`) gets an inline
`onPlay={() => playItem(item)}` at all three call sites (`:547`, `:571`, `:952`), and
`MediaPosterCard` is built inside `renderItem` at `MediaLibraryBrowser.tsx:299` with an
inline `status` object literal and two inline callbacks. So `React.memo` alone changes
nothing; the props have to be stabilised first. Budget: per-keystroke must reach ~25 ms for
a 4-character burst to clear 100 ms, and killing the ~13 ms card cost alone lands ~78 ms.
Re-score in the fix's own commit, as the rubric requires.

**Bullet 1 stays at 3 of 16 cells** — category 2 does not close: City PASSES, Video FAILS.


---

## 2026-08-31 — Media Center per-keystroke render cost FIXED; category 2 · Video re-scores PASS 10/10

**Recovered work, not new work.** The previous turn died mid-slice with the props-stabilisation
edit sitting uncommitted in `MediaCenterView.tsx` and `MediaLibraryBrowser.tsx`. The whole diff
of both files was that one slice, so it was verified and landed unchanged rather than re-derived.

Product, exactly the two boundaries the previous entry named as defeated by prop identity:

1. `LibraryEntryCard` — a `memo()` wrapper around `MediaPosterCard` in `MediaLibraryBrowser.tsx`.
   The memo could not have worked at the old call site: `renderItem` built the subtitle string,
   the `status` object literal and both callbacks inline, so every prop was a fresh identity per
   render. All four derivations moved INSIDE the boundary, leaving stable inputs only — the entry
   object (already a `useMemo` product from `entries`, which is keyed on `debouncedQuery`), two
   ids, and the shell's two existing `useCallback` handlers.
2. `useStableCallback` in `MediaCenterView.tsx`, applied to `LibraryPanel`'s `onPlay`. A ref
   holds the latest closure, the returned identity never changes. `useCallback` was not an option
   — the closure genuinely reads `state.items` / `state.current`. Without this the whole chain
   invalidates: inline `onPlay` → `activate` (`MediaLibraryShell.tsx:227`, dep `[onPlay]`) →
   the card's `onActivate`, and the `menuItems` useMemo at `:352` with it.

**Re-scored in this commit, four consecutive runs, same harness and same task as the FAIL:**

| run | worstRecv | inputRecv | overBar100 | liquid leg |
| --- | --- | --- | --- | --- |
| 1 | **82.2** | 82.2 / 60.3 / 37.9 / 18.1 | 0 | 76.4 |
| 2 | **83.7** | 83.7 / 61.3 / 40.0 / 19.4 | 0 | 73.7 |
| 3 | **79.6** | 79.6 / 56.9 / 37.8 / 20.6 | 0 | 72.5 |
| 4 | **82.9** | 82.9 / 61.6 / 41.7 / 22.5 | 0 | 72.5 |

Against the banked FAIL series 117.2 / 119.3 / 110.3 / 110.6 — **~30 ms off the worst keystroke**,
17 ms of headroom under the 100 ms bar, and the two populations do not overlap. The other four
bars are unchanged and still measured, not inherited: `deadEnds 0 · modalTraps 0 · scrollTraps 0
· costParity 5 = 5` with the Liquid leg driven AND reversed (`restoredTo pressed:false`).
Negative controls fired in the scoring run: `[0,0,0] → [1,1,1] → [0,0,0]`, `backToBaseline true`,
harness floor `inertClickRecvMs 0.2`. Undo `restored true`.

`baselines/cat2-l9-video.json` now holds run 4. **Category 2 CLOSES for bullet 1 — both RULE C
surfaces PASS 10/10.** Cells closed, counted by `ls baselines/ | grep l9` and reading each
file's own `verdict`: **4 of 16** (`cat1-l9-video`, `cat1-l9-city`, `cat2-l9-city`,
`cat2-l9-video`), all four `PASS 10/10`. Categories 3–8 are unmeasured on both surfaces.

TRAP: the app must be RELOADED before measuring this, not trusted to HMR. The edit landed at
00:59 and the window had been up since 22:12; a `/reload` is what put the measured code and the
on-disk code in the same place.

---

## 2026-08-31 — category 3 on both RULE C surfaces: Video FAIL 3 bars → PASS, City PASS (vacuous, proven)

**Video · category 3 · FAIL on all three bars as found**, in Liquid presentation
(`--presentation liquid`, which the harness drives and restores — an `as-is` run on a
standard window is correctly opaque and would report a defect that is not there):
`denseWorkOnTranslucent 3` against a bar of 0, `liquidTreatedEligible 3/4`,
`sharedPrimitiveEligible 3/4`. Both controls fired: `[3,3,3,4,5] → one-glass [4,…] →
all-glass [5,4,…] → restored [3,3,3,4,5]`.

Two defects, one repair each, and they are the same defect seen from two sides — the
inspector rail was glass where it should be opaque and opaque where it should be glass.

1. `section.mc-inspector-block` painted `rgba(20, 23, 33, 0.78)`, so the three regions
   backed by it — `.mc-toggle-list` (6 toggles), the block itself, `.media-yt` (2 inputs) —
   were dense FORM work on translucent material. Now `var(--lq-anchor-bg)`: opaque in every
   variant by construction, and theme-resolved (rgb(18, 28, 23) under forest-night) where the
   literal was a fixed blue-grey no palette could reach.
2. `aside.mc-video-inspector` was the one eligible region of four with neither treatment nor a
   shared primitive, while `.mc-sidebar`, `.mc-nav` and `.mc-topbar` beside it all carried
   `ContextualSurface`. It now does too. No exception rule: unlike `.medialib-rail` it is not
   flush — the page insets it 20px right and the grid holds a 12px gutter — so the shared
   inset-sheet geometry is the correct one. Blocks 288→270 wide, rail 664→688 tall.

**Video re-scored in this commit: PASS 10/10** — `denseWorkOnTranslucent 0`,
`liquidTreatedEligible 4/4`, `sharedPrimitiveEligible 4/4`, controls
`[0,4,4,4,5] → [1,…] → [5,…] → [0,4,4,4,5]`, `CONTROL FAILED AS REQUIRED`.

**City returned `VOID - no runtime Work region exists to falsify`, and the VOID was the
INSTRUMENT'S limit, not a defect.** Measured: 43 regions, `Work 0`, `Liquid-eligible 0`,
`Anchor 4`, `Ambient 39` — a frameless full-bleed canvas garden. Controls A (blur one Work
region) and B (all-glass, every Work region must fail) both need a Work region to perturb, so
neither could run and the whole score voided with them.

Fixed in the harness, generally rather than for City — the Visualizer, Note and the widget
surfaces are the same shape. **Controls C and D falsify by PLANTING instead of perturbing:**
C appends a `<nav>` carrying no `lq-` class (`eligibleTotal` must rise by 1, `sharedPrimitiveEligible`
must NOT), D appends a translucent `<div>` holding an `<input>` (`denseWorkOnTranslucent` must
rise by 1). Both are surface-agnostic, sized off the measured root to clear the 1% area floor,
and removed by attribute in `finally`. Measured on City: base `[0,0,0,0,0]` → planted
`[1,1,0,1,1]` → restored `[0,0,0,0,0]`, `barsWhilePlanted {denseWorkAnchored: false,
sharedPrimitives: false}` — **the low score the rubric requires this category to be able to
produce, produced on this surface.** With that proven, a contextual denominator of 0 is a
MEASURED zero and the two contextual bars are satisfied vacuously; the run says so in
`vacuousContextual: true` rather than silently. **City PASS 10/10.**

Video was re-run against the amended harness and re-derives PASS 10/10 with controls A and B
unchanged, so every cat3 baseline banked before this addition still reproduces.

TRAP: `.reading-garden-sky-console` — City's only region with focusables — is **DEV-ONLY**
(`if (!import.meta.env.DEV) return null;`, `ReadingGardenSkyEvents.tsx:293`). It is a sky-event
debug panel with a hand-rolled glass material. Do not migrate it to the shared primitive and do
not count it: in a packaged build City has 4 fewer regions than the numbers above. The `lq-hit-scope`
class already on it is a category-1 fix a previous turn applied to a panel that does not ship.

**Cells closed: 6 of 16**, counted by reading each `baselines/*l9*.json`'s own `verdict` —
cat1 video/city, cat2 video/city, cat3 video/city, all `PASS 10/10`. Categories 4–8 unmeasured.
