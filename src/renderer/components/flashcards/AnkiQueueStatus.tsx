/**
 * Cards mined while Anki was closed, waiting to be added to it.
 *
 * The local card is already in the deck and reviewable; this line says only
 * that its Anki half has not happened yet, and offers the two things a user
 * can do about it: send them now, or keep them in the app only. Renders
 * nothing when the queue is empty — a permanent "0 waiting" would be noise.
 */
import { useEffect, useState } from 'react';
import type { DeckFlashcard } from '../../flashcardDeck';
import {
  flushAnkiMineQueue,
  keepPendingCardsLocal,
  onAnkiMineQueueChanged,
  pendingAnkiCards,
  type AnkiQueueReport,
} from '../../studyMining';
import { useT } from '../../i18n';

export default function AnkiQueueStatus({ deck }: { deck: DeckFlashcard[] }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<AnkiQueueReport | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => onAnkiMineQueueChanged(() => setTick((n) => n + 1)), []);

  const pending = pendingAnkiCards(deck).length;
  if (!pending && !report) return null;

  const send = async (): Promise<void> => {
    setBusy(true);
    try {
      setReport(await flushAnkiMineQueue());
    } finally {
      setBusy(false);
    }
  };

  let note = '';
  if (report?.unreachable) note = t('flash.ankiQueue.unreachable');
  else if (report && report.sent + report.duplicate > 0) {
    note = t('flash.ankiQueue.sent', { count: report.sent + report.duplicate });
  }
  if (report?.failed) note = `${note} ${t('flash.ankiQueue.failed', { count: report.failed })}`.trim();

  return (
    <div className="flash-anki-queue" role="status" aria-live="polite">
      {pending > 0 && (
        <>
          <span className="flash-anki-queue-count">{t('flash.ankiQueue.pending', { count: pending })}</span>
          <button type="button" className="btn small" disabled={busy} onClick={() => void send()}>
            {busy ? t('flash.ankiQueue.busy') : t('flash.ankiQueue.retry')}
          </button>
          <button
            type="button"
            className="btn small"
            disabled={busy}
            onClick={() => {
              setReport(null);
              void keepPendingCardsLocal();
            }}
          >
            {t('flash.ankiQueue.keepLocal')}
          </button>
        </>
      )}
      {note && <span className="muted">{note}</span>}
    </div>
  );
}
