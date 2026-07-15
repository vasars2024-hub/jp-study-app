# Phase 4.75 Corrective Plan

## M1 - Shell Utilities

- Scope: `CommandPalette`, `ClipboardHistoryPanel`, `QuickSettings`, `NotificationCenter`, and Aero shell CSS.
- Goal: Replace Fluent overlay grammar with compact Aero utility-window grammar while keeping shortcut/events/storage logic untouched.
- Status: Complete.

## M2 - Widget Surfaces

- Scope: `WidgetGallery`, `WidgetFrame`, widget shared CSS.
- Goal: Make widgets feel like desktop accessories and control-panel applets, not modern cards.
- Status: Complete.

## M3 - Secondary Applications

- Scope: `ResourcesView`, `StatisticsView`, `TranslateView`, `NovelsView`, and scoped Aero app CSS.
- Goal: Recompose remaining smaller views so they no longer read as default Study OS pages with different colors.
- Status: Complete.

## M4 - Verification

- Scope: lint/build where practical, plus targeted visual review notes.
- Goal: Confirm this corrective pass is complete enough to unlock Phase 5.
- Status: Complete.

## M5 - Fringe Surfaces

- Scope: shared Aero dialogs, toast/status overlays, context menus, pop-out chrome, and the Noctis placeholder.
- Goal: Remove remaining modern Fluent card/flyout grammar from surfaces that appear between main apps.
- Status: Complete.

## M6 - Embedded Utility Subpanels

- Scope: profile/dictionary settings, shortcut editor, reader settings/bookmarks, wallpaper playlist editor, media library utility actions, deck action menu, and note CSS editor.
- Goal: Remove lingering modern card/pill/flyout grammar from secondary panels inside already reconstructed Aero apps.
- Status: Complete.

## M7 - Music Application Reconstruction

- Scope: `MusicView` and scoped Aero music CSS.
- Goal: Rebuild Music as a native Aero media-library and lyric-deck utility instead of the default Study OS two-pane music page.
- Status: Complete.

## M8 - Contextual Overlay Corrections

- Scope: dictionary and translation popups, Library import/file menus, Calendar event modal, Novels and Settings modals, CSV editor modals/context menus, Manga OCR panel, and Focus music picker.
- Goal: Remove remaining modern rounded-card overlay grammar from app-specific popups and modal utilities that bypass `AppChrome`.
- Status: Complete.

## Verification

- `npx eslint src/renderer/views/ResourcesView.tsx src/renderer/views/StatisticsView.tsx src/renderer/views/TranslateView.tsx src/renderer/views/NovelsView.tsx src/renderer/components/shell/QuickSettings.tsx src/renderer/components/shell/NotificationCenter.tsx`
- `npm test`
- `npx vite build --config vite.renderer.config.ts`
- `git diff --check -- src/PHASE_4_75_CORRECTIVE_VISUAL_AUDIT.md src/PHASE_4_75_CORRECTIVE_PLAN.md src/renderer/components/shell/QuickSettings.tsx src/renderer/components/shell/NotificationCenter.tsx src/renderer/views/ResourcesView.tsx src/renderer/views/StatisticsView.tsx src/renderer/views/TranslateView.tsx src/renderer/views/NovelsView.tsx src/renderer/theme/aero-shell.css src/renderer/theme/aero-apps.css`
- M5: `npx eslint src/renderer/components/AppSection.tsx`
- M5: `npm test`
- M5: `npx vite build --config vite.renderer.config.ts`
- M5: `git diff --check -- src/PHASE_4_75_CORRECTIVE_VISUAL_AUDIT.md src/PHASE_4_75_CORRECTIVE_PLAN.md src/renderer/components/AppSection.tsx src/renderer/theme/aero-apps.css src/renderer/theme/aero-shell.css`
- M6: `git diff --check -- src/PHASE_4_75_CORRECTIVE_VISUAL_AUDIT.md src/PHASE_4_75_CORRECTIVE_PLAN.md src/renderer/theme/aero-apps.css`
- M6: `npm test`
- M6: `npx vite build --config vite.renderer.config.ts`
- M7: `npx eslint src/renderer/views/MusicView.tsx`
- M7: `git diff --check -- src/PHASE_4_75_CORRECTIVE_VISUAL_AUDIT.md src/PHASE_4_75_CORRECTIVE_PLAN.md src/renderer/views/MusicView.tsx src/renderer/theme/aero-apps.css`
- M7: `npm test`
- M7: `npx vite build --config vite.renderer.config.ts`
- M8: `git diff --check -- src/PHASE_4_75_CORRECTIVE_VISUAL_AUDIT.md src/PHASE_4_75_CORRECTIVE_PLAN.md src/renderer/theme/aero-apps.css`
- M8: `npm test`
- M8: `npx vite build --config vite.renderer.config.ts`
