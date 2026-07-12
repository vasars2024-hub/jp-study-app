# Start Menu

Source: the `.os-start` block in `DesktopShell.tsx`.

## Contents

- **Title / hint** — "Study OS" + contextual hint.
- **Search field** (`.os-start-search`) *(Phase 2)* — opens the global palette
  (`palette:open` `'search'`); shows the `Ctrl P` shortcut.
- **App grid** — draggable app tiles (drag onto the desktop to place; HTML5 DnD
  payload `text/x-study-os-app`), each with a pin toggle. Specials: Widgets,
  Sticky note, Add app… (desktop 0).
- **Footer** (`.os-start-footer`) *(Phase 2)* — Settings, Quick settings, and a
  Power/Restart button (confirm → `location.reload()`).

## Aero styling (Phase 2 · M1/M4)

Under `data-materials='aero'`: the panel is a floating glass sheet with a top sheen;
tiles are glass with a lift on hover; and it **opens with an animation**
(`aero-scale-in` from bottom-left). Reduced motion / Battery Saver collapse it.
Default shell unchanged.

## Design stance

A Study OS interpretation of the Vista/7/Media Center Start experience — glass, soft
lighting, app-launcher-first — not a clone. Search is surfaced prominently (the
field) but delegates to the one universal palette (see SEARCH_SYSTEM.md) rather than
a second search implementation.

## Extensibility

Tiles come from the `APPS` catalog; add an app there. Footer shortcuts are plain
buttons dispatching existing events (`os:open`, `shell:toggleQuickSettings`). Future
profile / achievements / Noctis entries slot into the footer or a new Start section.
