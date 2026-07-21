// Blanc theming (Pillar 4).
//
// `blanc.css` is already fully tokenised, so a theme is not a restyle — it is a
// map of CSS custom properties layered over `.blanc-root`. This module owns the
// token list, the presets, and — most importantly — the validation.
//
// Why validation is the interesting part: these values end up inside a CSS
// custom property that the app writes into the document. An unvalidated value is
// a CSS injection: `red; } .blanc-taskbar { display: none` would close the rule
// and start a new one, and the plan's own warning applies — user styling must
// never be able to hide the way out of Blanc or the settings entry point, or the
// user locks themselves out of the surface they need to undo it.
//
// So values are not sanitised by stripping bad characters (a blocklist you can
// always get around). They must MATCH one of a small set of colour grammars, or
// they are rejected outright.

/** A themeable token, without the `--blanc-` prefix. */
export interface BlancThemeToken {
  /** Token name, e.g. 'accent' for `--blanc-accent`. */
  id: string;
  label: string;
  /** Grouping for the editor UI. */
  group: 'surface' | 'text' | 'accent' | 'state';
}

/**
 * The tokens exposed to the editor.
 *
 * Deliberately colours only. `blanc.css` also defines radii, durations, easing
 * and shadows; those take non-colour grammars that would each need their own
 * validator, and getting one wrong is how a stylesheet breaks. Colours cover the
 * "blood mode" ask and everything like it.
 */
export const BLANC_THEME_TOKENS: BlancThemeToken[] = [
  { id: 'bg', label: 'Background', group: 'surface' },
  { id: 'rail', label: 'Sidebar rail', group: 'surface' },
  { id: 'panel', label: 'Panel', group: 'surface' },
  { id: 'panel-soft', label: 'Panel (recessed)', group: 'surface' },
  { id: 'panel-raised', label: 'Panel (raised)', group: 'surface' },
  { id: 'border', label: 'Border', group: 'surface' },
  { id: 'border-strong', label: 'Border (strong)', group: 'surface' },
  { id: 'text', label: 'Text', group: 'text' },
  { id: 'muted', label: 'Text (muted)', group: 'text' },
  { id: 'faint', label: 'Text (faint)', group: 'text' },
  { id: 'accent', label: 'Accent', group: 'accent' },
  { id: 'accent-strong', label: 'Accent (strong)', group: 'accent' },
  { id: 'danger', label: 'Danger', group: 'state' },
  { id: 'success', label: 'Success', group: 'state' },
  { id: 'hover', label: 'Hover fill', group: 'state' },
  { id: 'active', label: 'Active fill', group: 'state' },
];

const TOKEN_IDS = new Set(BLANC_THEME_TOKENS.map((t) => t.id));

/** token id -> colour value. Only tokens the user changed appear. */
export type BlancThemeOverrides = Record<string, string>;

export interface BlancThemePreset {
  id: string;
  label: string;
  description: string;
  overrides: BlancThemeOverrides;
}

/**
 * Named presets. Each is a partial override — anything unset falls through to
 * `blanc.css`, so a preset stays correct when new tokens are added.
 */
export const BLANC_THEME_PRESETS: BlancThemePreset[] = [
  {
    id: 'default',
    label: 'Neutral',
    description: 'The shipped macOS-neutral greys.',
    overrides: {},
  },
  {
    id: 'blood',
    label: 'Blood',
    description: 'Near-black with a deep red accent.',
    overrides: {
      bg: '#141011',
      rail: '#141011',
      panel: '#1e1719',
      'panel-soft': '#181214',
      'panel-raised': '#241b1e',
      border: 'rgba(255, 90, 110, 0.10)',
      'border-strong': 'rgba(255, 90, 110, 0.20)',
      accent: '#ff2e4d',
      'accent-strong': '#ff5a6e',
      danger: '#ff6b6b',
      hover: 'rgba(255, 46, 77, 0.08)',
      active: 'rgba(255, 46, 77, 0.14)',
    },
  },
  {
    id: 'ink',
    label: 'Ink',
    description: 'Cool near-black with a muted blue accent.',
    overrides: {
      bg: '#101418',
      rail: '#101418',
      panel: '#181e24',
      'panel-soft': '#141a1f',
      'panel-raised': '#1d242b',
      accent: '#5aa9e6',
      'accent-strong': '#7cc0f0',
      hover: 'rgba(90, 169, 230, 0.08)',
      active: 'rgba(90, 169, 230, 0.14)',
    },
  },
  {
    id: 'paper',
    label: 'Paper',
    description: 'Light surfaces with warm grey text.',
    overrides: {
      bg: '#f4f2ee',
      rail: '#eceae5',
      panel: '#ffffff',
      'panel-soft': '#f7f5f2',
      'panel-raised': '#ffffff',
      border: 'rgba(0, 0, 0, 0.10)',
      'border-strong': 'rgba(0, 0, 0, 0.18)',
      text: '#1c1a17',
      muted: '#5f5b55',
      faint: '#8a857e',
      accent: '#8a5a2b',
      'accent-strong': '#a86f38',
      hover: 'rgba(0, 0, 0, 0.04)',
      active: 'rgba(0, 0, 0, 0.07)',
    },
  },
];

// ----- Validation -------------------------------------------------------------

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
// Numeric channels only: no nested functions, no var(), no calc(). Those are all
// legitimate CSS, and all avenues for smuggling something past a naive check.
const NUM = String.raw`-?\d+(?:\.\d+)?%?`;
const RGB = new RegExp(String.raw`^rgba?\(\s*${NUM}\s*(?:,|\s)\s*${NUM}\s*(?:,|\s)\s*${NUM}\s*(?:(?:,|/)\s*${NUM}\s*)?\)$`, 'i');
const HSL = new RegExp(String.raw`^hsla?\(\s*${NUM}(?:deg)?\s*(?:,|\s)\s*${NUM}\s*(?:,|\s)\s*${NUM}\s*(?:(?:,|/)\s*${NUM}\s*)?\)$`, 'i');
/** The handful of keywords worth allowing; anything else must be explicit. */
const KEYWORDS = new Set(['transparent', 'currentcolor', 'inherit', 'black', 'white']);

/**
 * True when `value` is a colour this module is willing to write into CSS.
 *
 * Allowlist by construction: the value must match one of the grammars above.
 * That makes injection impossible rather than unlikely — `red; } .x { display:
 * none` matches nothing, so it is rejected whole rather than partially cleaned.
 */
export function isSafeThemeColor(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v || v.length > 64) return false;
  if (KEYWORDS.has(v.toLowerCase())) return true;
  return HEX.test(v) || RGB.test(v) || HSL.test(v);
}

/** Keep only known tokens with safe values. Everything else is dropped. */
export function sanitizeThemeOverrides(value: unknown): BlancThemeOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: BlancThemeOverrides = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!TOKEN_IDS.has(key)) continue;
    if (!isSafeThemeColor(raw)) continue;
    out[key] = raw.trim();
  }
  return out;
}

/**
 * CSS declarations for the overrides, for injection into a scoped rule.
 *
 * Runs the values through validation again rather than trusting the caller — this
 * is the last point before the string becomes CSS, and it is cheap.
 */
export function themeOverridesToCss(overrides: BlancThemeOverrides): string {
  const safe = sanitizeThemeOverrides(overrides);
  const body = Object.entries(safe)
    .map(([token, value]) => `  --blanc-${token}: ${value};`)
    .join('\n');
  // Scoped to :root as well as .blanc-root, not just the latter. Custom
  // properties inherit downward only, and `body` — which blanc.css styles from
  // `--blanc-bg` — is a *parent* of `.blanc-root`, so a rule on `.blanc-root`
  // alone leaves the page background on its fallback while everything inside
  // changes colour. Verified: theming to Blood moved the panels but left the
  // body at the default grey until :root was included.
  return body ? `:root,\n.blanc-root {\n${body}\n}` : '';
}

export interface BlancThemeExport {
  version: 1;
  preset: string;
  overrides: BlancThemeOverrides;
}

export function exportTheme(preset: string, overrides: BlancThemeOverrides): BlancThemeExport {
  return { version: 1, preset, overrides: sanitizeThemeOverrides(overrides) };
}

/** Parse an exported theme. Returns null when it is not one. */
export function parseThemeExport(raw: string): BlancThemeExport | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Partial<BlancThemeExport>;
  if (obj.version !== 1) return null;
  const preset = typeof obj.preset === 'string' && obj.preset ? obj.preset : 'default';
  return { version: 1, preset, overrides: sanitizeThemeOverrides(obj.overrides) };
}

export function presetById(id: string): BlancThemePreset | undefined {
  return BLANC_THEME_PRESETS.find((p) => p.id === id);
}
