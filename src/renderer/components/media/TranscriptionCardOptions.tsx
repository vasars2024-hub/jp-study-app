import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  DEFAULT_TRANSCRIPTION_CARD_OPTIONS,
  normalizeTranscriptionCardOptions,
  type TranscriptionCardOptions,
} from '../../../shared/transcriptionIpc';
import { loadDeck, type DeckFlashcard } from '../../flashcardDeck';
import { useT } from '../../i18n';
import './transcriptionCards.css';

const OPTIONS_KEY = 'jp-media-transcription-card-options-v1';

function loadOptions(): TranscriptionCardOptions {
  try {
    return normalizeTranscriptionCardOptions(JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? 'null'));
  } catch {
    return DEFAULT_TRANSCRIPTION_CARD_OPTIONS;
  }
}

export function useTranscriptionCardOptions(): [
  TranscriptionCardOptions,
  (next: TranscriptionCardOptions) => void,
] {
  const [options, setOptions] = useState(loadOptions);
  const update = useCallback((next: TranscriptionCardOptions) => {
    setOptions(next);
    try {
      localStorage.setItem(OPTIONS_KEY, JSON.stringify(next));
    } catch {
      /* A private/locked store still gets session-local options. */
    }
  }, []);
  return [options, update];
}

export function TranscriptionCardOptionsControl({
  value,
  onChange,
  disabled = false,
}: {
  value: TranscriptionCardOptions;
  onChange: (next: TranscriptionCardOptions) => void;
  disabled?: boolean;
}) {
  const { t } = useT();
  const toggle = (key: keyof TranscriptionCardOptions) => (
    event: ChangeEvent<HTMLInputElement>,
  ): void => onChange({ ...value, [key]: event.currentTarget.checked });

  return (
    <fieldset className="transcription-card-options" disabled={disabled}>
      <legend>{t('media.transcriptCards.options')}</legend>
      <label>
        <input type="checkbox" checked={value.createCards} onChange={toggle('createCards')} />
        {t('media.transcriptCards.create')}
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.translateToEnglish}
          disabled={!value.createCards || disabled}
          onChange={toggle('translateToEnglish')}
        />
        {t('media.transcriptCards.translate')}
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.includeAudio}
          disabled={!value.createCards || disabled}
          onChange={toggle('includeAudio')}
        />
        {t('media.transcriptCards.audio')}
      </label>
      <p className="muted">{t('media.transcriptCards.replaceHint')}</p>
    </fieldset>
  );
}

export interface TranscriptBatchSummary {
  cards: DeckFlashcard[];
  title: string;
  audio: number;
  translated: number;
  estimated: boolean;
}

export function summarizeLatestTranscriptBatch(
  cards: DeckFlashcard[],
  mediaId?: string,
): TranscriptBatchSummary | null {
  const transcriptCards = cards
    .filter((card) => card.textProvenance === 'transcript' && card.studyActionId?.startsWith('transcription:'))
    .filter((card) => !mediaId || card.bookId === mediaId)
    .sort((a, b) => b.addedAt - a.addedAt);
  const batchId = transcriptCards[0]?.studyActionId;
  if (!batchId) return null;
  const batch = transcriptCards.filter((card) => card.studyActionId === batchId);
  return {
    cards: batch,
    title: batch[0]?.bookTitle || tFallbackTitle(batch[0]),
    audio: batch.filter((card) => Boolean(card.audioPath || card.audioDataUrl)).length,
    translated: batch.filter((card) => Boolean((card.meaning || card.back || '').trim())).length,
    estimated: batch.some((card) => card.timingFidelity === 'chunk-estimated'),
  };
}

function tFallbackTitle(card?: DeckFlashcard): string {
  return card?.bookId || '';
}

export function TranscriptionCardDeckStatus({ mediaId }: { mediaId?: string }) {
  const { t } = useT();
  const [cards, setCards] = useState(loadDeck);
  useEffect(() => {
    const update = (): void => setCards(loadDeck());
    window.addEventListener('flashcard-deck-changed', update);
    return () => window.removeEventListener('flashcard-deck-changed', update);
  }, []);
  const summary = useMemo(() => summarizeLatestTranscriptBatch(cards, mediaId), [cards, mediaId]);
  if (!summary) return null;

  const openCards = (): void => {
    window.dispatchEvent(new CustomEvent('os:open', { detail: 'flashcards' }));
    window.dispatchEvent(new CustomEvent('blanc:select-tab', { detail: 'flashcards' }));
  };

  return (
    <section className="transcription-card-status" aria-live="polite">
      <strong>{t('media.transcriptCards.ready', { count: summary.cards.length })}</strong>
      <span>{t('media.transcriptCards.source', { title: summary.title })}</span>
      <span>
        {t('media.transcriptCards.contents', {
          audio: summary.audio,
          translated: summary.translated,
        })}
      </span>
      {summary.estimated && <span>{t('media.transcriptCards.estimated')}</span>}
      <button type="button" className="btn small" onClick={openCards}>
        {t('media.transcriptCards.open')}
      </button>
    </section>
  );
}
