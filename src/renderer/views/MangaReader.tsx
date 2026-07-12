import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { LibraryItem } from '../../shared/types';
import DictionaryPopup from '../components/DictionaryPopup';
import Icon from '../components/Icons';
import { runOcr, type OcrLang } from '../ocr';
import { lookupWordFromMouseUp, isLookupClick, noteLookupPointerDown } from '../wordLookup';
import { registerCommandHandler } from '../keyboardShortcuts';

type Fit = 'height' | 'width' | 'original';
type OcrStatus = 'idle' | 'scanning' | 'done' | 'error';

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 4;

interface Props {
  item: LibraryItem;
  onClose: () => void;
}

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

function pageStyle(fit: Fit, zoom: number): CSSProperties {
  if (fit === 'height') return { height: `${100 * zoom}%`, width: 'auto', maxWidth: 'none' };
  if (fit === 'width') return { width: `${100 * zoom}%`, height: 'auto', maxWidth: 'none' };
  return { transform: `scale(${zoom})`, transformOrigin: 'center top' };
}

export default function MangaReader({ item, onClose }: Props) {
  const [pages, setPages] = useState<string[]>([]);
  const [idx, setIdx] = useState(item.progress?.page ?? 0);
  const [fit, setFit] = useState<Fit>('height');
  const [zoom, setZoom] = useState(1);
  // Live page index while dragging the scrubber (null = not dragging). Committed
  // to `idx` on release so we don't hammer the on-disk progress save mid-drag.
  const [scrub, setScrub] = useState<number | null>(null);

  // ----- OCR ("scan page") state -----
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>('idle');
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrText, setOcrText] = useState('');
  const [ocrError, setOcrError] = useState('');
  const [ocrLang, setOcrLang] = useState<OcrLang>('jpn_vert');
  const [popup, setPopup] = useState<{ query: string; x: number; y: number } | null>(null);
  const popupRef = useRef(popup);
  popupRef.current = popup;
  const popupOpenOnDownRef = useRef(false);

  useEffect(() => {
    window.api.getMangaPages(item.id).then((p) => {
      setPages(p);
      setIdx(Math.min(item.progress?.page ?? 0, Math.max(0, p.length - 1)));
    });
  }, [item.id]);

  const go = useCallback(
    (delta: number) => {
      setIdx((i) => Math.min(Math.max(i + delta, 0), Math.max(0, pages.length - 1)));
    },
    [pages.length],
  );

  const bumpZoom = useCallback((delta: number) => {
    setZoom((z) => clampZoom(z + delta));
  }, []);

  // Run OCR on the page currently shown. Reads the raw image bytes from main
  // (as a data URL) so the worker never has to fetch the media:// protocol.
  const scanPage = useCallback(
    async (lang: OcrLang) => {
      const url = pages[idx];
      if (!url) return;
      setOcrOpen(true);
      setOcrStatus('scanning');
      setOcrProgress(0);
      setOcrError('');
      setOcrText('');
      try {
        const dataUrl = await window.api.readMangaPage(url);
        if (!dataUrl) throw new Error('Could not read this page image.');
        const text = await runOcr(dataUrl, lang, setOcrProgress);
        setOcrText(text);
        setOcrStatus(text.trim() ? 'done' : 'error');
        if (!text.trim()) setOcrError('No text was found on this page.');
      } catch (err) {
        console.error(err);
        setOcrError(err instanceof Error ? err.message : 'OCR failed.');
        setOcrStatus('error');
      }
    },
    [pages, idx],
  );

  // Selecting text in the OCR panel opens the dictionary popup (→ add to Anki).
  const onOcrSelect = useCallback((e: React.MouseEvent) => {
    const dismissOnly = popupOpenOnDownRef.current && isLookupClick(e);
    const hit = lookupWordFromMouseUp(e);
    if (hit && !hit.translate) setPopup({ query: hit.query, x: hit.x, y: hit.y });
    else if (dismissOnly) setPopup(null);
  }, []);

  // Persist reading position whenever the page changes.
  useEffect(() => {
    if (!pages.length) return;
    window.api.setProgress(item.id, {
      page: idx,
      percent: pages.length > 1 ? idx / (pages.length - 1) : 1,
    });
  }, [idx, pages.length, item.id]);

  // A new page invalidates any previous scan result.
  useEffect(() => {
    setOcrStatus('idle');
    setOcrText('');
    setOcrError('');
    setPopup(null);
  }, [idx]);

  // Manga shortcuts via central manager (Settings → Shortcuts).
  useEffect(() => {
    const offs = [
      registerCommandHandler('manga.nextPage', () => {
        go(1);
      }),
      registerCommandHandler('manga.prevPage', () => {
        go(-1);
      }),
      registerCommandHandler('manga.zoomIn', () => {
        bumpZoom(0.15);
      }),
      registerCommandHandler('manga.zoomOut', () => {
        bumpZoom(-0.15);
      }),
      registerCommandHandler('manga.zoomReset', () => {
        setZoom(1);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [go, bumpZoom]);

  // Escape stays local (layered dismiss) — not a global rebindable exit.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (popup) setPopup(null);
      else if (ocrOpen) setOcrOpen(false);
      else onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, popup, ocrOpen]);

  // Ctrl+wheel to zoom (and stop the whole app from zooming).
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey) {
        e.preventDefault();
        bumpZoom(e.deltaY < 0 ? 0.15 : -0.15);
      }
    }
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [bumpZoom]);

  return (
    <div className="reader">
      <div className="reader-bar">
        <button className="btn" onClick={onClose}>
          <Icon name="chevron" size={13} style={{ transform: 'rotate(180deg)', marginRight: 4, verticalAlign: '-2px' }} />
          Library
        </button>
        <div className="reader-title">{item.title}</div>
        <div className="reader-controls">
          <span className="muted page-count">
            {pages.length ? (scrub ?? idx) + 1 : 0} / {pages.length}
          </span>
          <div className="sp-stepper">
            <button className="btn small" onClick={() => bumpZoom(-0.15)} disabled={zoom <= ZOOM_MIN}>
              −
            </button>
            <span className="sp-value">{Math.round(zoom * 100)}%</span>
            <button className="btn small" onClick={() => bumpZoom(0.15)} disabled={zoom >= ZOOM_MAX}>
              +
            </button>
          </div>
          <select
            value={fit}
            onChange={(e) => {
              setFit(e.target.value as Fit);
              setZoom(1);
            }}
          >
            <option value="height">Fit height</option>
            <option value="width">Fit width</option>
            <option value="original">Original size</option>
          </select>
          <button
            className={`btn ${ocrOpen ? 'active' : ''}`}
            title="Scan this page for Japanese text (OCR)"
            disabled={!pages.length}
            onClick={() => {
              if (ocrOpen) setOcrOpen(false);
              else scanPage(ocrLang);
            }}
          >
            <Icon name="search" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
            Scan
          </button>
        </div>
      </div>
      <div className="reader-stage manga-stage">
        <button className="nav-zone left" onClick={() => go(-1)} aria-label="Previous page" />
        {pages.length > 0 ? (
          <img
            className="manga-page"
            style={pageStyle(fit, zoom)}
            src={pages[idx]}
            alt={`Page ${idx + 1}`}
          />
        ) : (
          <div className="reader-msg">No pages found in this item.</div>
        )}
        <button className="nav-zone right" onClick={() => go(1)} aria-label="Next page" />

        {ocrOpen && (
          <aside className="ocr-panel" onMouseDown={() => setPopup(null)}>
            <div className="ocr-head">
              <span>Page text (OCR)</span>
              <button className="dict-x" onClick={() => setOcrOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="ocr-toolbar">
              <div className="sp-seg" role="group" aria-label="Text direction">
                <button
                  className={`sp-seg-btn ${ocrLang === 'jpn_vert' ? 'active' : ''}`}
                  onClick={() => {
                    setOcrLang('jpn_vert');
                    scanPage('jpn_vert');
                  }}
                >
                  縦 Vertical
                </button>
                <button
                  className={`sp-seg-btn ${ocrLang === 'jpn' ? 'active' : ''}`}
                  onClick={() => {
                    setOcrLang('jpn');
                    scanPage('jpn');
                  }}
                >
                  横 Horizontal
                </button>
              </div>
              <button
                className="btn small"
                disabled={ocrStatus === 'scanning'}
                onClick={() => scanPage(ocrLang)}
              >
                {ocrStatus === 'scanning' ? 'Scanning…' : 'Rescan'}
              </button>
            </div>

            {ocrStatus === 'scanning' && (
              <div className="ocr-progress">
                <div className="ocr-bar">
                  <div className="ocr-bar-fill" style={{ width: `${Math.round(ocrProgress * 100)}%` }} />
                </div>
                <span className="muted">
                  Reading page… {Math.round(ocrProgress * 100)}%
                  {ocrProgress === 0 ? ' (first scan downloads the OCR engine)' : ''}
                </span>
              </div>
            )}
            {ocrStatus === 'error' && <div className="ocr-msg muted">{ocrError}</div>}
            {ocrStatus === 'done' && (
              <>
                <p className="ocr-hint muted">Select a word to look it up and add it to Anki.</p>
                <div
                  className="ocr-text"
                  lang="ja"
                  onMouseDown={(e) => {
                    popupOpenOnDownRef.current = !!popupRef.current;
                    noteLookupPointerDown(e);
                  }}
                  onMouseUp={onOcrSelect}
                >
                  {ocrText}
                </div>
              </>
            )}
          </aside>
        )}
      </div>
      <div className="reader-footer">
        <button
          className="btn small"
          title="First page"
          disabled={!pages.length || idx === 0}
          onClick={() => setIdx(0)}
        >
          <Icon name="skip-back" size={13} />
        </button>
        <input
          className="reader-seek"
          type="range"
          min={1}
          max={Math.max(1, pages.length)}
          value={Math.min((scrub ?? idx) + 1, Math.max(1, pages.length))}
          disabled={!pages.length}
          title="Drag to jump to any page"
          onChange={(e) => setScrub(Number(e.target.value) - 1)}
          onPointerUp={() => {
            if (scrub != null) {
              setIdx(scrub);
              setScrub(null);
            }
          }}
          onKeyUp={() => {
            if (scrub != null) {
              setIdx(scrub);
              setScrub(null);
            }
          }}
        />
        <button
          className="btn small"
          title="Last page"
          disabled={!pages.length || idx >= pages.length - 1}
          onClick={() => setIdx(pages.length - 1)}
        >
          <Icon name="skip-forward" size={13} />
        </button>
        <span className="reader-pct muted">
          {pages.length ? Math.round((((scrub ?? idx) + 1) / pages.length) * 100) : 0}%
        </span>
      </div>

      {popup && (
        <DictionaryPopup
          query={popup.query}
          x={popup.x}
          y={popup.y}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}
