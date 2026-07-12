// App-wide UI zoom, for accessibility.
//
// CSS `zoom` scales paint without changing how % sizes resolve against the
// parent the way people expect. Applying zoom alone on a 100%×100% box leaves
// empty void (zoom-out) or clips the taskbar (zoom-in).
//
// Correct approach: size #root to (100/zoom) × viewport, then set zoom so the
// *painted* box always equals the Electron window. No document scrollbars.
// App panes (settings, floating windows) keep their own overflow-y: auto.

const KEY = 'jp-app-zoom';

export const ZOOM_MIN = 0.8;
export const ZOOM_MAX = 2.0;
export const ZOOM_STEP = 0.1;
export const ZOOM_DEFAULT = 1;

const EVENT = 'app-zoom-changed';

export function clampZoom(n: number): number {
  if (!Number.isFinite(n)) return ZOOM_DEFAULT;
  const snapped = Math.round(n * 20) / 20; // snap to the nearest 0.05
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, snapped));
}

export function loadZoom(): number {
  try {
    const raw = localStorage.getItem(KEY);
    return raw == null ? ZOOM_DEFAULT : clampZoom(Number(raw));
  } catch {
    return ZOOM_DEFAULT;
  }
}

/**
 * Effective zoom factor for coordinate conversion (clientX → layout).
 * Prefer the CSS variable so callers work even mid-transition.
 */
export function getZoomFactor(): number {
  try {
    const fromVar = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--app-zoom').trim(),
    );
    if (Number.isFinite(fromVar) && fromVar > 0.05) return fromVar;
  } catch {
    /* ignore */
  }
  try {
    const root = document.getElementById('root');
    if (root) {
      const z = parseFloat(
        (getComputedStyle(root) as CSSStyleDeclaration & { zoom?: string }).zoom || '',
      );
      if (Number.isFinite(z) && z > 0.05) return z;
    }
  } catch {
    /* ignore */
  }
  return ZOOM_DEFAULT;
}

/**
 * Size #root so layout × zoom fills the real window.
 * Uses vw/vh (not %) — % of a parent that also has overflow/zoom is unreliable.
 */
function layoutRoot(root: HTMLElement, z: number): void {
  const rs = root.style as CSSStyleDeclaration & { zoom?: string };
  const w = `${100 / z}vw`;
  const h = `${100 / z}vh`;

  rs.zoom = String(z);
  root.style.boxSizing = 'border-box';
  root.style.position = 'relative';
  root.style.margin = '0';
  root.style.padding = '0';
  // Critical: layout box grows when zoom < 1 and shrinks when zoom > 1,
  // so painted size is always exactly one viewport.
  root.style.width = w;
  root.style.height = h;
  root.style.minWidth = w;
  root.style.minHeight = h;
  root.style.maxWidth = w;
  root.style.maxHeight = h;
  // Never put document-level scrollbars on the OS shell; they leak into chrome.
  root.style.overflow = 'hidden';
}

/** Apply a zoom factor to the whole app without persisting it. */
export function applyZoom(factor: number): void {
  const z = clampZoom(factor);
  const html = document.documentElement;
  const body = document.body;
  const root = document.getElementById('root');

  html.style.setProperty('--app-zoom', String(z));
  // Never zoom <html> — that clips fixed chrome / mis-sizes the shell.
  html.style.removeProperty('zoom');
  (html.style as CSSStyleDeclaration & { zoom?: string }).zoom = '';

  html.style.overflow = 'hidden';
  html.style.width = '100%';
  html.style.height = '100%';
  if (body) {
    body.style.overflow = 'hidden';
    body.style.width = '100%';
    body.style.height = '100%';
    body.style.margin = '0';
  }

  if (root) {
    layoutRoot(root, z);
  } else {
    (html.style as CSSStyleDeclaration & { zoom?: string }).zoom = String(z);
  }
}

/** Set, persist, apply, and broadcast a new zoom factor. Returns the clamped value. */
export function setZoom(factor: number): number {
  const z = clampZoom(factor);
  try {
    localStorage.setItem(KEY, String(z));
  } catch {
    /* storage unavailable — zoom just won't persist */
  }
  applyZoom(z);
  window.dispatchEvent(new CustomEvent<number>(EVENT, { detail: z }));
  return z;
}

export function getZoom(): number {
  return loadZoom();
}

export function bumpZoom(delta: number): number {
  return setZoom(loadZoom() + delta);
}

/** Subscribe to zoom changes (e.g. to keep a slider in sync). Returns an unsubscribe fn. */
export function onZoomChanged(cb: (z: number) => void): () => void {
  const handler = (e: Event): void => cb((e as CustomEvent<number>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

let resizeHooked = false;

/** Keep compensated size correct if the Electron window is resized. */
export function installZoomResizeHook(): void {
  if (resizeHooked || typeof window === 'undefined') return;
  resizeHooked = true;
  window.addEventListener('resize', () => {
    applyZoom(loadZoom());
  });
}
