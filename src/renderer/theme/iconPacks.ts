/**
 * Frutiger Aero Platform — Icon-pack registry (Phase 5 · M7)
 * -----------------------------------------------------------------------------
 * `assetPacks.ts` has always resolved a theme's `assetPack.icons` id, but the
 * comment there said "Icons.tsx gains pack support in a later phase". This is
 * that phase.
 *
 * The contract is deliberately declarative rather than "a pack is a bag of React
 * components": a pack describes icons in ONE shared drawing language, so the set
 * is cohesive by construction instead of by discipline. `Icons.tsx` is the only
 * renderer.
 *
 * The language has two forms:
 *
 *   `tile`   — an application. A rounded glass plate in the family gradient with
 *              the base line glyph laid over it in white. Every app icon shares
 *              the same plate geometry, so a row of them reads as one system.
 *   `object` — a shell/system thing (folder, file, drive, notification, power).
 *              A free silhouette: filled `body`, optional `accent` shape, white
 *              `detail` strokes. These are objects, not apps, so they must not
 *              wear the app plate.
 *
 * A pack is PARTIAL. Any name it does not cover falls through to the base
 * line glyph in `Icons.tsx`, so adding an `IconName` can never break a pack.
 *
 * This module intentionally imports nothing but a type. `Icons.tsx` is on every
 * boot path including Blanc's, and pulling the sound engine / wallpaper
 * framework in behind it would undo the boot-budget work.
 */

import type { IconName } from '../components/Icons';

/** Palette slot for one icon family. Every colour is authored, none derived. */
export interface IconFamilyPalette {
  /** Top stop of the body gradient. */
  top: string;
  /** Bottom stop of the body gradient. */
  bottom: string;
  /** Outline. Must be dark enough to hold an edge on a bright wallpaper. */
  edge: string;
  /** Fill for `accent` shapes and for detail on very light bodies. */
  accent: string;
  /** Colour of the white-ish detail strokes. Defaults to #ffffff. */
  detail?: string;
}

/**
 * Silhouette class. This exists for accessibility, not decoration: status and
 * lifecycle icons must be distinguishable without colour, so every icon
 * declares the shape family it reads as, and the tests assert that icons which
 * differ only by colour never share one.
 */
export type GlyphShape =
  /** The application plate. Shared by every `tile`. */
  | 'plate'
  /** Containers and documents. */
  | 'folder'
  | 'sheet'
  | 'block'
  | 'bin'
  /** Round outlines. `disc` is solid, `ring` reads as an open loop. */
  | 'disc'
  | 'ring'
  | 'crescent'
  | 'cycle'
  | 'bubble'
  /** Angular outlines. */
  | 'octagon'
  | 'wedge'
  | 'shield'
  | 'door'
  | 'lock'
  | 'bar'
  | 'signal'
  | 'bell'
  /** Free marks. */
  | 'check'
  | 'star'
  | 'gem';

/** One icon, described in the shared drawing language. */
export interface LayeredGlyph {
  /** Key into the pack's `families` map. */
  family: string;
  /** `tile` for applications, `object` for shell/system things. */
  form: 'tile' | 'object';
  /** Filled silhouette on a 24×24 grid. Required for `object`. */
  body?: string;
  /** Second filled shape drawn over the body in the family accent. */
  accent?: string;
  /**
   * Silhouette the top-light sheen is painted into. Defaults to `body`. Set it
   * when the shape that faces the viewer is not the body — an open folder's
   * front flap, for instance, sits in front of its own back plate.
   */
  gloss?: string;
  /** Stroked detail drawn last, in the family detail colour. */
  detail?: string;
  /** Stroke width for `detail`. Defaults to 1.5 (`object`) / 1.9 (`tile`). */
  detailWidth?: number;
  /** Scale applied to the base line glyph inside a `tile`. Defaults to 0.62. */
  glyphScale?: number;
  /** Non-colour differentiation cue. See `GlyphShape`. */
  shape: GlyphShape;
}

export interface IconPack {
  id: string;
  label: string;
  /** Human-readable origin note, mirrored into the provenance doc. */
  provenance: string;
  families: Record<string, IconFamilyPalette>;
  glyphs: Partial<Record<IconName, LayeredGlyph>>;
}

const packs = new Map<string, IconPack>();

/** Idempotent by id — re-registering the same pack replaces it. */
export function registerIconPack(pack: IconPack): void {
  packs.set(pack.id, pack);
}

export function getIconPack(id: string): IconPack | undefined {
  return packs.get(id);
}

export function listIconPacks(): IconPack[] {
  return [...packs.values()];
}

/** Test seam. Not used by app code. */
export function clearIconPacks(): void {
  packs.clear();
  activeId = null;
}

let activeId: string | null = null;
const listeners = new Set<() => void>();

/**
 * Point the renderer at a pack. Called by `assetPacks.applyAssetPack` on every
 * theme change; an unknown or missing id means "base line glyphs".
 */
export function setActiveIconPack(id: string | null): void {
  const next = id && packs.has(id) ? id : null;
  if (next === activeId) return;
  activeId = next;
  for (const fn of listeners) fn();
}

export function getActiveIconPackId(): string | null {
  return activeId;
}

export function subscribeIconPack(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The active pack's glyph for `name`, or null to fall back to the line glyph. */
export function resolveGlyph(name: IconName): LayeredGlyph | null {
  if (!activeId) return null;
  return packs.get(activeId)?.glyphs[name] ?? null;
}

export function resolveFamily(pack: IconPack, family: string): IconFamilyPalette | null {
  return pack.families[family] ?? null;
}

/** The active pack, for the renderer to read palettes from. */
export function getActivePack(): IconPack | null {
  return activeId ? packs.get(activeId) ?? null : null;
}

/**
 * Below this size a `tile` renders as the plain line glyph instead. Window
 * chrome (15px) and inline toolbar affordances stay monochrome; the desktop
 * (24–36px), Start (18–24px) and taskbar (18px) get the real plate. Detail is
 * dropped at small sizes because it turns to mud, not to save work.
 *
 * `object` glyphs ignore this — a folder is still a folder at 12px, and the
 * whole point of the shell set is that it never degrades to a line drawing.
 */
export const TILE_MIN_SIZE = 17;

export interface ResolvedIcon {
  glyph: LayeredGlyph;
  family: IconFamilyPalette;
}

/**
 * The single decision "does this icon draw from the pack, and with what?".
 * Lives here rather than in the component so it can be tested without a DOM —
 * the size threshold and the fallback chain are the parts that actually break.
 *
 * Returns null to mean "render the base line glyph".
 */
export function resolveIcon(name: IconName, size: number, flat = false): ResolvedIcon | null {
  if (flat) return null;
  const pack = getActivePack();
  if (!pack) return null;
  const glyph = pack.glyphs[name];
  if (!glyph) return null;
  const family = pack.families[glyph.family];
  if (!family) return null;
  if (glyph.form === 'tile' && size < TILE_MIN_SIZE) return null;
  return { glyph, family };
}
