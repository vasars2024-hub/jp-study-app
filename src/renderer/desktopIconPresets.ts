/**
 * v1.0 audit item 4.1 — the "Recommended" section in icon settings.
 *
 * A preset is a *whole* desktop icon arrangement: which apps are on the desktop
 * and where each one sits. Arrangement-only presets were considered and rejected
 * — `defaultIcons()` returns `[]` and apps are pinned from Start, so a fresh
 * desktop has nothing to arrange and all five buttons would be visible no-ops.
 *
 * Following the `widgets/registry.tsx` pattern, each entry stores an i18n KEY and
 * is resolved with `t()` at render time; a module-level array cannot call
 * `useT()` at declaration time.
 */

import type { DesktopWinSection } from '../shared/desktop';
import { snapClamp, type SnapGridId } from './desktopPrefs';

export type IconPresetId = 'study' | 'immersion' | 'media' | 'everything' | 'minimal';

export interface IconPreset {
  id: IconPresetId;
  labelKey: string;
  descKey: string;
  /** Placement order — column-major, filling each column top to bottom. */
  sections: DesktopWinSection[];
  /** Preferred column count. The layout widens past this rather than drop an icon. */
  columns: number;
}

/**
 * Five configurations. Sections are ids only: an id the running app does not
 * offer is skipped by the caller rather than placed as a dead icon, so this list
 * can never pin something the Start catalog has dropped.
 */
export const ICON_PRESETS: IconPreset[] = [
  {
    id: 'study',
    labelKey: 'settings.desktop.preset.study',
    descKey: 'settings.desktop.preset.study.desc',
    sections: ['dictionary', 'grammar', 'flashcards', 'anki', 'reading', 'files', 'stats', 'settings'],
    columns: 2,
  },
  {
    id: 'immersion',
    labelKey: 'settings.desktop.preset.immersion',
    descKey: 'settings.desktop.preset.immersion.desc',
    sections: ['immersion', 'library', 'novels', 'reading', 'dictionary', 'scraper'],
    columns: 2,
  },
  {
    id: 'media',
    labelKey: 'settings.desktop.preset.media',
    descKey: 'settings.desktop.preset.media.desc',
    // No 'video': it is the same Media Center as 'player' ("Watch") on another tab,
    // and Start no longer offers it either (DesktopShell START_HIDDEN_SECTIONS).
    sections: ['player', 'youtube', 'music', 'scraper', 'library'],
    columns: 2,
  },
  {
    id: 'everything',
    labelKey: 'settings.desktop.preset.everything',
    descKey: 'settings.desktop.preset.everything.desc',
    sections: [
      'player', 'youtube', 'music', 'dictionary', 'immersion', 'scraper',
      'library', 'novels', 'reading', 'translate', 'grammar', 'files', 'anki',
      'flashcards', 'games', 'stats', 'calendar', 'resources', 'settings', 'city',
    ],
    columns: 3,
  },
  {
    id: 'minimal',
    labelKey: 'settings.desktop.preset.minimal',
    descKey: 'settings.desktop.preset.minimal.desc',
    sections: ['dictionary', 'reading', 'settings'],
    columns: 1,
  },
];

export function getIconPreset(id: string | undefined | null): IconPreset | null {
  if (!id) return null;
  return ICON_PRESETS.find((p) => p.id === id) ?? null;
}

export interface IconPresetLayoutOpts {
  /** Desktop bounds in layout coords (already excludes the taskbar). */
  boundW: number;
  boundH: number;
  /** Icon box from `ICON_METRICS`, so the arrangement follows the icon-size setting. */
  iconW: number;
  iconH: number;
  grid: SnapGridId;
  /** Preferred columns; ignored when the icons cannot fit in that many. */
  columns: number;
  margin?: number;
}

/**
 * Column-major positions for `count` icons.
 *
 * The preset's `columns` sets the shape — `rows = ceil(count / columns)`, so
 * "2 columns" of 8 icons is 4+4 and not 7+1. The height that is actually
 * available then caps `rows`, and columns grow past the preference rather than
 * place an icon below the desktop. Every position still goes through
 * `snapClamp`, so the snap grid and the bounds have the last word.
 */
export function iconPresetPositions(count: number, opts: IconPresetLayoutOpts): { x: number; y: number }[] {
  const margin = opts.margin ?? 16;
  const iconW = Math.max(1, opts.iconW);
  const iconH = Math.max(1, opts.iconH);
  const maxRows = Math.max(1, Math.floor((opts.boundH - margin * 2) / iconH));
  const cols = Math.max(1, Math.floor(opts.columns) || 1);
  const rows = Math.max(1, Math.min(maxRows, Math.ceil(count / cols)));
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const raw = { x: margin + Math.floor(i / rows) * iconW, y: margin + (i % rows) * iconH };
    out.push(snapClamp(raw.x, raw.y, iconW, iconH, opts.boundW, opts.boundH, opts.grid, margin));
  }
  return out;
}
