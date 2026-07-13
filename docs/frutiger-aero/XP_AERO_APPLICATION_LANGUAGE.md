# XP–Aero Application Language (Phase 4 · M1)

The shared design grammar that makes Secret OS applications read as native
mid-2000s desktop software — XP ergonomics, Vista materials, Frutiger Aero
atmosphere. Everything here is Aero-scoped: the default Study OS keeps its
Fluent minimalism untouched.

## Where it lives

- **`theme/aero-apps.css`** — the grammar. Density metrics, materials, states.
  Every selector is scoped `:root[data-materials='aero']`; nothing leaks into
  other themes. Loaded after `ui.css` in `main.tsx` so overrides win.
- **`components/ui/`** — five Phase 4 primitives beside the Phase 1 library:
  `MenuBar`, `StatusBar`, `SplitPane`, `FormRow`, `AppChrome`. Their base
  styles (theme-neutral, token-driven) live in `ui.css`; their XP–Aero look
  comes from `aero-apps.css`.

## The theme seam: AppChrome

`AppChrome` is the **only** sanctioned structural theme branch. It wraps an
app's content with a menu bar above and a status bar below **only while
`data-materials='aero'` is active**; in every other theme it returns its
children with no wrapper element, so the default app DOM is byte-identical.

```tsx
import { AppChrome, StatusBarField, StatusBarSpacer } from '../components/ui';

<AppChrome
  menus={[{ id: 'file', label: 'File', items: [...] }, ...]}
  status={<><StatusBarField>128 cards</StatusBarField><StatusBarSpacer />
          <StatusBarField live>32 due</StatusBarField></>}
>
  {/* the app, unchanged */}
</AppChrome>
```

Rules:
- Applications never check the theme or display mode themselves.
- Gating reads the `data-materials` attribute + the engine's theme broadcast
  (`useAeroMaterials()`), so it works without `<ThemeProvider>` and in every
  host — FloatingWindow, pop-out, focus shell.
- Menu items reuse the `MenuItem` shape from `ContextMenu` (single level; no
  nested submenus yet — propose only when a real app needs one).

## Density metrics (tokens, not magic numbers)

Declared on the Aero gate; the grammar consumes them, apps never hardcode:

| Token | Value | Used by |
|---|---|---|
| `--app-menubar-h` | 26px | MenuBar |
| `--app-toolbar-h` | 34px | Toolbar |
| `--app-statusbar-h` | 24px | StatusBar |
| `--app-row-h` | 26px | tree rows, sidebar items, list rows |
| `--app-tree-indent` | 14px | TreeView levels |
| `--app-selection` | aqua gradient | selected rows/tabs/open menus |
| `--app-chrome-sheen` | top gloss | menu/tool/status bars, tab strips |

Compact, never cramped: interactive rows stay ≥ 24px tall, focus rings and
disabled states come from the Phase 1 token contract, and `a11y.css` (reduced
motion, high contrast, large text) applies unchanged.

## Materials

- **Glass belongs to chrome** — menu bars, toolbars, status bars, dialog heads,
  window frames (Phase 2). Restrained gloss via `--app-chrome-sheen`.
- **Work surfaces stay solid** — `.ui-app-chrome__body` and dialog bodies sit
  on `var(--panel)`; never put blur or transparency behind documents, text, or
  data grids.
- **Light XP bevel** — buttons carry a 1px top highlight + bottom shade;
  pressed state is a shallow inset, not a transform.

## Corners

Smaller as elements get denser: windows/shells keep their Phase 2 moderate
rounding; buttons/inputs use `--radius-sm`; menu items, tree rows, toolbar
chips and status fields use `--radius-xs`; tab tops `--radius-sm`. Nothing
pill-shaped except pre-existing toggles/progress.

## States

- Selection: `--app-selection` gradient + inset highlight, on
  `[aria-selected='true']` (tree) and `[aria-current='true']` (sidebar).
- Focus: the shared `:focus-visible` ring from tokens/a11y — never removed.
- Pressed: inset shadow (buttons), `--btn--open` accent (menu bar).
- Disabled: `--alpha-disabled` opacity, pointer-events none (Phase 1 contract).

## Keyboard model

- **MenuBar** — WAI-ARIA menubar: Left/Right roam top-level items (roving
  tabindex), Down/Enter/Space open, Up/Down cycle, Left/Right slide between
  open menus, Escape closes and restores focus. A bare Alt press focuses the
  bar, but only when focus is already inside the same app scope
  (`[data-app-chrome]`, `.fwin`, `.popout-root`) — multiple windows never
  fight over the key.
- **SplitPane** — divider is `role="separator"` with `aria-value*`; arrows
  resize (Shift = coarse), Home/End snap to min/max, Enter/double-click
  resets. Pointer math is rect-ratio based so it stays accurate under app zoom
  and the 4:3 viewport scale; moves are rAF-throttled per the repo's drag
  convention. Optional `storageKey` persists the size.

## Adoption order

Shared grammar (M1) → dialog/menu standardization (M2) → shell convergence
(M3) → startup/audio (M4) → applications (M5 Settings, M6 Flashcards, M7 EPUB,
M8 CSV, M9 Calendar, M10 notes, M11 triage). See
`PHASE_4_IMPLEMENTATION_PLAN.md` for gates and commit boundaries.
