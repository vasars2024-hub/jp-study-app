import { useCallback, useEffect, useRef, useState } from 'react';
import { KANJI_RADICALS } from '../../shared/kanjiRadicals';
import { runOcr } from '../ocr';
import { stripFuriganaFragments } from '../../shared/mangaOcrText';
import { useT } from '../i18n';
import { getStudyLang } from '../studyEnvironment';

interface Props {
  x: number;
  y: number;
  engineReady: boolean;
  onLookup: (query: string, x: number, y: number) => void;
  onClose: () => void;
}

const SIZE = 200;

export default function MangaHandwritingPopup({ x, y, engineReady, onLookup, onClose }: Props) {
  const { t } = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, SIZE, SIZE);
    g.strokeStyle = '#111111';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.lineJoin = 'round';
  }, []);

  const clearCanvas = useCallback(() => {
    const c = canvasRef.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, SIZE, SIZE);
    g.strokeStyle = '#111111';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    setStatus('');
  }, []);

  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * SIZE,
      y: ((e.clientY - r.top) / r.height) * SIZE,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const g = canvasRef.current?.getContext('2d');
    if (!g) return;
    drawing.current = true;
    canvasRef.current?.setPointerCapture(e.pointerId);
    const p = pointerPos(e);
    g.beginPath();
    g.moveTo(p.x, p.y);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const g = canvasRef.current?.getContext('2d');
    if (!g) return;
    const p = pointerPos(e);
    g.lineTo(p.x, p.y);
    g.stroke();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = false;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const recognize = useCallback(async () => {
    const c = canvasRef.current;
    if (!c) return;
    setBusy(true);
    setStatus(t('manga.hw.recognizing'));
    try {
      const dataUrl = c.toDataURL('image/png');
      let text = '';
      const study = getStudyLang();
      if (study !== 'ja') {
        // Chinese and Russian are read by their own recognizer; manga-ocr and the
        // Tesseract fallback only know Japanese.
        text = (await window.api.ocrRecognizeGlyph(dataUrl, study)).trim();
      } else {
        if (engineReady) {
          text = (await window.api.mangaOcrRecognizeImage(dataUrl)).trim();
        }
        if (!text) {
          text = stripFuriganaFragments(await runOcr(dataUrl, 'jpn'), true).trim();
        }
      }
      // Prefer a single CJK character when the model returns a short string.
      const chars = [...text].filter((ch) => /[\u4e00-\u9fff々〆ヵヶぁ-んァ-ン\u0400-\u04ff]/.test(ch));
      const picked = chars[0] ?? text.replace(/\s+/g, '').slice(0, 4);
      if (picked) {
        setQuery((q) => q + picked);
        setStatus('');
      } else {
        setStatus(t('manga.hw.noChar'));
      }
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : t('manga.hw.failed'));
    } finally {
      setBusy(false);
    }
  }, [engineReady, t]);

  const lookup = () => {
    const q = query.trim();
    if (!q) return;
    onLookup(q, x, y);
  };

  const left = Math.min(window.innerWidth - 340, Math.max(8, x));
  const top = Math.min(window.innerHeight - 420, Math.max(8, y));

  return (
    <div
      className="manga-hw-popup"
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-label={t('manga.hw.title')}
    >
      <div className="manga-hw-head">
        <span>{t('manga.hw.title')}</span>
        <button className="dict-x" onClick={onClose} aria-label={t('manga.ocr.close')}>
          ×
        </button>
      </div>
      <p className="muted manga-hw-hint">{t('manga.hw.hint')}</p>
      <canvas
        ref={canvasRef}
        className="manga-hw-canvas"
        width={SIZE}
        height={SIZE}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="manga-hw-actions">
        <button className="btn small" onClick={clearCanvas} disabled={busy}>
          {t('manga.hw.clear')}
        </button>
        <button className="btn small" onClick={() => void recognize()} disabled={busy}>
          {busy ? t('manga.hw.recognizing') : t('manga.hw.recognize')}
        </button>
      </div>
      {status && <div className="muted manga-hw-status">{status}</div>}
      <div className="manga-hw-query-row">
        <input
          className="manga-hw-query"
          lang="ja"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('manga.hw.queryPlaceholder')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              lookup();
            }
          }}
        />
        <button className="btn small" onClick={lookup} disabled={!query.trim()}>
          {t('manga.hw.lookup')}
        </button>
      </div>
      <div className="manga-hw-radicals" role="list" aria-label={t('manga.hw.radicals')}>
        {KANJI_RADICALS.map((r) => (
          <button
            key={r}
            type="button"
            className="manga-hw-radical"
            onClick={() => setQuery((q) => q + r)}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}
