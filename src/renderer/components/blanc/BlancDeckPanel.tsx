/**
 * Blanc's Deck tab: the local deck table, the Anki export and the manual-card
 * form. Split out of BlancShell.tsx and loaded with the tab, so the deck store
 * (flashcardDeck and the review log, stats and local-deck sync it reaches) is
 * not part of Blanc's boot bundle — `tools/blanc-budget.cjs` gates that size.
 * Blanc-native markup only; the two sub-panels that render Study OS class names
 * fetch the compat sheet alongside their own chunks.
 */
import { Fragment, Suspense, useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { pickCardAiExtras } from '../../../shared/cardAiExtras';
import { getActiveProfile } from '../../profileState';
import { getStudyLang } from '../../studyEnvironment';
import { normalizeStudyLang, studyLangOfText } from '../../../shared/studyLang';
import {
  addDeckCards,
  loadDeck,
  onDeckChanged,
  removeDeckCard,
  updateDeckCard,
  type DeckFlashcard,
} from '../../flashcardDeck';
import { ProfileSwitcher } from '../ProfileSwitcher';
import { retryableLazy } from '../../retryableLazy';
import { ensureStudyOsCompat } from '../../blancStudyOsCompat';

/** See BlancShell's `withStudyOsCompat`: the panel renders once its sheet is in. */
function withStudyOsCompat<T>(load: () => Promise<T>): () => Promise<T> {
  return () => Promise.all([load(), ensureStudyOsCompat()]).then(([module]) => module);
}

const BlancAnkiPanel = retryableLazy(withStudyOsCompat(() =>
  import('./BlancAnkiPanel').then((m) => ({ default: m.BlancAnkiPanel })),
));
const DeckCardExtrasPanel = retryableLazy(withStudyOsCompat(() => import('../flashcards/DeckCardExtrasPanel')));

export function BlancDeckPanel({ advanced }: { advanced: boolean }) {
  const { t } = useT();
  const [cards, setCards] = useState<DeckFlashcard[]>(() => loadDeck());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState('');
  const [decks, setDecks] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [deck, setDeck] = useState(() => getActiveProfile().anki.deckName ?? '');
  const [term, setTerm] = useState('');
  const [reading, setReading] = useState('');
  const [meaning, setMeaning] = useState('');
  const [sentence, setSentence] = useState('');
  // Rendered a page at a time: the table mounted one row (six cells and a
  // checkbox) per card, 20,000 rows on a large deck.
  const [rowLimit, setRowLimit] = useState(BLANC_DECK_PAGE);
  const [extrasId, setExtrasId] = useState<string | null>(null);

  useEffect(() => onDeckChanged(() => setCards(loadDeck())), []);
  useEffect(() => {
    // Asked once per visit, not on every deck change (picking a deck re-queried
    // AnkiConnect each time), and not at all when the advanced Anki panel is
    // shown instead. A rejected IPC reads as "not connected", not as an
    // unhandled rejection.
    if (advanced) return undefined;
    let alive = true;
    void window.api.ankiStatus()
      .then((next) => {
        if (!alive) return;
        setConnected(!!next.connected);
        setDecks(next.decks ?? []);
        setDeck((current) => current || next.decks?.[0] || '');
      })
      .catch(() => {
        if (!alive) return;
        setConnected(false);
        setDecks([]);
      });
    return () => {
      alive = false;
    };
  }, [advanced]);

  if (advanced) return <BlancAnkiPanel />;

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sendCard = async (
    card: Pick<DeckFlashcard, 'id' | 'word' | 'reading' | 'meaning' | 'sentence' | 'studyLang'>
      & Partial<Pick<DeckFlashcard, 'mnemonic' | 'distinction' | 'exampleSentences' | 'acceptedAnswers'>>,
  ): Promise<boolean> => {
    const result = await window.api.ankiMineNote({
      // The card's own language routes it (absent is Japanese, as stored).
      route: { source: 'other', cardKind: card.sentence ? 'sentence' : 'word', language: normalizeStudyLang(card.studyLang) },
      term: card.word,
      reading: card.reading || undefined,
      meaning: card.meaning || undefined,
      sentence: card.sentence || undefined,
      deckName: deck || undefined,
      // The card's saved extras (memory aid, notes, examples, accepted answers).
      cardExtras: pickCardAiExtras(card),
    });
    const ok = result.ok || result.error === 'duplicate';
    if (card.id) {
      updateDeckCard(card.id, {
        ankiExported: ok,
        ankiExportedAt: ok ? Date.now() : undefined,
        ankiNoteId: result.noteId,
        ankiExportError: ok ? undefined : result.error ?? t('blanc.shell.deck.exportFailed'),
        ankiDeck: deck || undefined,
      });
      setCards(loadDeck());
    }
    return ok;
  };

  const exportSelected = async (): Promise<void> => {
    const targets = cards.filter((card) => selected.has(card.id));
    if (!targets.length) {
      setStatus(t('blanc.shell.deck.selectFirst'));
      return;
    }
    setStatus(t('blanc.shell.deck.exporting', { count: targets.length }));
    let ok = 0;
    for (const card of targets) {
      if (await sendCard(card)) ok += 1;
    }
    setStatus(t('blanc.shell.deck.exported', { ok, total: targets.length }));
  };

  const addManual = async (): Promise<void> => {
    const word = term.trim();
    if (!word) return;
    const payload = {
      word,
      reading: reading.trim(),
      meaning: meaning.trim(),
      sentence: sentence.trim() || undefined,
      front: word,
      back: meaning.trim(),
      source: 'epub' as const,
      // Absent means Japanese on a stored card; anything else is said.
      ...(studyLangOfText(word, getStudyLang()) !== 'ja' ? { studyLang: studyLangOfText(word, getStudyLang()) } : {}),
    };
    const created = addDeckCards([payload])[0];
    setCards(loadDeck());
    setTerm('');
    setReading('');
    setMeaning('');
    setSentence('');
    if (connected && created) {
      const ok = await sendCard(created);
      setStatus(ok ? t('blanc.shell.deck.savedExported') : t('blanc.shell.deck.savedExportFailed'));
    } else {
      setStatus(t('blanc.shell.deck.savedLocal'));
    }
  };

  return (
    <div className="blanc-panel">
      <ProfileSwitcher compact showHeading={false} />
      <fieldset>
        <legend>Anki</legend>
        <div className="blanc-toolbar">
          <span className={`blanc-status-dot${connected ? ' ok' : ''}`} />
          <span>{connected ? t('blanc.shell.deck.connected') : t('blanc.shell.deck.notConnected')}</span>
          <select value={deck} aria-label={t('blanc.shell.deck.deck')} onChange={(event) => setDeck(event.target.value)}>
            {deck && !decks.includes(deck) && <option value={deck}>{deck}</option>}
            <option value="">{t('blanc.shell.deck.profileDefault')}</option>
            {decks.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void exportSelected()}>
            {t('blanc.shell.deck.exportSelected')}
          </button>
        </div>
        {status && <p className="blanc-note">{status}</p>}
      </fieldset>

      <fieldset>
        <legend>{t('blanc.shell.deck.manualCard')}</legend>
        <div className="blanc-form-grid">
          <label>
            {t('blanc.shell.deck.word')}
            <input value={term} lang="ja" onChange={(event) => setTerm(event.target.value)} />
          </label>
          <label>
            {t('blanc.shell.deck.reading')}
            <input value={reading} lang="ja" onChange={(event) => setReading(event.target.value)} />
          </label>
          <label>
            {t('blanc.shell.deck.meaning')}
            <input value={meaning} onChange={(event) => setMeaning(event.target.value)} />
          </label>
          <label>
            {t('blanc.shell.deck.sentence')}
            <input value={sentence} lang="ja" onChange={(event) => setSentence(event.target.value)} />
          </label>
        </div>
        <button type="button" onClick={() => void addManual()} disabled={!term.trim()}>
          {t('blanc.shell.deck.addCard')}
        </button>
      </fieldset>

      <div className="blanc-table-wrap">
        <table className="blanc-table">
          <thead>
            <tr>
              <th />
              <th>{t('blanc.shell.deck.word')}</th>
              <th>{t('blanc.shell.deck.meaning')}</th>
              <th>{t('blanc.shell.deck.source')}</th>
              <th>Anki</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cards.slice(0, rowLimit).map((card) => (
              <Fragment key={card.id}>
                <tr>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(card.id)}
                      aria-label={t('blanc.shell.deck.selectCard', { word: card.word })}
                      onChange={() => toggle(card.id)}
                    />
                  </td>
                  <td lang="ja">{card.word}</td>
                  <td>{card.meaning || card.back}</td>
                  <td>{card.bookTitle || card.source}</td>
                  <td>{card.ankiExported ? t('blanc.shell.deck.stateExported') : card.ankiExportError ? t('blanc.shell.deck.stateFailed') : t('blanc.shell.deck.stateLocal')}</td>
                  <td>
                    {/* The card's saved extras (memory aid, notes, kept examples,
                        accepted answers) — the same panel as the Study OS and Aero
                        deck rows. Not `data-ai-entry`: it works with AI off. */}
                    <button
                      type="button"
                      data-flash-action="row-card-extras"
                      aria-pressed={extrasId === card.id}
                      aria-label={t('aiStudy.extras.open', { word: card.word })}
                      title={t('aiStudy.extras.open', { word: card.word })}
                      onClick={() => setExtrasId(extrasId === card.id ? null : card.id)}
                    >
                      {t('blanc.shell.deck.extras')}
                    </button>{' '}
                    <button type="button" onClick={() => {
                      removeDeckCard(card.id);
                      setCards(loadDeck());
                    }}>
                      {t('blanc.shell.remove')}
                    </button>
                  </td>
                </tr>
                {extrasId === card.id && (
                  <tr>
                    <td colSpan={6}>
                      <Suspense fallback={null}>
                        <DeckCardExtrasPanel card={card} onClose={() => setExtrasId(null)} />
                      </Suspense>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {cards.length === 0 && (
              <tr>
                <td colSpan={6}>{t('blanc.shell.deck.empty')}</td>
              </tr>
            )}
          </tbody>
        </table>
        {cards.length > rowLimit && (
          <p className="blanc-note">
            <span>{t('perf3.deck.rowsShown', { shown: rowLimit, total: cards.length })}</span>{' '}
            <button type="button" onClick={() => setRowLimit((limit) => limit + BLANC_DECK_PAGE)}>
              {t('perf3.deck.showMore', { count: Math.min(BLANC_DECK_PAGE, cards.length - rowLimit) })}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

/** Rows the Blanc deck table mounts per page. */
const BLANC_DECK_PAGE = 200;
