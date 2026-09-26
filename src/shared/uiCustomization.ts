/**
 * MASTER_PLAN.md §20 — AI-Powered UI Customization.
 *
 * §20's whole point is the architecture diagram at the end of it:
 *
 *     AI Assistant → Theme/UI API → CSS variables + component settings → Application UI
 *
 * and explicitly **not** `AI → directly edits app files`. This module *is* that
 * Theme/UI API. Everything a request can change has to pass through the allow-list in
 * `UI_TOKENS` or the Appearance values in `UiLook`; a request that names anything else is
 * reported as unmatched rather than guessed at, and raw custom CSS goes through a
 * sanitizer that refuses to let anyone — user or assistant — hide the way back out.
 *
 * The "AI" half is deliberately a **deterministic interpreter**, not a model call.
 * The app is offline-first (CLAUDE.md), so a customization request that needed a model
 * would be dead whenever the model was absent, which is most of the time. Instead the
 * interpreter resolves phrasing to token patches locally and always returns a *plan*
 * that must be previewed and confirmed. A local LLM, when one is installed, produces
 * the same `UiChangePlan` shape via §17's tool layer — it does not get a second path
 * to the DOM.
 *
 * Purity contract, as in `connectionProfiles.ts`: no I/O, no `Date.now()`,
 * no `Math.random()`. `now` and ids are arguments.
 */

export const UI_CUSTOMIZATION_VERSION = 1;
export const UI_THEME_HISTORY_LIMIT = 20;
/** Matches the limit the shipped `renderer/customCss.ts` sandbox already enforced. */
export const UI_CUSTOM_CSS_LIMIT = 24_000;

export type UiTokenKind = 'color' | 'length' | 'number' | 'font' | 'duration' | 'shadow';

export interface UiTokenSpec {
  /** The CSS custom property, without the leading `--`. */
  token: string;
  kind: UiTokenKind;
  group: UiTokenGroup;
  /** Numeric bounds for `length` / `number` / `duration`, in the unit named below. */
  min?: number;
  max?: number;
  unit?: 'px' | 'rem' | 'ms' | '';
}

export type UiTokenGroup =
  | 'color'
  | 'typography'
  | 'spacing'
  | 'radius'
  | 'shadow'
  | 'motion'
  | 'density';

/**
 * The allow-list. Every entry names a custom property that already exists in
 * `theme/tokens.css` or the base `:root` in `styles.css` — this API only re-points
 * tokens the stylesheets already read, so a customization can restyle the app but can
 * never introduce a property nothing consumes (which would look like a silent no-op).
 *
 * **What is NOT on it, on purpose:** the tokens Settings > Appearance owns (listed in
 * `APPEARANCE_OWNED_TOKENS`). They used to be here too, emitted `!important`, so
 * applying a theme silently disabled the Appearance controls above it — the Accent
 * swatch showed one colour while the app painted another, and Density did nothing. A
 * theme now sets those as Appearance VALUES (`UiLook`, below), written through
 * `osPersonalization`, so both panels always show what is actually on screen.
 */
export const APPEARANCE_OWNED_TOKENS = [
  'accent',
  'accent-2',
  'space-xs',
  'space-sm',
  'space-md',
  'space-lg',
  'space-xl',
  'radius-sm',
  'radius-md',
  'radius-lg',
  'shadow-card',
  'shadow-toolbar',
  'font-body',
] as const;

export const UI_TOKENS: UiTokenSpec[] = [
  { token: 'accent-weak', kind: 'color', group: 'color' },
  { token: 'bg', kind: 'color', group: 'color' },
  { token: 'panel', kind: 'color', group: 'color' },
  { token: 'panel-2', kind: 'color', group: 'color' },
  { token: 'sidebar', kind: 'color', group: 'color' },
  { token: 'text', kind: 'color', group: 'color' },
  { token: 'muted', kind: 'color', group: 'color' },
  { token: 'border', kind: 'color', group: 'color' },
  { token: 'glass-tint', kind: 'color', group: 'color' },
  { token: 'glass-border', kind: 'color', group: 'color' },

  { token: 'font-display', kind: 'font', group: 'typography' },
  { token: 'font-mono', kind: 'font', group: 'typography' },
  /*
   * The typography ladder is FIVE steps in `theme/tokens.css`, and this list carried only the
   * top three. `--font-size-xs` is the single most-used font-size token in the renderer (201
   * declarations against `sm`'s 97) and `--font-size-2xs` adds another 86, so between them the
   * two missing steps are most of the app's small text — every caption, chip, status line and
   * toolbar label. A user who asked the product to make text bigger moved 1 of 70 visible text
   * elements on Settings, because the two tokens their UI actually uses were not in the
   * customization system at all. Measured under L11 bullet 2's text-scaling clause.
   */
  { token: 'font-size-2xs', kind: 'length', group: 'typography', min: 8, max: 20, unit: 'px' },
  { token: 'font-size-xs', kind: 'length', group: 'typography', min: 8, max: 22, unit: 'px' },
  { token: 'font-size-sm', kind: 'length', group: 'typography', min: 9, max: 24, unit: 'px' },
  { token: 'font-size-md', kind: 'length', group: 'typography', min: 10, max: 28, unit: 'px' },
  { token: 'font-size-lg', kind: 'length', group: 'typography', min: 11, max: 34, unit: 'px' },
  { token: 'line-height-normal', kind: 'number', group: 'typography', min: 1, max: 2.4, unit: '' },

  { token: 'control-radius', kind: 'length', group: 'radius', min: 0, max: 32, unit: 'px' },

  { token: 'glass-blur', kind: 'length', group: 'shadow', min: 0, max: 64, unit: 'px' },

  { token: 'motion-duration', kind: 'duration', group: 'motion', min: 0, max: 1_000, unit: 'ms' },
  { token: 'dur-fast', kind: 'duration', group: 'motion', min: 0, max: 1_000, unit: 'ms' },
  { token: 'dur-normal', kind: 'duration', group: 'motion', min: 0, max: 2_000, unit: 'ms' },

  { token: 'scrollbar-size', kind: 'length', group: 'density', min: 4, max: 24, unit: 'px' },
];

const TOKEN_BY_NAME = new Map(UI_TOKENS.map((spec) => [spec.token, spec]));

export type UiTokenPatch = Record<string, string>;

// ---------------------------------------------------------------------------
// Appearance values a theme sets (Settings > Appearance owns them)
// ---------------------------------------------------------------------------

/*
 * §20's "Component-Level Customization" card used to live here: twelve settings for a
 * media card, a subtitle panel and a vocabulary card, emitted as `--ui-media-card-*`,
 * `--ui-subtitle-panel-*` and `--ui-vocabulary-card-*`. Nothing in the app ever read
 * one of those variables, so all twelve controls did nothing. They are removed rather
 * than wired: the media card belongs to the Gum library; the subtitle panel already has
 * real settings in the player (`VideoCoreStudyPreferences`), which "bigger subtitles"
 * now writes; and "compact / spacious" now means Appearance > Density, which reaches
 * every surface.
 */

export const UI_LOOK_DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
export const UI_LOOK_RADII = ['sharp', 'soft', 'round'] as const;
export const UI_LOOK_SHADOWS = ['none', 'soft', 'deep'] as const;
export type UiLookDensity = (typeof UI_LOOK_DENSITIES)[number];
export type UiLookRadius = (typeof UI_LOOK_RADII)[number];
export type UiLookShadow = (typeof UI_LOOK_SHADOWS)[number];

/**
 * The Appearance values a theme carries. Applying a theme WRITES these into
 * `osPersonalization` — the store the Accent, Density, Corners and Shadows controls
 * edit — instead of overriding their tokens, so there is one current value and both
 * panels show it. An absent field means "leave the user's choice alone".
 */
export interface UiLook {
  /** `#rrggbb`. */
  accent?: string;
  density?: UiLookDensity;
  radius?: UiLookRadius;
  shadow?: UiLookShadow;
}

/** Appearance's own defaults (`osPersonalization` DEFAULTS), the base for relative steps. */
export const UI_LOOK_DEFAULTS: Required<Omit<UiLook, 'accent'>> = {
  density: 'comfortable',
  radius: 'soft',
  shadow: 'soft',
};

export function sanitizeUiLook(input: unknown): UiLook {
  const out: UiLook = {};
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return out;
  const raw = input as Record<string, unknown>;
  if (typeof raw.accent === 'string' && /^#[0-9a-f]{6}$/i.test(raw.accent.trim())) {
    out.accent = raw.accent.trim().toLowerCase();
  }
  if (UI_LOOK_DENSITIES.includes(raw.density as UiLookDensity)) out.density = raw.density as UiLookDensity;
  if (UI_LOOK_RADII.includes(raw.radius as UiLookRadius)) out.radius = raw.radius as UiLookRadius;
  if (UI_LOOK_SHADOWS.includes(raw.shadow as UiLookShadow)) out.shadow = raw.shadow as UiLookShadow;
  return out;
}

function pxOf(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)px$/i);
  return match ? Number(match[1]) : null;
}

/**
 * A profile stored before themes wrote Appearance values carried them as raw tokens.
 * Read those back into the nearest Appearance step once, so an existing theme keeps
 * its look instead of silently losing it at the upgrade.
 */
export function lookFromLegacyTokens(tokens: unknown): UiLook {
  if (typeof tokens !== 'object' || tokens === null || Array.isArray(tokens)) return {};
  const raw = tokens as Record<string, unknown>;
  const look: UiLook = {};
  const space = pxOf(raw['space-md']);
  if (space !== null) look.density = space <= 9 ? 'compact' : space >= 15 ? 'spacious' : 'comfortable';
  const radius = pxOf(raw['radius-md']);
  if (radius !== null) look.radius = radius <= 5 ? 'sharp' : radius >= 11 ? 'round' : 'soft';
  if (typeof raw['shadow-card'] === 'string' && raw['shadow-card'].trim().toLowerCase() === 'none') {
    look.shadow = 'none';
  }
  return { ...look, ...sanitizeUiLook({ accent: raw.accent }) };
}

function stepOf<T extends string>(ladder: readonly T[], current: T, step: number): T {
  const at = Math.max(0, ladder.indexOf(current));
  return ladder[Math.min(ladder.length - 1, Math.max(0, at + step))];
}

/**
 * The player's subtitle size bounds and default, in px. They mirror
 * `normalizeVideoCoreStudyPreferences` (`shared/videoCoreStudy.ts`), which is what the
 * value is written through; a test pins the two together.
 */
export const UI_SUBTITLE_FONT_SIZE = { min: 16, max: 48, fallback: 26 } as const;

// ---------------------------------------------------------------------------
// Theme profiles
// ---------------------------------------------------------------------------

export interface UiThemeVersion {
  id: string;
  createdAt: string;
  reason: string;
  tokens: UiTokenPatch;
  look: UiLook;
  customCss: string;
}

export interface UiThemeProfile {
  id: string;
  name: string;
  builtIn: boolean;
  tokens: UiTokenPatch;
  look: UiLook;
  /**
   * Kept for portability only. Settings > Appearance has ONE custom-CSS editor (the
   * sandbox in `renderer/customCss.ts`); a profile's stylesheet is no longer rendered.
   * The renderer moved the active profile's stylesheet into the sandbox once, and an
   * imported theme's stylesheet is added there too.
   */
  customCss: string;
  customCssEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  history: UiThemeVersion[];
}

export interface UiCustomizationDocument {
  version: typeof UI_CUSTOMIZATION_VERSION;
  activeProfileId: string;
  profiles: UiThemeProfile[];
  /** Developer mode reveals the generated stylesheet. */
  developerMode: boolean;
  /** A pending, previewed-but-unconfirmed plan. Nothing reaches the DOM from here. */
  preview: UiChangePlan | null;
}

/** §20's own list of theme profiles, minus "Custom user theme" (which the user creates). */
export const BUILT_IN_UI_THEMES: Array<{ id: string; name: string; tokens: UiTokenPatch; look: UiLook }> = [
  // Default puts the layout values back to Appearance's defaults, so switching to it
  // undoes another theme's density and corners. It never touches the accent.
  { id: 'default', name: 'Default', tokens: {}, look: { ...UI_LOOK_DEFAULTS } },
  {
    id: 'macos-inspired',
    name: 'macOS inspired',
    tokens: {
      'control-radius': '8px',
      'glass-blur': '30px',
      'line-height-normal': '1.5',
    },
    look: { radius: 'round', density: 'spacious', shadow: 'soft' },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    tokens: {
      'glass-blur': '0px',
    },
    look: { radius: 'sharp', shadow: 'none' },
  },
  {
    id: 'japanese-study',
    name: 'Japanese study mode',
    tokens: {
      'font-size-md': '16px',
      'font-size-lg': '20px',
      'line-height-normal': '1.9',
    },
    look: { density: 'spacious' },
  },
  {
    id: 'dark-oled',
    name: 'Dark OLED',
    tokens: {
      bg: '#000000',
      panel: '#050505',
      'panel-2': '#0b0b0b',
      sidebar: '#000000',
      border: '#1a1a1a',
      'glass-tint': 'rgba(0,0,0,0.72)',
    },
    look: {},
  },
];

const BUILT_IN_UI_THEME_NAME_KEY: Record<string, string> = {
  default: 'theme.builtin.default',
  'macos-inspired': 'theme.builtin.macosInspired',
  minimal: 'theme.builtin.minimal',
  'japanese-study': 'theme.builtin.japaneseStudy',
  'dark-oled': 'theme.builtin.darkOled',
};

/**
 * The i18n key a profile's name is shown through, or null to show it as stored. A
 * built-in keeps its English name in the document (which is exported as portable
 * JSON), so it is translated at render, and only while it still reads as the
 * built-in's own: a name the user gave a profile is theirs.
 */
export function builtInUiThemeNameKey(profile: { id: string; name: string }): string | null {
  const key = BUILT_IN_UI_THEME_NAME_KEY[profile.id];
  const builtIn = BUILT_IN_UI_THEMES.find((theme) => theme.id === profile.id);
  return key && builtIn && builtIn.name === profile.name ? key : null;
}

// ---------------------------------------------------------------------------
// Value validation
// ---------------------------------------------------------------------------

const COLOR_PATTERN = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\(\s*[0-9.,%\s/deg]+\)|[a-z]{3,20})$/i;
const FONT_PATTERN = /^[-\w\s'",()]{1,160}$/;
const SHADOW_PATTERN = /^(none|[-0-9a-z.,%\s()#/]{1,240})$/i;

export interface UiValueIssue {
  token: string;
  message: string;
}

function clampNumeric(spec: UiTokenSpec, raw: string): string | null {
  const match = raw.trim().match(/^(-?\d+(?:\.\d+)?)\s*(px|rem|ms|s|%)?$/i);
  if (!match) return null;
  let value = Number(match[1]);
  const unit = (match[2] ?? '').toLowerCase();
  // Seconds are accepted for durations and folded into the token's own unit, because
  // "0.2s" is the natural way to write it and rejecting it would be pure pedantry.
  if (spec.unit === 'ms' && unit === 's') value *= 1_000;
  else if (unit && spec.unit && unit !== spec.unit) return null;
  if (spec.min !== undefined) value = Math.max(spec.min, value);
  if (spec.max !== undefined) value = Math.min(spec.max, value);
  const rounded = spec.unit === '' ? Math.round(value * 100) / 100 : Math.round(value);
  return `${rounded}${spec.unit ?? ''}`;
}

/** Returns the value to store, or `null` if it cannot be made safe. */
export function normalizeTokenValue(token: string, raw: unknown): string | null {
  const spec = TOKEN_BY_NAME.get(token);
  if (!spec || typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value || value.length > 240) return null;
  // A value may never smuggle in a declaration terminator, a comment, or a url() — all
  // three are how a "colour" turns into arbitrary CSS once interpolated into a rule.
  if (/[;{}]|\/\*|url\s*\(|expression\s*\(|@import/i.test(value)) return null;
  switch (spec.kind) {
    case 'color':
      return COLOR_PATTERN.test(value) ? value : null;
    case 'font':
      return FONT_PATTERN.test(value) ? value : null;
    case 'shadow':
      return SHADOW_PATTERN.test(value) ? value : null;
    case 'length':
    case 'number':
    case 'duration':
      return clampNumeric(spec, value);
    default:
      return null;
  }
}

export function sanitizeTokenPatch(patch: unknown): { tokens: UiTokenPatch; issues: UiValueIssue[] } {
  const tokens: UiTokenPatch = {};
  const issues: UiValueIssue[] = [];
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return { tokens, issues };
  for (const [token, raw] of Object.entries(patch as Record<string, unknown>)) {
    if (!TOKEN_BY_NAME.has(token)) {
      issues.push({ token, message: 'Not a customizable token.' });
      continue;
    }
    const value = normalizeTokenValue(token, raw);
    if (value === null) {
      issues.push({ token, message: 'Value rejected.' });
      continue;
    }
    tokens[token] = value;
  }
  return { tokens, issues };
}

// ---------------------------------------------------------------------------
// Custom CSS safety (§20 "Safety System" / "Custom CSS Support")
// ---------------------------------------------------------------------------

/**
 * Selectors that must stay visible and clickable. Hiding any of them is how a theme —
 * hand-written or generated — locks a user inside a broken UI with no way to reach
 * Settings and undo it. This is the same lockout guard Blanc's raw-CSS escape hatch
 * uses, applied to the Study OS shell.
 */
export const PROTECTED_UI_SELECTORS = [
  '.os-taskbar',
  '.os-taskbar-start',
  '.win-controls',
  '.win-close',
  '.os-settings',
  '.settings-nav',
  '.os-launcher',
  '.command-palette',
  'body',
  'html',
  ':root',
];

/** Declarations that would make a protected element unreachable. */
const HIDING_DECLARATIONS: Array<{ property: string; test: (value: string) => boolean }> = [
  { property: 'display', test: (value) => value === 'none' },
  { property: 'visibility', test: (value) => value === 'hidden' || value === 'collapse' },
  { property: 'opacity', test: (value) => Number(value) === 0 },
  { property: 'pointer-events', test: (value) => value === 'none' },
  { property: 'content-visibility', test: (value) => value === 'hidden' },
];

export type UiCssViolationKind =
  | 'at-import'
  | 'remote-url'
  | 'script-url'
  | 'expression'
  | 'blocked-construct'
  | 'hides-protected'
  | 'too-long'
  | 'unbalanced';

/**
 * Legacy foot-guns carried over from `renderer/customCss.ts`, which this reviewer now
 * backs. `</style` and `<script` matter because custom CSS is written into a `<style>`
 * element's text: closing the element early turns a stylesheet into markup.
 */
const BLOCKED_CONSTRUCTS = ['-moz-binding', 'vbscript:', '</style', '<script'];

/**
 * IE's `behavior:` (which loaded an HTC script) has to stay blocked, but it cannot be a
 * plain substring test: **`scroll-behavior`, `overscroll-behavior` and
 * `transition-behavior` all contain it**, so `html { scroll-behavior: smooth }` — about
 * the most ordinary line a user can type — was refused with "Blocked construct:
 * behavior:". Measured 2026-08-07 (v1.0 audit §2.2): all three were rejected.
 *
 * The property must therefore start at a property boundary: start of input, or a
 * character that cannot be part of an identifier. `-` is deliberately excluded from the
 * allowed prefixes, which is what keeps `-moz-behavior`-style vendor spellings out too.
 */
const IE_BEHAVIOR_PATTERN = /(^|[^-\w])behavior\s*:/i;

export interface UiCssViolation {
  kind: UiCssViolationKind;
  detail: string;
}

export interface UiCssReview {
  css: string;
  violations: UiCssViolation[];
  safe: boolean;
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * The rule the `remote-url` violation actually means: **does this reach the network?**
 *
 * It used to mean "is this anything other than `data:`", which refused
 * `url('./cat.png')` — a file that ships with the app — and told the user their
 * stylesheet "loads something over the network", which was simply false. Measured
 * 2026-08-07 (v1.0 audit §2.2).
 *
 * A relative or root-relative path resolves against the renderer's own origin —
 * `http://localhost:5173` in dev, `file://` when packaged — so it is local in both, and
 * the offline-first rule it exists to protect is untouched. What must stay blocked is an
 * explicit remote scheme and the protocol-relative `//host/x` form, which is easy to
 * mistake for a path and is not one.
 */
function isNetworkUrl(target: string): boolean {
  if (!target) return false;
  if (target.startsWith('//')) return true;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(target)?.[1]?.toLowerCase();
  if (!scheme) return false;
  return scheme !== 'data' && scheme !== 'file';
}

/**
 * Reviews custom CSS without applying it. Deliberately conservative and *reporting*
 * rather than rewriting: silently deleting half a user's stylesheet is worse than
 * telling them which rule was refused and why.
 */
export function reviewCustomCss(input: unknown): UiCssReview {
  const raw = typeof input === 'string' ? input : '';
  const violations: UiCssViolation[] = [];
  if (raw.length > UI_CUSTOM_CSS_LIMIT) {
    violations.push({ kind: 'too-long', detail: `${raw.length} characters` });
    return { css: '', violations, safe: false };
  }
  const css = stripComments(raw);

  if (/@import/i.test(css)) violations.push({ kind: 'at-import', detail: '@import' });
  if (/javascript\s*:/i.test(css)) violations.push({ kind: 'script-url', detail: 'javascript:' });
  if (/expression\s*\(/i.test(css)) violations.push({ kind: 'expression', detail: 'expression()' });
  const lower = css.toLowerCase();
  for (const construct of BLOCKED_CONSTRUCTS) {
    if (lower.includes(construct)) violations.push({ kind: 'blocked-construct', detail: construct });
  }
  if (IE_BEHAVIOR_PATTERN.test(lower)) violations.push({ kind: 'blocked-construct', detail: 'behavior:' });

  for (const match of css.matchAll(/url\s*\(\s*(['"]?)([^'")]*)\1\s*\)/gi)) {
    const target = match[2].trim();
    if (isNetworkUrl(target)) violations.push({ kind: 'remote-url', detail: target || 'url()' });
  }

  const opens = (css.match(/\{/g) ?? []).length;
  const closes = (css.match(/\}/g) ?? []).length;
  if (opens !== closes) violations.push({ kind: 'unbalanced', detail: `${opens} open, ${closes} close` });

  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = rule[1].split(',').map((entry) => entry.trim()).filter(Boolean);
    const guarded = selectors.filter((selector) =>
      PROTECTED_UI_SELECTORS.some((protectedSelector) =>
        selector === protectedSelector
        || selector.startsWith(`${protectedSelector} `)
        || selector.startsWith(`${protectedSelector}:`)
        || selector.startsWith(`${protectedSelector}.`)
        || selector.includes(`${protectedSelector},`)));
    if (!guarded.length) continue;
    for (const declaration of rule[2].split(';')) {
      const [property, ...rest] = declaration.split(':');
      if (!property || !rest.length) continue;
      const name = property.trim().toLowerCase();
      const value = rest.join(':').replace(/!important/i, '').trim().toLowerCase();
      const rulePattern = HIDING_DECLARATIONS.find((entry) => entry.property === name);
      if (rulePattern?.test(value)) {
        violations.push({ kind: 'hides-protected', detail: `${guarded[0]} { ${name}: ${value} }` });
      }
    }
  }

  return { css: raw, violations, safe: violations.length === 0 };
}

// ---------------------------------------------------------------------------
// CSS generation (Theme/UI API → CSS variables)
// ---------------------------------------------------------------------------

/**
 * Renders a profile's tokens to a stylesheet on `:root`.
 *
 * **Why `!important`.** Themes (`theme/*.css`) declare these tokens under attribute
 * selectors such as `:root[data-theme=…]`, which outrank a bare `:root`, and the motion
 * preferences write `--dur-*` inline — without it a theme would be silently ignored
 * while the panel reported it applied. What it must NOT override is Settings >
 * Appearance, and it no longer can: the tokens Appearance owns are not on the
 * allow-list (see `APPEARANCE_OWNED_TOKENS`); a theme sets those as Appearance values
 * instead. The stock "Default" theme has no token overrides and emits nothing.
 *
 * A profile's own `customCss` is not rendered: Appearance has one custom-CSS editor.
 */
export function profileToCss(profile: UiThemeProfile): string {
  const declarations = Object.entries(profile.tokens)
    .filter(([token]) => TOKEN_BY_NAME.has(token))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([token, value]) => `  --${token}: ${emittedTokenValue(token, value)} !important;`);
  return declarations.length ? [':root {', ...declarations, '}'].join('\n') : '';
}

/**
 * A pinned font-size still rides the display base font.
 *
 * `theme/tokens.css` writes the whole `--font-size-*` ladder as
 * `calc(<step> * var(--display-font-scale, 1))`, which is how Settings > Display > base font
 * reaches the surfaces (they resolve through the ladder, not through inheritance from `body`).
 * The declarations here are `!important` and therefore replace that whole value — so a profile
 * that pins one step would silently make the base font stop working for it. Re-applying the
 * scale here keeps the two text-size affordances composing instead of cancelling: `bigger text`
 * against an 18px base gives 13 * 1.15 * (18/14).
 *
 * Only `font-size-*` is scaled. `line-height-normal` is unitless, and `space-*`/`radius-*` are
 * not typography — scaling those would turn a base-font preference into a whole-layout zoom,
 * which the app already has as a separate control.
 */
function emittedTokenValue(token: string, value: string): string {
  if (!token.startsWith('font-size-')) return value;
  return `calc(${value} * var(--display-font-scale, 1))`;
}

// ---------------------------------------------------------------------------
// The intent interpreter — §20 steps 1–3 (understand, identify, generate)
// ---------------------------------------------------------------------------

export type UiIntentId =
  | 'sidebar-narrower'
  | 'sidebar-wider'
  | 'darker-glass'
  | 'macos-look'
  | 'subtitle-larger'
  | 'subtitle-smaller'
  | 'card-spacing-tighter'
  | 'card-spacing-looser'
  | 'rounder-corners'
  | 'sharper-corners'
  | 'less-motion'
  | 'more-contrast'
  | 'oled-black'
  | 'bigger-text'
  | 'smaller-text'
  | 'flatter'
  | 'compact-density'
  | 'spacious-density';

interface IntentRule {
  id: UiIntentId;
  /** Every phrase is a lowercase substring test; the first match wins per phrase list. */
  phrases: string[];
  tokens?: UiTokenPatch;
  /** Relative token nudges, resolved against the currently resolved value. */
  scale?: Record<string, number>;
  /** Absolute Appearance values. */
  look?: UiLook;
  /** One step along an Appearance ladder, from the CURRENT Appearance value. */
  lookStep?: { density?: number; radius?: number };
  /** A factor on the player's current subtitle size. */
  subtitleScale?: number;
}

/**
 * Phrase → change. Ordered most-specific first, because "make the sidebar smaller" also
 * contains "smaller" and must not be swallowed by the text-size rule.
 */
const INTENT_RULES: IntentRule[] = [
  {
    id: 'sidebar-narrower',
    phrases: ['sidebar smaller', 'smaller sidebar', 'narrow sidebar', 'sidebar narrower', 'shrink the sidebar'],
    lookStep: { density: -1 },
  },
  {
    id: 'sidebar-wider',
    phrases: ['sidebar bigger', 'bigger sidebar', 'wider sidebar', 'sidebar wider'],
    lookStep: { density: 1 },
  },
  {
    // The player's own subtitle size, not a CSS variable nothing reads — "increase
    // subtitle size" used to land on `--ui-subtitle-panel-font-scale`, which no
    // stylesheet consumed, so it did nothing while reporting success.
    id: 'subtitle-larger',
    phrases: ['subtitle size', 'subtitles bigger', 'bigger subtitles', 'increase subtitle', 'larger subtitle'],
    subtitleScale: 1.25,
  },
  {
    id: 'subtitle-smaller',
    phrases: ['smaller subtitle', 'subtitles smaller', 'decrease subtitle', 'reduce subtitle'],
    subtitleScale: 0.85,
  },
  {
    id: 'darker-glass',
    phrases: ['darker glass', 'dark glass', 'glassier', 'more glass', 'frosted'],
    tokens: { 'glass-tint': 'rgba(6,6,10,0.66)', 'glass-blur': '28px' },
  },
  {
    id: 'macos-look',
    phrases: ['like macos', 'more like macos', 'mac os style', 'macos style', 'like a mac'],
    tokens: {
      'control-radius': '8px',
      'line-height-normal': '1.5',
    },
    look: { radius: 'round', shadow: 'soft' },
  },
  {
    id: 'oled-black',
    phrases: ['oled', 'true black', 'pure black', 'pitch black'],
    tokens: { bg: '#000000', panel: '#050505', sidebar: '#000000' },
  },
  {
    id: 'card-spacing-tighter',
    phrases: ['tighter card', 'less card spacing', 'tighter spacing', 'reduce card spacing', 'less spacing'],
    lookStep: { density: -1 },
  },
  {
    id: 'card-spacing-looser',
    phrases: ['more card spacing', 'looser spacing', 'increase card spacing', 'more spacing', 'more breathing room'],
    lookStep: { density: 1 },
  },
  {
    id: 'rounder-corners',
    phrases: ['rounder', 'more rounded', 'round the corners', 'softer corners'],
    lookStep: { radius: 1 },
    scale: { 'control-radius': 1.6 },
  },
  {
    id: 'sharper-corners',
    phrases: ['sharper corners', 'square corners', 'less rounded', 'squarer'],
    lookStep: { radius: -1 },
    scale: { 'control-radius': 0.4 },
  },
  {
    id: 'flatter',
    phrases: ['flatter', 'no shadows', 'remove shadows', 'flat design'],
    look: { shadow: 'none' },
  },
  {
    id: 'less-motion',
    phrases: ['less motion', 'slower animation', 'calmer motion', 'reduce animation', 'less animation'],
    scale: { 'motion-duration': 1.5, 'dur-normal': 1.5 },
  },
  {
    id: 'more-contrast',
    phrases: ['more contrast', 'higher contrast', 'easier to read'],
    tokens: { text: '#ffffff', muted: '#c9c9d4', border: '#3a3a48' },
  },
  {
    id: 'bigger-text',
    phrases: ['bigger text', 'larger text', 'increase font', 'bigger font', 'larger font'],
    // Every step of the ladder, or the request only reaches the text that was already largest.
    scale: {
      'font-size-2xs': 1.15,
      'font-size-xs': 1.15,
      'font-size-sm': 1.15,
      'font-size-md': 1.15,
      'font-size-lg': 1.15,
    },
  },
  {
    id: 'smaller-text',
    phrases: ['smaller text', 'decrease font', 'smaller font', 'reduce text size'],
    scale: {
      'font-size-2xs': 0.9,
      'font-size-xs': 0.9,
      'font-size-sm': 0.9,
      'font-size-md': 0.9,
      'font-size-lg': 0.9,
    },
  },
  {
    id: 'compact-density',
    phrases: ['more compact', 'denser', 'compact mode', 'fit more'],
    look: { density: 'compact' },
  },
  {
    id: 'spacious-density',
    phrases: ['more spacious', 'roomier', 'spacious mode'],
    look: { density: 'spacious' },
  },
];

export interface UiIntent {
  id: UiIntentId;
  matched: string;
}

export interface UiChangePlan {
  /** The request as typed, kept so a stored preview is self-explanatory. */
  request: string;
  intents: UiIntent[];
  tokens: UiTokenPatch;
  /** Appearance values to write (Settings > Appearance), resolved to absolute values. */
  look: UiLook;
  /**
   * The player's subtitle size to write, in px, when the request was about subtitles.
   * Not stored on a profile: it is the player's own setting, and a theme switch must
   * not silently resize the user's subtitles.
   */
  subtitleFontSize?: number;
  /** Words the interpreter could not map. Reported, never guessed at. */
  unmatched: string[];
}

/** What the interpreter resolves relative requests against. */
export interface UiInterpretContext {
  /** The CURRENT Appearance values (not a profile's stored seed). */
  look?: UiLook;
  /** The player's current subtitle size, px. */
  subtitleFontSize?: number;
}

/**
 * Baseline values used to resolve relative nudges ("smaller", "rounder"). They mirror
 * the base `:root`, so a scale applied to an untouched profile lands somewhere sensible
 * instead of on `NaN`.
 */
export const UI_TOKEN_BASELINE: UiTokenPatch = {
  'control-radius': '8px',
  // These must mirror `renderer/theme/tokens.css`, because a relative nudge ("bigger text")
  // resolves from here whenever the profile has not set the token explicitly. `font-size-sm` said
  // 12px against the stylesheet's 0.8125rem = 13px, so "bigger" landed on 14px — one step of the
  // ladder, not 15 percent of anything.
  'font-size-2xs': '11px',
  'font-size-xs': '12px',
  'font-size-sm': '13px',
  'font-size-md': '14px',
  'font-size-lg': '16px',
  'line-height-normal': '1.5',
  'motion-duration': '140ms',
  'dur-fast': '120ms',
  'dur-normal': '240ms',
  'glass-blur': '18px',
  'scrollbar-size': '10px',
};

function scaleToken(token: string, factor: number, current: UiTokenPatch): string | null {
  const spec = TOKEN_BY_NAME.get(token);
  if (!spec) return null;
  const base = current[token] ?? UI_TOKEN_BASELINE[token];
  if (!base) return null;
  const match = base.match(/^(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  return normalizeTokenValue(token, `${Number(match[1]) * factor}${spec.unit ?? ''}`);
}

function clampSubtitleSize(value: number): number {
  return Math.round(Math.max(UI_SUBTITLE_FONT_SIZE.min, Math.min(UI_SUBTITLE_FONT_SIZE.max, value)));
}

/**
 * §20 steps 1–3: understand the request, identify what it affects, generate the change.
 * Steps 4–6 (preview, confirm, apply) are `stageUiPlan` / `applyUiPlan` below — this
 * function never touches a profile.
 */
export function interpretUiRequest(
  request: string,
  current: UiTokenPatch = {},
  context: UiInterpretContext = {},
): UiChangePlan {
  const text = String(request ?? '').toLowerCase();
  const plan: UiChangePlan = { request: String(request ?? ''), intents: [], tokens: {}, look: {}, unmatched: [] };
  if (!text.trim()) return plan;
  const currentLook = { ...UI_LOOK_DEFAULTS, ...sanitizeUiLook(context.look) };

  let consumed = text;
  for (const rule of INTENT_RULES) {
    const matched = rule.phrases.find((phrase) => text.includes(phrase));
    if (!matched) continue;
    plan.intents.push({ id: rule.id, matched });
    // Matched phrases are removed so the leftovers below are genuinely unexplained
    // words rather than the same request reported back as unmatched.
    consumed = consumed.split(matched).join(' ');
    if (rule.tokens) {
      const { tokens } = sanitizeTokenPatch(rule.tokens);
      Object.assign(plan.tokens, tokens);
    }
    if (rule.scale) {
      for (const [token, factor] of Object.entries(rule.scale)) {
        const value = scaleToken(token, factor, { ...current, ...plan.tokens });
        if (value !== null) plan.tokens[token] = value;
      }
    }
    if (rule.look) Object.assign(plan.look, sanitizeUiLook(rule.look));
    if (rule.lookStep?.density) {
      plan.look.density = stepOf(UI_LOOK_DENSITIES, plan.look.density ?? currentLook.density, rule.lookStep.density);
    }
    if (rule.lookStep?.radius) {
      plan.look.radius = stepOf(UI_LOOK_RADII, plan.look.radius ?? currentLook.radius, rule.lookStep.radius);
    }
    if (rule.subtitleScale) {
      const base = plan.subtitleFontSize ?? context.subtitleFontSize ?? UI_SUBTITLE_FONT_SIZE.fallback;
      plan.subtitleFontSize = clampSubtitleSize(base * rule.subtitleScale);
    }
  }

  const stopWords = new Set([
    'make', 'the', 'a', 'an', 'my', 'app', 'please', 'to', 'be', 'more', 'less', 'and',
    'it', 'look', 'i', 'want', 'can', 'you', 'use', 'change', 'set', 'with', 'of', 'for',
    'this', 'that', 'is', 'are', 'in', 'on', 'ui', 'style', 'theme', 'like',
  ]);
  plan.unmatched = [...new Set(
    consumed
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2 && !stopWords.has(word)),
  )];
  return plan;
}

/** Whether a plan changes anything at all. */
export function uiPlanHasChanges(plan: UiChangePlan): boolean {
  return Object.keys(plan.tokens).length > 0
    || Object.keys(plan.look).length > 0
    || plan.subtitleFontSize !== undefined;
}

// ---------------------------------------------------------------------------
// Profiles: create / patch / preview / apply / history
// ---------------------------------------------------------------------------

export function createUiThemeProfile(
  id: string,
  name: string,
  now: string,
  seed: { tokens?: UiTokenPatch; look?: UiLook } = {},
): UiThemeProfile {
  return {
    id,
    name,
    builtIn: false,
    tokens: sanitizeTokenPatch(seed.tokens ?? {}).tokens,
    look: sanitizeUiLook(seed.look),
    customCss: '',
    customCssEnabled: false,
    createdAt: now,
    updatedAt: now,
    history: [],
  };
}

export function createDefaultUiCustomizationDocument(
  now = new Date().toISOString(),
): UiCustomizationDocument {
  return {
    version: UI_CUSTOMIZATION_VERSION,
    activeProfileId: 'default',
    profiles: BUILT_IN_UI_THEMES.map((theme) => ({
      ...createUiThemeProfile(theme.id, theme.name, now, theme),
      builtIn: true,
    })),
    developerMode: false,
    preview: null,
  };
}

export function findUiProfile(
  document: UiCustomizationDocument,
  profileId: string,
): UiThemeProfile | null {
  return document.profiles.find((profile) => profile.id === profileId) ?? null;
}

export function activeUiProfile(document: UiCustomizationDocument): UiThemeProfile {
  return findUiProfile(document, document.activeProfileId) ?? document.profiles[0];
}

function withUiProfile(
  document: UiCustomizationDocument,
  profileId: string,
  update: (profile: UiThemeProfile) => UiThemeProfile,
): UiCustomizationDocument {
  let touched = false;
  const profiles = document.profiles.map((profile) => {
    if (profile.id !== profileId) return profile;
    touched = true;
    return update(profile);
  });
  if (!touched) throw new Error(`Unknown theme profile "${profileId}".`);
  return { ...document, profiles };
}

function snapshot(profile: UiThemeProfile, reason: string, versionId: string, now: string): UiThemeVersion[] {
  const version: UiThemeVersion = {
    id: versionId,
    createdAt: now,
    reason,
    tokens: { ...profile.tokens },
    look: { ...profile.look },
    customCss: profile.customCss,
  };
  return [version, ...profile.history].slice(0, UI_THEME_HISTORY_LIMIT);
}

/** §20 step 4 — preview. Stored on the document; nothing is applied yet. */
export function stageUiPlan(document: UiCustomizationDocument, plan: UiChangePlan): UiCustomizationDocument {
  return { ...document, preview: plan };
}

export function discardUiPreview(document: UiCustomizationDocument): UiCustomizationDocument {
  return { ...document, preview: null };
}

/** §20 steps 5–6 — the confirmation is the caller invoking this; then it applies. */
export function applyUiPlan(
  document: UiCustomizationDocument,
  plan: UiChangePlan,
  options: { profileId?: string; now: string; versionId: string },
): UiCustomizationDocument {
  const profileId = options.profileId ?? document.activeProfileId;
  const next = withUiProfile(document, profileId, (profile) => ({
    ...profile,
    history: snapshot(profile, 'assistant', options.versionId, options.now),
    tokens: { ...profile.tokens, ...sanitizeTokenPatch(plan.tokens).tokens },
    look: { ...profile.look, ...sanitizeUiLook(plan.look) },
    updatedAt: options.now,
  }));
  return { ...next, preview: null };
}

export function patchUiTokens(
  document: UiCustomizationDocument,
  profileId: string,
  patch: UiTokenPatch,
  options: { now: string; versionId: string },
): { document: UiCustomizationDocument; issues: UiValueIssue[] } {
  const { tokens, issues } = sanitizeTokenPatch(patch);
  const next = withUiProfile(document, profileId, (profile) => ({
    ...profile,
    history: snapshot(profile, 'edit', options.versionId, options.now),
    tokens: { ...profile.tokens, ...tokens },
    updatedAt: options.now,
  }));
  return { document: next, issues };
}

/**
 * Record the current Appearance values on a profile, so re-activating it later brings
 * back the look the user had while it was active. Only called for a user theme; a
 * built-in keeps its own seed.
 */
export function setUiProfileLook(
  document: UiCustomizationDocument,
  profileId: string,
  look: UiLook,
  now: string,
): UiCustomizationDocument {
  return withUiProfile(document, profileId, (profile) => ({
    ...profile,
    look: sanitizeUiLook(look),
    updatedAt: now,
  }));
}

export function undoUiChange(
  document: UiCustomizationDocument,
  profileId: string,
  options: { now: string; versionId: string },
): UiCustomizationDocument {
  return withUiProfile(document, profileId, (profile) => {
    const [previous, ...rest] = profile.history;
    if (!previous) throw new Error('There is nothing to undo.');
    return {
      ...profile,
      // The undone state is itself snapshotted, so undo is reversible rather than a
      // one-way door — §20 lists Undo and Version history side by side for a reason.
      history: [
        {
          id: options.versionId,
          createdAt: options.now,
          reason: 'undo',
          tokens: { ...profile.tokens },
          look: { ...profile.look },
          customCss: profile.customCss,
        },
        ...rest,
      ].slice(0, UI_THEME_HISTORY_LIMIT),
      tokens: { ...previous.tokens },
      look: { ...previous.look },
      customCss: previous.customCss,
      updatedAt: options.now,
    };
  });
}

export function restoreUiDefaults(
  document: UiCustomizationDocument,
  profileId: string,
  options: { now: string; versionId: string },
): UiCustomizationDocument {
  return withUiProfile(document, profileId, (profile) => {
    const builtIn = BUILT_IN_UI_THEMES.find((theme) => theme.id === profile.id);
    return {
      ...profile,
      history: snapshot(profile, 'reset', options.versionId, options.now),
      tokens: builtIn ? sanitizeTokenPatch(builtIn.tokens).tokens : {},
      look: builtIn ? sanitizeUiLook(builtIn.look) : {},
      customCss: '',
      customCssEnabled: false,
      updatedAt: options.now,
    };
  });
}

export function setActiveUiProfile(
  document: UiCustomizationDocument,
  profileId: string,
): UiCustomizationDocument {
  if (!findUiProfile(document, profileId)) throw new Error(`Unknown theme profile "${profileId}".`);
  return { ...document, activeProfileId: profileId };
}

export function addUiProfile(
  document: UiCustomizationDocument,
  profile: UiThemeProfile,
): UiCustomizationDocument {
  if (findUiProfile(document, profile.id)) throw new Error(`Profile "${profile.id}" already exists.`);
  return { ...document, profiles: [...document.profiles, profile] };
}

export function deleteUiProfile(
  document: UiCustomizationDocument,
  profileId: string,
): UiCustomizationDocument {
  const profile = findUiProfile(document, profileId);
  if (!profile) throw new Error(`Unknown theme profile "${profileId}".`);
  if (profile.builtIn) throw new Error('Built-in themes cannot be deleted.');
  return {
    ...document,
    profiles: document.profiles.filter((entry) => entry.id !== profileId),
    activeProfileId: document.activeProfileId === profileId ? 'default' : document.activeProfileId,
  };
}

export function setUiDeveloperMode(
  document: UiCustomizationDocument,
  developerMode: boolean,
): UiCustomizationDocument {
  return { ...document, developerMode };
}

// ---------------------------------------------------------------------------
// Normalization & portability
// ---------------------------------------------------------------------------

function normalizeProfile(value: unknown, now: string): UiThemeProfile | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) return null;
  const review = reviewCustomCss(raw.customCss);
  const history = Array.isArray(raw.history)
    ? raw.history
        .filter((entry): entry is Record<string, unknown> =>
          typeof entry === 'object' && entry !== null && !Array.isArray(entry))
        .filter((entry) => typeof entry.id === 'string' && entry.id)
        .slice(0, UI_THEME_HISTORY_LIMIT)
        .map((entry) => ({
          id: String(entry.id),
          createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : now,
          reason: typeof entry.reason === 'string' ? entry.reason.slice(0, 40) : 'edit',
          tokens: sanitizeTokenPatch(entry.tokens).tokens,
          look: entry.look !== undefined ? sanitizeUiLook(entry.look) : lookFromLegacyTokens(entry.tokens),
          customCss: reviewCustomCss(entry.customCss).safe && typeof entry.customCss === 'string'
            ? entry.customCss
            : '',
        }))
    : [];
  return {
    id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : id,
    builtIn: BUILT_IN_UI_THEMES.some((theme) => theme.id === id),
    tokens: sanitizeTokenPatch(raw.tokens).tokens,
    // A profile stored before themes wrote Appearance values has no `look`; its
    // Appearance-owned tokens are read back into one instead of being dropped.
    look: raw.look !== undefined ? sanitizeUiLook(raw.look) : lookFromLegacyTokens(raw.tokens),
    // Unsafe CSS is dropped at the boundary, not carried and filtered at render time.
    customCss: review.safe ? review.css : '',
    customCssEnabled: review.safe && raw.customCssEnabled === true,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    history,
  };
}

export function normalizeUiCustomizationDocument(
  input: unknown,
  now = new Date().toISOString(),
): UiCustomizationDocument {
  const raw = (typeof input === 'object' && input !== null && !Array.isArray(input))
    ? input as Record<string, unknown>
    : {};
  const profiles: UiThemeProfile[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw.profiles)) {
    for (const entry of raw.profiles) {
      const profile = normalizeProfile(entry, now);
      if (!profile || seen.has(profile.id)) continue;
      seen.add(profile.id);
      profiles.push(profile);
    }
  }
  for (const theme of BUILT_IN_UI_THEMES) {
    if (seen.has(theme.id)) continue;
    profiles.push({ ...createUiThemeProfile(theme.id, theme.name, now, theme), builtIn: true });
    seen.add(theme.id);
  }
  const activeCandidate = typeof raw.activeProfileId === 'string' ? raw.activeProfileId : '';
  return {
    version: UI_CUSTOMIZATION_VERSION,
    activeProfileId: seen.has(activeCandidate) ? activeCandidate : 'default',
    profiles,
    developerMode: raw.developerMode === true,
    // A preview is a transient, unconfirmed proposal; it is never restored from disk,
    // or a stale plan could be confirmed weeks later against a different theme.
    preview: null,
  };
}

export interface UiThemeExport {
  version: typeof UI_CUSTOMIZATION_VERSION;
  profile: UiThemeProfile;
}

export function exportUiTheme(document: UiCustomizationDocument, profileId: string): UiThemeExport {
  const profile = findUiProfile(document, profileId);
  if (!profile) throw new Error(`Unknown theme profile "${profileId}".`);
  return { version: UI_CUSTOMIZATION_VERSION, profile: JSON.parse(JSON.stringify(profile)) as UiThemeProfile };
}

export function importUiTheme(
  document: UiCustomizationDocument,
  input: unknown,
  options: { id: string; now: string },
): { document: UiCustomizationDocument; review: UiCssReview } {
  const raw = (typeof input === 'object' && input !== null && !Array.isArray(input))
    ? input as Record<string, unknown>
    : {};
  if (typeof raw.version === 'number' && raw.version > UI_CUSTOMIZATION_VERSION) {
    throw new Error('That theme was created by a newer app version.');
  }
  const source = (typeof raw.profile === 'object' && raw.profile !== null) ? raw.profile : raw;
  const review = reviewCustomCss((source as Record<string, unknown>).customCss);
  const profile = normalizeProfile({ ...(source as Record<string, unknown>), id: options.id }, options.now);
  if (!profile) throw new Error('That theme could not be read.');
  // An imported theme is never built-in, whatever id it claims, and never lands on top
  // of an existing profile — it arrives as a new one the user can compare and discard.
  return {
    document: addUiProfile(document, { ...profile, builtIn: false, history: [] }),
    review,
  };
}
