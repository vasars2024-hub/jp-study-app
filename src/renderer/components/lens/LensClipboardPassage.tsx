import type { CSSProperties, MouseEvent } from 'react';
import type { ReadingLensCapture } from '../../../shared/readingLens';
import type { JpToken } from '../../tokenizer';
import './lensClipboardPassage.css';

type LensMode = 'dictionary' | 'ai';

interface Props {
  capture: ReadingLensCapture;
  tokens: readonly JpToken[];
  region: { x: number; y: number; width: number; height: number };
  mode: LensMode;
  t: (key: string, vars?: Record<string, unknown>) => string;
  onModeChange: (mode: LensMode) => void;
  onWordClick: (event: MouseEvent, surface: string) => void;
  onAskAgent: () => void;
  onNewRegion: () => void;
  onClose: () => void;
}

function isJapaneseWord(value: string): boolean {
  return /[぀-ヿ㐀-鿿々ー]/u.test(value);
}

/** A text capture has no OCR boxes, so it gets an honest passage surface. */
export default function LensClipboardPassage({
  capture,
  tokens,
  region,
  mode,
  t,
  onModeChange,
  onWordClick,
  onAskAgent,
  onNewRegion,
  onClose,
}: Props) {
  const style: CSSProperties = {
    left: region.x,
    top: region.y,
    width: region.width,
    maxHeight: region.height,
  };

  return (
    <section className="lens-clipboard-passage lens-interactive" style={style}>
      <div className="lens-clipboard-head">
        <span className="lens-source-badge">{t('lens.badge.source.clipboard')}</span>
        <div className="lens-mode" role="radiogroup" aria-label={t('lens.mode.label')}>
          {(['dictionary', 'ai'] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={mode === item}
              className={'lens-mode-btn ' + (mode === item ? 'active' : '')}
              onClick={() => onModeChange(item)}
            >
              {t('lens.mode.' + item)}
            </button>
          ))}
        </div>
      </div>

      <div className="lens-clipboard-text" lang={capture.language || 'ja'}>
        {tokens.map((token, index) =>
          isJapaneseWord(token.surface) ? (
            <button
              key={index}
              type="button"
              className="lens-clipboard-word"
              onClick={(event) => onWordClick(event, token.surface)}
            >
              {token.surface}
            </button>
          ) : (
            <span key={index}>{token.surface}</span>
          ),
        )}
      </div>

      <div className="lens-clipboard-actions">
        <button type="button" onClick={onAskAgent}>
          {t('lens.action.askAgent')}
        </button>
        <button type="button" onClick={onNewRegion}>
          {t('lens.action.newRegion')}
        </button>
        <button type="button" onClick={onClose}>
          {t('lens.action.close')}
        </button>
      </div>
    </section>
  );
}
