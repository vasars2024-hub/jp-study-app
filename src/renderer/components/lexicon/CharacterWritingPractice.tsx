import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';

const SIZE = 180;

export default function CharacterWritingPractice({ target }: { target: string }) {
  const { t } = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const context = canvasRef.current?.getContext('2d');
    if (context) { context.lineWidth = 4; context.lineCap = 'round'; context.lineJoin = 'round'; context.strokeStyle = '#111'; }
  }, []);

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, SIZE, SIZE);
    setResult('');
  };
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * SIZE, y: ((event.clientY - rect.top) / rect.height) * SIZE };
  };
  const recognize = async () => {
    const canvas = canvasRef.current;
    if (!canvas || busy) return;
    setBusy(true);
    try {
      const value = (await window.api.mangaOcrRecognizeImage(canvas.toDataURL('image/png'))).trim();
      setResult(value ? [...value].find((char) => /[\u4e00-\u9fff々〆ヵヶ]/.test(char)) ?? value : t('manga.hw.noChar'));
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
        <span lang="ja">{target}</span>
      </div>
      <canvas ref={canvasRef} width={SIZE} height={SIZE} className="lexicon-character-practice-canvas"
        aria-label={t('manga.hw.title')}
        onPointerDown={(event) => { drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId); const p = point(event); const c = event.currentTarget.getContext('2d'); c?.beginPath(); c?.moveTo(p.x, p.y); }}
        onPointerMove={(event) => { if (!drawing.current) return; const p = point(event); const c = event.currentTarget.getContext('2d'); if (c) { c.lineTo(p.x, p.y); c.stroke(); } }}
        onPointerUp={(event) => { drawing.current = false; event.currentTarget.releasePointerCapture(event.pointerId); }}
        onPointerCancel={(event) => { drawing.current = false; event.currentTarget.releasePointerCapture(event.pointerId); }} />
      <div className="lexicon-character-practice-actions">
        <button type="button" className="btn small" onClick={clear}>{t('manga.hw.clear')}</button>
        <button type="button" className="btn small" onClick={() => void recognize()} disabled={busy}>{busy ? t('manga.hw.recognizing') : t('manga.hw.recognize')}</button>
      </div>
      {result && <output className="lexicon-character-practice-result" lang="ja">{result}</output>}
    </div>
  );
}
