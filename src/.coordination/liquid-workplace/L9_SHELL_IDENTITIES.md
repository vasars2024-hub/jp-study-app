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
