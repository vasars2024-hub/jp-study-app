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
