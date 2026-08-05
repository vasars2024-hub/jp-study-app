/** One episode row in the detail drawer: still, number, title, runtime, watched. */
import Icon from '../../Icons';
import { useT } from '../../../i18n';
import { LANG_TAGS } from '../../../../shared/i18n/core';
import MediaStatusPill from './MediaStatusPill';
import { useMediaArtwork } from './useMediaArtwork';
import { isWatched, providerEpisodeTitle, watchedFraction } from '../../../../shared/mediaLibraryEntries';
import type { MediaSubtitleStatus } from '../../../../shared/mediaSubtitleStatus';
import type { MediaItem } from '../../../../shared/types';

function runtime(seconds: number | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export interface MediaEpisodeRowProps {
  item: MediaItem;
  /** Position in the season, used when the file name carries no episode number. */
  ordinal: number;
  active?: boolean;
  status?: MediaSubtitleStatus | null;
  onOpen: (id: string) => void;
}

export default function MediaEpisodeRow({ item, ordinal, active, status = null, onOpen }: MediaEpisodeRowProps) {
  const { t, lang } = useT();
  const { url } = useMediaArtwork(item.id, 'still');
  const watched = isWatched(item);
  const progress = watchedFraction(item);
  const number = typeof item.episode === 'number' ? item.episode : ordinal;
  // The provider's episode title beats the file name once a sweep has fetched
  // one — "Roger Smith" rather than "The Big O - 01 [BDRip 1440x1080 x265]".
  const label = providerEpisodeTitle(item) ?? item.title?.trim() ?? item.fileName;
  const percent = progress !== null ? Math.round(progress * 100) : null;
  // Formatted in the UI language so a Japanese or Russian UI does not read US
  // dates. `undefined` here would follow the OS regional setting instead, which
  // is what this line used to do despite the comment claiming otherwise.
  const aired = typeof item.airedAt === 'number' && Number.isFinite(item.airedAt)
    ? new Date(item.airedAt).toLocaleDateString(LANG_TAGS[lang], { year: 'numeric', month: '2-digit', day: '2-digit' })
    : null;

  return (
    <button
      type="button"
      className="medialib-ep"
      data-active={active || undefined}
      onClick={() => onOpen(item.id)}
    >
      <span className="medialib-ep__num">{number}</span>
      <span className="medialib-ep__thumb">
        {/* Genuinely decorative, and the one image in this tree that does not go
            through `MediaArtwork`: the row is a button whose own content is the
            episode number, title, air date and runtime, so the still is a picture
            of an item the button already names. Slice 68's call-site table, row 7. */}
        {url && <img src={url} alt="" loading="lazy" decoding="async" draggable={false} />}
        {percent !== null && percent > 0 && !watched && (
          <span className="medialib-card__progress" aria-hidden="true">
            <i style={{ width: `${percent}%` }} />
          </span>
        )}
      </span>
      <span className="medialib-ep__text">
        <span className="medialib-ep__title" title={label}>{label}</span>
        <MediaStatusPill status={status} />
      </span>
      {aired && <span className="medialib-ep__aired">{aired}</span>}
      {runtime(item.durationSec) && <span className="medialib-ep__dur">{runtime(item.durationSec)}</span>}
      <span
        className="medialib-ep__check"
        data-watched={watched}
        title={watched ? t('media.episode.watched') : t('media.episode.unwatched')}
      >
        <Icon name="check" size={14} />
      </span>
    </button>
  );
}
