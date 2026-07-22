/**
 * Convert a page-image item (scanned PDF, image archive, image folder) into a
 * readable text EPUB.
 *
 * The work happens in the main process and can run for minutes — a 288-page
 * novel is around 18 minutes — so this is built around the progress stream
 * rather than a request/response: the job survives navigating away, and
 * remounting re-attaches to whatever is already running.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { Progress } from '../ui/Progress';
import Icon from '../Icons';
import { useT } from '../../i18n';
import type { LibraryItem } from '../../../shared/types';
import type { BookOcrPhase, BookOcrProgress } from '../../../shared/bookOcrIpc';

interface Props {
  item: LibraryItem;
}

/** Phases where the job is actively working and can be cancelled. */
const ACTIVE: readonly BookOcrPhase[] = [
  'preparing',
  'rasterizing',
  'recognizing',
  'translating',
  'packaging',
];

function formatEta(ms: number, t: (k: string, v?: Record<string, unknown>) => string): string {
  const total = Math.round(ms / 1000);
  if (total < 60) return t('bookOcr.eta.seconds', { count: total });
  return t('bookOcr.eta.minutes', { count: Math.round(total / 60) });
}

export function BookOcrPanel({ item }: Props) {
  const { t } = useT();
  const [progress, setProgress] = useState<BookOcrProgress | null>(null);
  const [heavy, setHeavy] = useState(true);
  const [bilingual, setBilingual] = useState(false);
  const [starting, setStarting] = useState(false);

  // Only progress for the item on screen; the stream carries every job.
  useEffect(() => {
    setProgress(null);
    void window.api.bookOcrStatus?.(item.id).then((s) => {
      if (s?.running) setProgress({ itemId: item.id, phase: 'preparing', done: 0, total: 0, confidence: 0 });
    });
    return window.api.onBookOcrProgress?.((p) => {
      if (p.itemId === item.id) setProgress(p);
    });
  }, [item.id]);

  const start = useCallback(async () => {
    setStarting(true);
    try {
      await window.api.bookOcrRun?.({
        itemId: item.id,
        quality: heavy ? 'heavy' : 'fast',
        bilingual,
        pageMarkers: true,
      });
    } finally {
      setStarting(false);
    }
  }, [item.id, heavy, bilingual]);

  const cancel = useCallback(() => {
    void window.api.bookOcrCancel?.(item.id);
  }, [item.id]);

  const phase = progress?.phase;
  const active = starting || (phase != null && ACTIVE.includes(phase));

  if (active && progress) {
    const { done, total, confidence, etaMs } = progress;
    return (
      <div className="book-ocr-panel">
        <div className="book-ocr-head">
          <span>{t(`bookOcr.phase.${progress.phase}`)}</span>
          {total > 0 && <span className="muted">{t('bookOcr.pages', { done, total })}</span>}
        </div>
        <Progress value={total > 0 ? done / total : undefined} />
        <div className="book-ocr-meta muted">
          {confidence > 0 && <span>{t('bookOcr.confidence', { percent: Math.round(confidence * 100) })}</span>}
          {etaMs != null && <span>{formatEta(etaMs, t)}</span>}
        </div>
        <Button onClick={cancel} leftIcon={<Icon name="close" size={14} />}>
          {t('common.cancel')}
        </Button>
      </div>
    );
  }

  return (
    <div className="book-ocr-panel">
      {phase === 'done' && progress && (
        <p className="book-ocr-result">
          {t('bookOcr.done', {
            pages: progress.total,
            percent: Math.round(progress.confidence * 100),
          })}
        </p>
      )}
      {phase === 'cancelled' && <p className="muted">{t('bookOcr.cancelled')}</p>}
      {phase === 'error' && <p className="book-ocr-error">{progress?.error ?? t('bookOcr.failed')}</p>}

      <Checkbox
        checked={heavy}
        onChange={(e) => setHeavy(e.currentTarget.checked)}
        label={t('bookOcr.option.heavy')}
      />
      <Checkbox
        checked={bilingual}
        onChange={(e) => setBilingual(e.currentTarget.checked)}
        label={t('bookOcr.option.bilingual')}
      />
      <p className="muted book-ocr-hint">
        {bilingual ? t('bookOcr.hint.bilingual') : t('bookOcr.hint.default')}
      </p>
      <Button onClick={() => void start()} leftIcon={<Icon name="novels" size={14} />}>
        {item.epubFile ? t('bookOcr.reconvert') : t('bookOcr.convert')}
      </Button>
    </div>
  );
}

export default BookOcrPanel;
