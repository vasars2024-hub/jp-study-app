import { useEffect, useRef, useState } from 'react';
import { CLASS_LABELS, type ConjugationForm } from '../../../shared/conjugate';
import { couldConjugate, type ConjugationAnalysis } from '../../../shared/conjugationClass';
import { useT } from '../../i18n';
import './conjugationTable.css';

/**
 * Form names, reusing the keys the dictionary pop-up already shows when it
 * deinflects a word.
 *
 * Deliberately not a new `lexicon.conjugation.form.*` family: the pop-up says
 * "polite past" on the way in and this table would have said the same thing on
 * the way out under a second set of keys, which is how two surfaces end up
 * disagreeing after one of them is retranslated. `pastNegative` is the single
 * form `deinflect.ts` has no reason id for — it deinflects 〜なかった as the
 * `negative` + `past` chain — so it is the only one that needs a key here.
 */
const FORM_KEY: Record<ConjugationForm, string> = {
  polite: 'deinflect.reason.polite',
  negative: 'deinflect.reason.negative',
  politeNegative: 'deinflect.reason.politeNegative',
  past: 'deinflect.reason.past',
  pastNegative: 'lexicon.conjugation.form.pastNegative',
  politePast: 'deinflect.reason.politePast',
  te: 'deinflect.reason.te',
  potential: 'deinflect.reason.potential',
  passive: 'deinflect.reason.passive',
  causative: 'deinflect.reason.causative',
  volitional: 'deinflect.reason.volitional',
  imperative: 'deinflect.reason.imperative',
  conditional: 'deinflect.reason.conditionalBa',
};

interface Props {
  /** The matched headword, not the raw query. */
  query: string;
  /** Source language of the lookup. Only Japanese has a conjugation table here. */
  lang: string;
}

/**
 * Every form of the looked-up word, when the analyser says it has any.
 *
 * Unlike the semantic-neighbour expansion this needs no button: it costs one
 * tokenizer call against a dictionary the main process has already built, and a
 * table that has to be asked for before it can say "this word does not conjugate"
 * is worse than one that is simply absent. Words that cannot conjugate render
 * nothing at all — no empty section, no caption implying a missing import.
 */
export default function ConjugationTable({ query, lang }: Props) {
  const { t } = useT();
  const [analysis, setAnalysis] = useState<ConjugationAnalysis | null>(null);
  const run = useRef(0);

  useEffect(() => {
    const attempt = ++run.current;
    setAnalysis(null);
    if (lang !== 'ja' || !couldConjugate(query)) return;
    void window.api
      .dictConjugation(query)
      .then((result) => {
        // A slow analysis for the previous word must never land under the
        // current one; the run id is bumped before every request.
        if (attempt === run.current) setAnalysis(result);
      })
      .catch(() => {
        // An unavailable analyser is "no table", which is already the state
        // every non-verb renders.
        if (attempt === run.current) setAnalysis(null);
      });
  }, [query, lang]);

  if (!analysis || !analysis.wordClass || analysis.rows.length === 0) return null;

  return (
    <section className="lexicon-conjugation" aria-label={t('lexicon.conjugation.title')}>
      <h3 className="lexicon-conjugation-title">{t('lexicon.conjugation.title')}</h3>
      <p className="muted lexicon-conjugation-class">
        {t('lexicon.conjugation.classIs', {
          word: analysis.word,
          class: CLASS_LABELS[analysis.wordClass],
          type: analysis.conjugationType ?? '',
        })}
      </p>
      {/* The form's name and the form itself, and deliberately not `FormSpec.japanese`.
          That field names one class's suffix — potential is '〜できる', which is
          true of する and of nothing else, and 〜ません is wrong for an
          i-adjective — so in a table that spans every class it would caption
          食べられる as 〜できる. The drill it was written for shows one word at a
          time and can carry it; this cannot. */}
      <ul className="lexicon-conjugation-list">
        {analysis.rows.map((row) => (
          <li key={row.form}>
            <span className="lexicon-conjugation-label">{t(FORM_KEY[row.form])}</span>
            <span className="lexicon-conjugation-surface" lang="ja">{row.surface}</span>
          </li>
        ))}
      </ul>
      <p className="muted lexicon-conjugation-note">{t('lexicon.conjugation.note')}</p>
    </section>
  );
}
