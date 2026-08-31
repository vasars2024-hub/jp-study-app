export const AERO_VIEWPORT_WIDTH = 1280;
export const AERO_VIEWPORT_HEIGHT = 960;

export type AeroDisplayMode = 'classic-4-3' | 'native';

export interface AeroViewportGeometry {
  mode: AeroDisplayMode;
  scale: number;
  renderedWidth: number;
  renderedHeight: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Resolve the physical frame geometry without touching DOM state. Classic mode
 * always preserves the 1280×960 logical desktop; Native Display consumes the
 * available stage exactly. Keeping this pure makes pointer/framing assumptions
 * independently verifiable at every Phase 5 M15 checkpoint resolution.
 */
export function resolveAeroViewportGeometry(
  stageWidth: number,
  stageHeight: number,
  nativeFill: boolean,
): AeroViewportGeometry {
  const width = Number.isFinite(stageWidth) && stageWidth > 0 ? stageWidth : AERO_VIEWPORT_WIDTH;
  const height = Number.isFinite(stageHeight) && stageHeight > 0 ? stageHeight : AERO_VIEWPORT_HEIGHT;

  if (nativeFill) {
    return {
      mode: 'native',
      scale: 1,
      renderedWidth: width,
      renderedHeight: height,
      offsetX: 0,
      offsetY: 0,
    };
  }

  const scale = Math.min(width / AERO_VIEWPORT_WIDTH, height / AERO_VIEWPORT_HEIGHT);
  const renderedWidth = AERO_VIEWPORT_WIDTH * scale;
  const renderedHeight = AERO_VIEWPORT_HEIGHT * scale;
  return {
    mode: 'classic-4-3',
    scale,
    renderedWidth,
    renderedHeight,
    offsetX: (width - renderedWidth) / 2,
    offsetY: (height - renderedHeight) / 2,
  };
}
