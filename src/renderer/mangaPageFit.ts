/**
 * Cubari-style page-fit math for the manga reader.
 *
 * Percent sizing on a shrink-wrapped wrap never constrains the image (circular
 * layout). Fit uses the stage's pixel box at zoom=1; zoom is applied separately
 * via CSS `zoom` on the wrap so +/- actually scales the page.
 */

import type { CSSProperties } from 'react';
import type { PageFitMode } from './mangaReaderSettings';

export interface MangaPageFitStyles {
  wrap: CSSProperties;
  img: CSSProperties;
}

function clampZoom(zoom: number): number {
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

function clampMaxWidth(pct: number): number {
  return Math.min(100, Math.max(10, Number.isFinite(pct) ? pct : 100));
}

const wrapBase: CSSProperties = {
  display: 'inline-block',
  lineHeight: 0,
  position: 'relative',
  flexShrink: 0,
  boxSizing: 'border-box',
  // Override any stylesheet max-width so zoom/stretch can grow past the stage.
  maxWidth: 'none',
};

/**
 * Compute wrap + img styles for one page.
 * `zoom` scales the fitted page (CSS `zoom` — Chromium/Electron layout-aware).
 * Fit caps are always computed at 1× against the stage box.
 */
export function mangaPageFitStyles(
  fit: PageFitMode,
  zoom: number,
  maxWidthPct: number,
  stageWidth: number,
  stageHeight: number,
): MangaPageFitStyles {
  const z = clampZoom(zoom);
  const maxWPct = clampMaxWidth(maxWidthPct);
  const w = Math.max(0, stageWidth);
  const h = Math.max(0, stageHeight);

  // Fit box at 100% zoom — zoom multiplies via CSS `zoom` on the wrap.
  const availW = w > 0 ? w * (maxWPct / 100) : undefined;
  const availH = h > 0 ? h : undefined;
  const fallbackMaxW = `${maxWPct}%`;
  const fallbackMaxH = '100%';

  const wrapZoom: CSSProperties = {
    ...wrapBase,
    // Electron/Chromium: scales layout + paint so +/- zoom actually changes size.
    zoom: z,
  };

  switch (fit) {
    case 'limit-height':
      return {
        wrap: wrapZoom,
        img: {
          display: 'block',
          width: 'auto',
          height: 'auto',
          maxWidth: availW ?? fallbackMaxW,
          maxHeight: availH ?? fallbackMaxH,
          objectFit: 'contain',
        },
      };
    case 'limit-width':
      return {
        wrap: wrapZoom,
        img: {
          display: 'block',
          width: 'auto',
          height: 'auto',
          maxWidth: availW ?? fallbackMaxW,
          objectFit: 'contain',
        },
      };
    case 'limit-all':
      return {
        wrap: wrapZoom,
        img: {
          display: 'block',
          width: 'auto',
          height: 'auto',
          maxWidth: availW ?? fallbackMaxW,
          maxHeight: availH ?? fallbackMaxH,
          objectFit: 'contain',
        },
      };
    case 'stretch-height':
      return {
        wrap: wrapZoom,
        img: {
          display: 'block',
          width: 'auto',
          height: availH ?? fallbackMaxH,
          maxWidth: availW ?? fallbackMaxW,
          objectFit: 'contain',
        },
      };
    case 'stretch-width':
      return {
        wrap: wrapZoom,
        img: {
          display: 'block',
          width: availW ?? fallbackMaxW,
          height: 'auto',
          maxHeight: availH ?? fallbackMaxH,
          objectFit: 'contain',
        },
      };
    case 'stretch-all':
      return {
        wrap: {
          ...wrapZoom,
          width: availW ?? fallbackMaxW,
          height: availH ?? fallbackMaxH,
        },
        img: {
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'fill',
        },
      };
    default:
      return mangaPageFitStyles('limit-all', z, maxWPct, stageWidth, stageHeight);
  }
}
