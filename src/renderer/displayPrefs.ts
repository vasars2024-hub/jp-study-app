import { setWindowChromeMode, type WindowChromeMode, parseWindowChromeMode } from './windowChrome';

export type ContrastId = 'normal' | 'medium' | 'high';
export type LetterSpacingId = 'tight' | 'normal' | 'loose';
export type TransparencyId = 'full' | 'reduced' | 'off';
export type FocusRingId = 'off' | 'normal' | 'strong';
export type ScrollbarModeId = 'auto' | 'always' | 'hidden';
export type PointerSizeId = 'normal' | 'large';
export type AnimationLevelId = 'full' | 'reduced' | 'none';
export type ColorFilterId = 'none' | 'warm' | 'cool' | 'grayscale' | 'high-contrast';

export interface DisplayPrefs {
  /** Base root font size in px (before app zoom). */
  baseFontPx: number;
  /** Bold UI text. */
  boldText: boolean;
  contrast: ContrastId;
  letterSpacing: LetterSpacingId;
  /** 0–1 warm night-light filter. */
  nightLight: number;
  /** 0.65–1.15 overall brightness multiplier. */
  brightness: number;
  /** 0–1.5 color saturation. */
  saturation: number;
  transparency: TransparencyId;
  focusRing: FocusRingId;
  scrollbarMode: ScrollbarModeId;
  smoothScroll: boolean;
  pointerSize: PointerSizeId;
  animationLevel: AnimationLevelId;
  colorFilter: ColorFilterId;
  /** Soften harsh flashes / celebrate sparkles. */
  reduceFlashes: boolean;
  /** Stronger outline on focused controls. */
  underlineLinks: boolean;
  /** Native window chrome: standard OS bar, in-app bar, or fully frameless. */
  windowChromeMode: WindowChromeMode;
}

const KEY = 'jp-os-display-prefs-v1';
const EVENT = 'jp-os-display-prefs-changed';
const MOTION_KEY = 'jp-os-reduce-motion';

const DEFAULTS: DisplayPrefs = {
  baseFontPx: 14,
  boldText: false,
  contrast: 'normal',
  letterSpacing: 'normal',
  nightLight: 0,
  brightness: 1,
  saturation: 1,
  transparency: 'full',
  focusRing: 'normal',
  scrollbarMode: 'auto',
  smoothScroll: true,
  pointerSize: 'normal',
  animationLevel: 'full',
  colorFilter: 'none',
  reduceFlashes: false,
  underlineLinks: false,
  windowChromeMode: 'standard',
};

function clamp(n: number, a: number, b: number): number {
  if (!Number.isFinite(n)) return a;
  return Math.min(b, Math.max(a, n));
}

export function loadDisplayPrefs(): DisplayPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<DisplayPrefs> & { borderless?: boolean };
      return normalize({ ...DEFAULTS, ...p, windowChromeMode: chromeFromStored(p) });
    }
  } catch {
    /* ignore */
  }
  // Mirror legacy reduce-motion flag into animationLevel on first load.
  try {
    if (localStorage.getItem(MOTION_KEY) === '1') {
      return { ...DEFAULTS, animationLevel: 'reduced' };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

function chromeFromStored(p: Partial<DisplayPrefs> & { borderless?: boolean }): WindowChromeMode {
  if (p.windowChromeMode) return parseWindowChromeMode(p.windowChromeMode);
  if (p.borderless === true) return 'borderless';
  return 'standard';
}

function normalize(s: DisplayPrefs): DisplayPrefs {
  const contrast =
    s.contrast === 'medium' || s.contrast === 'high' ? s.contrast : 'normal';
  const letterSpacing =
    s.letterSpacing === 'tight' || s.letterSpacing === 'loose' ? s.letterSpacing : 'normal';
  const transparency =
    s.transparency === 'reduced' || s.transparency === 'off' ? s.transparency : 'full';
  const focusRing =
    s.focusRing === 'off' || s.focusRing === 'strong' ? s.focusRing : 'normal';
  const scrollbarMode =
    s.scrollbarMode === 'always' || s.scrollbarMode === 'hidden' ? s.scrollbarMode : 'auto';
  const pointerSize = s.pointerSize === 'large' ? 'large' : 'normal';
  const animationLevel =
    s.animationLevel === 'reduced' || s.animationLevel === 'none' ? s.animationLevel : 'full';
  const colorFilter =
    s.colorFilter === 'warm' ||
    s.colorFilter === 'cool' ||
    s.colorFilter === 'grayscale' ||
    s.colorFilter === 'high-contrast'
      ? s.colorFilter
      : 'none';
  return {
    baseFontPx: clamp(Math.round(s.baseFontPx), 12, 20),
    boldText: s.boldText === true,
    contrast,
    letterSpacing,
    nightLight: clamp(s.nightLight, 0, 1),
    brightness: clamp(s.brightness, 0.65, 1.2),
    saturation: clamp(s.saturation, 0, 1.6),
    transparency,
    focusRing,
    scrollbarMode,
    smoothScroll: s.smoothScroll !== false,
    pointerSize,
    animationLevel,
    colorFilter,
    reduceFlashes: s.reduceFlashes === true,
    underlineLinks: s.underlineLinks === true,
    windowChromeMode: parseWindowChromeMode(s.windowChromeMode),
  };
}

export function applyDisplayPrefs(s: DisplayPrefs): void {
  const root = document.documentElement;
  const st = root.style;
  const n = normalize(s);

  st.setProperty('--display-font-px', `${n.baseFontPx}px`);
  st.setProperty('--display-letter-spacing', letterSpacingCss(n.letterSpacing));
  st.setProperty('--display-font-weight', n.boldText ? '600' : '400');
  st.setProperty('--display-night-light', String(n.nightLight));
  st.setProperty('--display-brightness', String(n.brightness));
  st.setProperty('--display-saturation', String(n.saturation));
  st.setProperty('--display-focus-width', focusWidth(n.focusRing));
  st.setProperty('--display-focus-alpha', focusAlpha(n.focusRing));
  st.setProperty('--display-pointer-scale', n.pointerSize === 'large' ? '1.25' : '1');
  st.setProperty('--display-hit-pad', n.pointerSize === 'large' ? '4px' : '0px');

  // Screen filters: brightness, sat, optional night light / color blindness aids
  const filters: string[] = [];
  if (Math.abs(n.brightness - 1) > 0.01) filters.push(`brightness(${n.brightness})`);
  if (Math.abs(n.saturation - 1) > 0.01) filters.push(`saturate(${n.saturation})`);
  if (n.nightLight > 0.01) {
    // Warm amber wash via sepia + hue (readable at low strength)
    filters.push(`sepia(${(n.nightLight * 0.45).toFixed(3)})`);
    filters.push(`hue-rotate(-${(n.nightLight * 18).toFixed(1)}deg)`);
  }
  if (n.colorFilter === 'warm') filters.push('sepia(0.25) hue-rotate(-12deg)');
  if (n.colorFilter === 'cool') filters.push('hue-rotate(12deg) saturate(1.05)');
  if (n.colorFilter === 'grayscale') filters.push('grayscale(1)');
  if (n.colorFilter === 'high-contrast') filters.push('contrast(1.18) saturate(1.08)');
  // Apply screen filter only when needed — always-on filter on #root tanks FPS.
  const rootEl = document.getElementById('root') as HTMLElement | null;
  const filterCss = filters.length ? filters.join(' ') : '';
  st.setProperty('--display-filter', filterCss || 'none');
  if (rootEl) {
    if (filterCss) rootEl.style.filter = filterCss;
    else rootEl.style.removeProperty('filter');
  }

  root.dataset.displayContrast = n.contrast;
  root.dataset.displayTransparency = n.transparency;
  root.dataset.displayFocus = n.focusRing;
  root.dataset.displayScroll = n.scrollbarMode;
  root.dataset.displayPointer = n.pointerSize;
  root.dataset.displayAnim = n.animationLevel;
  root.dataset.displayFlashes = n.reduceFlashes ? '1' : '0';
  root.dataset.displayLinks = n.underlineLinks ? '1' : '0';
  root.dataset.displayBold = n.boldText ? '1' : '0';

  // Keep legacy reduce-motion class in sync for existing CSS.
  const reduce = n.animationLevel === 'reduced' || n.animationLevel === 'none';
  root.classList.toggle('reduce-motion', reduce);
  try {
    localStorage.setItem(MOTION_KEY, reduce ? '1' : '0');
  } catch {
    /* ignore */
  }

  // Smooth scroll on the scrolling document / panes
  root.style.setProperty('scroll-behavior', n.smoothScroll && !reduce ? 'smooth' : 'auto');
}

function letterSpacingCss(id: LetterSpacingId): string {
  if (id === 'tight') return '-0.02em';
  if (id === 'loose') return '0.04em';
  return '0';
}

function focusWidth(id: FocusRingId): string {
  if (id === 'off') return '0px';
  if (id === 'strong') return '3px';
  return '2px';
}

function focusAlpha(id: FocusRingId): string {
  if (id === 'off') return '0';
  if (id === 'strong') return '0.95';
  return '0.75';
}

export function saveDisplayPrefs(partial: Partial<DisplayPrefs>): DisplayPrefs {
  const prev = loadDisplayPrefs();
  const next = normalize({ ...prev, ...partial });
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  applyDisplayPrefs(next);
  if (prev.windowChromeMode !== next.windowChromeMode) {
    void setWindowChromeMode(next.windowChromeMode);
  }
  window.dispatchEvent(new CustomEvent<DisplayPrefs>(EVENT, { detail: next }));
  return next;
}

/**
 * Reduce-motion, as a first-class preference rather than a raw key.
 *
 * `jp-os-reduce-motion` is a *mirror* of `animationLevel`, written by
 * `applyDisplayPrefs`. Three other modules used to set it directly, which left the
 * mirror and the preference it mirrors disagreeing until the next `applyDisplayPrefs`
 * overwrote whatever they wrote. Going through here keeps both in step.
 */
export function getReduceMotion(): boolean {
  const level = loadDisplayPrefs().animationLevel;
  return level === 'reduced' || level === 'none';
}

export function setReduceMotion(on: boolean): void {
  saveDisplayPrefs({ animationLevel: on ? 'reduced' : 'full' });
}

export function bootDisplayPrefs(): void {
  applyDisplayPrefs(loadDisplayPrefs());
}

export function onDisplayPrefsChanged(cb: (s: DisplayPrefs) => void): () => void {
  const h = (e: Event): void => cb((e as CustomEvent<DisplayPrefs>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

export function resetDisplayPrefs(): DisplayPrefs {
  const prev = loadDisplayPrefs();
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  const next = { ...DEFAULTS };
  applyDisplayPrefs(next);
  if (prev.windowChromeMode !== next.windowChromeMode) {
    void setWindowChromeMode(next.windowChromeMode);
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent<DisplayPrefs>(EVENT, { detail: next }));
  return next;
}
