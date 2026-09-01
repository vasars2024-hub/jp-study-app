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

---

## 2026-08-31 — category 4 measured on both surfaces: BOTH FAIL. Diagnosed, not repaired.

Banked as `cat4-l9-video.json` / `cat4-l9-city.json` with verdict `FAIL`, so the cell count
below does not move. Both failures are located with numbers; neither is repaired, and the
next turn OPENS on Video's.

**Video · FAIL 2 bars of 7.** Clipping 0, overlap 0, `contentGrowsNotChrome` true (chrome
47.5 → 42.0% default → maximized, dominant canvas 94.8 → 95.3%), every leg `restored: true`.

1. `horizontal` FAILS at compact **260x170**: `main.mc-content 240>154`, plus two
   `hiddenOverflowX` — `div.mc-video-stage 149>124`, `div.medialib-card__art 36>34`.
   Root cause measured, not guessed: at container width 222 the `@container mc (max-width:
   640px)` block puts `.mc-video-inspector` on `grid-template-columns: 1fr`, and `1fr` floors
   at min-content — the resolved track is **226px inside a 126px box**. Each
   `.mc-inspector-block` is 226 wide there. The 226 comes from `LABEL.mc-toggle`, which
   measures 200 min-content, so `minmax(0, 1fr)` on the inspector is necessary and NOT
   sufficient: it lets the column shrink, and the overflow then reappears inside
   `.mc-inspector-block`, which sets no `overflow`. The toggle rows have to wrap too.
   19 other surfaces bank a PASS at this same 260x170, so the size is in scope.
2. `deadRegion` FAILS at maximized 1264x765: **17.1%** against the 15% bar, largest dead box
   `694x256 at grid 7,7`. Default is 13.0% (inside the bar) and compact 0.6%, so this is the
   maximized layout not filling the extra height, not a constant.

**City · FAIL 5 bars, and at least three of them are the INSTRUMENT, on the evidence.** It
reports `clipped 24` and `overlaps 397` at 680x709. City is a parallax scene: 39 Ambient
layers deliberately larger than the window and deliberately stacked — `world-back`,
`background-master`, `sky-events`, `life` and `foreground-mask` all measure 910x1137 in a
680x709 box. `cat2-clunkiness.cjs` already carries this exact exclusion for scroll traps
("a clipped ART PLATE is not unreachable content", its correction 5) and cat4 has no
equivalent. Do not "fix" City's art to satisfy this bar before the harness has the
exclusion — that would delete a feature to pass a measurement.
`allThreeSizes` and `restored` also fail for a structural reason: `rootKind` is
`section inside a floating window` and a frameless window has no Maximize button, so only 2
of 3 legs ran. cat4 needs a defined behaviour for that shape, the same way cat3 just got one
for a surface with no Work region.

**Cells closed: still 6 of 16**, counted by reading each `baselines/*l9*.json`'s own
`verdict` — cat1, cat2 and cat3 on both surfaces. cat4 measured and FAILING on both;
categories 5–8 unmeasured.

## 2026-08-31 — category 4 · Video: FAIL 2 bars → **PASS 10/10**, banked

`cat4-l9-video.json` re-run and re-banked in this fix's own commit. All 7 bars true at all
three sizes. **Cells: 7 of 16.** Control still valid: `injectedClip` 0→1→0 with removal
proven, and `subMinimumShrink` at 200x140 (below the surface's floor) still reports
`horizontalScrollers 3 / hiddenOverflowX 3` — the instrument can still see overflow, so the
0s at 260x170 are a result and not a blind probe.

**The previous entry's root cause for bar 1 was WRONG in its second half and is corrected
here.** It named `LABEL.mc-toggle` at 200 min-content as the source of the 226px track. It is
not: measured live, `label.mc-toggle` is **77** min-content and `.mc-toggle-list` is 108 — the
200 was its *used* width in an already-226 track, read back as if it were a floor. The real
226 is inspector block #3, and inside it `select.media-model-select` at exactly 200: a
`<select>` has `white-space: pre`, so its min-content is its widest option label, and the
shared rule in `styles.css` clamps that to `max-width: 200px` — a ceiling with no floor. So
`minmax(0, 1fr)` IS sufficient once the select can shrink, and the toggle rows never needed to
wrap. Read a min-content number off the element you are blaming, not off its parent's track.

Five distinct chains, each measured before and after, none guessed:

| chain | before | after |
| --- | --- | --- |
| `.mc-video-inspector` track vs box | 226 in 126 | 126 in 126 |
| `.mc-video-stage` (empty-state action row, `nowrap`, min-content 174 in 64) | 149>124 | 124>124 |
| `.medialib-card__art` (`.mc-tile-play` 27px circle in a 22px box; `span.mc-tile-episode` at `left: 7px` resolving `right: -2.17px`) | 36>34 | none |
| `.mc-video-topbar > div:first-child` — `min-width: 0` governs the MAIN axis only, and the ≤640 query flips the bar to a column, so the nowrap title reverted to fit-content | 156 in 126 → `main.mc-content 170>154` | 126 in 126 |
| `.mc-section-head` — `space-between` with no space to give; the trailing count sits 17px past the content edge | `div.mc-video-empty 119>114` | none |

**`deadRegion` 17.1% → 4.5% maximized, 13.0% → 4.1% default.** Not a spacing tweak: the
maximized stage was a 668x668 void with a 179px message block centred in it, while
`.mc-shelf.mc-up-next` — the shelf that answers that message's own question, "Choose what to
watch" — sat at y=855 in a 650px scroller, below the fold. The shelf now renders INSIDE the
empty stage and not below it. **Relocated, not duplicated**: one `upNext` value, rendered in
one of two places, so no state shows the same seven posters twice and none loses them.

Two harness-shaped traps this cost real time to learn, both live:
1. **The Media Center tab drifts, and every harness scores whatever tab it lands on.** A cat2
   run reported `scrollTraps 2` (`span.medialib-card__title`, 17px unreachable) that read
   exactly like a regression from this slice. It was the **Library** tab, unfiltered, measured
   because HMR had reset the tab — and `cat2-l9-video.json`'s own banked task navigates to
   Library and types `jojo`, which filters those long titles away. Re-run from the Video tab:
   `scrollTraps 0`. Assert the tab before believing any L9 Video number.
2. **cat2's first run after a tab switch is a cold outlier.** `worstRecv 105.8` over the 100
   bar, then 76.0 / 81.8 / 76.6 / 88.9 on four repeats. One reading is not a latency finding.

No regression in the three banked categories, all re-derived on the Video tab this turn:
cat1 **PASS 10/10**, cat3 **PASS 10/10**, cat2 `failedBars []` (deadEnds 0, scrollTraps 0,
worstRecv 88.9 < 100; `costParity` UNMEASURED because the presentation-parity leg was not
re-driven, and it is unchanged in the bank).

`sampled-out:` unchanged from the 2026-08-31 00:25 entry.

## 2026-08-31 — category 4 · City: the INSTRUMENT was wrong on 4 of 5 bars. Two corrections, both controlled.

City's `FAIL 5 bars` was mostly `cat4-use-of-space.cjs` meeting a shape it was never written
against. Fixed in the harness, not in the art — and the fix is inert on a dense surface, which
is the number that makes it trustworthy: **Video re-runs PASS 10/10 with `excused 0/0/0` at all
three sizes.** Nothing that passed before is passing for a new reason.

**Correction 19 — a frameless window has no third size, and that is the product.** `allThreeSizes`
and `restored` were false because the maximize leg refused. City is `.fwin-frameless` and
`DesktopShell` forces `max: false` for section `city` in two places, so no state of the app paints
it maximized. `sizesExpected` is now 2, with the refusal carrying its own evidence:
`chromeButtons 3`, `chromeButtonTitles ["Pop out into its own window","Minimize","Close"]`,
`frameless true` — three real buttons and no Maximize among them. `contentGrowsNotChrome` was
UNMEASURED for want of a second end; it now compares **compact → default** and names the pair in
`contentGrowsNotChromePair`. Both bars PASS on evidence, not by waiver.

> **The first version of this proof was vacuous and is recorded so nobody rebuilds it.** It counted
> `.fwin-btns .fwin-b` and got **0** for City — whose controls live in `.fwin-frameless-controls` —
> and would have returned 0, and therefore exonerated, for *any* window whose chrome sits anywhere
> else. It now scans every `.fwin-b` in the window and asks whether any is titled Maximize. A framed
> window missing only that button still fails, which is the case this must not launder.

**Correction 20 — an ambient art plate is not clipping, and two stacked are not an overlap.**
`cat2-clunkiness.cjs` has carried this judgement since its correction 5; cat4 had none. The rule
is asked of the nearest OUT-OF-FLOW ancestor-or-self, not of the element — City's clouds and fog
are absolutely-positioned sprites holding a `position: static` canvas, and an element-only test
still scored 7 clips and 215 overlaps of pure parallax. For clipping the question is cat2's, not
"does it contain a control": **is anything readable or actionable stranded outside the surface**.
That distinction is the whole value — the world layer holds the mushroom hitbox in the middle of
the visible scene at default (excused) and outside the window at 260x170 (**correctly still
marked**). Overlap asks a different question, because two boxes hide things from each other
regardless of the surface edge: both sides out of flow AND at least one pure paint.

| bar | before | after |
| --- | --- | --- |
| clipped, default 680x709 | 24 | **0** (24 excused as plates) |
| overlaps, default | 397 | **3** (336 excused) |
| clipped, compact 260x170 | 55 | 13 (45 excused) |
| overlaps, compact | 266 | **0** (225 excused) |
| horizontal, default | `main.reading-garden 947>678` | **0** — excused, every crossing box is a plate |

**Both controls fire, in opposite directions, and that pair is the point.** `injectedClip` now
plants text (`lq control: stranded content`) because the old empty plant would have been excused
by correction 20 and the control would have gone quiet: it still moves `clipped` 0 → 1 → 0. The new
`artPlateExclusion` leg plants the same box at the same place hanging out by the same 279px but
empty and out of flow: `clipped` does NOT rise, `artPlateClipCount` 24 → 25 → 24, and the plant is
named in `artPlateClips`. Narrow the exclusion to a no-op and the second fails; widen it into an
amnesty and the first fails. *Trap: `namedInArtPlateClips` must be computed in-page over the
UNTRUNCATED list — the reported array is capped at 8 and City has 24 plates, so the plant is not
in it and the control read false while working correctly.*

**City remains FAIL — 3 bars, and both remaining causes are now REAL, not instrument.** Banked as
`cat4-l9-city.json` with verdict FAIL, so the cell count does not move.

1. **compact 260x170 strands the scene's only control.** `clipped 13`, and the list names
   `button.reading-garden-mushroom-hitbox` and `button.reading-garden-sky-console-toggle` along
   with `main.reading-garden`, `world` and `mushroom`; `hox` follows for the same reason
   (`main.reading-garden 459>258` is no longer all-plates once the hitbox is stranded). City IS
   resizable to that size — it carries a `.fwin-resize` grip and `min-width: 0px` — so this is a
   size a user can reach, and 19 other surfaces bank a PASS at it. The camera already has a scale
   (`--garden-camera-scale-a/b`, `1.26 - progress * 0.26`, `ReadingGarden.tsx:493`); a fit-to-window
   factor multiplied into it is the shape of the repair. **Not attempted here**: it is parallax
   camera maths on art that cannot be verified by measurement alone, and a rushed pass would break
   what it was meant to protect.
2. **default 680x709 keeps 3 overlaps, and all three are the DEV-ONLY console** —
   `div.reading-garden-world x div.reading-garden-sky-console{,-body,-actions}`.
   `ReadingGardenSkyEvents.tsx:293` is `if (!import.meta.env.DEV) return null;`, so a packaged
   build has **0**. Not excused: hardcoding that class into a parameterised harness is exactly the
   surface-specific special case RULE 1 forbids, and quietly excusing "debug overlays" as a
   category would hide real inspectors. Disclosed instead, and the number stands as measured.

**Cells: still 7 of 16** — cat4 closes on Video only. `sampled-out:` unchanged.

## 2026-08-31 — category 4 · City: FAIL 5 bars → **PASS 10/10**. cat4 CLOSES on both surfaces.

**Cells: 8 of 16.** Both L9 RULE C surfaces now bank `PASS 10/10` for category 4. Two product
fixes and one more harness correction, on top of 19 and 20 in the entry above.

**The compact failure was one CSS declaration, not camera maths — and the previous entry's
"parallax camera maths" reading was wrong.** Measured at 260x170 before touching anything:

| element | box | verdict |
| --- | --- | --- |
| `main.reading-garden` | 258 **x 420** in a 170px window | 251px below the frame |
| `.reading-garden-mushroom` | y = **254** | under the fold |
| `button.reading-garden-mushroom-hitbox` | y = **259** | the scene's ONLY control, unreachable |
| `.reading-garden-sky-console` | y = **230** | under the fold |

`.reading-garden` carried `height: 100%` and `min-height: 420px`. **`min-height` beats both
`height` and `max-height`** — the used height is `max(min-height, min(max-height, height))` — so
that was not a floor, it was an override, and it won every time the window was shorter than 420.
`gardenWorldRect` projects off this element's own box, so the world was being cover-fitted into a
420px area of which 170 was visible, and everything positioned inside it went with it.
`min-height: min(420px, 100%)` keeps the floor where there is room and yields where there is not.
After: `main` 258x168, mushroom (75, 76) 78x56, hitbox (83, 79) 61x50 — **inside the window**.
Proven inert at the default size, which is what makes cat1/cat3's banked City scores still valid
without re-running them: at 680x709 `main` is 678x707 with used `height: 707px`, exactly as before,
because 420 < 707 either way. The percentage resolves in both real hosts — `.fwin-body` and
`.popout-root` (`position: absolute; inset: 0; height: 100%`) both have definite heights, which is
the same reason `height: 100%` above them already worked.

**Correction 21 — a dev-only overlay is not part of the surface.** With the above fixed, City's
ENTIRE remaining failure was `.reading-garden-sky-console`: 2 clipped and 8 overlaps at 260x170,
3 overlaps at default, from a panel `ReadingGardenSkyEvents.tsx` returns `null` for in any
packaged build. These harnesses walk the running DEV app, so it is on screen here and on no
user's machine. The product now marks that root **`data-dev-only="true"`, next to its own
`import.meta.env.DEV` guard**, and the reader drops such subtrees in `painted()`.

An ATTRIBUTE the product sets, never a class list the harness knows — a surface-specific
exception is what RULE 1 forbids, and a harness deciding for itself what "looks like" a debug
panel would hide real inspectors. Every exclusion is named: City reports
`devOnlyExcluded: ["div.reading-garden-sky-console (+8 descendants)"]`, count 1. Putting the
attribute on a shipping element to dodge a score would appear there by name.

| bar | City before | City after |
| --- | --- | --- |
| clipped (default / compact) | 24 / 55 | **0 / 0** |
| overlaps | 397 / 266 | **0 / 0** |
| horizontal | `main.reading-garden 947>678` | **0 / 0** |
| allThreeSizes, restored | false, false | **true** (2 of 2 reachable, proven) |
| contentGrowsNotChrome | UNMEASURED | **true** (compact → default, pair named) |

**The instrument is inert where it should be.** Video re-runs `PASS 10/10` with
`excused 0/0/0` and `devOnly 0` at all three sizes: none of corrections 19, 20 or 21 fires on a
dense app surface, so nothing that passed before is passing for a new reason. Both controls hold
on both surfaces — `injectedClip` 0 → 1 → 0, and the plate plant excused, named, and removed.

**Category 4 CLOSED for L9 bullet 1.** Remaining for the bullet: categories 5–8 × 2 surfaces.
`sampled-out:` unchanged.

## 2026-08-31 — primary — category 6 on Video: PASS 10/10, no product defect, two instrument corrections

Category 5 needs a committed `cat6-<label>.json` or Q7/Q8/Q9 read `MEASURE` and the run is VOID,
so category 6 is scored FIRST on both L9 surfaces. Neither existed: `l6-parity.js` had no spec for
the Media Center's Video tab (its `music` sibling covers the Music tab only).

**`video` spec — 10 rows, and every one is a cross-check between two independently rendered
places**, because this surface's real failure mode is not a missing control, it is two renderings
of one state disagreeing. `rootSel: '.mc-video-page'` + `notSel: '.mc-music-layout'` for the same
reason `vn` needs one: the Media Center is ONE `.fwin` whose page swaps.

| row | what earns it |
| --- | --- |
| `stageHonesty` | `video` elements 0 while the empty states show; the entry empty's 2 actions both enabled |
| `topbarActions` | 4 actions, 2 enabled, and **every disabled one carries a non-empty `title`** (the mute-pair contract) |
| `learningToggles` | driven: `toggle` clicks the first; exactly 1 of 6 moved, the other five unchanged |
| `transcriptionModel` | the inspector's own select (4 options, value in list) + 1 of 2 language segments active |
| `watchFolder` | 1 control, enabled |
| `youtubeDraft` | driven: the drafted URL survives in the field and its action stays live |
| `upNextShelf` | **exactly one** shelf, 7 cards, visible — the "relocated, not duplicated" property `04e51992` established |
| `inspectorHonesty` | score row / MAL link / meta line / empty copy all agree — `blank`, never `MIXED` |
| `navReach` | active nav `<strong>` === `.fwin-title-text` === the mounted `.mc-page` class |
| `windowLifecycle` | shared: 5 chrome buttons, `aria-pressed` a real boolean |

**Result: PASS 10/10.** parity `standard 10/10` vs `liquid 10/10`, equal, `rowsAgree true`, `na 0`.
Round trip standard → liquid → standard: `fieldsHeld true`, `shellHeld true`, **0 diffs**, box
`1080x700` in both presentations. Negative control: **all 10 mutations fell exactly their own row
and every one returned to 10/10** — `CONTROL FAILED AS REQUIRED`. No product change was needed.

**Correction 22 — the nav label is the `<strong>`, not `textContent.split('\n')`.** The item is
`<svg><span><strong>Video</strong><small>Immersion player</small></span>`; `textContent`
concatenates with NO separator, so `navReach` read `activeLabel "VideoImmersion player"` against
`windowTitle "Video"` and scored a correct surface 9/10. Its own mutation then reported
`fellRows: []` — a row that is already false cannot fall, which is how the instrument error was
caught rather than filed as a defect.

**Correction 23 — and it is my own cat4 fix biting back.** `stageHonesty`'s actions were queried
as a bare descendant `button`. `04e51992` moved the up-next shelf INSIDE that empty state, so the
query counted its **seven poster cards as entry actions**: detaching a real action still left
eight, the row stayed true, and the control read VOID on a passing surface. Scoped to
`:scope > div > button` — the empty's own action row. **A relocation changes what a descendant
query means; re-read every harness that walks the region you moved something into.**

Restored to exactly what was found: presentation `standard`, toggles
`[false,false,false,true,false,false]`, YouTube field empty, `jp-media-player-preferences-v1`
byte-identical, page still `mc-video-page`, 1080x700.

**Cells: 9 of 16.** `sampled-out:` unchanged.

## 2026-08-31 — primary — category 6 on City: PASS 10/10, and correction 24 — the no-Liquid host

City could not be scored for category 6 at all. `canPresentLiquid` (`liquidWindowPresentation.ts:72`)
refuses sections `city` and `visualizer` outright — "the frameless garden and visualizer trinkets
have no conventional chrome to swap" — so the window renders **no Make Liquid control**, and
`cat6-feature-parity.cjs` threw on its first `flip()`. The category was simply out of reach on
L9's second RULE C surface.

**Correction 24 — a `.fwin` with no Liquid destination is a FOURTH host, `fwin-no-liquid`.**
Classified from the RENDERED ABSENCE of `.fwin-b-liquid`, never from a class name the harness
recognises. It is not `chromeless` (it has Pop out / Minimize / Close) and it is not a broken
`fwin` (3 buttons and no toggle would have scored a correct window false). `lifecycle()` gets the
inverse contract for it: the toggle must be **absent**, `data-presentation` must read `standard`,
and `fwin-liquid` must not be on the class list — a non-presentable window painting Liquid with
nothing to leave it is the 2026-08-17 visualizer finding, which this row still has to catch.

**Scoring 10/10 because nothing could be measured is the empty-harness false pass, so the parity
bar is REPLACED, not waived.** Two real things take its place:

| bar | what earned it |
| --- | --- |
| `liquidAbsenceProved` | the identical `.fwin-b-liquid` query over every open window at one moment: **City 0, Video 1**, City `data-presentation="standard"`, 3 chrome buttons. **With no such neighbour the run REFUSES** — an absent toggle is otherwise equally explained by an app that renders the affordance nowhere, which is a defect. |
| `roundTripHeld` | the reversible transition City actually has — **minimize → restore** from its taskbar button. `display: none` asserted mid-trip, so a trip that did not happen cannot pass. |

**Z-order is compared as RANK, not as the raw inline value.** Restoring a minimised window
legitimately raises it — measured `zIndex 196 → 198` — and scoring the shell's correct behaviour
as a lost round trip would be a fabricated defect. `rank 1 of 2` before and after; both raw values
are printed beside it.

**`city` spec — 9 rows, every one an agreement between two numbers the scene computes
independently**, because a canvas surface has almost no controls and presence-counting would score
an empty stage 10/10: `stageReadout` (badge `01` vs the root's `stage-band-1`, `floor((n-1)/10)+1`),
`dossierFacts` (the sentence `10 / 50 pages banked` vs the progress bar's inline `width: 20%`),
`musicControls` (one of two `aria-pressed` vs the volume slider's `disabled`), `musicVolumeReadout`,
`dossierDisclosure` (`aria-controls` → the panel's own `id`, with an enabled way back out),
`scenePainted`, `devOnlyIsolated`, `windowLifecycle`, and **`heroPlacement` — `df9441cf` stated as a
contract**, so the mushroom can never slide back under the fold unnoticed.

**Result: PASS 10/10.** 9/9 rows reachable, absence proved, round trip `fieldsHeld true`
`shellHeld true` `rankHeld true`, geometry `94,54 680x709` identical. Negative control: **all 9
mutations fell exactly their own row, all 9 returned to 9/9** — `CONTROL FAILED AS REQUIRED`. No
product change was needed on this surface either.

**Correction 25 — `raise()` resolved the window by title and City has none.** It queried
`.fwin-title-text`, got nothing for a frameless window, concluded the open on-top window was not
open, and clicked the taskbar button to "open" it. **The taskbar button is a TOGGLE**, so that
click MINIMISED the surface and every measurement after it would have run on a `display: none`
window. Now resolved through the spec's own `__win`.

Two limitations, on the record rather than buried. `scenePainted`'s control falsifies the parallax
half only: zeroing a canvas backing store is the more literal falsification, but the restore sweep
puts an ATTRIBUTE back and not the pixels, so a layer not on a redraw loop would stay blank in the
user's live garden. `devOnlyIsolated` is falsified from the other side — stripping the marked
panel's identifying class — because the sweep can put an attribute back but never remove one the
harness invented, and marking a shipping node would leave `data-dev-only=""` on it.

Restored: dossier closed as found, 6 cloud sprites, sky console present, 3 chrome buttons,
`94,54 680x709`, 0 leftover `data-lqp-*` markers. The hitbox keeps an inert `style=""` the restore
sweep writes where no style attribute existed; it applies nothing and React drops it on re-render.
**Video re-runs `PASS 10/10` with host `fwin` and `raised`, so correction 24/25 are inert on a
presentable surface** — nothing that passed before passes for a new reason.

**Category 6 CLOSED for L9 bullet 1. Cells: 10 of 16.** `sampled-out:` unchanged.

## 2026-08-31 — primary — category 5 measured on both L9 surfaces: Video 8/10, City VOID. Both diagnosed.

`cat6-l9-video.json` and `cat6-l9-city.json` now exist, so Q7/Q8/Q9 stopped reading `MEASURE` and
category 5 became reachable on both.

| Q | Video | City |
| --- | --- | --- |
| 1 dominant task obvious | YES | **NO** — `entryPoints 0` |
| 2 location and way back | YES | **NO** — `titleText ""` |
| 3 primary action visible | YES | **NO** — `primaryAction null` |
| 4 tools without clutter | **NO** — `collapsedDisclosures 0`, `scannedControls 24 > 12` | YES |
| 5 stable contrast | **NO** | **NO** |
| 6 motion explains | YES | **NO-SUBJECT** → VOID |
| 7 / 8 / 9 (from cat6) | YES | YES |
| 10 not a card dashboard | YES | YES |

**Correction 26 — Q7/Q8/Q9 on a `fwin-no-liquid` host.** Left alone, City scored **three fabricated
`NO`s**: `parity.equal` and `parity.rowsAgree` are `null` on that host, and Q8 fell on the single
`zIndex` diff a minimize/restore trip legitimately produces. They now read that baseline's own bars.
Q8 is answered by **proved absence** — the discriminating query that found a neighbouring window
rendering `.fwin-b-liquid` while this one does not — plus the lifecycle trip holding, and the output
carries a `basis` field saying so. **Known weakening, on the record: on this host Q7 and Q9 share
their evidence**, because a surface with one presentation has one row set.

**Q5 is a real defect on BOTH surfaces, and the theme axis is what exposes it.** `themeAxisMoved
true` on both, so this is a measurement and not a stuck reading.

- **Video, `forest-night`: `button.mc-button-primary` 3.92 at the top of its gradient**, bar 4.5,
  white on `linear-gradient(rgb(217,81,110), rgb(184,51,85))` — 3.92 at the top stop, 5.77 at the
  bottom. Three buttons. **cat1 banked `minRatio 4.24 / failingCount 0` on this same surface and
  theme**, so the two instruments disagree and cat5 is the stricter: it scores the WORST stop under
  the text, cat1 did not reach these buttons at all (100 runs vs 85 — different sets).
- **Video, `classic-light`: 18 failing, worst 1.03**, `strong` at 1.13 and `p` at 2.97 over
  `gradient on div.mc-video-empty`. The stage's empty state paints a fixed dark gradient that does
  not remap with the palette, so in a light theme its own copy is unreadable.
- **City, `classic-light`: 3 failing at 1.61** — every glyph of `.fwin-frameless-controls`
  (`⧉ ─ ×`) at 72% over the window. A frameless window's ONLY chrome is invisible in a light theme.

**Video Q4 is real too.** `scannedControls 24` against a bar of 12, `collapsedDisclosures 0`: the
Video tab presents the shell nav, the topbar's four actions, both stage empties' actions and the
whole inspector rail at once, with nothing collapsed.

**City Q1/Q2/Q3 are the instrument meeting a canvas surface, and are NOT yet adjudicated.** Q1
counts accent buttons in the top third; City's one control is a mushroom near the ground. Q2 wants a
title; a frameless window renders none by design and bullet 1 closed on exactly that. Q3 wants an
element explicitly marked primary. Each is either a real product gap or a dense-surface assumption —
the next turn decides each on its own evidence and does not waive them as a group.
**City Q6 is `NO-SUBJECT` because the toggle leg refuses, yet `liquidRegions 2` were found in the
only presentation the surface has — one of them `div.reading-garden-sky-console-body`, the DEV-ONLY
console correction 21 already excludes from category 4. cat5 does not yet honour that attribute.**

Banked as `cat5-l9-video.json` (8/10) and `cat5-l9-city.json` (VOID), so **cells stay 10 of 16.**

## 2026-08-31 — primary — cat5 Q5 on Video: forest-night 3.92 → 4.74, failing 3 → 0. classic-light is an INSTRUMENT defect.

**Product fix 1 — `.mc-button-primary`'s gradient.** A gradient under text is a RANGE of contrast
ratios and the bar is the worst stop, not the average. White on `#d9516e → #b83355` measured
**3.92:1 at the top stop and 5.77:1 at the bottom** (14px/400, bar 4.5), so the upper third of every
primary button in this shell was below AA while its lower third was clear. The mid-gradient reading
a simpler instrument takes is 4.75:1 — which is why cat1 banked `failingCount 0` on this same
surface and theme and never reached these buttons. Both stops stepped down to `#c94061 → #a82c4b`
(hover `#cc4464 → #b63354`, still lighter than rest so the affordance reads). **Re-scored:
forest-night `minRatio` 3.92 → 4.74, `failingCount` 3 → 0.**

**Product fix 2 — `--mc-stage-plate`.** `.mc-video-empty` inlined a literal dark gradient, so in a
light palette the ink correctly went dark and the plate stayed near-black. Now a token, defaulting
to the identical literal (dark palettes pixel-identical) and re-sourced in the light and
high-contrast blocks exactly like the four glass tokens above it. **Verified live** by setting
`data-theme='classic-light'` and reading the computed value on the element:

    linear-gradient(145deg, rgb(255, 255, 255), rgb(243, 243, 243))   text rgb(30, 30, 30)

A white plate under near-black text. The base layer is opaque there, not 0.9/0.98: with the dark
default's alphas kept, the light plate still composited the dark stage beneath and `strong` moved
only 1.13 → 1.09 — the plate had changed and the reading had not.

**CORRECTION 27, NOT YET APPLIED — cat5's gradient parser flattens multi-layer backgrounds, and it
is why classic-light still reports 22 failing on a plate that is provably white.**
`cs.backgroundImage` is ONE string holding both layers. The parser regex harvests every colour token
across ALL layers into one stop list, then decides whether to stop walking with
`min(alphas) >= 0.996`. My plate is `radial-gradient(accent @ 0.1), linear-gradient(opaque, opaque)`:
`min` is the top layer's 10% bloom, so the walk does NOT stop at an opaque lower layer and it
composites `.mc-video-stage`'s dark fill underneath a plate that hides it completely. The banked
`classic-light: 22 failing, minRatio 1.01` in `cat5-l9-video.json` is **partly fabricated and must
not be treated as a product finding.** The fix: split `backgroundImage` on TOP-LEVEL commas (commas
inside `rgba()`, `color()` and the gradient's own arguments do not count), score each layer on its
own alphas, and stop the walk when ANY layer is opaque everywhere. This is the same family as the
2026-08-28 Games correction quoted in that branch's own comment, which fixed the per-STOP alpha and
left the per-LAYER one.

**Video's cat5 stays 8/10 and is NOT closed**: Q5 pending correction 27's re-score, Q4 (`24`
controls scanned against a bar of 12, `collapsedDisclosures 0`) untouched. **Cells still 10 of 16.**

## 2026-08-31 — boss-audit repair, not scoring: liquid commits that shipped without their consumers

`docs/audit/RELAY_BOSS_AUDIT.md`'s 2026-08-31 receipt (audit-20260831-043527-2edb16dc) found three
defects, all of them liquid commits whose product wiring stayed uncommitted in the shared tree.
Re-derived here before repair, then re-measured in a detached worktree at each new HEAD.

**Measured, clean HEAD, `node tools/architecture-audit.cjs`: 15 new identities before, 9 after.**
Focused suites at clean HEAD after: **6 files / 61 tests pass** (settingsSearchReachability,
liquidTokens, videoStudyLayout, aeroSafeModeRecovery, aeroViewportWiring, studyBlockWindows).

- `a6f61698` — finding 2. `27bcbf36` committed `aeroSafeMode.ts` but not the CSS or any importer, so
  `liquidTokens.test.ts:179` threw **ENOENT** on `theme/aero-safe-mode.css` and the file could not
  even load. Landed the sheet, `main.tsx` boot, the sound/ambient suppressors, the Motion settings
  card, its registry entry, the storage-domain key, and 11 keys × 4 catalogs.
- `c47feb3f` — `src/main/studyBlockWindows.ts` had no importer; no detached block could be opened.
- `7795f921` — `AeroViewport`, `DetachedStudyBlock` and `TourOverlay` had no importer. HEAD still
  carried its **own inline copy** of AeroViewport, which is why the extraction looked harmless.
- `c7c0b711` — finding 3. Negative control at `7795f921`: `settingsSearchReachability.test.ts`
  fails with **exactly** `profile-identity`, `profile-site-overrides`, `profile-history`,
  `profile-portable` unanchored. After: 6/6. L8's "zero unanchored" claim was stale, now true again.
- `7ce85e50` — `studyBlockWindows.test.ts` (22 cases) and `aeroViewportWiring.test.tsx` were
  **untracked**: the shared tree was green on tests that did not exist at HEAD.

**Trap for the next worker.** Seven of these files also carry another track's uncommitted hunks
(the i18n conversion of `App.tsx`/`POPOUT_LABELS` and the four catalogs, the transcription domain in
`settingsCatalog.ts`). Each was staged as HEAD-blob + this slice's hunks via `git hash-object
--no-filters` + `update-index --cacheinfo`, never `git add` of the whole file. That work is still
uncommitted and untouched; do not absorb it.

**Deliberately NOT fixed, and why.** The 9 remaining orphans need consumers that live inside
in-progress foreign rewrites: `StudyBottomBar`/`StudyDocks`/`StudyWorkspaceCustomizer` are imported
only by `VideoCoreStudyOverlay.tsx` (**+936/-662 uncommitted**), and `seanimeMediaAuth` only by
`StudyPlayerSlice.tsx` (**+237**, 11 hunks). Landing either means committing another track's
half-finished slice. `episodeProcessingRules`, `blancMasterSources`, `captureKindKeys`,
`companionAssignments`, `readingDiscoveryActions` likewise sit behind scraper/blanc/i18n dirt.
**Clean HEAD's architecture gate stays red at 9 until those owners land their consumers.**

## 2026-08-31 — backup — cat5 closes on Video (correction 27 + two real fixes); cat8 Video 10/10, City UNMEASURABLE

**Correction 27 APPLIED (`8383aa1a`).** `cs.backgroundImage` is one string holding every layer;
the stop regex harvested colours across all of them and `min(alphas)` was the most transparent
stop of the most transparent LAYER, so the walk never sealed at an opaque lower layer. Layers
now split on TOP-LEVEL commas (depth-counted), score separately in paint order, and the walk
stops when ANY layer is opaque everywhere — a layer that dropped a fully transparent stop may
not seal. **Video/classic-light: banked `22 failing / 1.01` → `7 failing / 1.09`. Fifteen were
fabricated, as diagnosed. The seven were REAL** and are fixed: `.mc-tile-copy strong` and
`.mc-study-row-copy strong` hardcoded `#dfe0e6`, so the Video empty state's recent-media titles
painted rgb(223,224,230) on the now-white plate. `--mc-tile-ink`, dark literal unchanged,
re-sourced in the light and high-contrast blocks. Live: dark `rgb(223,224,230)`, classic-light
`rgb(30,30,30)`, high-contrast `rgb(255,255,0)`.

**TRAP, and it cost a run.** The first re-run scored 9/10 on the **Music** section: the Media
Center's internal route had drifted while the window title stayed "Video". `--surface Video`
resolves the WINDOW, not the section. Check `.mc-nav .is-active` before every Media Center run;
that run was discarded, not banked.

**Q4 closed with a product change, not a flag (`06708e7c`).** Transcription + watch folder +
YouTube move into one `<details class="mc-inspector-advanced">`, same uncontrolled semantics as
`.mc-music-import`. Unflagged, live: **collapsed 0 → 1, scanned 34 → 17** (`cat5-l9-video-q4raw
.json`). Ten of the 17 are `.mc-sidebar`/`.mc-topbar`; scored with the identical
`.mc-sidebar,.mc-topbar,.mc-playerbar` exclusion Music's Q4 closed under, page-scanned **7**,
shell 15. **cat5-l9-video PASS 10/10**; control `FAILED AS REQUIRED on Q2, Q3, Q4, Q5, Q10`.

**cat8 · Video PASS 10/10** — 0 raw keys / 0 placeholders / 0 mute pairs, statesNamed 1 of 1
observable, langs 4 distinct hashes and diffShare 0.65 over 80 runs, restored. Control
`[0,0,0] → [1,1,1] → [0,0,0]`.

**cat8 · City is UNMEASURABLE, and scoring it FAIL would have been a fabricated defect.**
City's ENTIRE painted text is 3 window glyphs plus 7 runs of `.reading-garden-sky-console`,
which is `import.meta.env.DEV`-gated and carries `data-dev-only="true"`
(`ReadingGardenSkyEvents.tsx:293,309`). Counted, cat8 read `distinctHashes 1, diffShare 0` →
`languagesDiffer false` → **FAIL: a localisation defect filed against a debug panel no user
sees.** **CORRECTION 28**: both walkers exclude `[data-dev-only]` (cat4's correction 21, reaching
the other harness), the count is reported as `devOnlyRuns`, and `languagesDiffer` is UNMEASURED
when `wordRuns === 0` — a surface with no words cannot answer it. City now reads `textRuns 3,
devOnlyRuns 7, wordRuns 0`, **0 failed bars, UNMEASURED on statesNamed + languagesDiffer**.
Video re-run under the corrected harness: `devOnlyRuns 0`, unchanged, still 10/10. Both controls
fire and restore.

**Cells: 10 → 12 of 16** (cat5 both, cat8 Video). **cat8 cannot close on this PAIR.** Per RULE C
a failed category expands across remaining surfaces; an UNMEASURABLE cell is not a failure to
repair but a surface that cannot answer, so cat8 needs a THIRD surface substituted for City —
that alone, not the other seven. Next: cat7 on Video and City, then that substitution.

## 2026-08-31 — primary — category 7 · Video: PASS 10/10, and correction 29 (the titleless window)

**CORRECTION 29, applied before a number was taken.** City is `.fwin-frameless`: no
`.fwin-title-text`, no `.fwin-bar`. `-Title ''` matches EVERY window and the largest-area
tie-break then drives whichever is biggest — `probe-picks-first-visible-fwin` one level up,
and it would have scored the Settings window as City. `-Title` and
`cat7-collection-weight --title` now also accept **`@<css-selector>`** (the window that matches
or contains it), the same form cat4/cat8 already use as `--surface @.fwin-frameless`, and the
drag grip is `.fwin-bar, .fwin-drag-strip` so a frameless window has a real handle. A selector
matching nothing still REFUSES. Proven live: `@.fwin-frameless` scoped the collection walk to
the garden and returned its 120 nodes; the un-`@` form returns "no window titled".

**Two specs added, not two probes** (RULE 1). Video's heavy leg is NOT "open a video": the
section is a launcher — the stage renders workspace/connecting/needs-server copy
(`MediaCenterView.tsx:890-921`) and `playItem` calls main's `media:open` then dispatches
`os:open` to navigate away (`MediaContent.tsx:995-1001`), so it writes resume state AND leaves
the surface. The repeatable read-only load is the inspector disclosure `06708e7c` created,
cycled across the Up Next shelf's overflow, with both restored.

**cat7 · Video PASS 10/10.** Session ceiling p50 **16.6** / p95 17.1, `noiseFloorOver100 0`,
max 18.3 — the machine did not stall in this run, so over-100 counts are scored against 0.
Scene 3 windows / 1,115 elements, stable on all three gestures; the Video window is 316.
Process settled: `uptimeSec 33,483` (9.3 h).

| leg | p50 | p95 | max | >100 ms | main max |
| --- | --- | --- | --- | --- | --- |
| drag | 16.7 | 33.6 | 66.8 | 0 | 10.0 |
| resize | 16.7 | 17.1 | 66.9 | 0 | 13.1 |
| theme | 16.7 | 17.3 | 50.3 | 0 | 12.2 |
| theme CONTROL (root hidden) | 16.7 | 17.1 | 83.6 | 0 | 11.5 |

Heavy leg main max **23.0 ms** against the 500 ms bar, p50 1.9 / p95 3.6, `span_ms 3027` of a
declared 3000 — it covered its own load. Idle after: max 9.7. Proof, non-empty and
non-refusing: `cycled 40 disclosures (20 open / 20 closed) over 7 tiles and 637 px, restored`.
Memory: main RSS 54.0 → 73.2 MB, heap 312.3 MB. Collection: Up Next `rows 7 / domRows 7 /
nodes 79 / overdraw 1.0`, **FITS** — it is not a virtualiser candidate.

**CONTROL FIRED.** `--jank` produced **5 frames over 100 ms and a 133.3 ms max** against the
clean run's 0 and 66.8. The recorder is seeing real frames, so the zeros above are measured.

Cells **13 of 16** (cat1-cat6 both, cat8 Video, cat7 Video). Next: cat7 · City, then cat8's
third-surface substitution.

## 2026-08-31 — primary — category 7 · City: PASS 10/10. cat7 CLOSES on both RULE C surfaces.

**Correction 29 is proven by the gesture record, not asserted.** Both gesture legs report
`title: "@.fwin-frameless"` with `before`/`after` = `128px / 84px / 680x679` and
`closedLoop: true` — the probe gripped **City's own inline geometry** and put it back. That is
the discriminating fact: had the selector fallen through to the largest window it would have
been Video's geometry in the record. `.fwin-drag-strip` supplied the handle; a window with
neither grip still refuses.

**City's heavy leg is the honest one for a canvas surface.** Its load runs UNPROMPTED — 13
`<canvas>` layers, 48 stars and 22 dust motes paint whether or not anyone touches it. The only
user-driven work on top is the mushroom hitbox toggling the dossier
(`ReadingGarden.tsx:461-469`). The sky console's Star / Asteroid / Ice-barrage buttons were
**not** used: correction 28 established they are `import.meta.env.DEV`-gated `data-dev-only`
debug controls, so firing them would score the product against a panel no user has.

Ceiling p50 **16.6** / p95 17.1, `noiseFloorOver100 0`. Scene 3 windows / 1,115 elements,
stable on all three gestures; the City window is 131 elements. `uptimeSec 33,601` (9.3 h).

| leg | p50 | p95 | max | >100 ms | main max |
| --- | --- | --- | --- | --- | --- |
| drag | 16.7 | 33.1 | 66.8 | 0 | 9.8 |
| resize | 16.7 | 17.1 | 66.5 | 0 | 12.0 |
| theme | 16.6 | 17.3 | 50.4 | 0 | 10.9 |
| theme CONTROL (root hidden) | 16.6 | 17.2 | 50.3 | 0 | 12.3 |

Heavy leg main max **12.9 ms** against the 500 ms bar, `span_ms 3008` of a declared 3000.
Idle after: max 8.5. Proof: `toggled the dossier 20 times (10 open / 10 closed) over 13
animating canvases, restored`. Memory: main RSS 72.0 → 84.2 MB, heap 317.0 MB.
Collection: `nodes 120`, and its `INERT` verdict is an artifact of asking a canvas stack a
list question — the 1,122 px "spacer" is the parallax world layer. Recorded, not a defect.

**CONTROL FIRED.** `--jank`: **8 frames over 100 ms, max 116.8** against the clean run's 0 and
66.8.

**OBSERVATION for L11, not a finding here.** Both surfaces returned drag `p95 ≈ 33 ms` — two
frames at a 16.6 ms ceiling — against a bar of `p95 x 2 = 34.2`. Identical on a 316-element
window and a 131-element one, so it is the SHELL's drag cost, not either surface's, and it sits
one millisecond under the bar. L11's "drag/resize at target frame rate" bullet owns it.

**cat7 CLOSES on this pair. Cells 14 of 16.** Only cat8's third-surface substitution is left.

## 2026-08-31 — primary — cat8's third surface: the Command Palette. FAIL 0 of 1 state → PASS 10/10.

**RULE C substitution, and why this surface.** City is UNMEASURABLE for cat8 (correction 28:
`wordRuns 0`), and an unmeasurable cell is not a repairable failure, so cat8 alone expands to a
third surface. The **command palette** is the honest choice rather than a convenient one: it is
literally bullet 1's own third entry point ("taskbar/**context**/**command**"), it is the one a
keyboard user reaches without pointing at a window, and it is dense with localized text —
`textRuns 143`, all of them word runs, `devOnlyRuns 0`. Opened with
`window.dispatchEvent(new CustomEvent('palette:open', {detail:'commands'}))`; 40 rows, 388 nodes.

**FIRST RUN: FAIL, on `statesNamed 0 of 1 observable`.** Driven with `--drive-input
.palette-input`, the empty state rendered but carried NO message: `{hosts: 1, messages: []}`.
The cause is `palette.noMatches` = **"No matches."** — 11 characters, under correction 12's
weighted 12-char bar, and more to the point it names neither what was searched nor the way out.
Every other surface scored in L9 names its empty state.

**Product fix, not a harness change.** `palette.noMatchesFor` echoes the query so a typo is
visible and names Esc, because the backdrop click is the only other exit; `palette.noMatches`
becomes a real sentence for the no-query case. Four catalogs, `i18n-check` exit 0 at **11,793**
English keys complete in ja/zh/ru. Live before the re-score: `Nothing matches
“zzqqxxnosuchthing”. Try a shorter word, or press Esc to close.`

**RE-SCORE, in the fix's own commit: PASS 10/10.** `rawKeyCount 0` in all four languages
(catalog union 9,760 keys, `keyShapedNonCatalog 0`), `placeholderCount 0`, `mutePairCount 0`,
`statesNamed 1 of 1` (loading/error/offline correctly `notObservable`), langs **4 distinct
hashes** with `diffShare 0.804` and ja/zh/ru each differing on **115 of 143** runs; language
restored `en → en`, asserted. Drive leg `surfaceChanged true`, `restored true`.

**CONTROL FIRED**, same root: injected key + `Lorem ipsum` + unexplained disabled button moved
the counts `[0,0,0] → [1,1,1] → [0,0,0]` and `backToBaseline true`.

**TRAP, and it cost a run.** The HMR reload that delivered the catalog fix also **reset the
Settings window to Home**, so the next `--langs` leg refused on "no ui-language card on screen".
The surface the langs leg drives is not the surface being scored, and HMR resets it silently.
Re-navigate Settings > Appearance after any renderer edit, before any `--langs` run.

`sampled-out:` for cat8's expansion — Note, Visualizer, Music widget, notifications, onboarding,
Help, and the Aero/Wired/Blanc adapters. Not scored, named rather than truncated.

**Cell arithmetic, stated exactly rather than rounded up.** Of the 16 cells on the RULE C pair,
**15 are scored and all PASS 10/10** (cat1-cat7 on both surfaces, cat8 on Video). The 16th —
cat8 · City — is UNMEASURABLE, not failed, and is **replaced** by cat8 · Palette PASS 10/10.
So bullet 1 carries **16 scored cells, one of them on a substituted surface**, and closes.

What the sample does and does not cover, so nobody over-reads it: the two host windows carry
the title-bar button and the taskbar context item, and the palette IS the command entry point,
so all three of the bullet's entry points are represented — but only the command one was scored
as a surface in its own right.

## 2026-08-31 — primary — L9 bullet 1 CLOSED; gates; and bullet 4's ground truth, measured not assumed

**Bullet 1 tag flipped to `closed`** in the plan with its evidence. Re-derived the whole-plan
count with the plan's OWN prescribed method, `grep -c '^- .*status: closed;'` and siblings:
**25 closed / 21 open / 0 unknown, summing to 46.**

**COUNT CORRECTION, and the plan already warned about it.** The previous handoff's
"25 closed / 22 open of 47" is the unanchored-grep overcount described at
`LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md:443` — that line IS the counting instruction and
contains the literal `status: closed;`, so a pattern without the `^- ` anchor counts the
paragraph as a bullet. The true figure before this turn was **24 / 22**. The three counts must
sum to 46, and 47 is the tell.

Per phase (closed/open): L0 4/1 · L1 0/4 · L2 4/0 · L3 4/0 · L4 3/1 · L5 3/0 · L6 2/0 ·
L7 0/2 · L8 2/0 · **L9 3/1** · L10 0/4 · L11 0/4 · L12 0/4.

**Four gates, after the last slice.** `npx vitest run` **exit 0 — 946 files passed / 1 skipped,
12,232 tests passed / 6 skipped / 0 FAILED**. `node tools/i18n-check.cjs` exit 0 at **11,793**
English keys complete in ja/zh/ru. `node tools/architecture-audit.cjs` exit 0, 2,396 modules,
28 findings, **Nothing new**. ESLint on the touched paths: 0 errors.

**BULLET 4's ground truth, read off the live root rather than assumed** — so the next turn does
not spend its first half hour here. `documentElement.dataset` currently carries
`theme=forest-night`, `aeroSafeMode=off`, `appBorder=aero-glass`, and a full `wired*` block
(`wiredCrt=standard`, `wiredStatic=full`, `wiredAmbient=on`, `wiredFinding=off`,
`wiredMotion=full`, `wiredIdle=on`) — i.e. **the Wired settings exist while no Wired root is
mounted** (`[class*="wired-"]` is absent; `[class*="aero-"]` is present). The lifecycle state
lives in localStorage: `jp-aero-discovered`, `jp-wired-archive-boot-seen-v1`,
`jp-aero-restore-theme-v1`, `jp-blanc-mode-v1`, `jp-aero-environment-v1`.

Those five keys are the bullet's real subject and they are PERSISTED, so a lifecycle probe must
capture-patch-restore them and assert byte-identical (`-ceq`), never toggle and hope. Correction
29 already covers the naming half: both `cat7-perf.cjs` and `cat8-honest-states.cjs` accept
`@<selector>`, so a Secret shell with no `.fwin-title-text` needs no new probe.

**App state left exactly as found**: palette closed, Media Center on Video, City at
`128px/84px/680x679`, Settings on Appearance (the `ui-language` card is on screen — the `--langs`
leg refuses without it), theme forest-night, lang en.

## 2026-08-31 — primary — bullet 4: a real identity leak, found before a single cell was scored

**Defect, measured live, not read off source.** `terminalModeSettings.ts:137-146` stamps six
`data-wired-*` attributes on `<html>` on every boot under every theme, and `main.tsx` imports
every wired sheet unconditionally. **61 selectors** keyed on those attributes were therefore
live in forest-night, Aero and Blanc, and their subjects are shell-wide: `.fwin*`,
`.os-task-win`, `.os-taskbar`, `.ui-toast*`, `.flash-card*`, `.stats-*`, `.dict-results
article`, `.immersion-stage`, `.widget-frame`, `.os-clock`, `.media-player`, `.wgt-*`.

Instrument: forest-night, `data-materials` **absent**, no Wired root mounted, a real `.fwin`
with the product's own `fwin-anim-opening` class (`DesktopShell.tsx:3518`).
`data-wired-motion='off'` → `fwinIn`/0.14s became **`none`/0s**. `'reduced'` → 0.12s.
**Negative control** `'zzzcontrol'` → unchanged `fwinIn`/0.14s, so the instrument was reading
the rule, not the weather.

**Fix `59d3eb89`**: every gate scoped to `:root[data-materials='wired']` — the identity
attribute `engine.ts:121` already stamps at its single choke point. After: off + no materials →
`fwinIn`/0.14s (leak gone); off + `materials='wired'` → `none`/0s (**the feature still works** —
this is the control that separates a fix from a deletion); reduced + materials →
`wm-frame-power`/0.12s; materials removed again → `fwinIn`/0.14s. Root and app restored.

**`c473e217`**: Aero was already clean — every `[data-aero-*]` and `[data-app-border]` rule
carries `[data-materials='aero']`, which is exactly what made the wired set legible as an
oversight. Nothing protected that, so the guard is now data-driven over 3 identity prefixes ×
3 checks (corpus floor, scope present, scope on `:root`).

**`f62c614e` — the Blanc cold-open boundary, and it is NOT the attribute that saves it.**
Blanc keeps `data-theme`. Measured in Study OS with `data-materials` already absent — Blanc's
exact attribute state — `data-theme='wired-archive'` alone moved `--bg` #0c1410 → **#02070d**,
`--text` → #d8fbff, `--panel` → #06121a; `frutiger-aero` moved `--bg` → **#9ed8f2**. What
actually saves Blanc is that `blancMain.tsx` imports six sheets and **none** of them is
`styles.css` or a material pack, so the palette block does not exist in that document. One
import re-opens it silently; now guarded. `main.tsx`'s comment claiming its own Blanc block was
"the fallback entry that is actually loaded today" is **stale** — `main.ts:545` loads
`blanc.html?blanc=1`, and `blanc.html:14` + `blanc-harness.html:175` both point at
blancMain.tsx. Corrected in place, block kept as the only defence if a route returns.

**Three adverse controls, each restored byte-identical**: reverting `wired-motion.css:536`
failed exactly that assertion; `aero-safe-mode.css:3` failed the new Aero leg; adding
`import './theme/wired-shell.css'` to `blancMain.tsx` failed the Blanc leg (`637f8b1e`).
Guard: `renderer/__tests__/secretIdentityScope.test.ts`, **12 tests**.

**BULLET 4 STAYS OPEN.** Its RULE C receipt — 2 surfaces × 8 categories — is not started. What
this turn bought is that the leak the categories would have hunted is already gone, and the
`unknown` half of the bullet's ground truth is now measured rather than assumed.

## 2026-08-31 — primary — bullet 4's receipt opens: cat1 Wired 10/10, and a one-way door in the shell

**RULE C surfaces, and why these two.** The **Wired shell** (`@.os-desktop-wired`) is the densest
secret identity — root `os-desktop os-desktop-wired`, 22 wired nodes, the atmosphere wall, the
tray lamps, and every taskbar entry renamed (Start → `NODE ROUTER`, windows → `SIG-VID / Signal
Archive`, `SYS / Service Panel`, `CAP-50 / Mooncap Garden`). **Blanc** is the most different: its
own HTML entry, its own six sheets, and the cold-open boundary `f62c614e` already measured.
`sampled-out:` Aero shell, Lockscreen, Mini widget, City, notifications, onboarding, help.

**Instrument.** The theme is applied through `applyTheme`'s own three effects in its own order —
`data-theme` + `data-materials` from the registry entry (`wired-archive.ts`: `materialSet:'wired'`,
no `dataAttrs`), `jp-os-theme` persisted, `jp-theme-changed` dispatched — so the React branches
that render the identity actually re-render. Attribute-setting alone does not: the wired shell is
a React branch, not only a CSS gate.

**cat1 · Wired — FAIL → PASS 10/10 (`bc7816d6`), instrument repaired, not the art.** First run
VOIDed at −39 (83 of 116 controls occluded) because three `.fwin` sat over the desktop; minimised
through their own Minimize controls, which is the shell's own path. Then FAIL on contrast, one
element: `span.wired-wall-kana` at **1.46** — the wallpaper watermark at `DesktopShell.tsx:2591`,
inside an `aria-hidden` atmosphere layer. **Correction 30** adds the half of WCAG 1.4.3's
Incidental exemption this harness lacked: it applied "inactive user interface component" and not
"pure decoration". Exempt only when the nearest `aria-hidden="true"` host holds nothing focusable;
every exempted row is PRINTED with its ratio (`decorativeSkipped` 4, `decorativeWorst` names the
1.46). After: minRatio **7.67** (`span.os-clock-date`), failing **0**, targets/2.5.8/keyboard/
motion all clear. Control moved all six legs and returned to baseline — and the sharp half is that
`contrast` still went 0 → **2**: the injected plain span AND an `aria-hidden` wrapper around a
REAL focusable button were both caught, so the exemption is proven narrow in the same pass.

**cat2 opened a genuine product defect, and it is a one-way door.** cat2's first run VOIDed on
"the surface changes with no input"; it did **not** reproduce (`rawChurns:false` both phases) and
12 samples over 5 s with cat2's own `painted()` filter found no churn. One idle reading is noise —
do not chase it. Driving the shell's own dominant task then hit the real thing:
`switchDesktop(0)` fails forever with **`desktop-on-another-display`**, and `DesktopShell.tsx:2424`
answers with `console.error` alone, so the button silently does nothing.

Measured, not inferred: `Screen::AllScreens` reports **one** physical display (1920x1080 primary),
while `desktopGetLayout()` carries **six** assignment rows from earlier sessions — including
`display|1920x1080|1` holding desktop 0 `enabled:true`, and `dell-up3017|2560x1600|1` holding
desktop 3. No display answers the first key and no secondary window exists for it (`/health`: one
window). `isDesktopClaimedBySecondary` read the assignment RECORD; `syncDesktopWindows` only ever
builds windows for displays in `listDisplays()`. The two disagreed, and because the guard inspects
only the TARGET the disagreement was a trap door: leaving desktop 0 was allowed and returning
never was, stranding that desktop's windows, icons, notes and widgets with no route back. I hit it
live and could not undo it from the UI.

**Fix `<pending>`**: the guard now also asks `isDisplayAttached`, factored out of
`syncAssignments`'s own `isStaleKey` so "attached" means exactly what "absent" means everywhere
else (exact key → base key without `#n` → the primary alias). Before the display service has
reported once the cache is `null` and every key reads attached, keeping the older behaviour rather
than opening the guard during startup. An assignment still outlives its monitor, which is the
documented intent (`resolveDisplayKey`: "the user unplugged a monitor, they did not reset its
configuration"). **3 tests** added; the adverse control reverts the one clause and exactly the two
new presence tests go red (2 failed / 31 passed) while both pre-existing guard tests stay green —
so the fix cannot silently become a deletion of the guard.

**Fix landed and verified LIVE, `f5b664ff`.** Main does not hot-reload, so the app was restarted
(forge stalls at "Checking your system" without a TTY — launch it through `Start-Process cmd /c`,
not `nohup`, or you wait five minutes for nothing). After the restart the shell hydrated on
REMOTE FEED, `LOCAL NODE` went **ACTIVE on the first click**, and desktop 0's three windows came
back at exactly their found geometry — 1080x700 @60,24 · 960x680 @94,54 · frameless 680x679
@128,84. That is the same click that returned `desktop-on-another-display` forever beforehand.

**cat2 · Wired — FAIL on latency alone, and two instrument findings first.**
Bars: deadEnds **0** PASS · modalTraps **0** PASS · scrollTraps **0** PASS · costParity
`N/A-single-path` · **latency FAIL**. Control moved all three legs (base [0,0,0] → dirty [1,1,1] →
restored [0,0,0]) and the undo restored the surface, so the instrument is proven this session.

1. **The idle-churn VOID did not reproduce.** First run: "the surface changes with no input",
   `rawChannels:["text"]`. Second and third: `rawChurns:false` in both phases, and 12 samples over
   5 s using cat2's own `painted()` filter found zero text drift. One idle reading is noise.
2. **`key:Escape` read as a dead end and is not one.** `inputCost.keystrokes` was **0** and
   `latencyMs.inputRecv` **[]** — the keystroke never reached the renderer at all — and on the
   control's own restored pass the dead-end count fell to 0. Bridge key delivery to this window is
   flaky; a `key:` step in a task can therefore manufacture a dead end. The task was rebuilt from
   clicks only (Start is a toggle, so it closes itself) and dead ends went to 0.

**The real defect, reproduced twice: opening the Wired Start menu is not acknowledged inside the
rubric's 100 ms.** `clickRecv` **166.8** ms on the first run and **135.7** on the second, against
an inert-element floor of **14.6** ms measured in the same pass — so ~121 ms of genuine renderer
work, not bridge overhead. The other two clicks in the same task are fine: closing the menu 43.6,
the desktop switch 15.5. Diagnosis for the next turn, measured rather than guessed: the panel is
rendered inline in `DesktopShell.tsx:2714` behind `{startOpen && …}`, so the open is one
synchronous commit that adds **531** nodes (911 → 1442), of which the panel is **232** nodes
carrying **51** controls and **51 inline SVGs**. NOT repaired this turn — a perf refactor of a
shared shell component is not a slice to start in a turn's last minutes.

**RULE C standing: cat1 PASS 10/10, cat2 FAIL (banked, unrepaired). 14 of 16 cells not yet run.**

**Four gates, after the last slice.** `npx vitest run` **exit 0 — 947 files passed / 1 skipped,
12,247 tests passed / 6 skipped / 0 FAILED** (was 12,244; the +3 delta is exactly this turn's
three desktop-reachability tests). `node tools/i18n-check.cjs` exit 0 at **11,793** English keys
complete in ja/zh/ru — no new UI strings were added this turn, deliberately, because the four
catalogs are dirty with another track's work. `node tools/architecture-audit.cjs` exit 0, 2,397
modules, 28 findings, **Nothing new**. ESLint 0 errors on the touched TS.

**Boss audit 2026-08-31 11:35 MSK: all three findings CLOSED**, re-derived rather than trusted.
Findings 1 and 2 by `a6f61698`, finding 3 by `c7c0b711`; the architecture gate is exit 0 and every
orphan module the audit named resolves to a production consumer in a HEAD blob. Recorded here
because neither track's handoff mentioned it and the next worker would otherwise re-audit it.

## 2026-08-31 12:50 EDT — cat2 repaired and re-scored, and the instrument that was billing us twice

**`2632f656` — the Start menu built both shells and painted one.** `DesktopShell` mounted
`.os-start-legacy` AND `.os-start-aero-menu` on every open and let three stylesheets hide the
loser (`aero-shell.css:24` and `:1851`, `wired-shell.css:145`). One open built **531** nodes and
**106** inline SVGs to show at most half. Guarded on `secretStartMenu = material === 'aero' ||
material === 'wired'`, the same set the CSS names. Wired 911→**1209** nodes, open **135.7 →
118.1** ms; default material 854→**1088**, **131 → 86** ms median (every sample under the bar).
7 guard tests pair the JS condition with the CSS; adverse control (legacy guard made always-true)
turns exactly 2 of the 7 red.

**Attribution, so nobody re-derives it.** The cost is not paint: an override sheet killing
`backdrop-filter`, `box-shadow` and every animation/transition on the panel together moved the
median **103.7 → 98.8**. A MutationObserver split puts **99–110 ms before the first DOM mutation**
and **0.9–1.6 ms** from there to the frame. It is React render time at a flat ~0.3 ms/node, of
which the 55 `Icon` instances are **17.7** ms (102.3 with, 84.6 with `Icon` short-circuited).

**CORRECTION 31 — StrictMode was billing the product for a tax no user pays.** React StrictMode
double-invokes every render *in development only*; production strips the doubling. This harness
only ever drives a dev build. Same task, same open tree, same ~12 ms inert floor:

| | worstRecv | verdict |
|---|---|---|
| StrictMode **on** | **118.1** ms | FAIL (bar is 100) |
| StrictMode **off** | **52.3** ms | PASS |

Reproduced: a second strict-off run gave 54.4 (`cat2-l9b4-wired-after.json`, then the scored
`cat2-l9b4-wired.json`), and the strict-on run is banked unmodified as
`cat2-l9b4-wired-strictON-control.json` so the FAIL stays visible. Same class as correction 2
(billing the app for the main→renderer hop) and fixed the same way: score the number a user gets,
record the other beside it. `src/renderer/strictRoot.tsx` gives dev roots an explicit opt-out —
`localStorage['jp-lq-strict']='off'`, then reload — defaulting to ON, unconditional in production,
and printing a console warning on every boot it is honoured. Every cat2 artifact now stamps
`strictMode`. **TIMING ONLY: with StrictMode off, effects mount once, so categories 6 and 8 must
be measured with it ON.**

**cat2 · Wired = PASS 10/10.** deadEnds 0, modalTraps 0, scrollTraps 0, `overBar100` 0
(54.4/30.4/8.8), undo restores, and the negative control moved all three legs
[0,0,0] → [1,1,1] → [0,0,0] with a 1.1 ms inert click.

**RULE C standing: 2 of 16 cells closed — cat1 PASS, cat2 PASS, both on Wired. 14 to run
(cat3–cat8 on Wired, all 8 on Blanc).**

## 2026-08-31 — backup — cat3 Wired 10/10, and the taskbar was never contextual chrome

**cat3 · Wired = PASS 10/10** (`67594273`, corrected by `32c099bf`). denseWorkOnTranslucent
**0**, treated **1/1**, shared primitive **1/1**. Plant control base `[0,1,1,1,0]` → planted
`[1,1,1,2,1]` → restored `[0,1,1,1,0]`, both bars falsified while planted, cleaned true.
Banked `cat3-l9b4-wired.json`.

**The product defect, and it was in the one element every shell renders.** `.os-taskbar` is a
bare `<div>` — no landmark, no role, no shared Liquid primitive. On Wired that is a 1264x56 bar
with **12 focusables** classifying as a plain `Anchor`, so `eligibleTotal` was **0**: the
shell's primary transport chrome sat outside category 3's denominator entirely and was
invisible to landmark navigation. §2.3 names transport as what Liquid is FOR. Fixed once, in
`DesktopShell.tsx`: `role="navigation"` + `aria-label` + `data-lq-role="liquid"` (the contract
`LiquidAppScaffold` already marks its rail and dock with), plus a blur-backed material in
`liquid-tokens.css` driven entirely by `--lq-*`. `styles.css:14654`'s old note — "translucent
mix showed the dark wallpaper through" — is *why* it is blur-backed and not an alpha mix; every
degradation tier already zeroes `--lq-liquid-blur` and makes `--lq-liquid-bg` opaque, so the
fallback is the old solid chrome. Reused `settings.monitors.taskbar` rather than adding a key:
all four catalogs are foreign-dirty and one word does not justify the blob recipe.

**A false credit, withdrawn (`32c099bf`).** `wired-shell.css:90` ends its background stack in a
flat `#020b12`, same specificity (0,2,1), loading later — so it won, and the Wired bar computed
`rgb(2,11,18)` **alpha 1 while declaring `blur(6px)`**. cat3 scored that as treated anyway,
because `liquidTreatedEligible` counts `translucentBacking || ownBackdrop`. A PASS on a material
nobody can see. Only the backstop now yields, to the token Wired itself remaps; the cyan wash
and 18px scan grid are untouched. After: `color(srgb .0235 .0706 .102 / 0.72)` + `blur(6px)`.

**cat1 · Wired re-scored on the changed tree: still PASS 10/10** — 13 text nodes, minRatio
**7.65** (was 7.67 opaque; the translucent bar costs 0.02 against a 4.5 bar), 0 failing,
smallest target 34px, control back to baseline.

**THREE instrument corrections, all one bug: containment mistaken for ownership.** A shell root
CONTAINS floating windows, so every `root.querySelector` for window-owned furniture found a
nested window's. **32** — `readPresentation` matched two nested toggles ('SIG-VID / Signal
Archive', 'SYS / Service Panel') and REFUSED; category 3 could not be scored on ANY shell
surface, and its `--presentation liquid` escape would have clicked a foreign window's toggle.
**33** — `l1-surface-roles.js` walked from a nested 0x0 minimised `.fwin-body` and returned
`regions: 0` on a 1264x821 desktop. **33b** — cat3's own path resolver and plant host, same
line: the plant mounted 145px nodes into that 0x0 body, `planted` came back identical to `base`,
and the run scored VOID while the product bars were passing. All three now require the nearest
presentable host to BE the root. **This unblocks cat3 on Blanc and Aero too.**

**RULE C standing: 3 of 16 cells closed — cat1, cat2, cat3, all Wired. 13 to run (cat4–cat8 on
Wired, all 8 on Blanc).** `sampled-out:` Aero shell, Lockscreen, Mini widget, City,
notifications, onboarding, help.

## 2026-08-31 — primary — cat4 Wired 10/10, and cat5's instrument repaired

**RECOVERY FIRST.** `backup` died ten seconds after writing its handoff, part-way through the
one full `vitest` run its turn owed. That run finished here: **2 failed of 12,280**, both in
`renderer/__tests__/liquidTokens.test.ts`, both caused by `67594273`. L2's gate makes
`liquid-tokens.css` structurally incapable of painting — every selector `:root`, every
declaration a `--lq-*` property — and the taskbar rule put a real `.os-taskbar[...]` block in
it. Rule kept verbatim, moved to `components/shell/shell.css` beside the rest of the taskbar's
styling (`176debcf`). Selector unchanged, so cascade is unchanged; verified on the running app
rather than assumed: `background color(srgb .0235 .0706 .102 / 0.72)`, `backdrop-filter
blur(6px) saturate(1)`, `role=navigation`, 1264x56 — byte-identical to the reading `32c099bf`
banked. 11/11 green. `wired-shell.css`'s note pointed at the old file and now names the real
one; its specificity claim was wrong too (Wired wins **0,3,0 vs 0,2,0**, not by loading later
at an equal 0,2,1 — which is *why* compositing over `--lq-liquid-bg` was the necessary fix and
a reorder would not have been).

**cat4 · Wired = PASS 10/10** (`1b937fc9`). default 1264x821 / compact 924x561 / maximized
1600x1000; clipped 0, overlaps 0, horizontalScrollers 0, hiddenOverflowX 0, restored 3/3. It
first FAILED on `overlaps` and `deadRegion`; both were the instrument.

- **22 — ownership, cat4's three sites.** `win.querySelector('.fwin-body')` on a shell root
  returned a **0x0** body owned by 'SIG-VID / Signal Archive'. Silent, not refusing: the reader
  took correction 17's content viewport from a foreign window and both controls planted inside
  a minimised window, where nothing strands and the run VOIDs while the product passes.
- **23 — a decorative backdrop is not a collision.** `div.wired-wall-atmosphere` is the whole
  desktop (1264x821 at 0,0, absolute, `pointer-events: none`, 0 controls) and failed
  `purePaint` on **19 characters of ornamental kana**. A full-surface layer intersects every
  element's box, so any surface with one failed regardless of layout. Test is the app's own
  declaration: `aria-hidden=true` + inert + painted BEHIND (z auto vs **200000**;
  `elementFromPoint` at the bar's centre returns its own button). All 12 excused rows are named
  in the artifact and every one is the wall or its kana behind taskbar chrome.
  Control — inert, aria-hidden, control-free, but `z-index 999999` i.e. IN FRONT — must NOT be
  excused: overlaps **0 → 3 → 0**. It carries text so correction 20 cannot excuse it first.
- **24 — a desktop's free workspace is not dead space.** 59.5 / 54.0 / 63.4 pct against
  `chromePct 0`, with all three hosted `.fwin` minimised to 0x0, so the room they would take
  was empty by definition. `NOT-APPLICABLE`, kept distinct from `UNMEASURED` (whose rule is
  "measure it or score 0, never 10"); the percentages travel at every size.

**cat5 · Wired — instrument repaired, CELL NOT CLOSED** (`14fad326`). Same ownership bug at its
two sites. Its Q3 control was being falsified by the harness's own furniture: the Q10 dashboard
plant creates six `cat5ctl-kind-N` controls and appends them AFTER the pin, so the planted read
resolved `primaryAction` to `input.cat5ctl-kind-1` — inside the viewport by construction — and
Q3 stayed YES though the plant had correctly moved `button.os-start-btn`. Third repair to this
one term; the first two both reasoned about nodes existing at pin time. Q3 now skips
`[data-cat5-plant]` descendants, scoped to Q3 because Q4's clutter plants are *meant* to count.
After: **CONTROL FAILED AS REQUIRED on Q2, Q3, Q4, Q5, Q10** (was VOID on Q3), residue 0.

Two measured blockers, neither settled by widening an exclusion:
1. **Q7/Q8/Q9 VOID — no `cat6-l9b4-wired*.json`.** They are MEASURE terms driven by
   `cat6-feature-parity.cjs`. **For a shell, cat6 must run BEFORE cat5**, not the plan's
   cat5 → cat6 reading.
2. At rest: Q1 NO / Q2 NO / Q3 NO / Q4 NO / Q5 NO / Q10 NO, with Q3 `primaryAction` **null** —
   no explicitly-primary control, no accent button, no primary input. Product or instrument is
   the next question; correction 24's precedent does not transfer to it.

**RULE C: 4 of 16 cells — cat1, cat2, cat3, cat4, all Wired. 12 to run.** `sampled-out:` Aero
shell, Lockscreen, Mini widget, City, notifications, onboarding, help.

## 2026-08-31 — primary — cat6 Wired 10/10 (a fifth host), and the taskbar's close ink

**RECOVERY FIRST, and it was a no-op.** The relay flagged `primary2` as ending mid-turn at
12:22:26 with 0 chars. Nothing was stranded: `primary2` wrote its own handoff at **12:50**,
*after* that failure, and `jp-wt-filesapp` is **0 dirty paths** on `wt/files-app` at `b02e35dc`.
Boss audit `audit-20260831-043527` is likewise settled — findings 1/2/3 repaired by
`a6f61698`/`c47feb3f`/`7795f921`/`c7c0b711`, with 9 architecture orphans left open *honestly*
because their consumers sit inside another track's uncommitted rewrites.

**cat6 · Wired = PASS 10/10** (`f9d19517`). Category 6 knew 22 apps and no shells, so the cell
was unreachable. Added host **`shell`**, with the axis decided rather than assumed:

- **The axis is NOT the theme.** A shell renders no `.fwin-b-liquid`, and driving
  wired-archive → Study OS → back would mutate a persisted global through a transition for a
  reading the rubric never asked for. Category 6's own 10-requirement names the answer — the
  trip must preserve "**taskbar identity**", which is a shell property. So the axis is a HOSTED
  window's flip, and the claim is that making a window Liquid does not break the shell.
- **The proxy must be VISIBLE.** All three hosted windows sat at 0x0; a minimised window still
  carries its toggle at `display: none`, so an unguarded find flips a window nobody can see.
- **The shell CONTAINS its windows**, so rows and snapshot are scoped outside `.fwin` (`shq`).
  Unscoped, the round trip diffs on the flipped window's contents and blames the desktop.

Numbers: **9/9 rows in BOTH presentations**, `rowsAgree` true, `onlyInOne` empty; round trip
liquid→standard→liquid with **0 diffs**, `fieldsHeld`/`shellHeld` true, 1264x821 either side.
Control: **all 8 mutations fell exactly their own row**, 9/9→8/9, every one restored to 9/9.

Two instrument defects the first run caught, fixed not banked. **25 — trap 1, three rows at
once:** steps clicked and counted in ONE synchronous `/eval`, so `openStart` read `opened=0`
while the menu opened, `closeStart` saw that 1 and read `after=1`, and `taskbarRaise` read rank
3 of 3 on a window it had just correctly raised — a working shell scored **6/9**. Act and read
are now separate driver POSTs. **26 — the `shellIdentity` control proved nothing:** it detached
one of the two elements the row reads, `owned > 0` held, no row fell.

**Cleared by reading, not repair:** cat6, cat7-collection-weight and cat8 carry **no**
`root.querySelector('.fwin-body')` site at all, and cat7-perf's one use is fully qualified. The
correction-22 class that cost cat3/cat4/cat5 a repair each does **not** recur in the rest.

**cat5 · Wired — one real product fix, cell still VOID** (`cb204f3f`). Q5 measured
`span.os-task-close` at **3.47:1** (bar 4.5). A specificity accident: Wired brightens the active
button's ink to `#e9feff`, but `styles.css:14784` gives the close a flat `var(--muted)` at 0,2,0
which outranks inheritance — so the control that DESTROYS a window was the dimmest thing on it.
Fixed by `color: inherit` (`:not(:hover)`, or the shared red destructive hover, also 0,3,0, would
be decided by source order). Live: close ink now *equals* label ink, rest `rgb(109,241,255)` and
active `rgb(233,254,255)`. **wired-archive failingCount 2 → 1**, os-task-close gone.

cat5 is **7 of 10** and NOT closed. Q7/Q8/Q9 flipped VOID → YES on `f9d19517`'s baseline, and
Q1/Q2/Q3 now read YES. Three open, none of them the above:
1. **Q4 = 47 controls scanned against a bar of 12** — and the scanned list is the hosted Media
   Center's nav rail, menubar and search. A shell must be scored on the chrome it AUTHORS: those
   windows are separately-scored surfaces, so this charges them twice and makes the shell's
   number a function of which windows happen to be open. Same principle as cat6 decision 3;
   needs `shq`-style scoping plus a control proving it can still fail.
2. **Q5's alt-theme leg is measuring a combination the product never renders.** `classic-light`
   reports 79 failures, every one hosted-window content — but `.os-desktop-wired` exists ONLY
   while a wired theme is applied. A shell's alt must come from its own identity family.
3. **Q6 NO-SUBJECT**, refusing with "surface reads null" — the shell root has no
   `data-presentation`. cat6's shell proxy is the shape that resolves it.
Q5's last wired failure, `span.` "Home" at 1.75 on `button.os-set-nav-item`, is inside the hosted
Settings window — real, but a different surface's cell.

**RULE C: 5 of 16 cells — cat1, cat2, cat3, cat4, cat6, all Wired. 11 to run.** `sampled-out:`
Aero shell, Lockscreen, Mini widget, City, notifications, onboarding, help.

## 2026-08-31 — primary — cat5 scores a shell: VOID → 7/10, plus two product fixes

Three named terms from the previous receipt, all closed. Harness: `0e855e0d`.

1. **Shell scope (`rq`).** Detected structurally — not a `.fwin` and contains one — so it is
   the IDENTITY on every banked surface. Proved live rather than argued: 51/51, 53/53, 8/8 on
   the three open windows, 127 → 15 on the desktop. Applied to the snapshot, the Q2 plant, the
   card-host scan (four open windows would read as a uniform card grid) and the Q6 toggle.
2. **The Q6 toggle was MUTATING A NEIGHBOUR** — the real defect under "surface reads null".
   `r.querySelector('.fwin-b-liquid')` on a shell root returns the first HOSTED window's
   control, so the 17:09 run flipped SIG-VID, read `data-presentation` off the shell (which has
   none), refused, and — restore guarded on `!refused` — left it flipped. Every click is undone
   now, refusing ones included. The shell's own axis: **one presentation**, chrome material
   unconditional, so Q6 is measured where the shell is found with the basis in the output.
   Cat6's hosted-window flip answers a different requirement (taskbar identity); no conflict.
3. **`--alt-attr name=value`.** `wired-archive` is the ONLY `materialSet: 'wired'` theme, so
   the classic-light cell measured a combination the product never renders. The shell's shipped
   stability axis is its own ladder: `data-display-transparency` full → off. Default empty →
   every banked baseline re-derives unchanged. Restored and read back, absence included.

Two host-taxonomy repairs of the 2026-08-26 family: a shell **is not chromeless** (it owns the
taskbar, desktop layer and floating-window chrome the chromed set names, and scored 1 of 4
against the replacement set), and a shell **has no heading**, so Q2 reads which of its own
places is current from the app's own `aria-current`/`-pressed`/`-selected`. The bar is NOT
lowered: the shell uses the byte-identical chromed set the 18 `.fwin` surfaces use.

**Q5's VOID guard gained a second witness** — a djb2 digest over every measured fg/bg pair.
`minRatio` alone is the population's worst single ratio, so a tier that repaints everything and
leaves the worst one alone read as a swap that did nothing. Strictly more sensitive; both
reported (`axisWitness`).

**Two product fixes, both found by the scoped read.**
- `a2e9c1ce` — the shell's launcher and flyouts never said they were popups. All nine taskbar
  controls read `aria-haspopup=null`/`aria-expanded=null`; six open a menu or flyout and the two
  desktop switches carried "which desktop am I on" only in a CSS class. `aria-haspopup` on all
  six, `aria-expanded` only on Start and Widgets (the other four dispatch a CustomEvent and
  their panels own the state; a stale `false` over an open panel is worse than nothing).
  Collapsed disclosures **0 → 2**.
- `34291a6c` — `div.os-taskbar` is the shell's ONLY Liquid-treated region and its
  `transition-duration` read **0s**, so every degradation tier (high contrast, battery, Aero
  safe mode) snapped it from glass to solid in one frame. Transition on exactly the three
  properties that rule sets. Live 0s → 0.14s; control: `html.reduce-motion` collapses it to
  1e-06s and removing it restores 0.14s byte-identical.

**cat5 · Wired = 7/10, no VOIDs.** Q2/Q5/Q6/Q7/Q8/Q9/Q10 YES. Q5: 14 runs measured, **0
failing in both tiers**, minRatio 7.46 (the 79-failure phantom was hosted-window content).
Q6 is thin and says so: `liquidRegions: 1`. Control: **FAILED AS REQUIRED on Q2, Q3, Q4, Q5,
Q10** — Q2 only after the plant was taught the shell branch, or it attacked a term the question
is not scored on. Restore: residue 0, theme and `data-display-transparency` byte-identical.

**Three open, all product, none instrument:**
1. **Q4 — 13 scanned against a bar of 12.** Start + 2 desktop switches + 3 window buttons + 1
   close + 6 tray buttons. The product answer is a tray overflow (the Windows "show hidden
   icons" affordance): it obscures nothing, adds a disclosure and is the shell's own idiom.
   Blast radius is all four shells' taskbar, so it is a slice, not a tail-of-turn edit.
2. **Q1 — entryPoints 0** against a bar of 1..3. Two causes and only the first is instrument:
   `topThird` encodes "reading order starts at the top" and a shell's chrome band is at the
   BOTTOM by OS convention. Fixing the zone alone does NOT fix it — `os-start-btn` is neither
   `declaredPrimary` nor "the only filled button among its siblings" (its siblings in
   `.os-taskbar` are DIVs, so `sibs.length > 0` is false). Declaring it primary with an
   attribute that changes nothing a user sees would be marking for the test; **not done**.
3. **Q3 — primaryAction null**, the same question one step on: what IS a desktop shell's
   primary action. Answer it once, for Q1 and Q3 together.

**RULE C: still 5 of 16 cells PASSING — cat1, cat2, cat3, cat4, cat6, all Wired.** A cell
closes at 10/10, so cat5 at 7/10 is SCORED but not closed; 11 to run counting it. Said this
way deliberately: the previous line in this file read "6 of 16" for a moment and that would
have credited a 7 as a pass. `sampled-out:` Aero shell, Lockscreen, Mini widget, City,
notifications, onboarding, help.

## 2026-08-31 — codexA — interrupted tray-overflow slice recovered; Q4 closes

**Recovery was product work, not a re-derivation.** HEAD `5b0cb42d` had no staged paths; the
13:46–13:49 edits were `DesktopShell`, shell CSS, popup semantics, four catalog lines and the
new overflow test. They match the preceding receipt's exact Q4 slice and are checkpointed as
`234f0b44`; no foreign dirty hunk entered the commit.

The shared `.os-tray` now shows Search, hidden-icons, Quick Settings and Notifications. Widgets,
Clipboard history and Settings move behind the labeled hidden-icons dialog; every command remains
present with its original popup/window semantics. Live Wired shell: top-level tray buttons **7→4**,
dialog labels **3/3**, role `dialog`, initial focus on the panel, Escape closed it and returned
focus to the chevron. Focused source regressions: **26/26**; ESLint **0 errors**.

**cat5 · Wired remains 7/10, but Q4 NO→YES.** Default scanned controls **13→10** against the
bar of 12, collapsed disclosures stayed 2. Both transparency cells measured **13** readable
runs, **0** failures; minimum contrast 7.46/7.48. Category-6 evidence stayed 9/9 in each mode
with 0 round-trip diffs. Control: Q2/Q3/Q4/Q5/Q10 all failed as required, residue 0, theme,
presentation and `data-display-transparency=full` restored byte-identically.

Open product question is unchanged and deliberately not papered over: Q1/Q2/Q3 need one shell
navigation decision (dominant task, current location/recovery, primary action). **RULE C remains
5 of 16 passing cells.** `sampled-out:` Aero shell, Lockscreen, Mini widget, City, notifications,
onboarding, help.

## 2026-08-31 — codexA — cat5 Wired passes 10/10; the shell has a route home

**Decision, implemented in `25f484af`.** A desktop shell's authored entry band is its taskbar,
not an app page's top third. Start is the one declared primary entry; the selected desktop switch
states the current location; a visible Show desktop button is the route home. This uses existing
shell commands and the Windows taskbar idiom rather than inventing another navigation system.

Show desktop captures only windows it changes and restores their exact optional `min` values.
Live state began SIG-VID open / SYS open / CAP-50 already minimized; first click made all three
minimized and flipped label/pressed state to Restore all; second click restored the three DOM
class records **byte-identically**, including CAP-50 still minimized. Pure state tests **3/3**;
focused shell/source regressions **27/27**.

**cat5 · Wired = PASS 10/10.** Q1 has **1** entry point (`os-start-btn`); Q2 has one current
location (`LOCAL NODE`) and **1** route home; Q3's explicit primary is visible; Q4 has **11**
scanned controls and 2 collapsed disclosures. Q5 remains 0 failures in both tiers (minimum
7.46/7.48); cat6 evidence remains 9/9 each mode and 0 round-trip diffs. Control failed Q2,
Q3, Q4, Q5 and Q10 as required; residue 0 and the shell/theme/transparency state restored.

**RULE C: 6 of 16 passing cells** — cat1 through cat6, all Wired. Next is cat7 then cat8 on
Wired, followed by all eight on Blanc. `sampled-out:` Aero shell, Lockscreen, Mini widget, City,
notifications, onboarding, help.

## 2026-08-31 — codexA — cat7 Wired passes 10/10 under the real Start load

The shared category-7 runner gained the `shell` spec; no single-use probe was added. Structural
root `.os-desktop-wired` drives the OS-window branch. The heavy leg mounts/unmounts Start 24
times — the largest reversible synchronous shell mount — and proves count, node delta and exact
expanded-state restoration. Run used `--jank`, so the frame recorder was falsified in-session.

**cat7 · Wired = PASS 10/10.** Scene: **2** floating windows / **634** window elements / **836**
shell elements at 1264×821; main PID 804 uptime 3,881 s. Session ceiling p50/p95 16.7/16.8 ms,
0 frames over 100. Drag p50/p95 16.7/16.9, resize 16.7/16.9, theme 16.7/16.8; all scenes stable,
all closed loops true, all main maxima **≤58.3 ms** against the 500 ms bar.

Heavy Start cycle: **24** ticks (12 open / 12 closed), **298** nodes mounted, state restored;
main p50/p95/max **2.6/5.2/13.2 ms**. Sensitivity control injected twelve 120 ms renderer
blocks and recorded **12** frames over 100 ms (clean drag 0). No findings, no voids.

Category 8 did not close: opening Notifications marks unread history read. The original
notification bytes and unread IDs 66–72 were restored; renderer reload verified badge 7.
The byte-captured all-read fixture then raced Settings hydration twice and refused before any
language change. Final state verified: Wired, Home, en/en, badge 7, center closed.

**RULE C: 7 of 16 passing cells** — cat1 through cat7, all Wired. Exact next: rerun cat8 with
hydration polling before opening Appearance, the captured-store fixture, and byte verification;
then all eight categories on Blanc. `sampled-out:` Aero shell, Lockscreen, Mini widget, City,
notifications, onboarding, help.

## 2026-08-31 — codexA — cat8 Wired passes 10/10; hosted-app leakage removed

The shared category-8 runner had the same containment defect already repaired in categories
3–6: `.os-desktop-wired` contains every `.fwin`, so the first read charged two Media empty states
and Settings controls to the shell. Correction 29 scopes the shell to authored descendants;
the banked run excludes **371 hosted text runs / 3 windows** and reports the count.

Control proves both directions: a key, placeholder, mute control and error host planted inside a
hosted window changed **0** shell metrics (`hostedIsolation: true`); the same three honesty defects
planted on shell chrome moved **0/0/0 → 1/1/1 → 0/0/0**. No single-use probe was added.

One real product finding was fixed. Wired's visible red error lamp encoded an unread-error state
only by color and its entire group was `aria-hidden`. It now exposes localized polite status text
for both active and quiet states; source regressions are **26/26**, i18n is **11,815 keys**.

**cat8 · Wired = PASS 10/10.** At 1264×821: 14 authored text runs, 0 raw keys, 0 placeholders,
0 mute pairs, and the one observable error state named. Four languages produced 4 hashes,
maximum **3/14 = 21.43%** changed runs, 0 raw keys; en/en restored exactly. Notification storage
was never opened or mutated, so badge 7 and unread IDs 66–72 remained intact.

**RULE C: 8 of 16 passing cells** — all eight Wired cells. Next is all eight categories on Blanc.
`sampled-out:` Aero shell, Lockscreen, Mini widget, City, notifications, onboarding, help.

## 2026-08-31 — codexA — cat1 Blanc passes after three native-shell repairs

The first live run was **FAIL**: the 14px clock used `--blanc-faint` at **3.17:1**, four Focus
Music buttons rendered 30.5px hit boxes, and two checkbox labels rendered 21.5px high. The shared
bar is 4.5:1 and 32px; these were product defects, not identity exceptions.

Repairs live in `blanc-shell-a11y.css`, after the token-only adapter. A first draft put component
rules in `blanc-liquid.css`; its 2/12 test failures correctly rejected that because the adapter's
contract is vocabulary-only. The invariant was kept and the rules moved, not baselined.

**cat1 · Blanc = PASS 10/10.** At 1264×761: 118 text runs, minimum contrast **5.27:1**,
25/25 controls keyboard reachable, smallest effective target **32.5px**, 0 WCAG 2.5.8 failures,
and 29 motion owners collapsed to 0 under reduced motion then restored. The control moved all six
sensitivity terms and restored the surface (`[0,2,0,0,0] → [2,5,2,1,3]`). Focused guards **13/13**.

**RULE C: 9 of 16 passing cells** — all eight Wired cells plus cat1 Blanc. Next: cat2 Blanc.
`sampled-out:` Aero shell, Lockscreen, Mini widget, City, notifications, onboarding, help.

## 2026-08-31 — codexB — cat2 Blanc passes after responsive Settings navigation

The interrupted artifact was a real product finding: Settings navigation acknowledged at **191.7
ms**, then reproduced warm at **462.4 ms** while the injected inert control took 2.5 ms. The shell's
largest synchronous panel mount, not the bridge, crossed the 100 ms bar.

Taskbar Settings now paints the pressed control before mounting that panel on the next frame; a
different taskbar choice cancels the pending frame. Programmatic deep links retain synchronous
`chooseTab`, preserving their next-frame focus/scroll contract. Focused guards: **14/14**.

**cat2 · Blanc = PASS 10/10.** Settings cost 1 click, acknowledgment **0.3 ms**, dead ends 0,
modal traps 0, scroll traps 0, and Stats restored the exact surface hash. Control moved all three
defects **0/0/0 → 1/1/1 → 0/0/0**; inert acknowledgment 3.0 ms.

**RULE C: 10 of 16 passing cells** — all eight Wired plus cat1–cat2 Blanc. Next: cat3 Blanc.

## 2026-08-31 — codexB — cat3 Blanc passes with selective shared materials

The first run found **3/3 untreated contextual regions**: taskbar, nested nav and top bar. Applying
the shared primitive exposed the selective-material guard: Focus Music and the form cluster became
**2 dense regions on contextual material**, so that attempt VOIDed rather than flattering the shell.

Final composition keeps taskbar/top bar on Blanc's glassless `lq-liquid` mapping and their dense
children on opaque anchor islands. The token adapter remains vocabulary-only; a separate shell
layer preserves square edge-to-edge OS geometry. Focused guards: **12/12**.

**cat3 · Blanc = PASS 10/10.** Dense work on contextual material **0/5**; treated contextual
regions **3/3**; shared primitives **3/3**. Control moved one violation **0→1→0**, then the
all-glass arm moved **all 5** Work regions and restored them.

**RULE C: 11 of 16 passing cells** — all eight Wired plus cat1–cat3 Blanc. Next: cat4 Blanc.

## 2026-08-31 — codexB — cat4 Blanc passes at the OS minimum through maximized

First run: default/compact/max dead regions **18.7/13.5/21.4%**, plus **12** clipped compact
nav/icon elements. A first equal-row grid fixed neither packing nor the 190.5px compact top bar;
it was rejected rather than recorded.

Final layout uses balanced Stats columns, a 48px horizontal icon rail at short+narrow sizes, and a
keyboard-accessible Context tools disclosure. Desktop retains inline context controls; compact
users can open/close the same controls in a bounded overlay. Short-window content/fieldset padding
uses Blanc's 4px step. Focused guards: **27/27**.

**cat4 · Blanc = PASS 10/10.** Default/compact/max dead regions **8.1/14.0/13.1%**;
clips **0/0/0**, overlaps **0/0/0**, horizontal scrollers **0/0/0**; all sizes and bounds restore.
Controls: injected clip 0→1→0; art plate counted only as art; foreground plant made 10 overlaps
and restored 0.

**RULE C: 12 of 16 passing cells** — all eight Wired plus cat1–cat4 Blanc. Next: cat5 Blanc.

## 2026-08-31 — primary — cat6 Blanc 10/10 on a sixth host, and the axis a shell owns itself

**RECOVERY FIRST.** `codexA` ended at 20:15:30 on a usage limit; **nothing was stranded**. Its five
commits `090d4549`..`6b488974` all landed (19:58–20:10), the index is empty, and no file under
`src`/`docs`/`tools`/`debug` has an mtime after 20:10. Boss audit `audit-20260831-043527` is now
CLOSED: finding 2 (`aero-safe-mode.css`) and finding 3 (four Scraper anchors) both pass at clean
HEAD, and finding 1 went **15 unclassified identities → 3 → 0** (`23ecd75c`). The last three —
`StudyBottomBar`, `StudyDocks`, `StudyWorkspaceCustomizer`, all from `9fa37b59` — are classified
**pending, per file**, not accepted: their only consumer is `VideoCoreStudyOverlay.tsx`, which is
mid-rewrite and uncommitted in the shared tree (936 insertions / 662 deletions) beside untracked
`src/media/studyWorkspace.css`. Wiring them would have meant committing another track's work.
Control: a fresh unimported module still exits 1, so the gate was not widened.

**THE HANDOFF'S ORDER WAS WRONG, and this doc already said so at line 1636: for a shell cat6 runs
BEFORE cat5.** `cat5-ui-clarity.cjs` reads Q7/Q8/Q9 from `baselines/cat6-<label>.json` and VOIDs
without it, so "run cat5 on Blanc, then cat6–cat8" would have produced a VOID and a wasted arm.

**Host `shell` cannot score Blanc.** All eight of its rows name a `.os-*` class and its axis flips
a hosted `.fwin`; Blanc renders **0** `.fwin` and lives in its own BrowserWindow. Added
**`blancShell`** (`shellSel: '.blanc-root'`) rather than widening `shell` with nine `||` fallbacks
— a row that falls back cannot say which shell it scored.

**The axis is `taskbarHidden`, and two plausible candidates were rejected on evidence.** NOT
`workspaceFull`: its effect calls `window.api.blancSetFullScreen()` (`BlancShell.tsx:310`), so the
trip would drive the real OS window — the same objection that ruled out the theme axis for Wired,
through a different door. NOT dark mode: a palette swap leaves every capability in place, so
parity would be equal by construction and the cell would pass without being asked. Chrome
reduction removes nine routes and the exit from the screen while leaving `.blanc-content` alone,
so the question is real and `.blanc-taskbar-reveal` is the answer under test. New engine seam:
`presAxis` (read + flip), checked before the `.fwin`-proxy branch in `toggleLiquid` and in
`snapshot`'s presentation; the flip presses the user's control, never a class write.

**cat6 · Blanc = PASS 10/10** (`5d82ece6`). Parity **8/8 standard, 8/8 liquid**, `rowsAgree` true,
`onlyInOne` empty, `na` 0. Round trip standard→liquid→standard: **0 diffs**, `fieldsHeld` and
`shellHeld` true, 1264x761 either side. All **15** drive steps ran with **0 refusals**. Control:
**8 of 8 mutations fell exactly their own row**, 8/8→7/8 each, every one restored to 8/8. Live
state restored to as-found: taskbar visible, Stats route, 9 nav buttons, 2 identity regions,
0 detached residue.

**Disclosed weaker term, not banked silently:** `dirtiedField` is **null** — Blanc's shell chrome
has no editable text field outside `.blanc-content`, so the trip carried field values, scroll
offsets, geometry and node/char/control counts but no dirtied text. The harness reports this
itself. If a later worker wants the stronger reading, dirty the `.blanc-lang` select.

**RULE C: 13 of 16 passing cells** — all eight Wired plus Blanc cat1–cat4 and cat6. Next: **cat5
Blanc**, which is now unblocked and will read Q7/Q8/Q9 from `cat6-l9b4-blanc.json`; then cat7, cat8.

## 2026-08-31 — primary — cat5 Blanc measured: 7 of 10, VOID, and the three terms named

Run with the cat6 baseline in place. **Q7/Q8/Q9 flipped VOID → YES** off `cat6-l9b4-blanc.json`
exactly as the harness's "NO CATEGORY-6 BASELINE, NO SCORE" refusal intends — that refusal, not
the plan's cat5→cat6 reading, is why cat6 had to run first. Q1 Q2 Q3 Q10 also YES.

**cat5 · Blanc = VOID, 7 of 10.** Recorded as VOID rather than 7/10-and-moving-on because the
rubric caps an uncontrolled or no-subject cell at VOID. `cat5-l9b4-blanc.json` is committed as the
honest baseline. The three open terms, each with the analysis the next turn would otherwise redo:

1. **Q4 NO — `scannedControls` 23 against a bar of 12, `shellChromeSelector` null.** The 23
   include the Stats tool's own controls: `.blanc-content` hosts the 42 separately-scored Blanc
   tools, so charging the shell for them makes Blanc's number a function of which tool is open —
   the same defect the Wired cell hit at 47 controls, and the same principle as cat6 decision 3.
   The lever already exists: `--shell-chrome "<selectors>"` (cat5 line 141). **The exclusion goes
   on `.blanc-content`, NOT on `.blanc-taskbar, .blanc-top`** — those two ARE the chrome Blanc
   authors and excluding them would be the escape hatch that option's own header forbids. Needs a
   control proving Q4 can still fail once scoped.
2. **Q5 NO plus `theme left as null, wanted null` VOID.** 118 runs measured in one cell and the
   alt cell never applied: `--alt` defaults to `classic-light`, which is a Study OS theme, and
   Blanc's alt is its OWN identity family — `settings.darkMode` renders `.is-dark` on
   `.blanc-root` (`BlancShell.tsx:433`). The harness drives its alt cell by setting an ATTRIBUTE
   on `documentElement` (`ALT_ATTR`), so a class on the Blanc root is out of its reach as written.
   Either give the alt axis a root+class form, or have Blanc mirror dark mode onto an attribute.
   Same shape as the Wired Q5 finding ("a shell's alt must come from its own identity family").
3. **Q6 NO-SUBJECT — `refused: surface has no Liquid presentation control`.** cat5 detects the
   toggle itself and does not know about the `presAxis` seam this turn added to `l6-parity.js`.
   Blanc now demonstrably HAS a presentation trip (cat6 drove it, 0 diffs), so this is an
   instrument gap, not a product gap. Teach cat5's q6 leg to ask `__LQP` for the axis.

**RULE C: still 13 of 16.** Next turn OPENS on term 1, then 2, then 3, re-running cat5 after each.

## 2026-08-31 — primary — CORRECTION: boss-audit finding 1 cannot be closed by classification

The entry two sections above claimed finding 1 went **15 → 3 → 0** via `23ecd75c`. **That is
retracted.** `23ecd75c` is reverted by `8d59b9de`, and the honest count is **3 open at clean HEAD,
0 in the shared tree** — a difference that no baseline edit can remove.

Why, and it is worth two lines because the next worker will otherwise repeat it:
`architectureBaseline.test.ts` has **two** assertions, not one. `:49` fails on a finding with no
baseline entry; **`:55` fails on a baseline entry with no finding**, and `pending` is not exempt
(`tools/architecture-audit.cjs:481`). `StudyBottomBar` / `StudyDocks` / `StudyWorkspaceCustomizer`
are orphans at clean HEAD and NOT orphans in the shared tree, because the dirty uncommitted
`VideoCoreStudyOverlay.tsx` imports them. So the entries make clean HEAD exit 0 and the shared tree
exit 1 — the gate is symmetric and cannot be satisfied in both states at once. Measured, not
reasoned: full shared Vitest with the entries in place was **1 failed / 12,316 passed / 6 skipped**,
the single failure being `:55` on exactly those three keys; after the revert that file is 6/6.

**The right close is the media track committing its overlay rewrite**, at which point the three get
a real consumer at HEAD too and the finding evaporates with no baseline entry ever written. Until
then this is honest open debt attributable to `9fa37b59`, and a red SHARED suite for every worker
is strictly worse than a red clean-HEAD gate for CI. Boss-audit findings **2 and 3 are genuinely
closed** and were verified this turn at clean HEAD (`liquidTokens` and `settingsSearchReachability`
both pass, 22/23 tests in that trio, the one failure being the above).
