# Aero Vita 4:3 Viewport Architecture

## Scope

The fixed 4:3 viewport is active only while the secret Frutiger Aero / Aero Vita mode is active. The gate is the existing `data-materials="aero"` attribute on `<html>`. Default Study OS, focus mode, pop-outs, mini mode, and reader takeovers keep their existing full-window layout.

## Viewport Design

The root desktop render path now wraps the existing `DesktopShell` with `AeroViewport` in `renderer/App.tsx`.

In normal modes this wrapper is a pass-through full-window layer. In Aero mode, CSS turns its frame into a fixed 1280 x 960 virtual display, centered inside the application window. `DesktopShell` is not duplicated or reimplemented; it still owns wallpaper, windows, taskbar, widgets, environment layers, menus, and notifications.

## Scaling Algorithm

`AeroViewport` measures its stage with `ResizeObserver` and computes:

```text
scale = min(stageWidth / 1280, stageHeight / 960)
```

The frame keeps `width: 1280px` and `height: 960px`; only `transform: scale(...)` changes. This preserves a single desktop coordinate space while allowing the complete 4:3 world to fit on any monitor shape.

## Coordinate Mapping

Desktop-local coordinates remain measured from the top-left of the virtual display.

Existing icon and drop helpers already convert pointer coordinates through `getBoundingClientRect()`, so they naturally account for the scaled frame.

Floating windows and Home Workspace widgets now use `desktopPointerScale()`, which compares the rendered desktop rect to `clientWidth/clientHeight`. Pointer deltas are divided by that effective scale, so dragging and resizing remain accurate when Aero mode scales the 1280 x 960 desktop up or down.

The desktop context menu keeps the existing global behavior outside Aero. In Aero mode, right-clicks on the desktop background are converted into virtual desktop coordinates and clamped before opening the menu, so the menu stays inside the 4:3 frame.

## Presentation Layer

The area outside the virtual display is not empty. In Aero mode, `.os-viewport-ambience` paints a lightweight atmospheric layer using theme tokens, glass highlights, a soft vignette, and subtle reflection bands. It is decorative, pointer-inert, and does not duplicate wallpaper or environment simulations.

Wallpaper media, particles, weather, lighting, companions, windows, taskbar, Start, notifications, and widgets continue rendering inside the single `DesktopShell` instance.

## Integration Points

- `renderer/App.tsx`: owns the wrapper and scale measurement.
- `renderer/styles.css`: turns the wrapper into the centered fixed 4:3 frame only under `data-materials="aero"`.
- `renderer/components/DesktopShell.tsx`: keeps desktop-local pointer mapping correct for windows and desktop context menus.
- `renderer/components/WidgetFrame.tsx`: keeps widget drag/resize math correct under viewport scaling.

## Future Extensions

- Expose the virtual desktop dimensions as shared constants if another renderer path needs to know them.
- Allow the presentation layer to sample a low-cost wallpaper color token if the wallpaper engine later publishes one.
- Add a dedicated local clamp for transformed context menus if more desktop-local menus are introduced.
