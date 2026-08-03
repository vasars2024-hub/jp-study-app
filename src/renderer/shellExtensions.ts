/**
 * Shell extension points (Phase 2 · M16) — typed, no-op seams so LATER phases
 * (living wallpapers, particles, weather, companions, desktop pets, outside-app
 * overlays and Anime Edition) can plug into the desktop shell without
 * changing it. NOTHING is implemented here — only the contract + registry.
 *
 * The `DesktopLayer` registry lets a future system mount a full-bleed layer over
 * the wallpaper (below windows). It is rendered by <DesktopLayerHost/> (mounted
 * in DesktopShell); with no registered layers it renders nothing.
 *
 * Note: some seams already exist in the codebase and should be reused rather than
 * duplicated — the living-wallpaper rotation (environment/WallpaperStage +
 * EnvironmentStack), companion toasts (environment/BuddyToast), and the
 * transparent desktop-pet window (environment/CompanionHostView). This module is
 * the seam for the effects that don't have one yet (particles/weather/overlays).
 */
import type { ReactNode } from 'react';

/** A full-bleed desktop layer (above wallpaper, below windows). */
export interface DesktopLayer {
  id: string;
  /** Paint order; higher sits nearer the windows. Default 0. */
  z?: number;
  render: () => ReactNode;
}

/**
 * Documented future extension kinds (declared for reference; not consumed yet).
 * A later phase implements a system of one of these kinds and registers a
 * DesktopLayer (or reuses an existing seam) for it.
 */
export type ExtensionKind =
  | 'living-wallpaper'
  | 'particles'
  | 'weather'
  | 'companion'
  | 'desktop-pet'
  | 'overlay-window'
  | 'anime-edition';

const layers = new Map<string, DesktopLayer>();
const EVENT = 'shell:layers-changed';

function emit(): void {
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Register a desktop layer. Returns an unregister function. */
export function registerDesktopLayer(layer: DesktopLayer): () => void {
  layers.set(layer.id, layer);
  emit();
  return () => {
    layers.delete(layer.id);
    emit();
  };
}

/** All registered layers, sorted by paint order. */
export function getDesktopLayers(): DesktopLayer[] {
  return [...layers.values()].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
}

export function onDesktopLayersChanged(cb: () => void): () => void {
  const h = (): void => cb();
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
