/**
 * Every installed corpus's rank for one entry, as a compact row of chips beside the
 * headword — one per frequency dictionary, the way Yomitan shows them.
 *
 * Before this the entry carried one number: the lowest rank any metadata bank gave the
 * word, attributed to whichever bank won the merge. Two corpora that disagree (a novel
 * list and a news list) is information a learner uses, and the merge threw it away. The
 * ranks here come from `dict:frequency`, the database's per-corpus reader that the
 * page's frequency panel already uses, cached per word for the session.
 *
 * Nothing is estimated: a word no corpus ranks keeps the single merged badge it had (or
 * nothing at all), never a guessed "rare".
 */
import { useEffect, useState } from 'react';
import type { DictEntry } from '../../../shared/types';
import { frequencyBand, type LexiconFrequencyResult } from '../../../shared/lexiconFrequency';
import { cachedWordFrequency, fetchWordFrequency, frequencySourceShortLabel } from '../../dictFrequencyCache';
import { useT } from '../../i18n';
import './dictEntryExtras.css';

/** Chips shown before the rest fold into "+N". */
const MAX_CHIPS = 4;

export default function EntryFrequencies({ entry, lang }: { entry: DictEntry; lang: string }) {
  const { t, lang: uiLang } = useT();
  const key = `${lang}|${entry.word}`;
  const [fetched, setFetched] = useState<{ key: string; value: LexiconFrequencyResult } | null>(null);
  const reply = fetched?.key === key ? fetched.value : cachedWordFrequency(entry.word, lang);

  useEffect(() => {
    if (!entry.word || cachedWordFrequency(entry.word, lang)) return undefined;
    let alive = true;
    void fetchWordFrequency(entry.word, lang).then((value) => {
      if (alive && value) setFetched({ key: `${lang}|${entry.word}`, value });
    });
    return () => {
      alive = false;
    };
  }, [entry.word, lang]);

  const ranks = reply?.entries ?? [];
  if (!ranks.length) {
    // The merged metadata rank, as before: attributed when the merge knew its source.
    if (entry.frequency == null) return null;
    return (
      <span
        className="dict-badge freq"
        title={
          entry.frequencySource
            ? t('dict.results.freqTitleSourced', { source: entry.frequencySource })
            : t('dict.results.freqTitle')
        }
      >
        #{entry.frequency}
        {entry.frequencySource && <span className="dict-freq-source">{entry.frequencySource}</span>}
      </span>
    );
  }

  const shown = ranks.slice(0, MAX_CHIPS);
  const rest = ranks.slice(MAX_CHIPS);
  const number = (value: number): string => value.toLocaleString(uiLang);
  return (
    <span className="dict-freq-chips" role="list" aria-label={t('dict2.freq.label')}>
      {shown.map((row) => {
        const band = frequencyBand(row.rank);
        const title = t('dict2.freq.chipTitle', {
          source: row.corpusTitle,
          rank: number(row.rank),
          band: band ? t(`lexicon.frequency.band.${band}`) : '',
        });
        return (
          <span
            key={row.corpusId}
            role="listitem"
            className={`dict-freq-chip${band ? ` is-${band}` : ''}`}
            title={title}
            aria-label={title}
          >
            <span className="dict-freq-chip-src" aria-hidden="true">{frequencySourceShortLabel(row.corpusTitle)}</span>
            <span className="dict-freq-chip-rank" aria-hidden="true">{number(row.rank)}</span>
          </span>
        );
      })}
      {rest.length > 0 && (
        <span
          role="listitem"
          className="dict-freq-chip dict-freq-chip-more"
          title={rest.map((row) => `${row.corpusTitle} ${number(row.rank)}`).join('\n')}
        >
          {t('dict2.freq.more', { count: rest.length })}
        </span>
      )}
    </span>
  );
}
