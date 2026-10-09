// Reader preferences shared by the book (and partly the manga) reader.
// Persisted to localStorage so they auto-save and apply to every book.

import { WK_HIGHLIGHT_CSS } from './wordHighlight';

export type ReaderTheme = 'light' | 'sepia' | 'cream' | 'gray' | 'dark' | 'black' | 'wired';
export type ReaderFont = 'default' | 'serif' | 'sans' | 'rounded';
/** Page-flip columns vs. one long scrolling page. */
export type ReaderFlow = 'paginated' | 'scrolled';
/** Text direction: respect the book, force横書き (L→R rows) or force縦書き (tategaki). */
export type ReaderWritingMode = 'auto' | 'horizontal' | 'vertical';

export interface ReaderSettings {
  /** Body font size, as a percentage (100 = publisher default). */
  fontSize: number;
  theme: ReaderTheme;
  font: ReaderFont;
  hideFurigana: boolean;

  // ---- Typography & appearance (ttu-reader style) ----
  /** 0 = leave the font's default weight; otherwise a CSS weight (300–700). */
  fontWeight: number;
  /** Line spacing multiplier (e.g. 1.8). */
  lineHeight: number;
  /** First-line indent of each paragraph, in em (0 = none). */
  paragraphIndent: number;
  /** Blank space on each side, as a % of width (0 = none). */
  sideMargin: number;
  /**
   * Max width of the text column in horizontal scrolled mode, in rem.
   * Independent of font size — raise this to keep lines long when zoomed in.
   */
  contentWidth: number;
  /** Stretch lines to both edges (justified) instead of a ragged edge. */
  justify: boolean;
  /** Fine letter-pair spacing (font-kerning). */
  kerning: boolean;
  /** Tighten spacing around Japanese punctuation (palt/vpal features). */
  vpal: boolean;
  /** Avoid leaving a lone word/character on a paragraph's last line. */
  prettyWrap: boolean;
  /** Force these settings to override the book's own styling. */
  prioritizeStyles: boolean;
  /**
   * Apply the book's own CSS — sanitised and scoped (`shared/epubPublisherCss`):
   * 縦中横, upright text, 傍点, ruby placement, alignment, image sizing.
   * Optional so settings saved before it existed (and hand-built ones) read as on.
   */
  publisherStyles?: boolean;

  // ---- Reading mode & layout ----
  /** Paginated (page flip) or one continuous scrolling page. */
  flow: ReaderFlow;
  /** Respect the book's direction, or force horizontal / vertical (縦書き). */
  writingMode: ReaderWritingMode;

  /** Tint words by how well you know them (LingQ-style; Japanese text). */
  wordHighlight: boolean;

  /**
   * When true, hyperlinks in EPUB text are active. Wikipedia links import as a
   * new library EPUB; other https links open externally. When false, link
   * clicks are ignored (safe for dense wiki dumps).
   */
  hyperlinksEnabled: boolean;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 100,
  theme: 'light',
  font: 'default',
  hideFurigana: false,
  fontWeight: 0,
  lineHeight: 1.8,
  paragraphIndent: 0,
  sideMargin: 0,
  contentWidth: 46,
  justify: false,
  kerning: false,
  vpal: false,
  prettyWrap: false,
  prioritizeStyles: false,
  publisherStyles: true,
  flow: 'paginated',
  writingMode: 'auto',
  wordHighlight: true,
  hyperlinksEnabled: true,
};

export const FONT_MIN = 70;
export const FONT_MAX = 400;

export const LINE_HEIGHT_MIN = 1.0;
export const LINE_HEIGHT_MAX = 2.6;
export const INDENT_MAX = 3;
export const MARGIN_MAX = 30;
export const CONTENT_WIDTH_MIN = 20;
export const CONTENT_WIDTH_MAX = 120;

const STORAGE_KEY = 'jp-reader-settings';

/** Fired when reader settings change (e.g. H shortcut). Detail is the full settings object. */
export const READER_SETTINGS_CHANGED = 'reader-settings-changed';

export function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: ReaderSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage full or unavailable — settings just won't persist */
  }
}

/** Toggle LingQ-style word highlighting. Returns the new on/off state. */
export function toggleWordHighlight(): boolean {
  const cur = loadSettings();
  const next = { ...cur, wordHighlight: !cur.wordHighlight };
  saveSettings(next);
  window.dispatchEvent(new CustomEvent(READER_SETTINGS_CHANGED, { detail: next }));
  return next.wordHighlight;
}

/** Subscribe to reader settings changes (keyboard shortcuts, other windows). */
export function onReaderSettingsChanged(cb: (s: ReaderSettings) => void): () => void {
  const h = (e: Event) => cb({ ...DEFAULT_SETTINGS, ...(e as CustomEvent<ReaderSettings>).detail });
  window.addEventListener(READER_SETTINGS_CHANGED, h);
  return () => window.removeEventListener(READER_SETTINGS_CHANGED, h);
}

export function clampFontSize(n: number): number {
  return Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(n)));
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
export function clampLineHeight(n: number): number {
  return Math.min(LINE_HEIGHT_MAX, Math.max(LINE_HEIGHT_MIN, round2(n)));
}
export function clampIndent(n: number): number {
  return Math.min(INDENT_MAX, Math.max(0, round2(n)));
}
export function clampMargin(n: number): number {
  return Math.min(MARGIN_MAX, Math.max(0, Math.round(n)));
}
export function clampContentWidth(n: number): number {
  return Math.min(CONTENT_WIDTH_MAX, Math.max(CONTENT_WIDTH_MIN, Math.round(n)));
}

export const THEMES: Record<ReaderTheme, { bg: string; fg: string; link: string }> = {
  light: { bg: '#fbf7ee', fg: '#1b1b1b', link: '#1c5fb0' },
  cream: { bg: '#fff9e8', fg: '#2a2620', link: '#b06a13' },
  sepia: { bg: '#f4ecd8', fg: '#5b4636', link: '#915b1f' },
  gray: { bg: '#cfd2d6', fg: '#1c1d20', link: '#1c5fb0' },
  dark: { bg: '#15151b', fg: '#d9d9e3', link: '#6c9bff' },
  black: { bg: '#000000', fg: '#cacace', link: '#6c9bff' },
  // WIRED PHOSPHOR (§5.11) — lets the page itself opt into the terminal look.
  wired: { bg: '#02070d', fg: '#d8fbff', link: '#6df1ff' },
};

const FONT_STACKS: Record<ReaderFont, string> = {
  default: '',
  serif: "'Yu Mincho', 'Hiragino Mincho ProN', 'Noto Serif JP', 'Songti SC', serif",
  sans: "'Yu Gothic', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif",
  rounded: "'Hiragino Maru Gothic ProN', 'Yu Gothic', 'Noto Sans JP', sans-serif",
};

/** CSS injected into each epub.js chapter document to apply the current settings. */
export function buildReaderCss(input: ReaderSettings): string {
  // Backfill any missing fields (e.g. settings saved before a field existed) so
  // we never emit `undefined` into the CSS or read a missing value.
  const s = { ...DEFAULT_SETTINGS, ...input };
  const t = THEMES[s.theme] ?? THEMES.light;
  const family = FONT_STACKS[s.font] ?? '';
  const imp = '!important';
  const lines: string[] = [];

  lines.push('html, body {');
  lines.push(`  background: ${t.bg} ${imp};`);
  lines.push(`  color: ${t.fg} ${imp};`);
  if (family) lines.push(`  font-family: ${family} ${imp};`);
  if (s.fontWeight) lines.push(`  font-weight: ${s.fontWeight} ${imp};`);
  lines.push(`  font-kerning: ${s.kerning ? 'normal' : 'none'} ${imp};`);
  if (s.vpal) lines.push(`  font-feature-settings: "palt" 1, "vpal" 1 ${imp};`);
  // Writing direction. 'auto' respects the book. Both the standard and the
  // -epub- prefixed property are set so it works in the epub.js iframe.
  if (s.writingMode === 'vertical') {
    lines.push(`  -epub-writing-mode: vertical-rl ${imp};`);
    lines.push(`  writing-mode: vertical-rl ${imp};`);
  } else if (s.writingMode === 'horizontal') {
    lines.push(`  -epub-writing-mode: horizontal-tb ${imp};`);
    lines.push(`  writing-mode: horizontal-tb ${imp};`);
  }
  lines.push('}');

  lines.push('body {');
  lines.push(`  line-height: ${s.lineHeight} ${imp};`);
  if (s.sideMargin > 0) {
    lines.push(`  padding-left: ${s.sideMargin}% ${imp};`);
    lines.push(`  padding-right: ${s.sideMargin}% ${imp};`);
  }
  if (s.prettyWrap) lines.push('  text-wrap: pretty;');
  lines.push('}');

  if (s.justify) lines.push(`body, p { text-align: justify ${imp}; }`);
  if (s.paragraphIndent > 0) lines.push(`p { text-indent: ${s.paragraphIndent}em ${imp}; }`);

  // "Prioritize reader styles": push the font onto every element so the book's
  // own per-element styling can't override the reader's choice.
  if (s.prioritizeStyles) {
    if (family) lines.push(`* { font-family: ${family} ${imp}; }`);
    if (s.fontWeight) lines.push(`* { font-weight: ${s.fontWeight} ${imp}; }`);
  }

  lines.push(`a, a:link, a:visited { color: ${t.link} ${imp}; }`);
  lines.push(`img { background: transparent ${imp}; }`);
  // Furigana lives in <rt> inside <ruby>. revert = show as the book intends.
  lines.push(`rt { display: ${s.hideFurigana ? 'none' : 'revert'} ${imp}; }`);
  lines.push(WK_HIGHLIGHT_CSS);

  return lines.join('\n');
}

/**
 * Typography CSS for the custom (ttu-style) reader, scoped to `.novel-content`.
 * Colours/writing-mode/scroll are handled by the reader component itself; this
 * only covers the shared text appearance so both readers stay consistent.
 */
export function buildNovelCss(input: ReaderSettings): string {
  const s = { ...DEFAULT_SETTINGS, ...input };
  const family = FONT_STACKS[s.font] ?? '';
  const c = '.novel-content';
  const lines: string[] = [];

  lines.push(`${c} {`);
  lines.push(`  line-height: ${s.lineHeight};`);
  if (family) lines.push(`  font-family: ${family};`);
  if (s.fontWeight) lines.push(`  font-weight: ${s.fontWeight};`);
  lines.push(`  font-kerning: ${s.kerning ? 'normal' : 'none'};`);
  if (s.vpal) lines.push('  font-feature-settings: "palt" 1, "vpal" 1;');
  if (s.prettyWrap) lines.push('  text-wrap: pretty;');
  if (s.justify) lines.push('  text-align: justify;');
  lines.push('}');

  if (s.paragraphIndent > 0) lines.push(`${c} p { text-indent: ${s.paragraphIndent}em; }`);
  if (s.prioritizeStyles && family) lines.push(`${c} * { font-family: ${family} !important; }`);
  if (s.prioritizeStyles && s.fontWeight) {
    lines.push(`${c} * { font-weight: ${s.fontWeight} !important; }`);
  }
  lines.push(`${c} rt { display: ${s.hideFurigana ? 'none' : 'revert'}; }`);
  lines.push(`${c} img, ${c} image, ${c} svg { max-width: 100%; height: auto; }`);

  return lines.join('\n');
}
