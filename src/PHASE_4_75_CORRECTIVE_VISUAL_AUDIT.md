# Phase 4.75 Corrective Visual Audit

This pass is a gate between Phase 4.5 and Phase 5. Phase 5 must not begin until these shared shell and secondary-surface issues are corrected.

## Evidence

- The current full desktop screenshot shows improved main app structure, but the command-like utilities, widgets, and small panels still read as modern translucent cards rather than native mid-2000s desktop software.
- The flashcards, grammar, settings, media, and immersion work from Phase 4.5 moved major applications toward independent Aero compositions.
- The remaining risk is consistency: if the smaller surfaces keep Fluent-style flyouts, pill chips, card dashboards, and rounded overlay modals, the illusion still collapses at the shell edges.

## Findings

- **Shared shell flyouts:** Quick Settings and Notification Center still use large Windows 11-style rounded glass panels, generous padding, modern toggle rows, and card-like action tiles.
- **Global utilities:** Command Palette and Clipboard History still read as command-center overlays, with search-first layouts, large radii, card rows, and Fluent modal proportions.
- **Widget system:** Widget Gallery and widget frames keep card-grid marketplace language rather than a compact desktop accessory browser.
- **Secondary apps:** Resources, Statistics, Translate, and Novels still expose the old Study OS composition through `view-head`, pill filters, search bars, card grids, and dashboard cards.
- **Aero integrity risk:** These surfaces share logic with the default Study OS, but in Aero they must not remain recognizable after removing color, material, and icons.

## Corrective Milestones

1. **M1 Shell Utilities:** Complete. Command Palette, Clipboard History, Quick Settings, and Notification Center now use denser Aero utility-window/flyout grammar with tighter frames, native rows, and status-strip cues.
2. **M2 Widget Surfaces:** Complete. Widget Gallery now reads as a compact desktop accessory manager, and widget frames/menus use smaller Aero desktop-tool chrome.
3. **M3 Secondary Applications:** Complete. Resources, Statistics, Translate, and Novels now have Aero-only native catalogue/monitor/workbench compositions instead of default Study OS card pages.
4. **M4 Verification:** Complete. Focused lint, unit tests, renderer build, and diff whitespace checks passed.
5. **M5 Fringe Surfaces:** Complete. Shared dialogs, context menus, UI/global toasts, pop-out chrome, and the Noctis placeholder now use compact Aero utility/application grammar instead of modern card/flyout grammar.
6. **M6 Embedded Utility Subpanels:** Complete. Shared study settings, shortcut rebinding, reader popovers, playlist rules, media maintenance actions, deck actions, and note CSS editing now use Aero property-sheet and utility-menu grammar.
7. **M7 Music Application Reconstruction:** Complete. Music now has native menu/status chrome and an Aero-specific media-library plus lyric-deck composition instead of the default two-pane Study OS page.
8. **M8 Contextual Overlay Corrections:** Complete. App-specific popups and modal utilities that bypass `AppChrome` now use compact Aero utility/dialog grammar.

## Rule

Phase 5 may begin after this corrective pass. Any remaining Phase 5 work must treat these shared utility and secondary-app branches as the new Aero baseline.
