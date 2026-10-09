/**
 * One dictionary entry's pitch accent: the high/low contour of every reading the pitch
 * dictionaries know, each followed by its downstep number (`[0]` heiban, `[2]` …), the
 * way Yomitan prints it.
 *
 * The structured data comes through `dict:pitch` (the accessor the flashcard contour and
 * Blanc's pitch panel read), via `pitchLookupCache`: one request per term|reading for the
 * session, so re-rendering or reopening the same word never asks twice, and once main has
 * said no pitch dictionary is installed no entry asks at all. Until the reply arrives — or
 * when it carries nothing drawable — the HTML row main attached (if any) stands in, so the
 * row never blinks out; with neither, nothing is rendered.
 *
 * It used to live inside `DictionaryPopup` only, so the Dictionary page (the same
 * `DictionaryResults` in its `page` variant) still printed the bare HTML pattern with no
 * downstep number. Both surfaces now draw the same contour.
 */
import { useEffect, useState } from 'react';
import type { DictEntry } from '../../../shared/types';
import type { PitchLookup } from '../../../shared/pitchAccent';
import { cachedPitch, fetchPitch } from '../../pitchLookupCache';
import { useT } from '../../i18n';
import PitchAccentContour from './PitchAccentContour';

export default function EntryPitch({ entry }: { entry: DictEntry }) {
  const { t } = useT();
  const key = `${entry.word}|${entry.reading}`;
  // Keyed, so a row reused for the next word never shows the previous word's contour.
  const [fetched, setFetched] = useState<{ key: string; value: PitchLookup } | null>(null);
  const reply = fetched?.key === key ? fetched.value : cachedPitch(entry.word, entry.reading);

  useEffect(() => {
    if (!entry.word || cachedPitch(entry.word, entry.reading)) return undefined;
    let alive = true;
    void fetchPitch(entry.word, entry.reading).then((value) => {
      if (alive && value) setFetched({ key: `${entry.word}|${entry.reading}`, value });
    });
    return () => {
      alive = false;
    };
  }, [entry.word, entry.reading]);

  const drawable = reply?.available ? reply.entries.filter((e) => e.positions.length > 0) : [];
  if (!drawable.length && !entry.pitchHtml) return null;
  return (
    <div className="dict-pitch" lang="ja" data-pitch-source={drawable.length ? 'contour' : 'html'}>
      <span className="dict-pitch-label">{t('dict.results.pitch')}</span>
      {drawable.length ? (
        <PitchAccentContour word={entry.word} reading={entry.reading} lang="ja" entries={drawable} showDownstep />
      ) : (
        <span className="dict-pitch-pattern" dangerouslySetInnerHTML={{ __html: entry.pitchHtml ?? '' }} />
      )}
    </div>
  );
}
