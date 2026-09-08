/**
 * The one-title shelf.
 *
 * A shelf that holds a single entry is a presentation problem, not a column
 * width. "Continue watching" with one title laid one 240px card out in a 764px
 * grid and left 284x602 of nothing beside it — 16.5% of a maximized viewport
 * against the rubric's 15% bar (`src/LIQUID_UI_RUBRIC.md` §4). Growing the card
 * only moves the void: the poster is height-bounded by the grid box long before
 * it is width-bounded.
 *
 * So the surplus width goes to the same title instead of to more tracks. The art
 * keeps its ratio, and the space beside it carries what the small card can only
 * hint at — the facts, the watch progress, and the actions. It is the entry the
 * user was already looking at, said at the size the window is actually offering.
 *
 * `MediaPosterCard` stays untouched and stays the grid's card: this renders only
 * when the shelf holds exactly one entry, so every denser shelf is byte-identical
 * to what it was.
 */

import { Button } from '../../ui';
import Icon from '../../Icons';
import { useT } from '../../../i18n';
import MediaArtwork from './MediaArtwork';
import MediaStatusPill from './MediaStatusPill';
import { CARD_METRICS, formatCardDuration, type MediaCardVariant } from './MediaPosterCard';
import { mediaSubtitleStatus } from '../../../../shared/mediaSubtitleStatus';
import type { LibraryEntry } from '../../../../shared/mediaLibraryEntries';

export interface MediaSpotlightCardProps {
  entry: LibraryEntry;
  variant: MediaCardVariant;
  active?: boolean;
  onOpen: () => void;
  onMenu: (anchor: HTMLElement) => void;
}

export default function MediaSpotlightCard({
  entry,
  variant,
  active = false,
  onOpen,
  onMenu,
}: MediaSpotlightCardProps) {
  const { t } = useT();

  const percent = entry.progress !== null && Number.isFinite(entry.progress)
    ? Math.min(100, Math.max(0, Math.round(entry.progress * 100)))
    : null;

  const duration = formatCardDuration(entry.primary.durationSec);
  const languages = entry.subtitleLanguages.map((code) => code.toUpperCase()).join(' · ');

  // Only rows that have something to say. An empty row is a worse use of the
  // space than no row, and it is the "honest states" bar in §8 of the rubric.
  const facts: Array<{ key: string; label: string; value: string }> = [
    { key: 'type', label: t('media.spotlight.type'), value: t(`media.category.${entry.category}`) },
    entry.year !== null
      ? { key: 'year', label: t('media.spotlight.year'), value: String(entry.year) }
      : null,
    entry.grouping !== 'none'
      ? {
        key: 'episodes',
        label: t('media.spotlight.episodes'),
        value: t('media.detail.episodeProgress', {
          have: entry.watchedCount,
          total: entry.episodeCount,
        }),
      }
      : null,
    entry.grouping === 'none' && duration
      ? { key: 'duration', label: t('media.spotlight.duration'), value: duration }
      : null,
    languages
      ? { key: 'languages', label: t('media.spotlight.languages'), value: languages }
      : null,
  ].filter((row): row is { key: string; label: string; value: string } => row !== null);

  return (
    <section
      className="medialib-spotlight"
      aria-label={t('media.spotlight.label')}
      data-active={active || undefined}
    >
      <div className="medialib-spotlight__art">
        <MediaArtwork
          id={entry.artworkItem.id}
          title={entry.title}
          ratio={CARD_METRICS[variant].ratioCss}
          // The heading two nodes down names the title, so the art is a picture
          // of something already named — the same call as `MediaPosterCard`'s.
          decorative
        />
      </div>

      <div className="medialib-spotlight__body">
        <div className="medialib-spotlight__head">
          <h3 className="medialib-spotlight__title" title={entry.title}>{entry.title}</h3>
          <MediaStatusPill
            status={mediaSubtitleStatus({
              languages: entry.subtitleLanguages,
              hasJapanese: entry.hasJapaneseSubtitles,
              // Same group-scoped reading as the browser card — the spotlight is the
              // largest thing on the surface, so it is the worst place to say "ready"
              // about a series that is half covered (D316).
              japanese: entry.grouping !== 'none'
                ? { have: entry.japaneseSubtitleCount, of: entry.episodeCount }
                : undefined,
              search: entry.subtitlesChecked ? 'idle' : undefined,
              metadataNeedsReview: entry.metadataNeedsReview,
            })}
          />
        </div>

        <dl className="medialib-spotlight__facts">
          {facts.map((row) => (
            <div key={row.key} className="medialib-spotlight__fact">
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>

        {percent !== null && percent > 0 && (
          <div className="medialib-spotlight__progress">
            <div
              className="medialib-spotlight__bar"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t('media.card.progress', { percent })}
            >
              <i style={{ width: `${percent}%` }} />
            </div>
            <span>{t('media.card.progress', { percent })}</span>
          </div>
        )}

        <div className="medialib-spotlight__actions">
          <Button variant="primary" leftIcon={<Icon name="player" size={14} />} onClick={onOpen}>
            {percent !== null && percent > 0 ? t('media.spotlight.resume') : t('media.spotlight.open')}
          </Button>
          <Button leftIcon={<Icon name="chevron" size={14} />} onClick={(e) => onMenu(e.currentTarget)}>
            {t('media.card.moreActions')}
          </Button>
        </div>
      </div>
    </section>
  );
}
