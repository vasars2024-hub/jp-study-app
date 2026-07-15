# Component Library (`components/ui/*`)

A self-contained, token/material-driven, accessible primitive layer. Import from
the barrel:

```tsx
import { Button, GlassCard, Dialog, Tabs, showToast } from '../components/ui';
```

Styles load globally (`ui.css` in `main.tsx`). Every primitive reads tokens, so
all follow the active theme (including Aero glass) with zero per-component colour.
Existing feature components are **not** force-migrated; use these for new work.

## Buttons
- **`Button`** — `variant` `default|primary|danger|ghost`, `size` `sm|md|lg`,
  `block`, `leftIcon`/`rightIcon`, all native button props. forwardRef.
- **`IconButton`** — icon-only; **`label` required** (becomes aria-label + title).

## Surfaces
- **`Card`** — opaque; safe over any wallpaper.
- **`GlassCard`** — translucent Aero glass (backdrop blur).
- **`Panel`** — inset grouping surface.

## Form controls (all keyboard + focus-ring accessible)
- **`Input`** — optional `label`/`hint` render a `<Field>` wrapper (auto-linked id).
- **`Select`** — `options?: {value,label,disabled}[]` or children.
- **`Checkbox`** — custom box over a native input; optional `label`.
- **`Toggle`** — switch (`role="switch"`); optional `label`.
- **`Slider`** — styled native range.
- **`SearchBox`** — input with a leading search glyph (`role="searchbox"`).

## Layout / navigation
- **`Toolbar`** + `ToolbarSpacer` / `ToolbarSeparator`.
- **`Tabs`** — `tabs`, `value`, `onChange`; roving arrow-key tablist
  (`ArrowLeft/Right/Home/End`), `aria-selected`.
- **`Sidebar`** — `items`, `value`, `onSelect`, `header`/`footer`; `aria-current`.
- **`Breadcrumb`** — `items: {id,label,onClick}[]`; last = `aria-current="page"`.
- **`TreeView`** — `nodes` (recursive), `defaultExpanded`, `onSelect`; roles +
  `Enter/Space` toggle + `ArrowLeft/Right` collapse/expand.

## Overlay / feedback
- **`Dialog`** — `open`, `onClose`, `title`, `footer`, `dismissable`. `role="dialog"`
  `aria-modal`, Escape to close, focus trap, restores focus on close.
- **`Sheet`** — edge-anchored slide-over; `side` `right|left|bottom`.
- **`ContextMenu`** — controlled `open`/`x`/`y`/`items`/`onClose`; zoom-corrected
  position + viewport clamp, click-outside/Escape/arrow-key nav.
- **`Dropdown`** — button + menu (reuses ContextMenu); `aria-haspopup`.
- **`Tooltip`** — CSS-driven (hover/focus-within), `side` `top|bottom|left|right`.
  Zoom-safe: no coordinate math.
- **`Progress`** — `value` 0–1, or omit for indeterminate; `role="progressbar"`.
- **`Notification`** — persistent inline notice; `kind`, `icon`, `actions`, `onClose`.
- **`Toast`** — imperative: mount `<ToastViewport/>` once, call `showToast('…')`
  or `showToast({ title, message, kind, duration })` from anywhere.

## Utilities
- **`appZoomFactor()`** — the app's accessibility-zoom factor. Any fixed/absolute
  UI positioned from pointer coordinates inside the zoomed `#root` must divide
  client coords by this (the recurring "fixed-position under CSS zoom" gotcha).
  `Window`, `ContextMenu` already do.

## Conventions
- Every interactive primitive carries `.ui-focusable` (or its own
  `:focus-visible` ring). Disabled controls drop pointer events + dim to
  `--alpha-disabled`.
- `Window` follows the drag invariant: geometry is written to the element's style
  during a gesture and committed to React state **once** on pointerup — never
  `setState` per `pointermove`.
