# Desktop Widget Framework

Sources: `src/renderer/widgets/registry.tsx`, `widgets/types.ts`,
`components/WidgetFrame.tsx`, `components/WidgetGallery.tsx`. **This framework
already existed** and is fully extensible; Phase 2 verified it and gave frames Aero
glass — no rewrite.

## Model

- **`WidgetDef`** (`widgets/types.ts`): `{ type, title, category, description,
  defaultSize, minSize, component }`. Categories in `WIDGET_CATEGORIES`.
- **Registry** (`widgets/registry.tsx`): `WIDGETS: WidgetDef[]` (~24 widgets across
  Productivity / Study / Statistics / Music / Utility / System), `getWidgetDef(type)`.
- **`WidgetFrame`**: the chrome — free-drag (8px grid snap) + resize (clamped to
  `minSize`), both following the same style-during-gesture / commit-once-on-pointerup
  invariant as windows; an options menu (lock, collapse, blur, opacity, duplicate,
  hide, remove); renders `def.component` with `{ settings, setSettings, size }`.
  Unknown types render a removable stub (forward-compatible).
- **`WidgetGallery`**: pick widgets to add.
- **Persistence**: `WidgetSnapshot` (type/x/y/w/h/z/locked/collapsed/hidden/settings)
  is part of the persisted `DesktopLayout`.

## Consumes the design system

Widget chrome reads tokens (`--panel`, `--border`, `--radius-*`, `--shadow-*`); the
`.widget-frame.blur` option already used glass. Under Aero (`aero-shell.css`), all
`.widget-frame`s become glass with a sheened bar; Battery Saver drops the blur.

## Adding a widget

Write a component `({ settings, setSettings, size }) => …` and append one `WidgetDef`
to `WIDGETS`. It appears in the gallery, persists its per-instance `settings`, moves /
resizes / snaps, and follows the theme automatically. Future Clock/Calendar/Study-
stats/Sticky-note/Weather/Flashcards/Perf/Companion/Noctis widgets are just more
`WidgetDef`s.
