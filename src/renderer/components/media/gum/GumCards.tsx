/**
 * The cards the media library is built from: the 2:3 poster card (Library grid,
 * Home shelves), its list-row form, and the 16:9 episode card (Continue watching,
 * Up next). Memoized on stable inputs only — the Library grid virtualizes, so cards
 * mount and unmount constantly while scrolling.
 */
import { memo, useState, type CSSProperties, type ReactNode } from 'react';
import type { MediaItem } from '../../../../shared/types';
import { watchedFraction } from '../../../../shared/mediaLibraryEntries';
import { useT } from '../../../i18n';
import MediaArtwork from '../library/MediaArtwork';
import { useMediaArtwork, type MediaArtworkVariant } from '../library/useMediaArtwork';
import GumIcon, { type GumGlyph } from './GumIcons';
import { useTitleArtUrl } from './gumBackend';
import type { GumBadge, GumRatingDisplay } from './gumLayout';
import type { GumTitle } from './gumModel';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function formatRuntime(t: Translate, minutes: number | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  // A clip under a minute says its seconds: a 20 s file read "24 min" (the catalogue's
  // episode length) or "0 min".
  if (minutes < 1) return t('gum.runtime.s', { s: Math.max(1, Math.round(minutes * 60)) });
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? t('gum.runtime.hm', { h, m: String(m).padStart(2, '0') }) : t('gum.runtime.m', { m });
}

/** The viewer's rating on the 0–10 scale every source is stored in (stars × 2). */
export function scoreOutOfTen(title: Pick<GumTitle, 'score' | 'stars'>): number | undefined {
  if (title.score !== undefined) return title.score;
  if (title.stars !== undefined) return title.stars * 2;
  return undefined;
}

/**
 * One scale for every title, the one the viewer chose: "★ 8" out of ten, or
 * "★★★★½" in stars. A MyAnimeList score and a Letterboxd rating used to print in
 * their own scales side by side ("★ 10" next to "★★★★★"), which reads as two
 * different ratings. '' when unrated.
 */
export function formatScore(
  title: Pick<GumTitle, 'score' | 'stars'>,
  display: GumRatingDisplay = 'ten',
  lang?: string,
): string {
  const ten = scoreOutOfTen(title);
  if (ten === undefined) return '';
  if (display === 'stars') {
    const halves = Math.max(1, Math.round(ten));
    const whole = Math.floor(halves / 2);
    return `${'★'.repeat(whole)}${halves % 2 ? '½' : ''}`;
  }
  let value: string;
  try {
    value = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(ten);
  } catch {
    value = Number.isInteger(ten) ? String(ten) : ten.toFixed(1);
  }
  return `★ ${value}`;
}

/**
 * "Play episode 3" / "Resume episode 3" by number; a later season keeps the compact
 * "S2 · E4" label, which already says both. The hero and the title page share it, so
 * neither prints a label inside a sentence that repeats it ("Episode E3").
 */
export function gumPlayLabel(t: Translate, resuming: boolean, n: number | null, seasonLabel?: string | null): string {
  if (seasonLabel) return t(resuming ? 'gum.hero.resumeEpisode' : 'gum.hero.playEpisode', { episode: seasonLabel });
  if (n === null) return t(resuming ? 'gum.hero.resume' : 'gum.hero.play');
  return t(resuming ? 'gum.episode.resume' : 'gum.episode.play', { n });
}

export function typeLabelKey(title: Pick<GumTitle, 'kind' | 'anime'>): string {
  if (title.anime) return title.kind === 'film' ? 'gum.type.animeFilm' : 'gum.type.anime';
  return `gum.type.${title.kind}`;
}

/** The line under a poster: where you are, or what the title is. */
export function metaLine(t: Translate, title: GumTitle): string {
  if (title.kind === 'film') {
    return [title.year ? String(title.year) : null, formatRuntime(t, title.runtimeMin)].filter(Boolean).join(' · ');
  }
  const season = title.seasons.length > 1 ? t('gum.meta.seasons', { count: title.seasons.length }) : null;
  if (title.progress > 0 || title.status === 'watching') {
    return [season, title.episodeCount
      ? t('gum.meta.progressOf', { n: title.progress, total: title.episodeCount })
      : t('gum.meta.progress', { n: title.progress })].filter(Boolean).join(' · ');
  }
  return [title.year ? String(title.year) : null, title.episodeCount ? t('gum.meta.episodes', { count: title.episodeCount }) : season]
    .filter(Boolean).join(' · ');
}

/**
 * The widest real art a file has, for a hero: backdrop (16:9) → banner → poster.
 * `soft` marks the poster case, which the hero blurs into colour rather than
 * stretching a 2:3 image to a banner.
 */
export function useHeroArt(id: string | null): { url: string | null; soft: boolean; loading: boolean } {
  const backdrop = useMediaArtwork(id, 'backdrop');
  const noBackdrop = backdrop.url === null && !backdrop.loading;
  const banner = useMediaArtwork(noBackdrop ? id : null, 'banner');
  const noBanner = noBackdrop && banner.url === null && !banner.loading;
  const poster = useMediaArtwork(noBanner ? id : null, 'poster');
  const url = backdrop.url ?? banner.url ?? poster.url;
  return {
    url,
    soft: url !== null && url === poster.url && backdrop.url === null && banner.url === null,
    loading: backdrop.loading || banner.loading || poster.loading,
  };
}

/** FNV-1a over the title — the same hue every time for the same show. */
function hue(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 360;
}

/**
 * The artless poster: the title set in type on a per-title hue, like a festival
 * one-sheet. A Letterboxd import has no art until a metadata lookup finds some,
 * and 300 identical glyph tiles read as "broken"; 300 typographic posters read as
 * a designed shelf, and the title is legible without the caption.
 */
const CJK = /[぀-ヿ㐀-鿿가-힯]/u;

/**
 * The title's type size, in container-width units, chosen so its LONGEST WORD fits
 * on one line and a long title still fits the clamp. The fixed 11.5cqw it replaces
 * broke single words mid-word ("Bakemonogat/ari", "Spirite/d") because
 * `overflow-wrap: anywhere` was the only thing stopping them overflowing.
 * CJK text breaks between characters, so it only counts its Latin runs.
 */
export function typoFontSize(text: string): number {
  const words = text.split(/\s+/u).flatMap((word) => word.split(CJK)).filter(Boolean);
  const longest = words.reduce((max, word) => Math.max(max, [...word].length), 1);
  const length = [...text].length;
  const byLength = length <= 14 ? 11.5 : length <= 28 ? 10 : length <= 48 ? 8.6 : 7.4;
  // ~0.64em per character of an 800-weight Latin face; 80cqw is the box less its padding.
  const byWord = 80 / (longest * 0.64);
  return Math.round(Math.max(5.5, Math.min(byLength, byWord)) * 10) / 10;
}

/** One or two letters for a thumbnail too small to set the title in: "SA", "B", "ゆ". */
export function monogram(text: string): string {
  const words = text.trim().split(/\s+/u).filter((word) => /[\p{L}\p{N}]/u.test(word));
  const first = (word: string): string => [...word.replace(/^[^\p{L}\p{N}]+/u, '')][0] ?? '';
  if (!words.length) return '';
  if (CJK.test(first(words[0]))) return first(words[0]);
  return words.slice(0, 2).map(first).join('').toUpperCase();
}

export function TypoPoster({ title }: { title: Pick<GumTitle, 'title' | 'year' | 'originalTitle'> }) {
  const h = hue(title.title);
  return (
    <div
      className="gum-typo"
      aria-hidden="true"
      style={{ '--gum-typo-h': h, '--gum-typo-h2': (h + 32) % 360, '--gum-typo-fs': typoFontSize(title.title) } as CSSProperties}
    >
      {/* In the flow above the title, not pinned to the top corner the type badge covers. */}
      <span className="gum-typo__rule" />
      <strong className="gum-typo__title">{title.title}</strong>
      {title.originalTitle && title.originalTitle !== title.title && (
        <span className="gum-typo__native" lang="ja">{title.originalTitle}</span>
      )}
      {title.year && <span className="gum-typo__year">{title.year}</span>}
      <span className="gum-typo__mono">{monogram(title.title)}</span>
    </div>
  );
}

/**
 * Art for a title: the file's artwork (a banner falls back to the poster), else the
 * tracking library's poster, else the typographic poster. One component so every
 * surface makes the same decision.
 */
export function GumArt({
  title,
  variant = 'poster',
  ratio = '2 / 3',
  children,
}: {
  title: GumTitle;
  variant?: MediaArtworkVariant;
  ratio?: string;
  children?: ReactNode;
}) {
  const media = useMediaArtwork(title.artworkId, variant);
  const poster = useMediaArtwork(variant !== 'poster' && media.url === null && !media.loading ? title.artworkId : null, 'poster');
  const remote = useTitleArtUrl(title, variant === 'banner' || variant === 'backdrop' ? 'banner' : 'poster');
  const url = media.url ?? poster.url ?? remote;
  const [failed, setFailed] = useState<string | null>(null);
  const show = url !== null && failed !== url;
  const loading = (media.loading || poster.loading) && !show;
  return (
    <div className="medialib-card__art gum-art" style={{ '--medialib-art-ratio': ratio } as CSSProperties}>
      {show ? (
        <img
          className="medialib-card__img"
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setFailed(url)}
        />
      ) : (
        <TypoPoster title={title} />
      )}
      {loading && <div className="medialib-skeleton" aria-hidden="true" />}
      <div className="medialib-card__scrim" aria-hidden="true" />
      {children}
    </div>
  );
}

export interface GumPosterCardProps {
  title: GumTitle;
  badges: Record<GumBadge, boolean>;
  layout?: 'card' | 'row';
  onOpen: (title: GumTitle) => void;
  /** Present when the title has something on disk to play. */
  onPlay?: (title: GumTitle) => void;
  /** A corner badge that overrides the type badge (Just added: "NEW EP"). */
  flag?: string;
  /** The one scale ratings print in. */
  ratingDisplay?: GumRatingDisplay;
}

export const GumPosterCard = memo(function GumPosterCard({ title, badges, layout = 'card', onOpen, onPlay, flag, ratingDisplay = 'ten' }: GumPosterCardProps) {
  const { t, lang } = useT();
  const score = badges.score ? formatScore(title, ratingDisplay, lang) : '';
  const ten = scoreOutOfTen(title);
  const meta = metaLine(t, title);
  const ratio = title.progressRatio ?? (title.watchState === 'progress' ? 0.02 : undefined);
  const showProgress = badges.progress && ratio !== undefined && ratio > 0 && ratio < 1;
  const canPlay = onPlay && title.onDisk;
  return (
    <div className={`gum-card gum-card--${layout}`} data-status={title.status ?? 'none'}>
      <button type="button" className="gum-card__hit" onClick={() => onOpen(title)} title={t('gum.card.open', { title: title.title })}>
        <GumArt title={title}>
          {(flag || badges.type) && (
            <span className={`gum-badge gum-badge--corner${flag ? ' is-flag' : ''}`}>{flag ?? t(typeLabelKey(title))}</span>
          )}
          {badges.onDisk && title.onDisk && (
            <span className="gum-badge gum-badge--disk" title={t('gum.card.onDisk')}>
              <GumIcon name="check" size={12} />
              <span className="gum-sr">{t('gum.card.onDisk')}</span>
            </span>
          )}
          {showProgress && (
            <span className="gum-progress" role="presentation"><i style={{ width: `${Math.round(ratio * 100)}%` }} /></span>
          )}
        </GumArt>
        <span className="gum-card__copy">
          {/* Study content: the title is shown as the source wrote it, never translated. */}
          <strong className="gum-card__title">{title.title}</strong>
          <span className="gum-card__meta">
            <span>{meta}</span>
            {score && (
              <em className="gum-card__score">
                <span aria-hidden="true">{score}</span>
                <span className="gum-sr">
                  {ratingDisplay === 'stars'
                    ? t('gum.card.scoreStars', { score: Math.max(1, Math.round(ten ?? 0)) / 2 })
                    : t('gum.card.score', { score: ten ?? 0 })}
                </span>
              </em>
            )}
          </span>
        </span>
      </button>
      {canPlay && (
        // A sibling of the card button (buttons do not nest), laid over the art by a box
        // with the art's own aspect ratio, so it centres on the poster at every size.
        <div className="gum-card__overlay">
          <button
            type="button"
            className="gum-card__play"
            onClick={() => onPlay(title)}
            aria-label={t(title.watchState === 'progress' ? 'gum.card.resume' : 'gum.card.play', { title: title.title })}
          >
            <GumIcon name="play" size={16} />
          </button>
        </div>
      )}
    </div>
  );
});

function timeLeft(t: Translate, item: MediaItem | undefined, positionSec: number, durationSec: number | undefined): string | null {
  return formatTimeLeft(t, durationSec ?? item?.durationSec, positionSec);
}

/**
 * "12 min left" from the file's real duration. Under a minute it counts seconds — "1 min
 * left" on a 20-second clip that had 16 seconds to go read as a wrong duration.
 */
export function formatTimeLeft(t: Translate, durationSec: number | undefined, positionSec: number): string | null {
  if (!durationSec || durationSec <= 0) return null;
  const leftSec = Math.max(0, durationSec - positionSec);
  if (leftSec < 60) return t('gum.card.secondsLeft', { s: Math.max(1, Math.round(leftSec)) });
  const left = Math.round(leftSec / 60);
  return left >= 60 ? t('gum.card.hoursLeft', { h: Math.floor(left / 60), m: String(left % 60).padStart(2, '0') }) : t('gum.card.minutesLeft', { m: Math.max(1, left) });
}

/** A per-episode length ("~24 min"), in seconds for a clip under a minute. */
export function formatPerEpisode(t: Translate, minutes: number | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  return minutes < 1 ? t('gum.runtime.s', { s: Math.max(1, Math.round(minutes * 60)) }) : t('gum.meta.perEpisode', { m: Math.round(minutes) });
}

export interface GumEpisodeCardProps {
  /** Card heading: the show or film. */
  name: string;
  /** "S1 · E3  Egg Sandwich" — over the still. */
  caption: string | null;
  item?: MediaItem;
  /** The title, for the fallback art when there is no file. */
  fallbackTitle: GumTitle | undefined;
  positionSec?: number;
  durationSec?: number;
  percent?: number | null;
  kindLabel?: string;
  onPlay: () => void;
  onOpen?: () => void;
  playLabel: string;
  /** The glyph on the art: play, or download for an episode that is not on this PC. */
  playIcon?: GumGlyph;
  /** A line under the name when there is no time left to show ("12 of 26 watched"). */
  note?: string;
  /** A visible text action under the name ("Find episode 13"). */
  action?: { label: string; onClick: () => void };
}

export const GumEpisodeCard = memo(function GumEpisodeCard({
  name,
  caption,
  item,
  fallbackTitle,
  positionSec = 0,
  durationSec,
  percent,
  kindLabel,
  onPlay,
  onOpen,
  playLabel,
  playIcon = 'play',
  note,
  action,
}: GumEpisodeCardProps) {
  const { t } = useT();
  const fraction = percent ?? (item ? watchedFraction(item) : null);
  const left = (positionSec > 0 ? timeLeft(t, item, positionSec, durationSec) : null) ?? note ?? null;
  const art = item ? (
    <MediaArtwork id={item.id} title={name} variant="still" ratio="16 / 9" decorative>
      <EpisodeOverlay caption={caption} kindLabel={kindLabel} fraction={fraction} />
    </MediaArtwork>
  ) : fallbackTitle ? (
    <GumArt title={fallbackTitle} variant="banner" ratio="16 / 9">
      <EpisodeOverlay caption={caption} kindLabel={kindLabel} fraction={fraction} />
    </GumArt>
  ) : (
    <MediaArtwork id={null} title={name} variant="still" ratio="16 / 9" decorative>
      <EpisodeOverlay caption={caption} kindLabel={kindLabel} fraction={fraction} />
    </MediaArtwork>
  );
  return (
    <div className="gum-ep-card">
      <button type="button" className="gum-ep-card__hit" onClick={onPlay} aria-label={playLabel}>
        {art}
        <span className="gum-ep-card__play" aria-hidden="true" data-icon={playIcon}><GumIcon name={playIcon} size={18} /></span>
      </button>
      <div className="gum-ep-card__copy">
        {onOpen ? (
          <button type="button" className="gum-ep-card__name" onClick={onOpen}>{name}</button>
        ) : (
          <strong className="gum-ep-card__name">{name}</strong>
        )}
        {left && <small>{left}</small>}
        {action && (
          <button type="button" className="gum-link gum-link--accent gum-ep-card__action" onClick={action.onClick}>
            <GumIcon name="download" size={12} /> {action.label}
          </button>
        )}
      </div>
    </div>
  );
});

function EpisodeOverlay({ caption, kindLabel, fraction }: { caption: string | null; kindLabel?: string; fraction: number | null }) {
  return (
    <>
      <span className="gum-ep-card__shade" aria-hidden="true" />
      {caption && <span className="gum-ep-card__caption">{caption}</span>}
      {kindLabel && <span className="gum-badge gum-badge--kind">{kindLabel}</span>}
      {fraction !== null && fraction > 0 && fraction < 1 && (
        <span className="gum-progress gum-progress--flush" role="presentation"><i style={{ width: `${Math.round(fraction * 100)}%` }} /></span>
      )}
    </>
  );
}
