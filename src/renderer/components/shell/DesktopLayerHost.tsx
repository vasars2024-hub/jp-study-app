/**
 * DesktopLayerHost (Phase 2 · M16) — renders any registered shell extension
 * layers (shellExtensions.ts) over the wallpaper. Empty by default (renders
 * nothing) — it's the future-compat seam for particles/weather/overlays.
 */
import { useEffect, useReducer } from 'react';
import { getDesktopLayers, onDesktopLayersChanged } from '../../shellExtensions';

export default function DesktopLayerHost() {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onDesktopLayersChanged(force), []);

  const layers = getDesktopLayers();
  if (layers.length === 0) return null;

  return (
    <>
      {layers.map((l) => (
        <div key={l.id} className="os-desktop-layer" style={{ zIndex: l.z }}>
          {l.render()}
        </div>
      ))}
    </>
  );
}
