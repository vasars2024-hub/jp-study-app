/**
 * Card Studio's streaming preview (docs/AI_AUDIT.md F9): while a run is asking
 * the model, the words it is writing appear one by one — the expression, its
 * reading and meaning, read out of the partial JSON (`shared/aiStreamPreview.ts`),
 * never the JSON itself. Cancel (`ai:cancelGenerate`) keeps the list on screen,
 * marked as stopped; the finished items main already kept are in the preview
 * below as before.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { partialJsonStrings, streamItems } from '../../shared/aiStreamPreview';
import { useT } from '../i18n';
import { subscribeAiStream } from './ai/aiStream';
import './ai/aiStream.css';

export interface CardDraftItem {
  expression: string;
  reading: string;
  meaning: string;
}

/** The words a reply has written so far: a batch's `items`, or one word's object. */
export function cardDraftItems(raw: string): CardDraftItem[] {
  const fromBatch = streamItems(raw, 'items');
  const rows = fromBatch.length
    ? fromBatch
    : [Object.fromEntries(partialJsonStrings(raw).filter((f) => !f.path.includes('.')).map((f) => [f.key, f.value]))];
  return rows
    .map((row) => ({ expression: (row.expression ?? '').trim(), reading: (row.reading ?? '').trim(), meaning: (row.meaning ?? '').trim() }))
    .filter((item) => item.expression);
}

let studioCounter = 0;

/**
 * One run's stream. `begin()` gives the id to send with the request; each new
 * reply in the run (a word, an invent batch) replaces the list.
 */
export function useCardStudioStream() {
  const [items, setItems] = useState<CardDraftItem[]>([]);
  const [phase, setPhase] = useState<'idle' | 'drafting' | 'stopped'>('idle');
  const unsubscribe = useRef<(() => void) | null>(null);

  const end = useCallback((): void => {
    unsubscribe.current?.();
    unsubscribe.current = null;
  }, []);

  const begin = useCallback((): string => {
    end();
    studioCounter += 1;
    const requestId = `cs-${Date.now().toString(36)}-${studioCounter}`;
    setItems([]);
    setPhase('drafting');
    unsubscribe.current = subscribeAiStream(requestId, (raw) => setItems(cardDraftItems(raw)));
    return requestId;
  }, [end]);

  /** The run is over: a finished one hides the draft, a cancelled one keeps it. */
  const finish = useCallback((cancelled: boolean): void => {
    end();
    setPhase(cancelled ? 'stopped' : 'idle');
    if (!cancelled) setItems([]);
  }, [end]);

  useEffect(() => end, [end]);

  return { items, phase, begin, finish };
}

export default function AiCardStudioDraft({
  items,
  phase,
  lang,
}: {
  items: readonly CardDraftItem[];
  phase: 'idle' | 'drafting' | 'stopped';
  /** The language the cards' expressions are in. */
  lang?: string;
}) {
  const { t } = useT();
  if (phase === 'idle' || !items.length) return null;
  return (
    <div className={`ai-stream-draft is-${phase}`} data-ai-stream={phase} aria-busy={phase === 'drafting'}>
      <p className="ai-stream-label" role="status">
        {t(phase === 'drafting' ? 'aiStudy.stream.cards' : 'aiStudy.stream.stopped')}
      </p>
      <ul className="ai-stream-text ai-stream-items">
        {items.map((item, index) => (
          <li key={`${index}-${item.expression}`}>
            <span lang={lang}>{item.expression}</span>
            {item.reading && item.reading !== item.expression && <span lang={lang}> ({item.reading})</span>}
            {item.meaning && <> — {item.meaning}</>}
            {phase === 'drafting' && index === items.length - 1 && <span className="ai-stream-caret" aria-hidden="true" />}
          </li>
        ))}
      </ul>
    </div>
  );
}
