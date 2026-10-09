/**
 * Theme sheets on demand (perf2).
 *
 * Every Aero and WIRED sheet used to be a static import in `main.tsx`, so every
 * Study OS window parsed ~600 KB of material CSS whose rules are scoped to a
 * `data-materials` value it did not have. They now load per active material:
 * the saved theme's sheets before the first React render, the other set only
 * when the user switches to it (or a cross-theme surface asks for one sheet).
 *
 * Cascade order is the hard part, and it is preserved by construction rather
 * than by analysis. `main.tsx` imported, in this order:
 *
 *   tokens … multiMonitor   (static, still in the entry bundle)
 *   aero-shell, aero-vista, aero-mechanics, wired-shell, wired-motion,
 *   wired-widgets, aero-apps, wired-apps, wired-navi, wired-mechanics,
 *   blanc, weather, atmosphere, flatten
 *
 * Everything from aero-shell onwards now lives in ONE ordered slot appended to
 * <head> right after the entry's static sheets, and before any sheet a lazily
 * imported component appends later. The always-on tail (blanc … flatten) is
 * loaded into the same slot at boot, so it still follows every material sheet:
 * flatten.css in particular out-orders aero-shell at equal specificity in a
 * handful of places (`.mini-frame`, `.palette`, `.os-toast`, `.fwin.focused`),
 * and moving it ahead of them would have been a visible regression under
 * `data-lq-flat`. The palette sheets (`frutiger-aero.css`, `wired-archive.css`)
 * stay static: they are small, carry the boot overlays, and keep the first
 * frame of a saved secret theme in its own colours.
 *
 * Loaded as `?inline` strings so the slot controls placement; Vite's own lazy
 * CSS links always append at the end of <head>, which would let a material
 * sheet overtake flatten.css.
 */

import { getTheme, onThemeChanged, loadThemeId } from './engine';

export type ThemeSheetId =
  | 'aero-shell'
  | 'aero-vista'
  | 'aero-mechanics'
  | 'wired-shell'
  | 'wired-motion'
  | 'wired-widgets'
  | 'aero-apps'
  | 'wired-apps'
  | 'wired-navi'
  | 'wired-mechanics'
  | 'blanc'
  | 'weather'
  | 'atmosphere'
  | 'flatten';

/** `main.tsx`'s historical import order — the cascade the slot reproduces. */
export const THEME_SHEET_ORDER: readonly ThemeSheetId[] = [
  'aero-shell',
  'aero-vista',
  'aero-mechanics',
  'wired-shell',
  'wired-motion',
  'wired-widgets',
  'aero-apps',
  'wired-apps',
  'wired-navi',
  'wired-mechanics',
  'blanc',
  'weather',
  'atmosphere',
  'flatten',
];

/** The sheets each `materialSet` (theme/engine.ts) needs while it is active. */
export const MATERIAL_SHEETS: Readonly<Record<string, readonly ThemeSheetId[]>> = {
  aero: ['aero-shell', 'aero-vista', 'aero-mechanics', 'aero-apps'],
  wired: ['wired-shell', 'wired-motion', 'wired-widgets', 'wired-apps', 'wired-navi', 'wired-mechanics'],
};

/** Needed in every Study OS window, whatever the theme. */
export const ALWAYS_SHEETS: readonly ThemeSheetId[] = ['blanc', 'weather', 'atmosphere', 'flatten'];

type SheetModule = { default: string };

/* eslint-disable import/no-unresolved -- Vite query suffixes (`?inline`): the
   node resolver eslint-plugin-import uses cannot see past them, the bundler can. */
const LOADERS: Record<ThemeSheetId, () => Promise<SheetModule>> = {
  'aero-shell': () => import('./aero-shell.css?inline'),
  'aero-vista': () => import('./aero-vista.css?inline'),
  'aero-mechanics': () => import('./aero-mechanics.css?inline'),
  'wired-shell': () => import('./wired-shell.css?inline'),
  'wired-motion': () => import('./wired-motion.css?inline'),
  'wired-widgets': () => import('./wired-widgets.css?inline'),
  'aero-apps': () => import('./aero-apps.css?inline'),
  'wired-apps': () => import('./wired-apps.css?inline'),
  'wired-navi': () => import('./wired-navi.css?inline'),
  'wired-mechanics': () => import('./wired-mechanics.css?inline'),
  blanc: () => import('./blanc.css?inline'),
  weather: () => import('../environment/weather.css?inline'),
  atmosphere: () => import('../environment/atmosphere.css?inline'),
  flatten: () => import('./flatten.css?inline'),
};
/* eslint-enable import/no-unresolved */

const ATTR = 'data-theme-sheet';
const pending = new Map<ThemeSheetId, Promise<void>>();
const modules = new Map<ThemeSheetId, Promise<SheetModule>>();
let slotEnd: Comment | null = null;
let installed = false;

/**
 * The slot's end marker. Created on first use, appended to <head> — which at
 * that moment ends with the entry's static sheets — so every later lazily
 * appended component sheet lands after it.
 */
function slot(): Comment | null {
  if (typeof document === 'undefined') return null;
  if (slotEnd?.isConnected) return slotEnd;
  const start = document.createComment('theme-sheets');
  slotEnd = document.createComment('/theme-sheets');
  document.head.append(start, slotEnd);
  return slotEnd;
}

function insertInOrder(id: ThemeSheetId, css: string): void {
  const end = slot();
  if (!end || document.head.querySelector(`style[${ATTR}="${id}"]`)) return;
  const style = document.createElement('style');
  style.setAttribute(ATTR, id);
  style.textContent = css;
  const rank = THEME_SHEET_ORDER.indexOf(id);
  // Before the first already-loaded sheet that ranks after this one, else at
  // the end of the slot. The slot therefore always reads in THEME_SHEET_ORDER.
  let before: Node = end;
  for (const node of Array.from(document.head.querySelectorAll<HTMLStyleElement>(`style[${ATTR}]`))) {
    const other = THEME_SHEET_ORDER.indexOf(node.getAttribute(ATTR) as ThemeSheetId);
    if (other > rank) {
      before = node;
      break;
    }
  }
  end.parentNode?.insertBefore(style, before);
}

function fetchSheet(id: ThemeSheetId): Promise<SheetModule> {
  let mod = modules.get(id);
  if (!mod) {
    mod = LOADERS[id]();
    // A failed chunk must not poison the cache: the next ask retries.
    mod.catch(() => modules.delete(id));
    modules.set(id, mod);
  }
  return mod;
}

/** Load (once) and apply the given sheets in cascade order. */
export function ensureThemeSheets(ids: readonly ThemeSheetId[]): Promise<void> {
  return Promise.all(
    ids.map((id) => {
      let job = pending.get(id);
      if (!job) {
        job = fetchSheet(id)
          .then((mod) => insertInOrder(id, mod.default ?? ''))
          .catch((err: unknown) => {
            pending.delete(id);
            console.warn(`[theme-sheets] ${id} failed to load:`, err instanceof Error ? err.message : err);
          });
        pending.set(id, job);
      }
      return job;
    }),
  ).then(() => undefined);
}

/**
 * Fetch without applying, so a later switch resolves in a microtask — before
 * the next paint — instead of showing one frame of an unstyled secret shell.
 */
export function prefetchThemeSheets(ids: readonly ThemeSheetId[]): void {
  for (const id of ids) void fetchSheet(id).catch(() => undefined);
}

export function sheetsForTheme(themeId: string): readonly ThemeSheetId[] {
  const set = getTheme(themeId)?.materialSet;
  return (set && MATERIAL_SHEETS[set]) || [];
}

/** True once the sheet's <style> is in the document (tests, diagnostics). */
export function isThemeSheetApplied(id: ThemeSheetId): boolean {
  return typeof document !== 'undefined' && !!document.head.querySelector(`style[${ATTR}="${id}"]`);
}

/**
 * Boot: the always-on tail plus the saved theme's material set, then follow
 * theme switches. Resolves when the first set is in (or after `timeoutMs`, so
 * a missing chunk can never hold the first render hostage).
 *
 * `materials: false` is the Blanc case: that window strips `data-materials`
 * and must never take a secret pack's unscoped rules either.
 */
export function bootThemeSheets(opts: { materials?: boolean; timeoutMs?: number } = {}): Promise<void> {
  const materials = opts.materials !== false;
  if (!installed) {
    installed = true;
    slot();
    if (materials) {
      onThemeChanged((id) => {
        void ensureThemeSheets(sheetsForTheme(id));
      });
    }
  }
  const timeoutMs = opts.timeoutMs ?? 2500;
  const first = ensureThemeSheets([...(materials ? sheetsForTheme(loadThemeId()) : []), ...ALWAYS_SHEETS]);
  return Promise.race([
    first,
    new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
  ]);
}
