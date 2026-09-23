/**
 * One title: backdrop, poster, what it is, where you are, and every episode —
 * including the ones not downloaded yet, each with a way to go and get it.
 *
 * Tracking (status, rating, progress, history) edits the watch library; the file
 * tools (subtitle search / transcription / fusion, re-match, notes, favourites,
 * study queue, remove) are the existing `MediaDetailPanel`, folded into the
 * Details tab rather than cluttering the page.
 */
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import type { MediaItem } from '../../../../shared/types';
import { WATCH_STATUSES, type WatchStatus, type WatchTitlePatch } from '../../../../shared/watchLibrary';
import type { MediaEpisodeGuideEntry } from '../../../../shared/mediaMetadataIpc';
import { buildLibraryEntries, isWatched, providerEpisodeTitle, watchedFraction } from '../../../../shared/mediaLibraryEntries';
import { confirmDialog, promptDialog, showToast } from '../../ui';
import { ContextualSurface } from '../../liquid/LiquidSurface';
import { useT } from '../../../i18n';
import MediaArtwork from '../library/MediaArtwork';
import MediaDetailPanel, { type MediaDetailPanelProps } from '../library/MediaDetailPanel';
import GumIcon from './GumIcons';
import { GumArt, formatRuntime, formatScore, typeLabelKey, useHeroArt } from './GumCards';
import { updateGumTitle, useSubtitleNotice, useSubtitleStatuses, WatchEditError, type GumSubtitleStatus } from './gumBackend';
import { episodesBySeasonOf, nextEpisodeOf, type GumTitle } from './gumModel';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** The Japanese autonym, shown as-is in every UI language — the language being studied. */
const JA_AUTONYM = '日本語';

export type GumTitleTab = 'episodes' | 'details' | 'subtitles' | 'history';

/** The file tools the page hands to `MediaDetailPanel`. */
export type GumFileTools = Pick<
  MediaDetailPanelProps,
  'onToggleFavorite' | 'onToggleStudyQueue' | 'onNoteChange' | 'onRematch' | 'onUseSubtitle' | 'activeSubtitleName'
> & { currentId: string | null };

export interface GumTitlePageProps {
  title: GumTitle;
  onBack: () => void;
  backLabel: string;
  /** Play a file; `startAtSec` resumes. */
  onPlayItem: (item: MediaItem, startAtSec?: number) => void;
  /** Resume position for a file, from the shared resume store, when there is one. */
  resumeAt: (item: MediaItem) => number | undefined;
  onFindDownload: (title: GumTitle, episode?: number) => void;
  onOpenSubtitleSettings: () => void;
  /** Settings ▸ API keys, where a translation engine or OpenSubtitles key is added. */
  onOpenApiKeys: () => void;
  fileTools: GumFileTools;
}

// ---------------------------------------------------------------------------
// Episodes: files ∪ the provider's guide ∪ the tracked episode count
// ---------------------------------------------------------------------------

export interface GumEpisodeRow {
  season: number;
  number: number | null;
  item?: MediaItem;
  guide?: MediaEpisodeGuideEntry;
  /** Counted as watched by the tracker (MAL progress) though no file says so. */
  trackedWatched: boolean;
}

const GUIDE_CAP = 300;

/**
 * Every episode the page lists, by season. Files come first; the provider's guide
 * adds the ones not on disk; failing a guide, a tracked episode count (a MAL row)
 * stands in, so an imported show with no files still lists its run.
 */
export function episodeRows(title: GumTitle): Map<number, GumEpisodeRow[]> {
  const seasons = new Map<number, Map<string, GumEpisodeRow>>();
  const bucket = (season: number): Map<string, GumEpisodeRow> => {
    let map = seasons.get(season);
    if (!map) {
      map = new Map();
      seasons.set(season, map);
    }
    return map;
  };
  const progress = title.progress;
  for (const { season, items } of episodesBySeasonOf(title)) {
    for (const item of items) {
      const key = typeof item.episode === 'number' ? `e${item.episode}` : `f${item.id}`;
      if (bucket(season).has(key)) continue;
      bucket(season).set(key, { season, number: item.episode ?? null, item, trackedWatched: false });
    }
  }
  const guide = title.items.find((item) => item.episodeGuide?.length)?.episodeGuide ?? [];
  for (const entry of guide.slice(0, GUIDE_CAP)) {
    const season = entry.season ?? 1;
    const key = `e${entry.number}`;
    const existing = bucket(season).get(key);
    if (existing) existing.guide = entry;
    else bucket(season).set(key, { season, number: entry.number, guide: entry, trackedWatched: title.seasons.length <= 1 && entry.number <= progress });
  }
  if (!guide.length && title.kind !== 'film' && title.episodeCount && title.episodeCount <= GUIDE_CAP && title.seasons.length <= 1) {
    const season = title.seasons[0] ?? 1;
    for (let n = 1; n <= title.episodeCount; n += 1) {
      const key = `e${n}`;
      if (!bucket(season).has(key)) bucket(season).set(key, { season, number: n, trackedWatched: n <= progress });
    }
  }
  const out = new Map<number, GumEpisodeRow[]>();
  for (const season of [...seasons.keys()].sort((a, b) => a - b)) {
    const rows = [...(seasons.get(season)?.values() ?? [])];
    rows.sort((a, b) => (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER));
    out.set(season, rows);
  }
  return out;
}

/**
 * "日本語 + English", "日本語 + English (translated)", or — while the automation is
 * still at work and nothing is attached — "Finding subtitles…". The automation's
 * status wins over the item's own records because it knows about work in flight.
 */
export function langNames(t: Translate, item: MediaItem | undefined, status: GumSubtitleStatus | undefined): string {
  if (status) {
    const out: string[] = [];
    if (status.ja === 'found' || status.ja === 'generated') {
      out.push(status.machineTranslated.ja ? t('gum.subs.translated', { lang: JA_AUTONYM }) : JA_AUTONYM);
    }
    if (status.en === 'found' || status.en === 'generated') {
      out.push(status.machineTranslated.en ? t('gum.subs.translated', { lang: t('gum.subs.en') }) : t('gum.subs.en'));
    }
    if (!out.length && [status.ja, status.en].some((state) => state === 'searching' || state === 'generating')) {
      return t('gum.subs.finding');
    }
    return out.join(' + ');
  }
  const langs = new Set((item?.subtitles ?? []).map((record) => (record.lang ?? '').trim().toLowerCase().slice(0, 2)));
  const out: string[] = [];
  if (langs.has('ja')) out.push(JA_AUTONYM);
  if (langs.has('en')) out.push(t('gum.subs.en'));
  return out.join(' + ');
}

/** "日本語 + English subtitles", or the in-flight sentence as it stands. */
function subsNote(t: Translate, langs: string, status: GumSubtitleStatus | undefined): string {
  if (status && langs === t('gum.subs.finding')) return langs;
  return t('gum.episode.subs', { langs });
}

function formatDate(ms: number | undefined, lang: string): string | null {
  if (!ms) return null;
  try {
    return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }).format(ms);
  } catch {
    return new Date(ms).toLocaleDateString(lang);
  }
}

function EpisodeCard({
  row,
  status,
  resumeAt,
  onPlay,
  onFind,
}: {
  row: GumEpisodeRow;
  status?: GumSubtitleStatus;
  resumeAt?: number;
  onPlay: (item: MediaItem, startAt?: number) => void;
  onFind: (episode: number | null) => void;
}) {
  const { t, lang } = useT();
  const item = row.item;
  const fraction = item ? watchedFraction(item) : null;
  const watched = item ? isWatched(item) : row.trackedWatched;
  const inProgress = item ? !watched && (item.positionSec ?? 0) > 0 : false;
  const name = (item ? providerEpisodeTitle(item) : null) ?? row.guide?.title ?? (item && row.number === null ? item.title : null);
  const runtime = row.guide?.runtimeMin ?? item?.runtimeMin ?? (item?.durationSec ? Math.round(item.durationSec / 60) : undefined);
  const subs = item ? langNames(t, item, status) : '';
  let note: string;
  let tone: 'watched' | 'progress' | 'ready' | 'missing';
  if (!item) {
    note = watched ? t('gum.episode.watchedElsewhere') : t('gum.episode.notDownloaded');
    tone = watched ? 'watched' : 'missing';
  } else if (watched) {
    const when = formatDate(item.lastPlayedAt, lang);
    note = when ? t('gum.episode.watchedOn', { date: when }) : t('gum.episode.watched');
    tone = 'watched';
  } else if (inProgress && item.durationSec) {
    const left = Math.max(1, Math.round((item.durationSec - (item.positionSec ?? 0)) / 60));
    note = [t('gum.card.minutesLeft', { m: left }), subs ? subsNote(t, subs, status) : null].filter(Boolean).join(' · ');
    tone = 'progress';
  } else {
    note = [t('gum.episode.onDisk'), subs ? subsNote(t, subs, status) : t('gum.episode.noSubs')].join(' · ');
    tone = 'ready';
  }
  const label = row.number !== null ? t('gum.episode.number', { n: row.number }) : t('gum.episode.extra');
  return (
    <li className="gum-episode" data-tone={tone}>
      <div className="gum-episode__still">
        {item ? (
          <MediaArtwork id={item.id} title={name ?? label} variant="still" ratio="16 / 9" decorative>
            {runtime ? <span className="gum-badge gum-badge--runtime">{t('gum.runtime.m', { m: runtime })}</span> : null}
            {fraction !== null && fraction > 0 && fraction < 1 && (
              <span className="gum-progress gum-progress--flush" role="presentation"><i style={{ width: `${Math.round(fraction * 100)}%` }} /></span>
            )}
          </MediaArtwork>
        ) : (
          <div className="gum-episode__blank" aria-hidden="true">
            {runtime ? <span className="gum-badge gum-badge--runtime">{t('gum.runtime.m', { m: runtime })}</span> : null}
          </div>
        )}
      </div>
      <div className="gum-episode__copy">
        <span className="gum-episode__num">{label}</span>
        <strong className="gum-episode__title">{name ?? (item ? item.fileName : label)}</strong>
        <small className="gum-episode__note" data-tone={tone}>{note}</small>
      </div>
      <div className="gum-episode__action">
        {item ? (
          <button
            type="button"
            className={`gum-round${inProgress ? ' is-accent' : ''}`}
            onClick={() => onPlay(item, inProgress ? resumeAt ?? item.positionSec : undefined)}
            aria-label={t(inProgress ? 'gum.episode.resume' : 'gum.episode.play', { n: row.number ?? '' })}
          >
            <GumIcon name="play" size={16} />
          </button>
        ) : (
          <button type="button" className="gum-btn gum-btn--ghost gum-btn--sm" onClick={() => onFind(row.number)}>
            <GumIcon name="download" size={13} /> {t('gum.episode.find')}
          </button>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Rating: a 0–10 slider drawn as five half-stars
// ---------------------------------------------------------------------------

function Rating({ value, onChange, label }: { value: number | undefined; onChange: (next: number | null) => void; label: string }) {
  const { t } = useT();
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  const fromPointer = (event: { currentTarget: HTMLDivElement; clientX: number }): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    return Math.max(1, Math.ceil((x / rect.width) * 10));
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    const current = value ?? 0;
    let next: number | null | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(10, current + 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = current <= 1 ? null : current - 1;
    else if (event.key === 'Home') next = 1;
    else if (event.key === 'End') next = 10;
    else if (event.key === 'Delete' || event.key === 'Backspace') next = null;
    if (next === undefined) return;
    event.preventDefault();
    onChange(next);
  };
  return (
    <div className="gum-rating">
      <span className="gum-rating__label">{label}</span>
      <div
        className="gum-rating__stars"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={value ?? 0}
        aria-valuetext={value ? t('gum.title.ratingValue', { n: value }) : t('gum.title.unrated')}
        onKeyDown={onKey}
        onPointerMove={(event) => setHover(fromPointer(event))}
        onPointerLeave={() => setHover(null)}
        onClick={(event) => {
          const next = fromPointer(event);
          onChange(next === value ? null : next);
        }}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const fill = Math.max(0, Math.min(1, (shown - (star - 1) * 2) / 2));
          return (
            <span key={star} className="gum-rating__star" aria-hidden="true">
              <GumIcon name="star" size={20} className="gum-rating__base" />
              <span className="gum-rating__fill" style={{ width: `${fill * 100}%` }}><GumIcon name="star" size={20} /></span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function Backdrop({ title }: { title: GumTitle }) {
  const { url, soft } = useHeroArt(title.artworkId);
  return (
    <div className="gum-title__backdrop" aria-hidden="true" data-soft={soft || !url ? 'true' : undefined}>
      {url ? <img src={url} alt="" decoding="async" draggable={false} /> : <GumArt title={title} variant="poster" ratio="auto" />}
    </div>
  );
}

function externalLinks(title: GumTitle): Array<{ label: string; url: string }> {
  const view = title.view;
  const out: Array<{ label: string; url: string }> = [];
  if (title.malId) out.push({ label: 'MyAnimeList', url: `https://myanimelist.net/anime/${title.malId}` });
  if (title.anilistId) out.push({ label: 'AniList', url: `https://anilist.co/anime/${title.anilistId}` });
  const tvmaze = view?.tvmazeId ?? title.items.find((item) => item.tvmazeId)?.tvmazeId;
  if (tvmaze) out.push({ label: 'TVmaze', url: `https://www.tvmaze.com/shows/${tvmaze}` });
  const tmdb = view?.tmdbId ?? title.items.find((item) => item.tmdbId)?.tmdbId;
  if (tmdb) out.push({ label: 'TMDB', url: `https://www.themoviedb.org/${title.kind === 'film' ? 'movie' : 'tv'}/${tmdb}` });
  const imdb = view?.imdbId ?? title.items.find((item) => item.imdbId)?.imdbId;
  if (imdb) out.push({ label: 'IMDb', url: `https://www.imdb.com/title/${imdb}/` });
  if (view?.letterboxdUri) out.push({ label: 'Letterboxd', url: view.letterboxdUri });
  return out;
}

export default function GumTitlePage({
  title,
  onBack,
  backLabel,
  onPlayItem,
  resumeAt,
  onFindDownload,
  onOpenSubtitleSettings,
  onOpenApiKeys,
  fileTools,
}: GumTitlePageProps) {
  const { t, lang } = useT();
  const rows = useMemo(() => episodeRows(title), [title]);
  const seasons = [...rows.keys()];
  const isSeries = title.kind !== 'film' && (seasons.length > 0 || title.items.length > 1);
  const [tab, setTab] = useState<GumTitleTab>(isSeries ? 'episodes' : 'details');
  const [season, setSeason] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const statuses = useSubtitleStatuses(title.items.map((item) => item.id));
  const subtitleNotice = useSubtitleNotice();

  useEffect(() => {
    setSeason(null);
    setTab(isSeries ? 'episodes' : 'details');
  }, [title.id]);

  const activeSeason = season ?? title.inProgressItem?.season ?? seasons[0] ?? 1;
  const next = nextEpisodeOf(title);
  const entry = useMemo(() => buildLibraryEntries(title.items)[0] ?? null, [title.items]);

  const edit = async (patch: WatchTitlePatch, success?: string): Promise<void> => {
    setBusy(true);
    try {
      await updateGumTitle(title, patch);
      if (success) showToast({ message: success, kind: 'success' });
    } catch (error) {
      const message = error instanceof WatchEditError && error.errorKey ? t(error.errorKey, error.errorParams) : error instanceof Error ? error.message : String(error);
      showToast({ message: t('gum.title.saveFailed', { reason: message }), kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const play = (): void => {
    if (!next) return;
    const inProgress = (next.positionSec ?? 0) > 0 && !isWatched(next);
    onPlayItem(next, inProgress ? resumeAt(next) ?? next.positionSec : undefined);
  };

  const episode = next && typeof next.episode === 'number'
    ? (next.season && next.season > 1 ? `S${next.season} · E${next.episode}` : `E${next.episode}`)
    : null;
  const resuming = next ? (next.positionSec ?? 0) > 0 && !isWatched(next) : false;
  const playLabel = resuming
    ? (episode ? t('gum.hero.resumeEpisode', { episode }) : t('gum.hero.resume'))
    : (episode ? t('gum.hero.playEpisode', { episode }) : t('gum.hero.play'));

  const meta = [
    title.year ? String(title.year) : null,
    title.genres.slice(0, 3).join(', ') || null,
    title.kind !== 'film' && seasons.length > 1 ? t('gum.meta.seasons', { count: seasons.length }) : null,
    title.kind !== 'film' && title.episodeCount ? t('gum.meta.episodes', { count: title.episodeCount }) : null,
    title.runtimeMin ? (title.kind === 'film' ? formatRuntime(t, title.runtimeMin) : t('gum.meta.perEpisode', { m: title.runtimeMin })) : null,
    title.providerScore ? t('gum.meta.providerScore', { score: Math.round(title.providerScore * 10) / 10 }) : null,
  ].filter(Boolean) as string[];
  const chips = [t(typeLabelKey(title)), title.language === 'ja' ? t('gum.filter.language.ja') : null, title.format && title.format !== 'TV' ? title.format : null]
    .filter(Boolean) as string[];

  const tabs: GumTitleTab[] = isSeries ? ['episodes', 'details', 'subtitles', 'history'] : ['details', 'subtitles', 'history'];
  const visibleRows = rows.get(activeSeason) ?? [];

  const toggleFilm = (): void => {
    const done = title.status === 'completed';
    void edit(done
      ? { status: 'plan' }
      : { status: 'completed', addWatchDate: { date: new Date().toISOString().slice(0, 10) } },
    done ? undefined : t('gum.title.markedWatched', { title: title.title }));
  };

  const addList = async (): Promise<void> => {
    const name = (await promptDialog({ title: t('gum.title.addListTitle'), message: t('gum.title.addListMessage'), placeholder: t('gum.title.listPlaceholder') }))?.trim();
    if (!name) return;
    const current = title.view?.lists ?? [];
    if (current.some((entry) => entry.toLowerCase() === name.toLowerCase())) return;
    await edit({ lists: [...current, name] });
  };

  const removeTitle = async (): Promise<void> => {
    if (!title.watchId) return;
    const ok = await confirmDialog({
      title: t('gum.title.untrackTitle'),
      message: t('gum.title.untrackMessage', { title: title.title }),
      confirmLabel: t('gum.title.untrack'),
      danger: true,
    });
    if (!ok) return;
    const result = await window.api.watchRemove(title.watchId);
    if (result.ok) {
      showToast({ message: t('gum.title.untracked', { title: title.title }), kind: 'success' });
      onBack();
    } else showToast({ message: t(result.errorKey, result.errorParams), kind: 'error' });
  };

  const searchSubtitles = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await window.api.runSubtitleDiscovery({ mediaIds: title.items.map((item) => item.id), force: true });
      showToast(result.ok
        ? { message: t('media.subtitles.searchDone', { count: result.files }), kind: result.files ? 'success' : 'default' }
        : { message: result.error ?? t('media.subtitles.searchFailed'), kind: 'error' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : t('media.subtitles.searchFailed'), kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const view = title.view;
  const links = externalLinks(title);
  const history = [...(view?.watchDates ?? [])].reverse();
  const localPlays = title.items
    .filter((item) => item.lastPlayedAt)
    .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
    .slice(0, 12);

  return (
    <div className="gum-page gum-title">
      <Backdrop title={title} />
      <div className="gum-title__fade" aria-hidden="true" />
      <ContextualSurface className="gum-title__bar">
        <button type="button" className="gum-btn gum-btn--glass" onClick={onBack}>
          <GumIcon name="chevron-down" size={14} style={{ transform: 'rotate(90deg)' }} /> {backLabel}
        </button>
      </ContextualSurface>

      <header className="gum-title__head">
        <div className="gum-title__poster">
          <GumArt title={title} />
        </div>
        <div className="gum-title__info">
          <div className="gum-title__chips">
            {chips.map((chip) => <span key={chip} className="gum-tag">{chip}</span>)}
          </div>
          <div>
            <h1 className="gum-title__name">{title.title}</h1>
            {title.originalTitle && title.originalTitle !== title.title && (
              <div className="gum-title__native" lang="ja">{title.originalTitle}</div>
            )}
          </div>
          {meta.length > 0 && (
            <div className="gum-hero__meta">
              {meta.map((part, index) => <span key={`${part}-${index}`}>{index > 0 && <i aria-hidden="true">•</i>}{part}</span>)}
            </div>
          )}
          {title.synopsis && <p className="gum-title__synopsis">{title.synopsis}</p>}
          <div className="gum-title__actions">
            {next && (
              <button type="button" className="gum-btn gum-btn--primary gum-btn--lg" onClick={play}>
                <GumIcon name="play" size={16} /> {playLabel}
              </button>
            )}
            {!title.onDisk && (
              <button type="button" className="gum-btn gum-btn--primary gum-btn--lg" onClick={() => onFindDownload(title)}>
                <GumIcon name="download" size={16} /> {t('gum.title.findDownload')}
              </button>
            )}
            <label className="gum-field">
              <span>{t('gum.title.status')}</span>
              <select
                // An untracked title's status is only what its files suggest; the select
                // says "Not tracked" until the viewer picks one, which starts tracking it.
                value={title.tracked ? title.status ?? '' : ''}
                disabled={busy}
                onChange={(event) => {
                  const value = event.target.value as WatchStatus;
                  if (value) void edit({ status: value });
                }}
              >
                {!title.tracked && <option value="">{t('gum.title.notTracked')}</option>}
                {WATCH_STATUSES.map((status) => <option key={status} value={status}>{t(`watchLibrary.status.${status}`)}</option>)}
              </select>
            </label>
            <div className="gum-field">
              <Rating
                value={title.score}
                label={t('gum.title.myRating')}
                onChange={(value) => void edit(value === null ? { score: null } : title.view?.scoreScale === 'stars' ? { stars: value / 2 } : { score: value })}
              />
            </div>
            {title.kind === 'film' ? (
              <button type="button" className="gum-field gum-field--button" aria-pressed={title.status === 'completed'} disabled={busy} onClick={toggleFilm}>
                <GumIcon name="check" size={14} /> {title.status === 'completed' ? t('gum.title.watched') : t('gum.title.markWatched')}
              </button>
            ) : (
              <div className="gum-field gum-stepper" role="group" aria-label={t('gum.title.progress')}>
                <span>{t('gum.title.progress')}</span>
                <button type="button" className="gum-icon-btn" disabled={busy || title.progress <= 0} onClick={() => void edit({ progress: Math.max(0, title.progress - 1) })} aria-label={t('gum.title.progressDown')}>
                  <GumIcon name="minus" size={12} />
                </button>
                <strong aria-live="polite">{title.episodeCount ? `${title.progress} / ${title.episodeCount}` : title.progress}</strong>
                <button type="button" className="gum-icon-btn" disabled={busy || (title.episodeCount !== undefined && title.progress >= title.episodeCount)} onClick={() => void edit({ progress: title.progress + 1 })} aria-label={t('gum.title.progressUp')}>
                  <GumIcon name="plus" size={12} />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="gum-title__tabsbar">
        <div className="gum-tabs" role="tablist" aria-label={t('gum.title.sections')}>
          {tabs.map((id) => (
            <button
              type="button"
              key={id}
              role="tab"
              id={`gum-title-tab-${id}`}
              aria-selected={tab === id}
              aria-controls="gum-title-panel"
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
                event.preventDefault();
                const index = tabs.indexOf(id);
                const nextTab = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
                setTab(nextTab);
                (event.currentTarget.parentElement?.querySelector(`#gum-title-tab-${nextTab}`) as HTMLElement | null)?.focus();
              }}
            >
              {t(`gum.title.tab.${id}`)}
            </button>
          ))}
        </div>
        {tab === 'episodes' && seasons.length > 1 && (
          <div className="gum-seg" role="radiogroup" aria-label={t('gum.title.season')}>
            {seasons.map((value) => (
              <button type="button" key={value} role="radio" aria-checked={activeSeason === value} onClick={() => setSeason(value)}>
                {t('gum.meta.season', { n: value })}
              </button>
            ))}
          </div>
        )}
      </div>

      <div id="gum-title-panel" role="tabpanel" aria-labelledby={`gum-title-tab-${tab}`} className="gum-title__panel">
        {tab === 'episodes' && (
          visibleRows.length ? (
            <ul className="gum-episodes">
              {visibleRows.map((row) => (
                <EpisodeCard
                  key={row.item?.id ?? `${row.season}-${row.number}`}
                  row={row}
                  status={row.item ? statuses.get(row.item.id) : undefined}
                  resumeAt={row.item ? resumeAt(row.item) : undefined}
                  onPlay={onPlayItem}
                  onFind={(n) => onFindDownload(title, n ?? undefined)}
                />
              ))}
            </ul>
          ) : (
            <p className="gum-muted">{t('gum.title.noEpisodes')}</p>
          )
        )}

        {tab === 'details' && (
          <div className="gum-details">
            <dl className="gum-facts">
              <div><dt>{t('gum.facts.type')}</dt><dd>{t(typeLabelKey(title))}{title.format ? ` · ${title.format}` : ''}</dd></div>
              {title.year && <div><dt>{t('gum.facts.year')}</dt><dd>{title.year}</dd></div>}
              {title.genres.length > 0 && <div><dt>{t('gum.facts.genres')}</dt><dd>{title.genres.join(', ')}</dd></div>}
              {title.episodeCount && title.kind !== 'film' && <div><dt>{t('gum.facts.episodes')}</dt><dd>{title.episodeCount}</dd></div>}
              {title.runtimeMin && <div><dt>{t('gum.facts.runtime')}</dt><dd>{formatRuntime(t, title.runtimeMin)}</dd></div>}
              {title.score !== undefined && <div><dt>{t('gum.facts.myRating')}</dt><dd>{formatScore(title)}</dd></div>}
              {title.providerScore && <div><dt>{t('gum.facts.providerRating')}</dt><dd>{title.providerScore.toFixed(1)}</dd></div>}
              <div><dt>{t('gum.facts.onDisk')}</dt><dd>{title.onDisk ? t('gum.facts.files', { count: title.items.length }) : t('gum.episode.notDownloaded')}</dd></div>
              <div><dt>{t('gum.facts.sources')}</dt><dd>{title.sources.map((source) => t(`gum.filter.source.${source}`)).join(', ')}</dd></div>
              {links.length > 0 && (
                <div>
                  <dt>{t('gum.facts.links')}</dt>
                  <dd className="gum-links">
                    {links.map((link) => (
                      <button type="button" key={link.label} className="gum-link" onClick={() => void window.api.openExternal(link.url)}>
                        {link.label}
                      </button>
                    ))}
                  </dd>
                </div>
              )}
            </dl>

            <section className="gum-details__block">
              <h2>{t('gum.title.listsHeading')}</h2>
              <div className="gum-details__tags">
                {title.lists.map((name) => (
                  title.view?.lists.includes(name) ? (
                    <button type="button" key={name} className="gum-chip" onClick={() => void edit({ lists: (title.view?.lists ?? []).filter((entry) => entry !== name) })}>
                      {name} <GumIcon name="close" size={11} /><span className="gum-sr">{t('gum.chip.remove')}</span>
                    </button>
                  ) : <span key={name} className="gum-tag">{name}</span>
                ))}
                <button type="button" className="gum-btn gum-btn--quiet gum-btn--sm" onClick={() => void addList()}>
                  <GumIcon name="plus" size={12} /> {t('gum.title.addList')}
                </button>
                <label className="gum-check">
                  <input type="checkbox" checked={title.favorite} disabled={busy} onChange={(event) => void edit({ favorite: event.target.checked })} />
                  <span>{t('gum.filter.favorite')}</span>
                </label>
                {title.sources.includes('letterboxd') && (
                  <label className="gum-check">
                    <input type="checkbox" checked={title.liked} disabled={busy} onChange={(event) => void edit({ liked: event.target.checked })} />
                    <span>{t('gum.filter.liked')}</span>
                  </label>
                )}
              </div>
              {title.watchId && (
                <button type="button" className="gum-link gum-link--danger" onClick={() => void removeTitle()}>{t('gum.title.untrack')}</button>
              )}
            </section>

            {entry && (
              <section className="gum-details__block gum-details__tools">
                <h2>{t('gum.title.fileTools')}</h2>
                <p className="gum-muted">{t('gum.title.fileToolsDetail')}</p>
                <div className="gum-tools-host">
                  <MediaDetailPanel
                    entry={entry}
                    currentId={fileTools.currentId}
                    onClose={() => setTab(isSeries ? 'episodes' : 'details')}
                    onPlay={(id) => {
                      const item = title.items.find((candidate) => candidate.id === id);
                      if (item) onPlayItem(item, resumeAt(item));
                    }}
                    onToggleFavorite={fileTools.onToggleFavorite}
                    onToggleStudyQueue={fileTools.onToggleStudyQueue}
                    onNoteChange={fileTools.onNoteChange}
                    onRematch={fileTools.onRematch}
                    onUseSubtitle={fileTools.onUseSubtitle}
                    activeSubtitleName={fileTools.activeSubtitleName}
                  />
                </div>
              </section>
            )}
          </div>
        )}

        {tab === 'subtitles' && (
          <div className="gum-details">
            {subtitleNotice.notice && (
              // One quiet, fixable notice at a time — the automation's own wording.
              <div className="gum-notice" role="status">
                <p>
                  {t(`subtitle.notice.${subtitleNotice.notice}`, subtitleNotice.quotaResetAt
                    ? { time: new Date(subtitleNotice.quotaResetAt).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) }
                    : undefined)}
                </p>
                <div className="gum-notice__actions">
                  {subtitleNotice.notice !== 'opensubtitles-quota' && (
                    <button type="button" className="gum-btn gum-btn--ghost gum-btn--sm" onClick={onOpenApiKeys}>{t('gum.subs.openApiKeys')}</button>
                  )}
                  <button type="button" className="gum-link" onClick={subtitleNotice.dismiss}>{t('subtitle.notice.dismiss')}</button>
                </div>
              </div>
            )}
            <div className="gum-details__actions">
              {title.items.length > 0 && (
                <button type="button" className="gum-btn gum-btn--primary" disabled={busy} aria-busy={busy} onClick={() => void searchSubtitles()}>
                  {busy ? t('media.subtitles.searching') : t('gum.subs.searchAll')}
                </button>
              )}
              <button type="button" className="gum-btn gum-btn--ghost" onClick={onOpenSubtitleSettings}>{t('gum.subs.providers')}</button>
              {entry && (
                <button type="button" className="gum-btn gum-btn--ghost" onClick={() => setTab('details')}>{t('gum.subs.moreTools')}</button>
              )}
            </div>
            {title.items.length === 0 ? (
              <p className="gum-muted">{t('gum.subs.noFiles')}</p>
            ) : (
              <table className="gum-subs-table">
                <thead>
                  <tr>
                    <th scope="col">{t('gum.subs.episode')}</th>
                    <th scope="col" lang="ja">{JA_AUTONYM}</th>
                    <th scope="col">{t('gum.subs.english')}</th>
                  </tr>
                </thead>
                <tbody>
                  {episodesBySeasonOf(title).flatMap(({ items }) => items).map((item) => {
                    const status = statuses.get(item.id);
                    const langs = new Set((item.subtitles ?? []).map((record) => (record.lang ?? '').trim().toLowerCase().slice(0, 2)));
                    const cell = (state: string | undefined, has: boolean, machine?: boolean): string => {
                      const base = t(`subtitleAuto.state.${state ?? (has ? 'found' : 'none')}`);
                      return machine ? `${base} · ${t('subtitleAuto.machineTranslated')}` : base;
                    };
                    return (
                      <tr key={item.id}>
                        <th scope="row">{typeof item.episode === 'number' ? t('gum.episode.number', { n: item.episode }) : item.fileName}</th>
                        <td data-state={status?.ja ?? (langs.has('ja') ? 'found' : 'none')}>{cell(status?.ja, langs.has('ja'), status?.machineTranslated.ja)}</td>
                        <td data-state={status?.en ?? (langs.has('en') ? 'found' : 'none')}>{cell(status?.en, langs.has('en'), status?.machineTranslated.en)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="gum-details">
            <dl className="gum-facts">
              {view?.startedAt && <div><dt>{t('gum.history.started')}</dt><dd>{view.startedAt}</dd></div>}
              {view?.finishedAt && <div><dt>{t('gum.history.finished')}</dt><dd>{view.finishedAt}</dd></div>}
              {view?.rewatchCount ? <div><dt>{t('gum.history.rewatches')}</dt><dd>{view.rewatchCount}</dd></div> : null}
              {title.lastWatchedAt && <div><dt>{t('gum.history.lastWatched')}</dt><dd>{formatDate(title.lastWatchedAt, lang)}</dd></div>}
              <div><dt>{t('gum.history.added')}</dt><dd>{formatDate(title.addedAt, lang) ?? '—'}</dd></div>
            </dl>
            {title.tracked && (
              <button
                type="button"
                className="gum-btn gum-btn--ghost"
                disabled={busy}
                onClick={() => void edit({ addWatchDate: { date: new Date().toISOString().slice(0, 10), rewatch: history.length > 0 } }, t('gum.history.logged'))}
              >
                <GumIcon name="plus" size={12} /> {t('gum.history.log')}
              </button>
            )}
            {history.length > 0 && (
              <ul className="gum-history">
                {history.map((date, index) => (
                  <li key={`${date.date}-${index}`}>
                    <strong>{date.date}</strong>
                    <span>{[date.rewatch ? t('gum.history.rewatch') : null, date.stars ? formatScore({ stars: date.stars }) : null, t(`gum.filter.source.${date.source}`)].filter(Boolean).join(' · ')}</span>
                  </li>
                ))}
              </ul>
            )}
            {localPlays.length > 0 && (
              <>
                <h2 className="gum-details__sub">{t('gum.history.plays')}</h2>
                <ul className="gum-history">
                  {localPlays.map((item) => (
                    <li key={item.id}>
                      <strong>{formatDate(item.lastPlayedAt, lang)}</strong>
                      <span>{typeof item.episode === 'number' ? t('gum.episode.number', { n: item.episode }) : item.title}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {!history.length && !localPlays.length && <p className="gum-muted">{t('gum.history.empty')}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
