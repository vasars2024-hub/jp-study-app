import { useCallback, useEffect, useRef, useState } from 'react';
import LensReaderPanel from './LensReaderPanel';
import { useT } from '../../i18n';
import { getTokenizer, tokenizeSync, tokenizerReady, type JpToken } from '../../tokenizer';
import type { LensInit } from '../../../main/readingLens';
import type { LensOcrResult } from '../../../main/screenOcr';
import './readingLens.css';

/**
 * Renderer for the Reading Lens window (`?readingLens=1`).
 *
 * The window is stretched over one display; all coordinates below are that
 * display's local DIP, which equals CSS px here (no #root zoom in this window).
 * States: `selecting` (draw a region) → `scanning` (capture + OCR, nothing
 * opaque is painted over the region so the screenshot underneath is clean) →
 * `reading` (interactive word hotspots) / `empty` / `error`.
 *
 * Pass-through: while reading, the main process ignores mouse events and
 * forwards them to the app below; we flip interactivity back on whenever the
 * cursor is over a `.lens-interactive` element (words, chrome, the popup), the
 * same trick companionHost.ts uses.
 */

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LensLine {
  text: string;
  box: [number, number, number, number];
  vertical: boolean;
  confidence: number;
  tokens: JpToken[];
}

type LensState =
  | { kind: 'idle' }
  | { kind: 'selecting' }
  | { kind: 'scanning'; region: Rect; engine: 'auto' | 'manga' | 'web' }
  | { kind: 'reading'; region: Rect; lines: LensLine[]; engine: string }
  | { kind: 'empty'; region: Rect }
  | { kind: 'error'; region: Rect | null; message: string; canRetry: boolean };

const MIN_REGION = 12;

function isJapaneseWord(s: string): boolean {
  return /[぀-ヿ㐀-鿿々ー]/.test(s);
}

function buildLines(res: LensOcrResult): LensLine[] {
  return res.lines.map((l) => ({
    text: l.text,
    box: l.box,
    vertical: l.vertical,
    confidence: l.confidence,
    tokens: tokenizerReady() ? tokenizeSync(l.text) : [{ surface: l.text, lemma: l.text } as JpToken],
  }));
}

export default function ReadingLensOverlay() {
  const { t } = useT();
  const [state, setState] = useState<LensState>({ kind: 'idle' });
  const [popup, setPopup] = useState<{
    query: string;
    context: string;
    tokens: JpToken[];
    x: number;
    y: number;
  } | null>(null);

  // Drag selection scratch state.
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<Rect | null>(null);
  // Fragments ghost out once the cursor leaves the scanned region (see effect).
  const [dimmed, setDimmed] = useState(false);
  // Mirrors the main-process ignoreMouseEvents flag so we only toggle on change.
  const interactiveRef = useRef(true);

  const setInteractive = useCallback((on: boolean) => {
    if (interactiveRef.current === on) return;
    interactiveRef.current = on;
    window.api.lensSetInteractive(on);
  }, []);

  const close = useCallback(() => {
    setPopup(null);
    setState({ kind: 'idle' });
    setInteractive(true);
    void window.api.lensClose();
  }, [setInteractive]);

  // Warm the tokenizer so the first scan can split words synchronously.
  useEffect(() => {
    void getTokenizer().catch(() => undefined);
  }, []);

  // Begin (or restart) a selection / auto-read when the window is (re)opened.
  const begin = useCallback((init: LensInit) => {
    setPopup(null);
    setDragRect(null);
    dragStart.current = null;
    interactiveRef.current = true; // main re-enabled the mouse on open
    if (init.mode === 'auto') {
      setState({
        kind: 'scanning',
        region: { x: 0, y: 0, width: init.bounds.width, height: init.bounds.height },
        engine: 'auto',
      });
    } else {
      setState({ kind: 'selecting' });
    }
  }, []);

  useEffect(() => {
    let alive = true;
    let tries = 0;
    // The main process pushes `lens:open` on did-finish-load, which can beat this
    // listener on first creation — so also *pull* the pending init, retrying
    // briefly until it's there. Whichever arrives first wins; begin() is idempotent.
    const off = window.api.onLensOpen((init) => begin(init));
    const pull = () => {
      if (!alive) return;
      window.api
        .lensGetInit()
        .then((init) => {
          if (!alive) return;
          if (init) begin(init);
          else if (tries++ < 20) setTimeout(pull, 60);
        })
        .catch(() => {
          if (alive && tries++ < 20) setTimeout(pull, 60);
        });
    };
    pull();
    return () => {
      alive = false;
      off();
    };
  }, [begin]);

  // Run OCR whenever we enter a scanning state. Two rAFs guarantee the dim /
  // previous overlay has actually painted out before the screenshot is taken.
  useEffect(() => {
    if (state.kind !== 'scanning') return;
    const { region, engine } = state;
    let alive = true;
    const run = () => {
      window.api
        .lensOcr({ ...region, engine })
        .then((res) => {
          if (!alive) return;
          if (!res.available) {
            const message =
              res.engine === 'manga'
                ? t('lens.error.manga')
                : res.downloading
                  ? t('lens.error.downloading')
                  : t('lens.error.web');
            setState({ kind: 'error', region, message, canRetry: true });
            return;
          }
          if (!res.ok) {
            const message = res.error === 'capture-failed' ? t('lens.error.capture') : t('lens.error.generic');
            setState({ kind: 'error', region, message, canRetry: true });
            return;
          }
          const lines = buildLines(res);
          if (!lines.length) {
            setState({ kind: 'empty', region });
          } else {
            setState({ kind: 'reading', region, lines, engine: res.engine });
          }
        })
        .catch(() => {
          if (alive) setState({ kind: 'error', region, message: t('lens.error.generic'), canRetry: true });
        });
    };
    const raf1 = requestAnimationFrame(() => requestAnimationFrame(run));
    return () => {
      alive = false;
      cancelAnimationFrame(raf1);
    };
  }, [state, t]);

  // Pass-through: once we're reading (or showing a message), let clicks fall
  // through to the app below except over interactive elements.
  useEffect(() => {
    const reading = state.kind === 'reading' || state.kind === 'empty' || state.kind === 'error';
    if (!reading) {
      setInteractive(true);
      return;
    }
    setInteractive(false);
    const onMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      setInteractive(!!el && !!(el as Element).closest('.lens-interactive'));
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [state.kind, setInteractive]);

  // Auto-dismiss so a finished read never lingers on screen. The fragments
  // ghost out — then the lens closes itself — once the cursor wanders away from
  // the text (not over any fragment, the panel, or the chrome, and not within a
  // grace radius of a fragment); moving back onto the text before it closes
  // snaps them back at full strength. Proximity to the *fragments* is the
  // signal, not the scanned rectangle, so this works the same for a small drag
  // and for a whole-screen auto-scan whose region covers everything. The
  // countdown is only armed by a move that lands away, so a stationary cursor —
  // you actually reading — never makes it vanish, and an open reader panel
  // suspends it entirely.
  useEffect(() => {
    if (state.kind !== 'reading' || popup) {
      setDimmed(false);
      return;
    }
    const { region, lines } = state;
    const pad = 64; // grace radius around each fragment, in DIP
    const boxes = lines.map((l) => ({
      x: region.x + l.box[0],
      y: region.y + l.box[1],
      w: l.box[2],
      h: l.box[3],
    }));
    // Squared distance from a point to a rect (0 when inside).
    const near = (px: number, py: number) =>
      boxes.some((b) => {
        const dx = Math.max(b.x - px, 0, px - (b.x + b.w));
        const dy = Math.max(b.y - py, 0, py - (b.y + b.h));
        return dx * dx + dy * dy <= pad * pad;
      });
    let fade: number | undefined;
    let shut: number | undefined;
    const clear = () => {
      if (fade != null) window.clearTimeout(fade);
      if (shut != null) window.clearTimeout(shut);
      fade = shut = undefined;
    };
    const onMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const overUi = !!(el && (el as Element).closest('.lens-interactive'));
      if (!overUi && !near(e.clientX, e.clientY)) {
        // Arm once; keep counting down while the cursor stays away.
        if (fade == null && shut == null) {
          fade = window.setTimeout(() => setDimmed(true), 1200);
          shut = window.setTimeout(() => close(), 3600);
        }
      } else {
        clear();
        setDimmed(false);
      }
    };
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      clear();
    };
  }, [state, popup, close]);

  // Escape always dismisses.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key.toLowerCase() === 'a' && state.kind === 'selecting') {
        // Auto-read the whole screen.
        e.preventDefault();
        void window.api.lensGetInit().then((init) => {
          if (init) setState({ kind: 'scanning', region: { x: 0, y: 0, width: init.bounds.width, height: init.bounds.height }, engine: 'auto' });
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, state.kind]);

  // ---- Selection drag ----------------------------------------------------

  const onSelDown = (e: React.MouseEvent) => {
    if (state.kind !== 'selecting') return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    setDragRect({ x: e.clientX, y: e.clientY, width: 0, height: 0 });
  };
  const onSelMove = (e: React.MouseEvent) => {
    if (state.kind !== 'selecting' || !dragStart.current) return;
    const s = dragStart.current;
    setDragRect({
      x: Math.min(s.x, e.clientX),
      y: Math.min(s.y, e.clientY),
      width: Math.abs(e.clientX - s.x),
      height: Math.abs(e.clientY - s.y),
    });
  };
  const onSelUp = () => {
    if (state.kind !== 'selecting' || !dragRect) return;
    const r = dragRect;
    dragStart.current = null;
    setDragRect(null);
    if (r.width < MIN_REGION || r.height < MIN_REGION) return; // ignore stray clicks
    setState({ kind: 'scanning', region: r, engine: 'auto' });
  };

  const rescan = (engine: 'auto' | 'manga' | 'web') => {
    const region =
      state.kind === 'reading' || state.kind === 'empty' || (state.kind === 'error' && state.region)
        ? (state as { region: Rect }).region
        : null;
    if (region) setState({ kind: 'scanning', region, engine });
  };

  const onWordClick = (
    e: React.MouseEvent,
    surface: string,
    context: string,
    tokens: JpToken[],
  ) => {
    e.stopPropagation();
    setPopup({ query: surface, context, tokens, x: e.clientX, y: e.clientY });
  };

  if (state.kind === 'idle') return <div className="lens-root lens-idle" />;

  return (
    <div className={`lens-root${dimmed ? ' lens-dimmed' : ''}`}>
      {/* Selection */}
      {state.kind === 'selecting' && (
        <div
          className="lens-select-layer"
          onMouseDown={onSelDown}
          onMouseMove={onSelMove}
          onMouseUp={onSelUp}
        >
          {dragRect ? (
            <div
              className="lens-select-rect"
              style={{ left: dragRect.x, top: dragRect.y, width: dragRect.width, height: dragRect.height }}
            />
          ) : (
            <div className="lens-select-hint">
              <div className="lens-select-hint-title">{t('lens.select.hint')}</div>
              <div className="lens-select-hint-sub">{t('lens.select.sub')}</div>
            </div>
          )}
        </div>
      )}

      {/* Scanning — deliberately paints nothing over the region. */}
      {state.kind === 'scanning' && (
        <div className="lens-status-pill lens-scanning">{t('lens.scanning')}</div>
      )}

      {/* Reading — interactive text over each detected line. */}
      {state.kind === 'reading' && (
        <>
          <div
            className="lens-frame"
            style={{
              left: state.region.x,
              top: state.region.y,
              width: state.region.width,
              height: state.region.height,
            }}
          />
          {state.lines.map((line, i) => {
            const [bx, by, bw, bh] = line.box;
            const fontPx = Math.max(11, Math.min(line.vertical ? bw * 0.78 : bh * 0.78, 30));
            return (
              <div
                key={i}
                className={`lens-line lens-interactive ${line.vertical ? 'lens-line-v' : ''}`}
                style={{
                  left: state.region.x + bx,
                  top: state.region.y + by,
                  minWidth: bw,
                  minHeight: bh,
                  fontSize: fontPx,
                }}
              >
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
              </div>
            );
          })}
          <LensChrome
            t={t}
            engine={state.engine}
            onRescan={rescan}
            onNewRegion={() => setState({ kind: 'selecting' })}
            onClose={close}
          />
        </>
      )}

      {/* Empty / error messages live inside the region. */}
      {(state.kind === 'empty' || state.kind === 'error') && (
        <div
          className="lens-message lens-interactive"
          style={
            state.region
              ? { left: state.region.x, top: state.region.y + state.region.height + 8 }
              : { left: 24, bottom: 24 }
          }
        >
          <div className="lens-message-title">
            {state.kind === 'empty' ? t('lens.empty.title') : state.message}
          </div>
          {state.kind === 'empty' && <div className="lens-message-sub">{t('lens.empty.hint')}</div>}
          <div className="lens-message-actions">
            {state.kind === 'empty' && (
              <button type="button" onClick={() => rescan('manga')}>
                {t('lens.action.manga')}
              </button>
            )}
            {state.kind === 'error' && state.canRetry && (
              <button type="button" onClick={() => rescan('auto')}>
                {t('lens.action.rescan')}
              </button>
            )}
            <button type="button" onClick={() => setState({ kind: 'selecting' })}>
              {t('lens.action.newRegion')}
            </button>
            <button type="button" onClick={close}>
              {t('lens.action.close')}
            </button>
          </div>
        </div>
      )}

      {popup && (
        <LensReaderPanel
          query={popup.query}
          context={popup.context}
          tokens={popup.tokens}
          x={popup.x}
          y={popup.y}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}

function LensChrome({
  t,
  engine,
  onRescan,
  onNewRegion,
  onClose,
}: {
  t: (k: string, v?: Record<string, unknown>) => string;
  engine: string;
  onRescan: (engine: 'auto' | 'manga' | 'web') => void;
  onNewRegion: () => void;
  onClose: () => void;
}) {
  return (
    <div className="lens-chrome lens-interactive">
      <span className="lens-source-badge">{t('lens.badge.source.screen')}</span>
      <button type="button" onClick={() => onRescan('auto')} title={t('lens.action.rescan')}>
        {t('lens.action.rescan')}
      </button>
      <button
        type="button"
        onClick={() => onRescan(engine === 'manga' ? 'web' : 'manga')}
        title={engine === 'manga' ? t('lens.action.web') : t('lens.action.manga')}
      >
        {engine === 'manga' ? t('lens.action.web') : t('lens.action.manga')}
      </button>
      <button type="button" onClick={onNewRegion} title={t('lens.action.newRegion')}>
        {t('lens.action.newRegion')}
      </button>
      <button type="button" className="lens-chrome-close" onClick={onClose} title={t('lens.action.close')}>
        ×
      </button>
    </div>
  );
}
