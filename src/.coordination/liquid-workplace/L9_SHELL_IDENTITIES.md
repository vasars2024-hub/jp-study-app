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
