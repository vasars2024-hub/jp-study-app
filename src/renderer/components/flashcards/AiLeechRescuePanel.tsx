/**
 * AI leech rescue (docs/AI_AUDIT.md N3): for a card the learner keeps
 * forgetting, a suggested mnemonic, a clearer meaning and a note that tells it
 * apart from the similar cards in the deck.
 *
 * Every part is shown as an AI suggestion and written only when the learner
 * ticks it and presses Approve; Reject drops it. A clearer meaning replaces the
 * learner's own meaning, so it starts unticked and shows the current one beside
 * it. Batch mode walks every leech one request at a time (cancellable), each
 * with its own Approve / Reject.
 *
 * Without a model (AI not ready, cloud not allowed, a failed call) each card
 * still gets the deterministic rescue: a partial-reveal hint of the reading and
 * the similar cards to compare against.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  leechRescueFallback,
  leechRescuePatch,
  type LeechRescueApproval,
  type LeechRescueSuggestion,
} from '../../../shared/aiLeechRescue';
import { pickWhyWrongNeighbours, type WhyWrongDeckCard } from '../../../shared/aiWhyWrong';
import { normalizeStudyLang } from '../../../shared/studyLang';
import { useAiReadiness } from '../../aiSetupClient';
import { loadDeck, updateDeckCard, type DeckFlashcard } from '../../flashcardDeck';
import { useT } from '../../i18n';
import { cardContentLang } from '../../studyEnvironment';
import {
  aiStudyStateFrom,
  AiStudyStatus,
  AiSuggestionBadge,
  cancelAiStudyRun,
  newAiStudyRequestId,
  type AiStudyRunState,
} from '../ai/aiStudyRequest';

type Outcome = 'pending' | 'applied' | 'rejected';

interface ItemState {
  run: AiStudyRunState<LeechRescueSuggestion>;
  approval: LeechRescueApproval;
  outcome: Outcome;
}

const IDLE: ItemState = {
  run: { status: 'idle' },
  approval: { mnemonic: true, clearerMeaning: false, distinction: true },
  outcome: 'pending',
};

function asDeckLike(card: DeckFlashcard): WhyWrongDeckCard {
  return { id: card.id, word: card.word || card.front || '', reading: card.reading || '', meaning: card.meaning || card.back || '' };
}

function lapsesOf(card: DeckFlashcard): number {
  const lapses = (card.srs as { lapses?: unknown } | undefined)?.lapses;
  return typeof lapses === 'number' && Number.isFinite(lapses) ? lapses : 0;
}

export default function AiLeechRescuePanel({
  cardIds,
  onApplied,
}: {
  /** One id: the review's leech banner. Several: the deck's "rescue all leeches". */
  cardIds: readonly string[];
  /** After an approval wrote to a card; the host re-reads the deck. */
  onApplied?: (cardId: string) => void;
}) {
  const { t, lang: uiLang } = useT();
  const ai = useAiReadiness();
  const batch = cardIds.length > 1;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Record<string, ItemState>>({});
  const [running, setRunning] = useState(false);
  const activeRequest = useRef<string | null>(null);
  const stopRef = useRef(false);

  const deck = useMemo(() => (open ? loadDeck() : []), [open, items]);
  const byId = useMemo(() => new Map(deck.map((card) => [card.id, card])), [deck]);
  const cards = cardIds.map((id) => byId.get(id)).filter((card): card is DeckFlashcard => Boolean(card));

  useEffect(() => () => {
    stopRef.current = true;
    if (activeRequest.current) cancelAiStudyRun(activeRequest.current);
  }, []);

  const similarFor = (card: DeckFlashcard) => {
    const lang = normalizeStudyLang(card.studyLang);
    // The single-card banner asks before the memoised deck exists.
    const source = deck.length ? deck : loadDeck();
    const pool = source.filter((entry) => normalizeStudyLang(entry.studyLang) === lang).map(asDeckLike);
    return pickWhyWrongNeighbours(asDeckLike(card), pool, 6).map(({ word, reading, meaning }) => ({ word, reading, meaning }));
  };

  const patchItem = (id: string, patch: Partial<ItemState>): void => {
    setItems((current) => ({ ...current, [id]: { ...(current[id] ?? IDLE), ...patch } }));
  };

  const suggest = async (card: DeckFlashcard, refresh = false): Promise<AiStudyRunState<LeechRescueSuggestion> | null> => {
    const requestId = newAiStudyRequestId();
    activeRequest.current = requestId;
    patchItem(card.id, { run: { status: 'running' }, outcome: 'pending' });
    let next: AiStudyRunState<LeechRescueSuggestion>;
    try {
      next = aiStudyStateFrom(await window.api.aiStudyLeechRescue({
        requestId,
        card: {
          word: card.word || card.front || '',
          reading: card.reading || '',
          meaning: card.meaning || card.back || '',
          sentence: card.sentence || '',
          lapses: lapsesOf(card),
        },
        similar: similarFor(card),
        studyLang: normalizeStudyLang(card.studyLang),
        answerLang: uiLang,
        ...(refresh ? { refresh: true } : {}),
      }));
    } catch {
      next = { status: 'failed', code: 'ipc-failed' };
    }
    if (activeRequest.current !== requestId) return null;
    activeRequest.current = null;
    patchItem(card.id, {
      run: next,
      // A suggestion with no distinction cannot have it approved.
      ...(next.status === 'done' ? { approval: { mnemonic: true, clearerMeaning: false, distinction: Boolean(next.result.distinction) } } : {}),
    });
    return next;
  };

  const suggestAll = async (): Promise<void> => {
    stopRef.current = false;
    setRunning(true);
    try {
      for (const card of cards) {
        if (stopRef.current) break;
        const state = items[card.id];
        if (state && (state.run.status === 'done' || state.outcome !== 'pending')) continue;
        const next = await suggest(card);
        // Cancelled, or a failure that would repeat for every card (switched off,
        // no key, cloud not allowed, no model, spend limit): the batch stops.
        if (!next) break;
        if (next.status === 'failed' && (next.needsKey || next.needsConsent || next.needsLocalModel
          || ['ai-off', 'cancelled', 'auth', 'spend', 'offline'].includes(next.code))) break;
      }
    } finally {
      setRunning(false);
    }
  };

  const cancel = (cardId?: string): void => {
    stopRef.current = true;
    const id = activeRequest.current;
    activeRequest.current = null;
    if (id) cancelAiStudyRun(id);
    if (cardId) patchItem(cardId, { run: { status: 'failed', code: 'cancelled' } });
    else {
      setItems((current) => {
        const next = { ...current };
        for (const [key, value] of Object.entries(next)) {
          if (value.run.status === 'running') next[key] = { ...value, run: { status: 'failed', code: 'cancelled' } };
        }
        return next;
      });
    }
    setRunning(false);
  };

  const approve = (card: DeckFlashcard): void => {
    const state = items[card.id];
    if (!state || state.run.status !== 'done') return;
    const patch = leechRescuePatch(state.run.result, state.approval);
    if (!Object.keys(patch).length) return;
    updateDeckCard(card.id, patch);
    patchItem(card.id, { outcome: 'applied' });
    onApplied?.(card.id);
  };

  const applyHint = (card: DeckFlashcard, hint: string): void => {
    updateDeckCard(card.id, { mnemonic: hint });
    patchItem(card.id, { outcome: 'applied' });
    onApplied?.(card.id);
  };

  if (!ai.loaded || !ai.enabled) return null;

  if (!open) {
    return (
      <span className="ai-study is-collapsed" data-ai-entry>
        <button
          type="button"
          className="btn small ai-study-btn"
          aria-expanded={false}
          onClick={() => {
            setOpen(true);
            if (!batch) {
              const card = loadDeck().find((entry) => entry.id === cardIds[0]);
              if (card) void suggest(card);
            }
          }}
        >
          {batch ? t('aiStudy.leech.batchButton', { count: cardIds.length }) : t('aiStudy.leech.button')}
        </button>
      </span>
    );
  }

  return (
    <section className="ai-study ai-study-leech" data-ai-entry aria-label={t('aiStudy.leech.title')}>
      <div className="ai-study-head">
        <h4>{batch ? t('aiStudy.leech.batchTitle', { count: cards.length }) : t('aiStudy.leech.title')}</h4>
        {batch && (running ? (
          <button type="button" className="btn small ai-study-btn" onClick={() => cancel()}>
            {t('aiStudy.leech.stop')}
          </button>
        ) : (
          <button type="button" className="btn small primary ai-study-btn" onClick={() => void suggestAll()}>
            {t('aiStudy.leech.suggestAll')}
          </button>
        ))}
        <button
          type="button"
          className="btn small ai-study-btn"
          aria-label={t('aiStudy.close')}
          title={t('aiStudy.close')}
          onClick={() => {
            cancel();
            setOpen(false);
          }}
        >
          ×
        </button>
      </div>
      <p className="muted ai-study-note">{t('aiStudy.leech.about')}</p>
      <ul className="ai-study-list">
        {cards.map((card) => {
          const state = items[card.id] ?? IDLE;
          // Only computed for a card whose AI suggestion failed: it walks the deck.
          const fallback = leechRescueFallback({ word: card.word, reading: card.reading }, state.run.status === 'failed' ? similarFor(card) : []);
          const suggestion = state.run.status === 'done' ? state.run.result : null;
          const contentLang = cardContentLang(card);
          return (
            <li key={card.id} className="ai-study-item">
              <div className="ai-study-head">
                <strong lang={contentLang}>{card.word || card.front}</strong>
                <span className="muted">{card.meaning || card.back}</span>
                {batch && state.run.status === 'idle' && state.outcome === 'pending' && (
                  <button type="button" className="btn small ai-study-btn" disabled={running} onClick={() => void suggest(card)}>
                    {t('aiStudy.leech.suggestOne')}
                  </button>
                )}
              </div>
              <AiStudyStatus state={state.run} onCancel={() => cancel(card.id)} busyKey="aiStudy.leech.busy" />
              {state.outcome === 'applied' && <p className="ai-study-note" role="status">{t('aiStudy.leech.applied')}</p>}
              {state.outcome === 'rejected' && <p className="muted ai-study-note" role="status">{t('aiStudy.leech.rejected')}</p>}
              {suggestion && state.outcome === 'pending' && (
                <fieldset className="ai-study-answer">
                  <legend><AiSuggestionBadge /></legend>
                  <label className="ai-study-check">
                    <input
                      type="checkbox"
                      checked={state.approval.mnemonic}
                      onChange={(event) => patchItem(card.id, { approval: { ...state.approval, mnemonic: event.currentTarget.checked } })}
                    />
                    <span><strong>{t('aiStudy.extras.mnemonic')}</strong> <span lang={uiLang}>{suggestion.mnemonic}</span></span>
                  </label>
                  {suggestion.clearerMeaning && (
                    <label className="ai-study-check">
                      <input
                        type="checkbox"
                        checked={state.approval.clearerMeaning}
                        onChange={(event) => patchItem(card.id, { approval: { ...state.approval, clearerMeaning: event.currentTarget.checked } })}
                      />
                      <span>
                        <strong>{t('aiStudy.leech.clearerMeaning')}</strong> {suggestion.clearerMeaning}
                        <br />
                        <span className="muted">{t('aiStudy.leech.currentMeaning', { meaning: card.meaning || card.back || '—' })}</span>
                      </span>
                    </label>
                  )}
                  {suggestion.distinction && (
                    <label className="ai-study-check">
                      <input
                        type="checkbox"
                        checked={state.approval.distinction}
                        onChange={(event) => patchItem(card.id, { approval: { ...state.approval, distinction: event.currentTarget.checked } })}
                      />
                      <span><strong>{t('aiStudy.extras.distinction')}</strong> <span lang={uiLang}>{suggestion.distinction}</span></span>
                    </label>
                  )}
                  {(card.mnemonic || card.distinction) && (
                    <p className="muted ai-study-meta">{t('aiStudy.leech.replaces')}</p>
                  )}
                  <div className="ai-study-actions">
                    <button
                      type="button"
                      className="btn small primary ai-study-btn"
                      disabled={!Object.keys(leechRescuePatch(suggestion, state.approval)).length}
                      onClick={() => approve(card)}
                    >
                      {t('aiStudy.leech.approve')}
                    </button>
                    <button type="button" className="btn small ai-study-btn" onClick={() => patchItem(card.id, { outcome: 'rejected' })}>
                      {t('aiStudy.leech.reject')}
                    </button>
                    <button type="button" className="btn small ai-study-btn" disabled={running} onClick={() => void suggest(card, true)}>
                      {t('aiStudy.askAgain')}
                    </button>
                  </div>
                </fieldset>
              )}
              {state.run.status === 'failed' && state.outcome === 'pending' && (
                <div className="ai-study-actions">
                  <p className="ai-study-note">
                    <span className="ai-study-section-label">{t('aiStudy.leech.fallback')}</span>{' '}
                    {fallback.hint ? t('aiStudy.leech.hint', { hint: fallback.hint }) : t('aiStudy.leech.noHint')}
                    {fallback.similar.length > 0 && (
                      <> {t('aiStudy.leech.compare', { words: fallback.similar.map((entry) => entry.word).join(' · ') })}</>
                    )}
                  </p>
                  {fallback.hint && !card.mnemonic && (
                    <button type="button" className="btn small ai-study-btn" onClick={() => applyHint(card, fallback.hint as string)}>
                      {t('aiStudy.leech.useHint')}
                    </button>
                  )}
                  <button type="button" className="btn small ai-study-btn" disabled={running} onClick={() => void suggest(card)}>
                    {t('aiStudy.leech.retry')}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
