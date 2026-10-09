/**
 * The workbench's glossary editor: the learner's preferred renderings
 * ("先輩 → senpai"), applied to every translation whose passage contains them,
 * plus suggestions mined from their own flashcard deck for the passage on screen.
 *
 * The deck is read only while this panel is open and only to suggest; nothing is
 * added to the glossary without a click. Shared by every Translate shell through
 * `TranslateOptionsBar`.
 */
import { useId, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { suggestGlossaryFromDeck, type TranslateGlossaryEntry } from '../../../shared/translateGlossary';
import { loadDeck } from '../../flashcardDeck';
import {
  deleteTranslateGlossaryTerm,
  saveTranslateGlossaryTerm,
  useTranslateGlossary,
} from '../../translateGlossaryStore';

function appliesTo(entry: TranslateGlossaryEntry, source: string, target: string): boolean {
  return (!entry.sourceLang || entry.sourceLang === source) && (!entry.targetLang || entry.targetLang === target);
}

export function TranslateGlossaryPanel({
  source,
  target,
  passage,
  id,
}: {
  source: string;
  target: string;
  /** The text in the source pane: what deck suggestions are drawn for. */
  passage: string;
  id?: string;
}) {
  const { t } = useT();
  const entries = useTranslateGlossary();
  const formId = useId();
  const [term, setTerm] = useState('');
  const [rendering, setRendering] = useState('');
  const [pairOnly, setPairOnly] = useState(true);
  const [note, setNote] = useState('');

  const forPair = useMemo(() => entries.filter((entry) => appliesTo(entry, source, target)), [entries, source, target]);
  const others = entries.length - forPair.length;

  const suggestions = useMemo(() => {
    if (!passage.trim()) return [];
    let cards: Array<{ word: string; meaning: string; studyKind?: string }> = [];
    try {
      cards = loadDeck();
    } catch {
      cards = [];
    }
    return suggestGlossaryFromDeck(cards, passage, target, forPair);
  }, [passage, target, forPair]);

  const pairTag = `${source.toUpperCase()} → ${target.toUpperCase()}`;

  const add = (): void => {
    const saved = saveTranslateGlossaryTerm({
      source: term,
      target: rendering,
      ...(pairOnly ? { sourceLang: source, targetLang: target } : {}),
    });
    setNote(saved ? t('xlate2.glossary.saved', { term: term.trim() }) : t('xlate2.glossary.invalid'));
    if (saved) {
      setTerm('');
      setRendering('');
    }
  };

  return (
    <section id={id} className="xlate2-glossary" aria-label={t('xlate2.glossary.title')}>
      <p className="muted">{t('xlate2.glossary.intro')}</p>
      <form
        className="xlate2-glossary-form"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label htmlFor={`${formId}-term`}>{t('xlate2.glossary.term')}</label>
        <input
          id={`${formId}-term`}
          type="text"
          lang={source}
          value={term}
          maxLength={80}
          onChange={(e) => setTerm(e.target.value)}
        />
        <label htmlFor={`${formId}-rendering`}>{t('xlate2.glossary.rendering')}</label>
        <input
          id={`${formId}-rendering`}
          type="text"
          lang={target}
          value={rendering}
          maxLength={80}
          onChange={(e) => setRendering(e.target.value)}
        />
        <label className="xlate2-glossary-scope">
          <input type="checkbox" checked={pairOnly} onChange={(e) => setPairOnly(e.target.checked)} />
          {t('xlate2.glossary.pairOnly', { pair: pairTag })}
        </label>
        <button type="submit" className="btn" disabled={!term.trim() || !rendering.trim()}>
          {t('xlate2.glossary.add')}
        </button>
      </form>
      {note && <p className="xlate2-note muted" role="status">{note}</p>}

      {suggestions.length > 0 && (
        <div className="xlate2-glossary-suggest">
          <h4>{t('xlate2.glossary.suggestTitle', { count: suggestions.length })}</h4>
          <ul>
            {suggestions.map((s) => (
              <li key={s.source}>
                <span lang={source}>{s.source}</span>
                {' → '}
                <span lang={target}>{s.target}</span>
                <button
                  type="button"
                  className="btn ghost"
                  aria-label={`${t('xlate2.glossary.useSuggestion')} — ${s.source}`}
                  onClick={() => {
                    saveTranslateGlossaryTerm({ ...s, sourceLang: source, targetLang: target, origin: 'deck' });
                  }}
                >
                  {t('xlate2.glossary.useSuggestion')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {forPair.length === 0 ? (
        <p className="muted">{t('xlate2.glossary.empty', { pair: pairTag })}</p>
      ) : (
        <ul className="xlate2-glossary-list" aria-label={t('xlate2.glossary.listLabel', { pair: pairTag })}>
          {forPair.map((entry) => (
            <li key={entry.id}>
              <span lang={entry.sourceLang ?? source}>{entry.source}</span>
              {' → '}
              <span lang={entry.targetLang ?? target}>{entry.target}</span>
              <span className="muted">
                {' · '}
                {entry.sourceLang ? pairTag : t('xlate2.glossary.allPairs')}
                {entry.origin === 'deck' ? ` · ${t('xlate2.glossary.fromDeck')}` : ''}
              </span>
              <button
                type="button"
                className="btn ghost"
                aria-label={`${t('xlate2.glossary.edit')} — ${entry.source}`}
                onClick={() => {
                  setTerm(entry.source);
                  setRendering(entry.target);
                  setPairOnly(Boolean(entry.sourceLang));
                }}
              >
                {t('xlate2.glossary.edit')}
              </button>
              <button
                type="button"
                className="btn ghost"
                aria-label={`${t('common.remove')} — ${entry.source}`}
                onClick={() => deleteTranslateGlossaryTerm(entry.id)}
              >
                {t('common.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {others > 0 && <p className="muted">{t('xlate2.glossary.otherPairs', { count: others })}</p>}
    </section>
  );
}
