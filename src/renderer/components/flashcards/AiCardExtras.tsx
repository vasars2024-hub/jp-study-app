/**
 * What a card carries beyond its fields — the memory aid and distinguishing note
 * a leech rescue added, and the example sentences the learner chose to keep —
 * plus the optional i+1 example-sentence generator (docs/AI_AUDIT.md N2).
 *
 * Shown on the review answer side and in the deck row's card panel. The saved
 * extras are the learner's (they approved every one), so they are shown — and,
 * in the deck panel, edited or removed — whether or not AI is on. Only the AI
 * "Generate" action is a `data-ai-entry`: the example-corpus lookup needs no
 * model, so the deck panel offers it with AI off too.
 *
 * Generation: the configured engine writes 1–3 sentences from a sample of known
 * words; each is tokenized here and checked against the knowledge store; a
 * sentence with more than one unknown word is discarded, never offered. The
 * fallback, with no model at all, is the example corpus (Tatoeba / an imported
 * one) ranked by the same check.
 */
import { useEffect, useState } from 'react';
import {
  mergeCardExamples,
  type CardExampleSentence,
  type ExampleSentencesResult,
} from '../../../shared/aiExampleSentences';
import { normalizeStudyLang } from '../../../shared/studyLang';
import { useAiReadiness } from '../../aiSetupClient';
import { findDeckCard, onDeckChanged, updateDeckCard, type DeckFlashcard } from '../../flashcardDeck';
import { useT } from '../../i18n';
import { cardContentLang } from '../../studyEnvironment';
import { AiStudyStatus, AiSuggestionBadge, useAiStudyRequest } from '../ai/aiStudyRequest';
import { checkExampleSentences, knownWordSample, type CheckedExample } from './aiExampleCheck';

interface Candidate extends CheckedExample {
  origin: CardExampleSentence['origin'];
  chosen: boolean;
}

function useDeckCard(cardId: string): DeckFlashcard | undefined {
  const [card, setCard] = useState(() => findDeckCard(cardId));
  useEffect(() => {
    setCard(findDeckCard(cardId));
    return onDeckChanged(() => setCard(findDeckCard(cardId)));
  }, [cardId]);
  return card;
}

const CORPUS_FETCH_LIMIT = 20;
const CORPUS_OFFER_LIMIT = 3;

type NoteField = 'mnemonic' | 'distinction';

export default function AiCardExtras({
  cardId,
  showGenerator = true,
  inDeckPanel = false,
}: {
  cardId: string;
  showGenerator?: boolean;
  /**
   * Opened from a deck row on purpose: render even with nothing saved (an empty
   * box on the review card would be noise; here it answers the question), allow
   * editing, and offer the corpus lookup with AI off.
   */
  inDeckPanel?: boolean;
}) {
  const { t, lang: uiLang } = useT();
  const ai = useAiReadiness();
  const card = useDeckCard(cardId);
  const request = useAiStudyRequest<ExampleSentencesResult>();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [checking, setChecking] = useState(false);
  const [corpusState, setCorpusState] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<{ field: NoteField; text: string } | null>(null);

  useEffect(() => {
    setCandidates([]);
    setOpen(false);
    setStatus('');
    setCorpusState('idle');
    setEditing(null);
    request.reset();
  }, [cardId]);

  if (!card) return null;
  const studyLang = normalizeStudyLang(card.studyLang);
  const contentLang = cardContentLang(card);
  const examples = card.exampleSentences ?? [];
  const accepted = [
    ...(card.acceptedAnswers?.meaning ?? []).map((answer) => ({ side: 'meaning' as const, answer })),
    ...(card.acceptedAnswers?.target ?? []).map((answer) => ({ side: 'target' as const, answer })),
  ];
  const hasExtras = Boolean(card.mnemonic || card.distinction || examples.length || (inDeckPanel && accepted.length));

  const offer = async (list: ReadonlyArray<{ text: string; translation: string }>, origin: Candidate['origin']): Promise<void> => {
    setChecking(true);
    try {
      const checked = await checkExampleSentences(list, { word: card.word, reading: card.reading }, studyLang);
      const already = new Set(examples.map((entry) => entry.text));
      setCandidates(checked
        .filter((entry) => !already.has(entry.text))
        .map((entry) => ({ ...entry, origin, chosen: entry.keep && !entry.unchecked })));
    } finally {
      setChecking(false);
    }
  };

  const generate = async (refresh = false): Promise<void> => {
    setStatus('');
    setCandidates([]);
    const result = await request.run((requestId) => window.api.aiStudyExampleSentences({
      requestId,
      word: card.word,
      reading: card.reading,
      meaning: card.meaning || card.back || '',
      knownWords: knownWordSample(card.word),
      count: 3,
      studyLang,
      answerLang: uiLang,
      ...(refresh ? { refresh: true } : {}),
    }));
    if (result) await offer(result.sentences, 'ai');
  };

  const fromCorpus = async (): Promise<void> => {
    setStatus('');
    setCandidates([]);
    setCorpusState('loading');
    try {
      const reply = await window.api.searchExamples(card.word, CORPUS_FETCH_LIMIT, studyLang);
      if (reply.error && !reply.examples.length) {
        setCorpusState('error');
        return;
      }
      const list = reply.examples.map((entry) => ({ text: entry.jp, translation: entry.en }));
      const checked = await checkExampleSentences(list, { word: card.word, reading: card.reading }, studyLang);
      const already = new Set(examples.map((entry) => entry.text));
      const ranked = checked
        .filter((entry) => !already.has(entry.text))
        .sort((a, b) => Number(b.keep) - Number(a.keep) || a.unknown - b.unknown)
        .slice(0, CORPUS_OFFER_LIMIT);
      setCandidates(ranked.map((entry) => ({ ...entry, origin: 'corpus', chosen: false })));
      setCorpusState(ranked.length ? 'idle' : 'empty');
    } catch {
      setCorpusState('error');
    }
  };

  const addChosen = (): void => {
    const chosen = candidates.filter((entry) => entry.chosen && (entry.keep || entry.unchecked));
    if (!chosen.length) return;
    updateDeckCard(card.id, {
      exampleSentences: mergeCardExamples(examples, chosen.map(({ text, translation, origin }) => ({ text, translation, origin }))),
    });
    setCandidates((list) => list.filter((entry) => !entry.chosen));
    setStatus(t('aiStudy.examples.added', { count: chosen.length }));
  };

  const removeExample = (text: string): void => {
    updateDeckCard(card.id, { exampleSentences: examples.filter((entry) => entry.text !== text) });
  };

  const saveNote = (field: NoteField, text: string): void => {
    const value = text.trim();
    updateDeckCard(card.id, { [field]: value || undefined });
    setEditing(null);
  };

  const removeAccepted = (side: 'meaning' | 'target', answer: string): void => {
    const list = (card.acceptedAnswers?.[side] ?? []).filter((entry) => entry !== answer);
    const next = { ...card.acceptedAnswers, [side]: list.length ? list : undefined };
    updateDeckCard(card.id, { acceptedAnswers: next.meaning || next.target ? next : undefined });
  };

  const kept = candidates.filter((entry) => entry.keep);
  const discarded = candidates.filter((entry) => !entry.keep);
  const aiUsable = ai.loaded && ai.enabled;
  // The examples tool: with AI on anywhere, and in the deck panel with AI off
  // too (its corpus lookup needs no model; only "Generate" is AI).
  const toolsAvailable = showGenerator && (aiUsable || inDeckPanel);
  // Nothing saved and nothing to offer: no empty box on the card.
  if (!hasExtras && !toolsAvailable) return null;

  const noteRow = (field: NoteField, labelKey: string, value: string | undefined) => {
    if (inDeckPanel && editing?.field === field) {
      return (
        <form
          className="ai-study-edit"
          onSubmit={(event) => {
            event.preventDefault();
            saveNote(field, editing.text);
          }}
        >
          <label>
            <strong>{t(labelKey)}</strong>
            <textarea
              rows={2}
              value={editing.text}
              onChange={(event) => setEditing({ field, text: event.currentTarget.value })}
            />
          </label>
          <span className="ai-study-actions">
            <button type="submit" className="btn small primary ai-study-btn">{t('aiStudy.extras.save')}</button>
            <button type="button" className="btn small ai-study-btn" onClick={() => setEditing(null)}>
              {t('aiStudy.extras.cancelEdit')}
            </button>
          </span>
        </form>
      );
    }
    if (!value) return null;
    const removeLabel = t(field === 'mnemonic' ? 'aiStudy.extras.removeMnemonic' : 'aiStudy.extras.removeDistinction');
    return (
      <p className="ai-study-note-row">
        <strong>{t(labelKey)}</strong>{' '}
        <span>{value}</span>
        {inDeckPanel && (
          <span className="ai-study-actions">
            <button
              type="button"
              className="btn small ai-study-btn"
              data-extras-action={`edit-${field}`}
              onClick={() => setEditing({ field, text: value })}
            >
              {t('aiStudy.extras.edit')}
            </button>
            <button
              type="button"
              className="btn small ai-study-btn"
              data-extras-action={`remove-${field}`}
              aria-label={removeLabel}
              title={removeLabel}
              onClick={() => saveNote(field, '')}
            >
              ×
            </button>
          </span>
        )}
      </p>
    );
  };

  return (
    <div className="ai-study-extras" onClick={(event) => event.stopPropagation()}>
      {inDeckPanel && !hasExtras && <p className="muted ai-study-note">{t('aiStudy.extras.empty')}</p>}
      {noteRow('mnemonic', 'aiStudy.extras.mnemonic', card.mnemonic)}
      {noteRow('distinction', 'aiStudy.extras.distinction', card.distinction)}
      {inDeckPanel && accepted.length > 0 && (
        <div>
          <p className="ai-study-section-label">{t('aiStudy.extras.accepted')}</p>
          <ul className="ai-study-list">
            {accepted.map((entry) => (
              <li key={`${entry.side}:${entry.answer}`} className="ai-study-item">
                <span>{entry.answer}</span>
                <span className="ai-study-actions">
                  <button
                    type="button"
                    className="btn small ai-study-btn"
                    aria-label={t('aiStudy.extras.acceptedRemove', { answer: entry.answer })}
                    title={t('aiStudy.extras.acceptedRemove', { answer: entry.answer })}
                    onClick={() => removeAccepted(entry.side, entry.answer)}
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {examples.length > 0 && (
        <div>
          <p className="ai-study-section-label">{t('aiStudy.extras.examples')}</p>
          <ul className="ai-study-list">
            {examples.map((entry) => (
              <li key={entry.text} className="ai-study-item">
                <span lang={contentLang}>{entry.text}</span>
                {entry.translation && <span className="muted">{entry.translation}</span>}
                <span className="ai-study-actions">
                  <span className="ai-study-meta">
                    {t(entry.origin === 'ai' ? 'aiStudy.extras.originAi' : 'aiStudy.extras.originCorpus')}
                  </span>
                  <button
                    type="button"
                    className="btn small ai-study-btn"
                    aria-label={t('aiStudy.extras.remove', { text: entry.text })}
                    title={t('aiStudy.extras.remove', { text: entry.text })}
                    onClick={() => removeExample(entry.text)}
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {toolsAvailable && !open && (
        <div className="ai-study is-collapsed">
          <button type="button" className="btn small ai-study-btn" aria-expanded={false} onClick={() => setOpen(true)}>
            {t('aiStudy.examples.button')}
          </button>
        </div>
      )}
      {toolsAvailable && open && (
        <section className="ai-study" aria-label={t('aiStudy.examples.title')}>
          <div className="ai-study-head">
            <h4>{t('aiStudy.examples.title')}</h4>
            <button
              type="button"
              className="btn small ai-study-btn"
              aria-label={t('aiStudy.close')}
              title={t('aiStudy.close')}
              onClick={() => {
                request.reset();
                setCandidates([]);
                setOpen(false);
              }}
            >
              ×
            </button>
          </div>
          <p className="muted ai-study-note">{t('aiStudy.examples.about')}</p>
          <div className="ai-study-actions">
            {aiUsable && (
              <button
                type="button"
                className="btn small primary ai-study-btn"
                data-ai-entry
                disabled={request.state.status === 'running' || checking}
                onClick={() => void generate(request.state.status === 'done')}
              >
                {t(request.state.status === 'done' ? 'aiStudy.askAgain' : 'aiStudy.examples.generate')}
              </button>
            )}
            <button
              type="button"
              className="btn small ai-study-btn"
              disabled={corpusState === 'loading' || checking}
              onClick={() => void fromCorpus()}
            >
              {t('aiStudy.examples.corpus')}
            </button>
          </div>
          <AiStudyStatus state={request.state} onCancel={request.cancel} busyKey="aiStudy.examples.busy" />
          {(checking || corpusState === 'loading') && <p className="muted ai-study-note" role="status">{t('aiStudy.examples.checking')}</p>}
          {corpusState === 'empty' && <p className="muted ai-study-note" role="status">{t('aiStudy.examples.corpusEmpty')}</p>}
          {corpusState === 'error' && <p className="ai-study-error" role="alert">{t('aiStudy.examples.corpusError')}</p>}

          {kept.length > 0 && (
            <fieldset className="ai-study-list">
              <legend className="ai-study-section-label">{t('aiStudy.examples.offered')}</legend>
              {kept.map((entry) => (
                <div key={entry.text} className="ai-study-item">
                  {entry.origin === 'ai' && <AiSuggestionBadge />}
                  <label className="ai-study-check">
                    <input
                      type="checkbox"
                      checked={entry.chosen}
                      onChange={(event) => {
                        const chosen = event.currentTarget.checked;
                        setCandidates((list) => list.map((c) => (c.text === entry.text ? { ...c, chosen } : c)));
                      }}
                    />
                    <span>
                      <span lang={contentLang}>{entry.text}</span>
                      {entry.translation && <><br /><span className="muted" lang={entry.origin === 'ai' ? uiLang : undefined}>{entry.translation}</span></>}
                    </span>
                  </label>
                  <span className="ai-study-meta">
                    {entry.unchecked
                      ? t('aiStudy.examples.unchecked')
                      : t('aiStudy.examples.coverage', { percent: entry.coveragePercent ?? 0, unknown: entry.unknown })}
                  </span>
                </div>
              ))}
            </fieldset>
          )}
          {discarded.length > 0 && (
            <details>
              <summary>{t('aiStudy.examples.discarded', { count: discarded.length })}</summary>
              <ul className="ai-study-list">
                {discarded.map((entry) => (
                  <li key={entry.text} className="ai-study-item is-discarded">
                    <span lang={contentLang}>{entry.text}</span>
                    <span className="ai-study-meta">
                      {t('aiStudy.examples.coverage', { percent: entry.coveragePercent ?? 0, unknown: entry.unknown })}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {request.state.status === 'done' && !checking && candidates.length === 0 && !status && (
            <p className="muted ai-study-note" role="status">{t('aiStudy.examples.noneLeft')}</p>
          )}
          {kept.length > 0 && (
            <div className="ai-study-actions">
              <button
                type="button"
                className="btn small primary ai-study-btn"
                disabled={!kept.some((entry) => entry.chosen)}
                onClick={addChosen}
              >
                {t('aiStudy.examples.add')}
              </button>
            </div>
          )}
          {status && <p className="ai-study-note" role="status">{status}</p>}
        </section>
      )}
    </div>
  );
}
