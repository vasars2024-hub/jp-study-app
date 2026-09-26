/**
 * Japanese pitch accent for one word, drawn as its high/low contour over the morae.
 *
 * The data is the pitch dictionary the app already holds (the Kanjium accents it seeds, or
 * any Yomitan pitch dictionary the user imported under Settings, dictionaries), read
 * through `dict:pitch`. The dictionary popup shows the same data as the pitch row of each
 * entry; this is the component for surfaces that only have a word and its reading — a
 * flashcard's answer side.
 *
 * Japanese only: Chinese shows tones in its pinyin and Russian its stress mark, both already
 * in the reading. With no pitch dictionary, or no entry for the word, it renders nothing —
 * an answer side is not the place to explain a missing asset.
 */
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import {
  isPitchLookup,
  moraPitch,
  pitchPatternName,
  splitMorae,
  type PitchEntry,
} from '../../../shared/pitchAccent';
import './pitchAccentContour.css';

interface Props {
  word: string;
  reading?: string;
  /** The card's study language; anything but Japanese renders nothing. */
  lang: string;
  className?: string;
}

export default function PitchAccentContour({ word, reading, lang, className }: Props) {
  const { t } = useT();
  const [entries, setEntries] = useState<PitchEntry[]>([]);
  const term = word.trim();
  const kana = (reading ?? '').trim();

  useEffect(() => {
    setEntries([]);
    if (lang !== 'ja' || !term) return undefined;
    const api = window.api?.dictPitch;
    if (typeof api !== 'function') return undefined;
    let alive = true;
    void api(term, kana || undefined)
      .then((res) => {
        if (alive && isPitchLookup(res) && res.available) setEntries(res.entries);
      })
      .catch(() => {
        /* no pitch data is not an error on a flashcard */
      });
    return () => {
      alive = false;
    };
  }, [term, kana, lang]);

  if (!entries.length) return null;
  return (
    <span className={['pitch-contour-list', className].filter(Boolean).join(' ')} lang="ja">
      {entries.flatMap((entry) =>
        entry.positions.map((downstep) => {
          const morae = splitMorae(entry.reading);
          const high = moraPitch(entry.reading, downstep);
          const pattern = pitchPatternName(downstep, morae.length);
          const label = t('dict.results.pitchAria', {
            reading: entry.reading,
            pattern: t(`dict.results.pitchPattern.${pattern}`),
          });
          return (
            <span
              key={`${entry.reading}-${downstep}`}
              className="pitch-contour"
              role="img"
              aria-label={label}
              title={label}
              data-pattern={pattern}
            >
              {morae.map((mora, i) => (
                <span
                  key={i}
                  className={`pitch-mora${high[i] ? ' is-high' : ''}${
                    // The drop: this mora is high and the next one (or the particle) is low.
                    high[i] && (i === morae.length - 1 ? downstep === morae.length : !high[i + 1]) ? ' is-drop' : ''
                  }`}
                >
                  {mora}
                </span>
              ))}
            </span>
          );
        }),
      )}
    </span>
  );
}
