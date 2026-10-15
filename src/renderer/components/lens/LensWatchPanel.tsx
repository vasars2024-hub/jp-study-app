import type { MouseEvent as ReactMouseEvent } from 'react';
import type { JpToken } from '../../tokenizer';

/**
 * The Reading Lens while it watches a region.
 *
 * Nothing is painted over the watched region itself: main samples those pixels
 * to see when the text changes, so a hotspot or a highlight drawn there would
 * read as a change of its own (and hide the game's text from the reader). The
 * frame sits just outside the region, and the latest read is shown in a panel
 * beside it — above or below, whichever side has room — with every word
 * clickable for the dictionary as usual.
 */

export interface LensWatchLine {
  text: string;
  tokens: JpToken[];
}

export type LensWatchStatus = 'reading' | 'ready' | 'empty' | 'error';

const PANEL_GAP = 10;
const PANEL_MAX_WIDTH = 640;
/** Room the panel needs below the region before it moves above it. */
const PANEL_ROOM = 180;

function isJapaneseWord(s: string): boolean {
  return /[぀-ヿ㐀-鿿々ー]/.test(s);
}

/** Where the panel goes: under the region when it fits, otherwise over it. */
export function watchPanelPlacement(
  region: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; width: number; top?: number; bottom?: number } {
  const width = Math.min(PANEL_MAX_WIDTH, Math.max(280, region.width), viewport.width - 16);
  const left = Math.max(8, Math.min(region.x, viewport.width - width - 8));
  const below = region.y + region.height + PANEL_GAP;
  if (viewport.height - below >= PANEL_ROOM || region.y < PANEL_ROOM) {
    return { left, width, top: Math.min(below, Math.max(8, viewport.height - PANEL_ROOM)) };
  }
  return { left, width, bottom: Math.max(8, viewport.height - region.y + PANEL_GAP) };
}

export default function LensWatchPanel({
  t,
  region,
  viewport,
  lines,
  status,
  message,
  onWordClick,
  onStop,
  onClose,
}: {
  t: (k: string, v?: Record<string, unknown>) => string;
  region: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number };
  lines: LensWatchLine[];
  status: LensWatchStatus;
  /** The error to show when `status` is `error`. */
  message?: string;
  onWordClick: (event: ReactMouseEvent, surface: string, context: string, tokens: JpToken[]) => void;
  onStop: () => void;
  onClose: () => void;
}) {
  const place = watchPanelPlacement(region, viewport);
  return (
    <>
      <div
        className="lens-watch-frame"
        aria-hidden="true"
        style={{ left: region.x - 4, top: region.y - 4, width: region.width + 8, height: region.height + 8 }}
      />
      <section
        className="lens-watch-panel lens-interactive"
        aria-label={t('lensOcr.watch.panel')}
        style={{
          left: place.left,
          width: place.width,
          ...(place.top !== undefined ? { top: place.top } : { bottom: place.bottom }),
        }}
      >
        <header className="lens-watch-head">
          <span className="lens-watch-dot" aria-hidden="true" />
          <span className="lens-watch-title">{t('lensOcr.watch.active')}</span>
          <span className="lens-watch-status" role="status">
            {status === 'reading' ? t('lensOcr.watch.reading') : status === 'empty' ? t('lensOcr.watch.empty') : ''}
          </span>
          <button type="button" className="lens-watch-stop" onClick={onStop} title={t('lensOcr.watch.stopHint')}>
            {t('lensOcr.watch.stop')}
          </button>
          <button type="button" className="lens-watch-close" onClick={onClose} title={t('lens.action.close')}>
            {t('lens.action.close')}
          </button>
        </header>
        {status === 'error' && message && <p className="lens-watch-error">{message}</p>}
        {lines.length > 0 ? (
          <div className="lens-watch-text" lang="ja">
            {lines.map((line, i) => (
              <p key={i} className="lens-watch-line">
                {line.tokens.map((tok, j) =>
                  isJapaneseWord(tok.surface) ? (
                    <span
                      key={j}
                      className="lens-word"
                      onClick={(e) => onWordClick(e, tok.surface, line.text, line.tokens)}
                    >
                      {tok.surface}
                    </span>
                  ) : (
                    <span key={j} className="lens-punct">
                      {tok.surface}
                    </span>
                  ),
                )}
              </p>
            ))}
          </div>
        ) : (
          status !== 'error' && <p className="lens-watch-hint">{t('lensOcr.watch.waiting')}</p>
        )}
      </section>
    </>
  );
}
