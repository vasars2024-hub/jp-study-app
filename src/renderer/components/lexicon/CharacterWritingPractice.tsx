import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';

const SIZE = 180;
const CJK = /[\u4e00-\u9fff々〆ヵヶ]/;

/**
 * The one glyph the reader drew, or nothing.
 *
 * The model is an OCR pass over a 180px square and answers with whatever it
 * believes it read. Recognizing an EMPTY square returned a four-character
 * phrase, and the old `?? value` fallback printed it verbatim under a heading
 * that says "Draw a character". A CJK character wins; a lone non-CJK character
 * is kept so drawing kana still works; anything longer is not a hand-drawn
 * glyph and is reported as nothing recognized rather than shown as one.
 */
function recognizedGlyph(value: string): string | null {
  const cjk = [...value].find((char) => CJK.test(char));
  if (cjk) return cjk;
  return [...value].length === 1 ? value : null;
}

/**
 * The canvas starts transparent, and a transparent PNG reads as black to the
 * recognizer — every drawing arrived as black strokes on black. The practice
 * surface is painted white, so the image is dark ink on white paper.
 */
export function paintBlank(context: Pick<CanvasRenderingContext2D, 'save' | 'restore' | 'fillRect' | 'fillStyle' | 'globalCompositeOperation'>): void {
  context.save();
  context.globalCompositeOperation = 'source-over';
  context.fillStyle = '#fff';
  context.fillRect(0, 0, SIZE, SIZE);
  context.restore();
}

export default function CharacterWritingPractice({
  target,
  expectedStrokes,
  lang = 'ja',
}: {
  target: string;
  expectedStrokes?: number;
  /** The character's language tag (`ja`, `zh-Hans`, `zh-Hant`): Chinese is read by the Chinese recognizer. */
  lang?: string;
}) {
  const glyphLang = lang.startsWith('zh') ? 'zh' : 'ja';
  const { t } = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const moved = useRef(false);
  const [result, setResult] = useState('');
  const [strokeCount, setStrokeCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<'match' | 'miss' | null>(null);
  useEffect(() => {
    const context = canvasRef.current?.getContext('2d');
    if (context) {
      paintBlank(context);
      context.lineWidth = 4; context.lineCap = 'round'; context.lineJoin = 'round'; context.strokeStyle = '#111';
    }
  }, []);

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    paintBlank(context);
    setResult('');
    setVerdict(null);
    setStrokeCount(0);
  };
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * SIZE, y: ((event.clientY - rect.top) / rect.height) * SIZE };
  };
  const recognize = async () => {
    const canvas = canvasRef.current;
    if (!canvas || busy || strokeCount === 0) return;
    setBusy(true);
    try {
      const value = (await window.api.ocrRecognizeGlyph(canvas.toDataURL('image/png'), glyphLang)).trim();
      const glyph = recognizedGlyph(value);
      setResult(glyph ?? t('manga.hw.noChar'));
      // Graded against the character being practised, not just read back.
      setVerdict(glyph ? (glyph === target ? 'match' : 'miss') : null);
    } catch {
      setResult(t('manga.hw.failed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="lexicon-character-practice" aria-label={t('manga.hw.title')}>
      <div className="lexicon-character-practice-heading">
        <strong>{t('manga.hw.title')}</strong>
        <span lang={lang}>{target}</span>
        {expectedStrokes !== undefined && (
          <span className="lexicon-character-practice-strokes">
            {t('lexicon.character.strokes')}: {strokeCount} / {expectedStrokes}
          </span>
        )}
      </div>
      <canvas ref={canvasRef} width={SIZE} height={SIZE} className="lexicon-character-practice-canvas"
        aria-label={t('manga.hw.title')}
        onPointerDown={(event) => { drawing.current = true; moved.current = false; event.currentTarget.setPointerCapture?.(event.pointerId); const p = point(event); const c = event.currentTarget.getContext('2d'); c?.beginPath(); c?.moveTo(p.x, p.y); }}
        onPointerMove={(event) => { if (!drawing.current) return; moved.current = true; const p = point(event); const c = event.currentTarget.getContext('2d'); if (c) { c.lineTo(p.x, p.y); c.stroke(); } }}
        onPointerUp={(event) => { if (drawing.current && moved.current) setStrokeCount((count) => count + 1); drawing.current = false; moved.current = false; if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId); }}
        onPointerCancel={(event) => { drawing.current = false; moved.current = false; if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId); }} />
      <div className="lexicon-character-practice-actions">
        <button type="button" className="btn small" onClick={clear}>{t('manga.hw.clear')}</button>
        <button
          type="button"
          className="btn small"
          onClick={() => void recognize()}
          disabled={busy || strokeCount === 0}
          title={strokeCount === 0 ? t('lexicon.character.drawFirst') : undefined}
        >
          {busy ? t('manga.hw.recognizing') : t('manga.hw.recognize')}
        </button>
      </div>
      {result && <output className="lexicon-character-practice-result" lang={lang}>{result}</output>}
      {verdict && (
        <p className={`lexicon-character-practice-verdict is-${verdict}`} role="status">
          {verdict === 'match' ? t('lexicon.character.match') : t('lexicon.character.miss', { target })}
        </p>
      )}
    </div>
  );
}
