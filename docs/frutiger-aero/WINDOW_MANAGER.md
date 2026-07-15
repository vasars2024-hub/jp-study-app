# Window Manager

Source: the inline `FloatingWindow` in `src/renderer/components/DesktopShell.tsx`.
**Reused as-is from the existing shell** — Phase 2 added Aero glass + motion only,
never touching the drag/resize logic.

## Capabilities (existing)

- Open (dedup per section — reopening focuses), close (with undo-reopen via
  `actionHistory`), minimize, maximize/restore (stores `restoreRect`), focus.
- Drag (title bar), resize (right / bottom / corner), edge-snap (top → maximize,
  left/right → half), z-order (`z = ++zTop` on focus; the max-z window is marked
  focused). Multiple windows; per-section default sizes + cascade offset.
- Two virtual desktops; layout persisted (see below).

## The drag/resize invariant (do not break)

During a drag or resize gesture, geometry is written **directly to the element's
style** (`transform: translate3d`, or `width/height`) via `requestAnimationFrame`,
and committed to React state **exactly once on `pointerup`**. Never `setState` per
`pointermove` — that re-renders every mounted window and re-serialises the layout
each frame. Pointer deltas are divided by the app zoom factor (`zoomFactor()`).

## Aero styling (Phase 2 · M1/M2)

Under `data-materials='aero'`, `theme/aero-shell.css` gives windows frosted glass
(`.fwin`), a sheened titlebar (`.fwin-bar`), a near-opaque legible body, and a
gentle **opacity-only** open/restore animation (`aero-fade` — never `transform`, so
it can't fight the drag). All collapse under reduced motion / Battery Saver
(perf.css adds `.fwin` to the battery backdrop-filter kill).

## Persistence

`WindowSnapshot` (id/section/x/y/w/h/z/visible/maximized/restoreRect) is part of the
`DesktopLayout` persisted by `src/main/desktop.ts` to `userData/desktop-layout.json`.
The renderer commits via `desktopState.commitLayout`; the main process persists +
broadcasts `desktop:changed`; the shell suppresses its own echo via a signature
ring buffer. Unchanged in Phase 2.

## Extensibility

New windows should use the Phase 1 `ui/Window` primitive (same drag invariant,
glass chrome). The shell's `FloatingWindow` stays the desktop's window host.
Future snapping/tiling/virtual-desktop work builds on the existing `WindowSnapshot`
+ commit round-trip.
