/**
 * Credits and ratings for a title's Details list: director / creator, cast,
 * age rating, country and airing slot. Read from the library items the
 * metadata providers filled (TMDB credits, release dates and content ratings;
 * TVmaze cast and schedule). Rendered as `<div><dt/><dd/></div>` rows so it
 * drops into an existing `<dl>`.
 */
import type { MediaItem } from '../../../shared/types';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { useT } from '../../i18n';

function firstOf<K extends keyof MediaItem>(items: readonly MediaItem[], key: K): MediaItem[K] | undefined {
  return items.map((item) => item[key]).find((value) => value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0));
}

export default function MediaCreditsFacts({ items }: { items: readonly MediaItem[] }) {
  const { t, lang } = useT();
  const director = firstOf(items, 'director');
  const cast = firstOf(items, 'cast');
  const ageRating = firstOf(items, 'ageRating');
  const country = firstOf(items, 'country');
  const schedule = firstOf(items, 'schedule');
  let countryName = country ?? '';
  if (country) {
    try {
      countryName = new Intl.DisplayNames([LANG_TAGS[lang] ?? 'en'], { type: 'region' }).of(country) ?? country;
    } catch {
      countryName = country;
    }
  }
  return (
    <>
      {director && <div><dt>{t('gum.facts.director')}</dt><dd>{director}</dd></div>}
      {cast && cast.length > 0 && <div><dt>{t('gum.facts.cast')}</dt><dd>{cast.slice(0, 6).join(', ')}</dd></div>}
      {ageRating && <div><dt>{t('gum.facts.ageRating')}</dt><dd>{ageRating}</dd></div>}
      {country && <div><dt>{t('gum.facts.country')}</dt><dd>{countryName}</dd></div>}
      {schedule && <div><dt>{t('gum.facts.schedule')}</dt><dd>{schedule}</dd></div>}
    </>
  );
}
