/**
 * Frutiger Aero Platform — Design Tokens (typed contract) · Phase 1 · M1
 * -----------------------------------------------------------------------------
 * The CSS values live in `./tokens.css` (loaded before styles.css). This module
 * is the TYPED mirror for TS/TSX code and the single documentation source of
 * truth that `THEME_TOKEN_REFERENCE.md` (M11) is generated from.
 *
 * Usage in TSX (inline styles / dynamic values):
 *
 *   import { cssVar, duration, easing, zIndex } from '../theme/tokens';
 *   <div style={{ transition: `opacity ${duration.normal} ${easing.standard}` }} />
 *   <div style={{ zIndex: Number.parseInt(...) }} />  // or use the raw token
 *
 * Prefer referencing tokens by their CSS var in stylesheets; use these helpers
 * only where a value must be computed or set inline.
 */

/** A single token, mirrored from tokens.css for docs + typed access. */
export interface TokenDef {
  /** CSS custom-property name, incl. leading `--`. */
  readonly name: string;
  /** The value declared in tokens.css (kept in sync manually — small surface). */
  readonly value: string;
  /** What it's for / when to reach for it. */
  readonly description: string;
}

/** A tier of related tokens. */
export interface TokenGroup {
  readonly tier: string;
  readonly description: string;
  readonly tokens: readonly TokenDef[];
}

/** Wrap a token name as a CSS `var()` reference, with an optional fallback. */
export function cssVar(name: string, fallback?: string): string {
  const n = name.startsWith('--') ? name : `--${name}`;
  return fallback === undefined ? `var(${n})` : `var(${n}, ${fallback})`;
}

/* ------------------------------------------------------------------ *
 * Convenience typed accessors (return ready-to-use `var(--…)` strings)
 * ------------------------------------------------------------------ */

export const fontSize = {
  '2xs': cssVar('--font-size-2xs'),
  xs: cssVar('--font-size-xs'),
  sm: cssVar('--font-size-sm'),
  md: cssVar('--font-size-md'),
  lg: cssVar('--font-size-lg'),
  xl: cssVar('--font-size-xl'),
  '2xl': cssVar('--font-size-2xl'),
  '3xl': cssVar('--font-size-3xl'),
  '4xl': cssVar('--font-size-4xl'),
  hero: cssVar('--font-size-hero'),
  display: cssVar('--font-size-display'),
} as const;

export const duration = {
  instant: cssVar('--dur-instant'),
  fast: cssVar('--dur-fast'),
  normal: cssVar('--dur-normal'),
  slow: cssVar('--dur-slow'),
  xslow: cssVar('--dur-xslow'),
} as const;

export const easing = {
  standard: cssVar('--ease-standard'),
  emphasized: cssVar('--ease-emphasized'),
  decelerate: cssVar('--ease-decelerate'),
  accelerate: cssVar('--ease-accelerate'),
  spring: cssVar('--ease-spring'),
  glass: cssVar('--ease-glass'),
} as const;

export const blur = {
  sm: cssVar('--blur-sm'),
  md: cssVar('--blur-md'),
  lg: cssVar('--blur-lg'),
  xl: cssVar('--blur-xl'),
  max: cssVar('--blur-max'),
} as const;

export const elevation = {
  0: cssVar('--elevation-0'),
  1: cssVar('--elevation-1'),
  2: cssVar('--elevation-2'),
  3: cssVar('--elevation-3'),
  4: cssVar('--elevation-4'),
  5: cssVar('--elevation-5'),
} as const;

/** Raw numeric z-index values (kept in sync with tokens.css) for JS ordering. */
export const zIndex = {
  base: 0,
  raised: 10,
  dropdown: 1000,
  sticky: 1100,
  window: 1200,
  overlay: 1300,
  modal: 1400,
  popover: 1500,
  toast: 1600,
  tooltip: 1700,
  max: 2147483000,
} as const;

/**
 * The SHELL layer scale — app-global surfaces, which never compare against the
 * `zIndex` component tier above. Declaration order here is the stacking order,
 * and `shellLayerScale.test.ts` asserts both that and the tokens.css values.
 *
 * A full-screen view (the adopted media workspace) sorts below the shell on
 * purpose: it is a view, not chrome, and an opaque one hides — rather than
 * merely covers — anything numbered under it.
 */
/**
 * View-scoped overlays — a modal that belongs to ONE view rather than to the app.
 *
 * Deliberately its own object: it is not part of the shell scale and must not be
 * compared with it by declaration order. It occupies the gap the shell scale
 * reserves between `--z-shell-view` and `--z-shell-overlay-backdrop`, which is the
 * whole ordering claim — above everything a view can raise (the ui/* tier tops out
 * at 1700), below every shell-global surface, so the palette, a toast, the taskbar
 * and this window's title bar stay reachable while a view's dialog is open.
 */
export const viewOverlayZIndex = {
  backdrop: 12500,
  dialog: 12501,
} as const;

export const shellZIndex = {
  viewAffordance: 9998,
  view: 9999,
  overlayBackdrop: 20000,
  overlay: 20001,
  feedback: 30000,
  blocking: 40000,
  lock: 100000,
  chrome: 200000,
  chromeRaised: 200001,
  windowChrome: 250000,
} as const;

/* ------------------------------------------------------------------ *
 * Documentation catalog — the tiers ADDED by this platform layer.
 * (Existing tokens declared in styles.css :root are cataloged separately
 *  in THEME_TOKEN_REFERENCE.md under "Pre-existing base tokens".)
 * ------------------------------------------------------------------ */

export const TOKEN_GROUPS: readonly TokenGroup[] = [
  {
    tier: 'Typography · size',
    description: 'rem-based scale; --font-size-md (14px) is the body base. Every step is emitted '
      + 'as `calc(<value> * var(--display-font-scale, 1))`, so Settings > Display > base font '
      + 'moves the whole ladder; the scale defaults to 1 and the values below are the resolved '
      + 'sizes at that default.',
    tokens: [
      { name: '--font-size-2xs', value: '0.6875rem', description: 'Dense status/toolbar text (11px).' },
      { name: '--font-size-xs', value: '0.75rem', description: 'Captions, chips (12px).' },
      { name: '--font-size-sm', value: '0.8125rem', description: 'Secondary/menu text (13px).' },
      { name: '--font-size-md', value: '0.875rem', description: 'Body base (14px).' },
      { name: '--font-size-lg', value: '1rem', description: 'Emphasised body / subheading (16px).' },
      { name: '--font-size-xl', value: '1.125rem', description: 'Headings (18px).' },
      { name: '--font-size-2xl', value: '1.375rem', description: 'Section titles (22px).' },
      { name: '--font-size-3xl', value: '1.75rem', description: 'Window/page titles (28px).' },
      { name: '--font-size-4xl', value: '2.25rem', description: 'Hero (36px).' },
      { name: '--font-size-hero', value: '3rem', description: 'Hero display (48px).' },
      { name: '--font-size-display', value: '4rem', description: 'Boot/splash display (64px).' },
    ],
  },
  {
    tier: 'Typography · rhythm',
    description: 'Line-height, weight, tracking, and the display family.',
    tokens: [
      { name: '--line-height-tight', value: '1.15', description: 'Display/hero.' },
      { name: '--line-height-snug', value: '1.3', description: 'Headings.' },
      { name: '--line-height-normal', value: '1.5', description: 'Body.' },
      { name: '--line-height-relaxed', value: '1.7', description: 'Long-form reading.' },
      { name: '--font-weight-regular', value: '400', description: 'Body.' },
      { name: '--font-weight-medium', value: '500', description: 'Emphasis / control labels.' },
      { name: '--font-weight-semibold', value: '600', description: 'Headings.' },
      { name: '--font-weight-bold', value: '700', description: 'Strong emphasis.' },
      { name: '--letter-spacing-tight', value: '-0.01em', description: 'Large display text.' },
      { name: '--letter-spacing-normal', value: '0', description: 'Body.' },
      { name: '--letter-spacing-wide', value: '0.02em', description: 'Small caps/labels.' },
      { name: '--letter-spacing-wider', value: '0.06em', description: 'All-caps status text.' },
      { name: '--font-display', value: 'var(--font-body)', description: 'Display face; a theme may override with a rounder font.' },
    ],
  },
  {
    tier: 'Spacing (extensions)',
    description: 'Adds to --space-xs..xl declared in styles.css.',
    tokens: [
      { name: '--space-2xs', value: '2px', description: 'Hairline gaps.' },
      { name: '--space-2xl', value: '32px', description: 'Large section padding.' },
      { name: '--space-3xl', value: '48px', description: 'Page gutters.' },
      { name: '--space-4xl', value: '64px', description: 'Hero spacing.' },
    ],
  },
  {
    tier: 'Radius (extensions)',
    description: 'Adds to --radius-sm/md/lg declared in styles.css.',
    tokens: [
      { name: '--radius-xs', value: '4px', description: 'Chips, tags.' },
      { name: '--radius-xl', value: '16px', description: 'Cards, panels.' },
      { name: '--radius-2xl', value: '22px', description: 'Glass windows.' },
      { name: '--radius-pill', value: '999px', description: 'Pills, toggles.' },
    ],
  },
  {
    tier: 'Motion · duration',
    description: 'Soft, fluid Aero timing.',
    tokens: [
      { name: '--dur-instant', value: '80ms', description: 'Micro state changes.' },
      { name: '--dur-fast', value: '140ms', description: 'Hover, small toggles.' },
      { name: '--dur-normal', value: '240ms', description: 'Most transitions.' },
      { name: '--dur-slow', value: '380ms', description: 'Dialogs, sheets.' },
      { name: '--dur-xslow', value: '640ms', description: 'Glass reveals, window open.' },
    ],
  },
  {
    tier: 'Motion · easing',
    description: 'Named curves; --ease-spring/-glass give Aero character.',
    tokens: [
      { name: '--ease-standard', value: 'cubic-bezier(0.4,0,0.2,1)', description: 'General.' },
      { name: '--ease-emphasized', value: 'cubic-bezier(0.2,0,0,1)', description: 'Emphasised motion.' },
      { name: '--ease-decelerate', value: 'cubic-bezier(0,0,0.2,1)', description: 'Enter.' },
      { name: '--ease-accelerate', value: 'cubic-bezier(0.4,0,1,1)', description: 'Exit.' },
      { name: '--ease-spring', value: 'cubic-bezier(0.34,1.56,0.64,1)', description: 'Gentle overshoot.' },
      { name: '--ease-glass', value: 'cubic-bezier(0.16,1,0.3,1)', description: 'Smooth glass reveal.' },
    ],
  },
  {
    tier: 'Blur',
    description: 'Aero glass backdrop blur radii.',
    tokens: [
      { name: '--blur-sm', value: '6px', description: 'Subtle frosting.' },
      { name: '--blur-md', value: '12px', description: 'Panels.' },
      { name: '--blur-lg', value: '20px', description: 'Windows (default glass).' },
      { name: '--blur-xl', value: '32px', description: 'Overlays.' },
      { name: '--blur-max', value: '48px', description: 'Full-screen scrims.' },
    ],
  },
  {
    tier: 'Elevation',
    description: 'Shadow ramp built from tokenised shadow colors.',
    tokens: [
      { name: '--shadow-color-weak', value: 'rgba(0,0,0,0.14)', description: 'Low shadow color.' },
      { name: '--shadow-color', value: 'rgba(0,0,0,0.22)', description: 'Mid shadow color.' },
      { name: '--shadow-color-strong', value: 'rgba(0,0,0,0.30)', description: 'High shadow color.' },
      { name: '--elevation-0', value: 'none', description: 'Flush.' },
      { name: '--elevation-1', value: '0 1px 2px …', description: 'Raised controls.' },
      { name: '--elevation-2', value: '0 2px 8px …', description: 'Cards.' },
      { name: '--elevation-3', value: '0 6px 18px …', description: 'Popovers/menus.' },
      { name: '--elevation-4', value: '0 12px 32px …', description: 'Dialogs.' },
      { name: '--elevation-5', value: '0 22px 56px …', description: 'Windows/overlays.' },
    ],
  },
  {
    tier: 'Z-index',
    description: 'Stacking scale for ui/* layers.',
    tokens: [
      { name: '--z-dropdown', value: '1000', description: 'Dropdowns/selects.' },
      { name: '--z-window', value: '1200', description: 'Floating windows.' },
      { name: '--z-overlay', value: '1300', description: 'Scrims.' },
      { name: '--z-modal', value: '1400', description: 'Dialogs.' },
      { name: '--z-popover', value: '1500', description: 'Popovers/context menus.' },
      { name: '--z-toast', value: '1600', description: 'Toasts.' },
      { name: '--z-tooltip', value: '1700', description: 'Tooltips.' },
    ],
  },
  {
    tier: 'Shell layers',
    description:
      'App-global stacking, far above the ui/* tier so the two never compare: '
      + 'view content < a full-screen view < shell-global overlays < OS chrome.',
    tokens: [
      {
        name: '--z-shell-view-affordance',
        value: '9998',
        description: 'The control that opens a full-screen view, just beneath it.',
      },
      {
        name: '--z-shell-view',
        value: '9999',
        description:
          'An opaque full-screen view (the adopted media workspace). Below the shell '
          + 'on purpose — it is a view, not chrome.',
      },
      {
        name: '--z-view-overlay-backdrop',
        value: '12500',
        description:
          'Scrim under a modal owned by ONE view. Not a shell token: it sits in the gap '
          + 'this scale reserves, above everything the ui/* tier can raise and below every '
          + 'shell-global surface.',
      },
      {
        name: '--z-view-overlay',
        value: '12501',
        description:
          'The view-scoped modal itself (manga source picker, library import). A dialog '
          + 'a view owns is not a gate on the app, so it never reaches --z-shell-blocking.',
      },
      {
        name: '--z-shell-overlay-backdrop',
        value: '20000',
        description: 'Click-catching scrim beneath a shell-global overlay.',
      },
      {
        name: '--z-shell-overlay',
        value: '20001',
        description: 'Command palette and clipboard history — reachable over any view.',
      },
      {
        name: '--z-shell-feedback',
        value: '30000',
        description: 'Toasts, which must be readable above the overlay that caused them.',
      },
      {
        name: '--z-shell-blocking',
        value: '40000',
        description:
          'A gate that must be answered before the app is usable (first-launch consent). '
          + 'Outranks every overlay, because those are things you reach for and this is the '
          + 'one thing you may not reach past.',
      },
      {
        name: '--z-shell-lock',
        value: '100000',
        description: 'Lock screen — covers everything a normal session can raise.',
      },
      {
        name: '--z-shell-chrome',
        value: '200000',
        description: 'Taskbar and the shell flyout backdrop.',
      },
      {
        name: '--z-shell-chrome-raised',
        value: '200001',
        description: 'Start menu and flyouts, above the taskbar.',
      },
      {
        name: '--z-window-chrome',
        value: '250000',
        description: "This OS window's own title bar.",
      },
    ],
  },
  {
    tier: 'Interaction alphas',
    description: 'Consistent hover/pressed/selected/disabled strengths.',
    tokens: [
      { name: '--alpha-hover', value: '0.08', description: 'Hover overlay.' },
      { name: '--alpha-pressed', value: '0.16', description: 'Pressed overlay.' },
      { name: '--alpha-selected', value: '0.22', description: 'Selected overlay.' },
      { name: '--alpha-disabled', value: '0.45', description: 'Disabled opacity.' },
      { name: '--alpha-muted', value: '0.6', description: 'Muted content.' },
    ],
  },
  {
    tier: 'Surface / glass / reflection',
    description: 'Base = dark Study OS; the Frutiger Aero theme overrides to bright glass (M3).',
    tokens: [
      { name: '--sheen', value: 'rgba(255,255,255,0.55)', description: 'Gloss top-highlight color.' },
      { name: '--sheen-strong', value: 'rgba(255,255,255,0.80)', description: 'Strong gloss highlight.' },
      { name: '--glass-tint', value: 'color-mix(panel 72%)', description: 'Glass fill.' },
      { name: '--glass-tint-strong', value: 'color-mix(panel 88%)', description: 'Denser glass fill.' },
      { name: '--glass-border', value: 'color-mix(text 14%)', description: 'Glass edge.' },
      { name: '--glass-highlight', value: 'color-mix(sheen 40%)', description: 'Inner top sheen.' },
      { name: '--glass-blur', value: 'var(--blur-lg)', description: 'Default glass blur.' },
    ],
  },
  {
    tier: 'Focus ring',
    description: 'Consumed by ui/* now and formalised in a11y (M8).',
    tokens: [
      { name: '--focus-ring-color', value: 'color-mix(accent 70%)', description: 'Focus ring color.' },
      { name: '--focus-ring-width', value: '2px', description: 'Ring thickness.' },
      { name: '--focus-ring-offset', value: '2px', description: 'Ring offset.' },
    ],
  },
  {
    tier: 'Status colours',
    description:
      'Semantic states, themeable. P1.1 split: error/danger use the deeper brick --danger ' +
      '(defined in styles.css :root), NOT the brand --accent/--red; info is a calm blue.',
    tokens: [
      { name: '--status-success', value: '#38b26b', description: 'Success / connected.' },
      { name: '--status-warning', value: '#e0a53a', description: 'Warning / caution (amber).' },
      { name: '--status-error', value: 'var(--danger)', description: 'Error signal — deeper brick red, distinct from brand.' },
      { name: '--status-info', value: '#3b82f6', description: 'Informational — calm blue, not accent.' },
      { name: '--danger-weak', value: 'color-mix(danger 16%)', description: 'Soft danger wash for destructive backgrounds/hover.' },
    ],
  },
] as const;
