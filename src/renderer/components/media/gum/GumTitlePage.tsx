/**
 * One title: backdrop, poster, what it is, where you are, and every episode —
 * including the ones not downloaded yet, each with a way to go and get it.
 *
 * Tracking (status, rating, progress, history) edits the watch library. The
 * Details tab is the title's facts (names, studio, runtime, ids, files on disk)
 * set natively in this page's style; it used to embed the whole old file drawer —
 * a second banner, title, Play button, synopsis and four tabs of its own inside
 * this page's tab. The per-file tools stay one click away in All files.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { MediaItem } from '../../../../shared/types';
import { WATCH_STATUSES, type WatchStatus, type WatchTitlePatch } from '../../../../shared/watchLibrary';
import type { MediaEpisodeGuideEntry } from '../../../../shared/mediaMetadataIpc';
import { buildLibraryEntries, isWatched, providerEpisodeTitle, watchedFraction } from '../../../../shared/mediaLibraryEntries';
import { confirmDialog, promptDialog, Select, showToast } from '../../ui';
import { ContextualSurface } from '../../liquid/LiquidSurface';
import { useT } from '../../../i18n';
import type { LibraryEntry } from '../../../../shared/mediaLibraryEntries';
import MediaArtwork from '../library/MediaArtwork';
import GumIcon from './GumIcons';
import { GumArt, formatPerEpisode, formatRuntime, formatScore, formatTimeLeft, gumPlayLabel, typeLabelKey, useHeroArt } from './GumCards';
import {
  externalPlayerProfile,
  openInExternalPlayer,
  updateGumTitle,
  useSubtitleNotice,
  useSubtitleStatuses,
  WatchEditError,
  type GumSubtitleStatus,
} from './gumBackend';
import GumPopover from './GumPopover';
import type { GumRatingDisplay } from './gumLayout';
import { episodesBySeasonOf, gumEpisodeLabel, nextEpisodeOf, type GumTitle } from './gumModel';
import { STUDY_LANG_NATIVE_NAME, type StudyLang } from '../../../../shared/studyLang';
import { subtitleLangMatches } from '../../../../shared/subtitleDiscoveryPick';
import { getStudyLang } from '../../../studyEnvironment';
import { useStudyLanguage } from '../../../useStudyLanguage';
import MediaLevelBadge from '../MediaLevelBadge';
import MediaCreditsFacts from '../MediaCreditsFacts';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * The study language's autonym (日本語 / 中文 / Русский), shown as-is in every UI
 * language — the language being studied, not always Japanese.
 */
function studyAutonym(study: StudyLang): string {
  return STUDY_LANG_NATIVE_NAME[study];
}

/** Whether an item carries a track in `lang` (tags like `jpn`, `zh-Hant`, `rus` included). */
function hasTrackIn(item: MediaItem | undefined, lang: string): boolean {
  return (item?.subtitles ?? []).some((record) => subtitleLangMatches(record.lang, lang));
}

export type GumTitleTab = 'episodes' | 'details' | 'subtitles' | 'history';

/**
 * The file tools the shell hands the page. Only the study-queue switch is drawn
 * here; the rest (re-match, notes, subtitle tracks) live in All files, which the
 * page links to rather than re-embedding the old drawer.
 */
export interface GumFileTools {
  currentId: string | null;
  activeSubtitleName?: string | null;
  onToggleStudyQueue?: (entry: LibraryEntry, next: boolean) => Promise<void> | void;
}

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
  /** All files, where every per-file tool lives (re-match, notes, subtitle tracks). */
  onOpenFiles?: () => void;
  /** The one scale ratings print in (the Library's Customise choice). */
  ratingDisplay?: GumRatingDisplay;
  /** Settings > External players, offered when no external player is set up. */
  onOpenExternalPlayerSettings?: () => void;
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
 * "日本語 + English", "中文 + English (translated)", or — while the automation is
 * still at work and nothing is attached — "Finding subtitles…". The automation's
 * status wins over the item's own records because it knows about work in flight.
 * The status's `ja` line is the study line, whatever language is studied.
 */
export function langNames(
  t: Translate,
  item: MediaItem | undefined,
  status: GumSubtitleStatus | undefined,
  study: StudyLang = getStudyLang(),
): string {
  const autonym = studyAutonym(study);
  if (status) {
    const out: string[] = [];
    if (status.ja === 'found' || status.ja === 'generated') {
      out.push(status.machineTranslated.ja ? t('gum.subs.translated', { lang: autonym }) : autonym);
    }
    if (status.en === 'found' || status.en === 'generated') {
      out.push(status.machineTranslated.en ? t('gum.subs.translated', { lang: t('gum.subs.en') }) : t('gum.subs.en'));
    }
    if (!out.length && [status.ja, status.en].some((state) => state === 'searching' || state === 'generating')) {
      return t('gum.subs.finding');
    }
    return out.join(' + ');
  }
  const out: string[] = [];
  if (hasTrackIn(item, study)) out.push(autonym);
  if (hasTrackIn(item, 'en')) out.push(t('gum.subs.en'));
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

/** A stored `YYYY-MM-DD` (or `YYYY-MM`, `YYYY`) in the UI language, as written when it will not parse. */
function formatIsoDate(value: string, lang: string): string {
  const full = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const ms = Date.parse(full ? `${value}T12:00:00` : value);
  if (!full || !Number.isFinite(ms)) return value;
  try {
    return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(ms);
  } catch {
    return value;
  }
}

function formatCount(n: number, lang: string): string {
  try {
    return new Intl.NumberFormat(lang).format(n);
  } catch {
    return String(n);
  }
}

function formatDecimal(n: number, lang: string): string {
  try {
    return new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
  } catch {
    return n.toFixed(1);
  }
}

/** What the Details tab lists beyond the title's own fields, gathered from its files. */
export function titleFacts(title: GumTitle, lang: string): {
  altTitles: string[];
  studio: string | null;
  network: string | null;
  airing: string | null;
  aired: string | null;
} {
  const first = <K extends keyof MediaItem>(key: K): MediaItem[K] | undefined =>
    title.items.map((item) => item[key]).find((value) => value !== undefined && value !== null && value !== '');
  const seen = new Set([title.title.trim().toLowerCase(), (title.originalTitle ?? '').trim().toLowerCase()]);
  const altTitles: string[] = [];
  for (const name of [...(title.view?.altTitles ?? []), ...title.items.map((item) => item.nativeTitle ?? '')]) {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    altTitles.push(name.trim());
  }
  const airedAt = title.items.map((item) => item.airedAt).filter((value): value is number => typeof value === 'number' && value > 0)
    .sort((a, b) => a - b)[0];
  let aired: string | null = null;
  if (airedAt) {
    try {
      aired = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(airedAt);
    } catch {
      aired = null;
    }
  }
  return {
    altTitles: altTitles.slice(0, 12),
    studio: (first('studio') as string | undefined) ?? null,
    network: (first('network') as string | undefined) ?? null,
    airing: (first('status') as string | undefined) ?? null,
    aired,
  };
}

/**
 * "Open in <player>" for one file, through `media:handoff` with the file's path, its
 * resume point and the chosen subtitle. The profile is read when the menu opens, so
 * a player set up in Settings a moment ago is offered at once; with none configured
 * the item is not shown and the menu links to Settings > External players instead.
 */
function ExternalPlayerMenu({
  item,
  resumeSec,
  label,
  compact,
  onSetUp,
}: {
  item: MediaItem;
  resumeSec?: number;
  label: string;
  compact?: boolean;
  onSetUp?: () => void;
}) {
  const { t } = useT();
  const run = async (profile: NonNullable<ReturnType<typeof externalPlayerProfile>>): Promise<void> => {
    try {
      const refused = await openInExternalPlayer(item, profile, resumeSec);
      if (refused) {
        showToast({ message: t('gum.external.failed', { reason: refused === 'unavailable' ? t('gum.external.unavailable') : refused }), kind: 'error' });
      } else {
        showToast({ message: t('gum.external.opened', { player: profile.name }), kind: 'success' });
      }
    } catch (error) {
      showToast({ message: t('gum.external.failed', { reason: error instanceof Error ? error.message : String(error) }), kind: 'error' });
    }
  };
  return (
    <GumPopover
      className={compact ? 'gum-pop--icon gum-pop--row-menu' : 'gum-pop--icon gum-pop--play-menu'}
      label={<GumIcon name="more" size={compact ? 16 : 18} />}
      ariaLabel={label}
      chevron={false}
      align={compact ? 'end' : 'start'}
    >
      {(close) => {
        const profile = externalPlayerProfile();
        return (
          <div className="gum-menu" role="group" aria-label={label}>
            {profile ? (
              <button type="button" className="gum-menu__item" onClick={() => { close(); void run(profile); }}>
                <span>{t('gum.external.openWith', { player: profile.name })}</span>
              </button>
            ) : (
              <>
                <span className="gum-menu__note">{t('gum.external.none')}</span>
                {onSetUp && (
                  <button type="button" className="gum-menu__item" onClick={() => { close(); onSetUp(); }}>
                    <span>{t('gum.external.setUp')}</span>
                  </button>
                )}
              </>
            )}
          </div>
        );
      }}
    </GumPopover>
  );
}

function EpisodeCard({
  row,
  status,
  resumeAt,
  onPlay,
  onFind,
  onSetUpExternal,
}: {
  row: GumEpisodeRow;
  status?: GumSubtitleStatus;
  resumeAt?: number;
  onPlay: (item: MediaItem, startAt?: number) => void;
  onFind: (episode: number | null) => void;
  onSetUpExternal?: () => void;
}) {
  const { t, lang } = useT();
  const item = row.item;
  const fraction = item ? watchedFraction(item) : null;
  const watched = item ? isWatched(item) : row.trackedWatched;
  const inProgress = item ? !watched && (item.positionSec ?? 0) > 0 : false;
  const name = (item ? providerEpisodeTitle(item) : null) ?? row.guide?.title ?? (item && row.number === null ? item.title : null);
  // The file's own length first: the guide's and provider's are the catalogue's typical
  // episode, which put "24 min" on a 20-second file.
  const runtime = (item?.durationSec ? item.durationSec / 60 : undefined) ?? row.guide?.runtimeMin ?? item?.runtimeMin;
  const study = useStudyLanguage().lang;
  const subs = item ? langNames(t, item, status, study) : '';
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
    note = [formatTimeLeft(t, item.durationSec, item.positionSec ?? 0), subs ? subsNote(t, subs, status) : null].filter(Boolean).join(' · ');
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
            {runtime ? <span className="gum-badge gum-badge--runtime">{formatRuntime(t, runtime)}</span> : null}
            {fraction !== null && fraction > 0 && fraction < 1 && (
              <span className="gum-progress gum-progress--flush" role="presentation"><i style={{ width: `${Math.round(fraction * 100)}%` }} /></span>
            )}
          </MediaArtwork>
        ) : (
          <div className="gum-episode__blank" aria-hidden="true">
            {runtime ? <span className="gum-badge gum-badge--runtime">{formatRuntime(t, runtime)}</span> : null}
          </div>
        )}
      </div>
      <div className="gum-episode__copy">
        <span className="gum-episode__num">{label}</span>
        <strong className="gum-episode__title">{name ?? (item ? item.fileName : label)}</strong>
        <small className="gum-episode__note" data-tone={tone}>{note}</small>
      </div>
      <div className="gum-episode__action">
        {item && (
          <ExternalPlayerMenu
            compact
            item={item}
            resumeSec={inProgress ? resumeAt ?? item.positionSec : undefined}
            label={row.number !== null ? t('gum.episode.options', { n: row.number }) : t('gum.episode.optionsExtra')}
            onSetUp={onSetUpExternal}
          />
        )}
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
          // One small icon per row; the list's own "Find missing episodes" is the big
          // action. A full text button on each of 26 rows squeezed every title.
          <button
            type="button"
            className="gum-icon-btn gum-episode__find"
            onClick={() => onFind(row.number)}
            aria-label={row.number !== null ? t('gum.episode.findN', { n: row.number }) : t('gum.episode.find')}
            title={row.number !== null ? t('gum.episode.findN', { n: row.number }) : t('gum.episode.find')}
          >
            <GumIcon name="download" size={15} />
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

/** Keys that change a closed native `<select>` without opening it. */
const SELECT_BROWSE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);

/**
 * The title's watch status.
 *
 * A closed native select changes its value on every arrow key, and saving on `change` meant
 * arrowing past "Completed" on the way to "On hold" marked the show completed (and set its
 * progress to the last episode). A keyboard change is now a draft, saved on Enter or when
 * focus leaves; Escape puts the saved value back. A pick from the open list (mouse, or
 * Enter in the list) saves at once. The select is never disabled while saving — disabling
 * it threw focus to the page after every change.
 *
 * An untracked title shows the status its files suggest ("Watching (from your files)"),
 * the same status the library counts it under; it said "Not tracked" while the Watching
 * tab counted it.
 */
export function GumStatusSelect({ title, busy, onCommit }: { title: GumTitle; busy: boolean; onCommit: (status: WatchStatus) => void }) {
  const { t } = useT();
  const saved = title.tracked ? title.status ?? '' : '';
  const [draft, setDraft] = useState<string>(saved);
  const browsing = useRef(false);
  /** The value last sent, so the blur after a pick does not save it a second time. */
  const sent = useRef<string | null>(null);
  useEffect(() => {
    setDraft(saved);
    sent.current = null;
  }, [saved, title.id]);
  const commit = (value: string): void => {
    if (!value || value === saved || value === sent.current || busy) return;
    sent.current = value;
    onCommit(value as WatchStatus);
  };
  const untrackedLabel = !title.tracked && title.status
    ? t('gum.title.derivedStatus', { status: t(`watchLibrary.status.${title.status}`) })
    : t('gum.title.notTracked');
  return (
    <Select
      value={draft}
      aria-busy={busy || undefined}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit(draft);
          return;
        }
        if (event.key === 'Escape' && draft !== saved) {
          event.preventDefault();
          event.stopPropagation();
          setDraft(saved);
          return;
        }
        const printable = event.key.length === 1 && !event.ctrlKey && !event.metaKey;
        if ((SELECT_BROWSE_KEYS.has(event.key) && !event.altKey) || printable) {
          browsing.current = true;
          // The `change` a browse key causes fires within this key press; after it, a
          // change is a pick from the open list again.
          window.setTimeout(() => {
            browsing.current = false;
          }, 0);
        }
      }}
      onChange={(event) => {
        const value = event.target.value;
        setDraft(value);
        if (!browsing.current) commit(value);
      }}
      onBlur={() => commit(draft)}
    >
      {!title.tracked && <option value="">{untrackedLabel}</option>}
      {WATCH_STATUSES.map((status) => <option key={status} value={status}>{t(`watchLibrary.status.${status}`)}</option>)}
    </Select>
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

/**
 * The title on other sites, each named through the catalogue with its id ("MyAnimeList
 * (457)"). Ids are identifiers, not quantities, so they are passed as strings.
 */
function externalLinks(t: Translate, title: GumTitle): Array<{ key: string; label: string; url: string }> {
  const view = title.view;
  const out: Array<{ key: string; label: string; url: string }> = [];
  if (title.malId) out.push({ key: 'mal', label: t('gum.link.mal', { id: String(title.malId) }), url: `https://myanimelist.net/anime/${title.malId}` });
  if (title.anilistId) out.push({ key: 'anilist', label: t('gum.link.anilist', { id: String(title.anilistId) }), url: `https://anilist.co/anime/${title.anilistId}` });
  const tvmaze = view?.tvmazeId ?? title.items.find((item) => item.tvmazeId)?.tvmazeId;
  if (tvmaze) out.push({ key: 'tvmaze', label: t('gum.link.tvmaze', { id: String(tvmaze) }), url: `https://www.tvmaze.com/shows/${tvmaze}` });
  const tmdb = view?.tmdbId ?? title.items.find((item) => item.tmdbId)?.tmdbId;
  if (tmdb) out.push({ key: 'tmdb', label: t('gum.link.tmdb', { id: String(tmdb) }), url: `https://www.themoviedb.org/${title.kind === 'film' ? 'movie' : 'tv'}/${tmdb}` });
  const imdb = view?.imdbId ?? title.items.find((item) => item.imdbId)?.imdbId;
  if (imdb) out.push({ key: 'imdb', label: t('gum.link.imdb', { id: imdb }), url: `https://www.imdb.com/title/${imdb}/` });
  if (view?.letterboxdUri) out.push({ key: 'letterboxd', label: t('gum.link.letterboxd'), url: view.letterboxdUri });
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
  onOpenFiles,
  ratingDisplay = 'ten',
  onOpenExternalPlayerSettings,
}: GumTitlePageProps) {
  const { t, lang } = useT();
  const studyLanguage = useStudyLanguage();
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
  const facts = useMemo(() => titleFacts(title, lang), [title, lang]);

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

  const resuming = next ? (next.positionSec ?? 0) > 0 && !isWatched(next) : false;
  const nextNumber = next && typeof next.episode === 'number' && title.kind !== 'film' ? next.episode : null;
  const playLabel = gumPlayLabel(t, resuming, nextNumber, nextNumber !== null && (next?.season ?? 1) > 1 ? gumEpisodeLabel(next) : null);

  const meta = [
    title.year ? String(title.year) : null,
    title.genres.slice(0, 3).join(', ') || null,
    title.kind !== 'film' && seasons.length > 1 ? t('gum.meta.seasons', { count: seasons.length }) : null,
    title.kind !== 'film' && title.episodeCount ? t('gum.meta.episodes', { count: title.episodeCount }) : null,
    title.runtimeMin ? (title.kind === 'film' ? formatRuntime(t, title.runtimeMin) : formatPerEpisode(t, title.runtimeMin)) : null,
    title.providerScore ? t('gum.meta.providerScore', { score: Math.round(title.providerScore * 10) / 10 }) : null,
  ].filter(Boolean) as string[];
  const chips = [t(typeLabelKey(title)), title.language === 'ja' ? t('gum.filter.language.ja') : null, title.format && title.format !== 'TV' ? title.format : null]
    .filter(Boolean) as string[];

  const tabs: GumTitleTab[] = isSeries ? ['episodes', 'details', 'subtitles', 'history'] : ['details', 'subtitles', 'history'];
  const visibleRows = rows.get(activeSeason) ?? [];
  const missingCount = [...rows.values()].flat().filter((row) => !row.item && !row.trackedWatched).length;

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
  const links = externalLinks(t, title);
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
            <MediaLevelBadge className="media-level-badge--title" ids={[title.id, ...title.items.map((item) => item.id)]} fallbackLevel={title.items.find((item) => item.jlptLevel)?.jlptLevel} />
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
              <div className="gum-title__play">
                <button type="button" className="gum-btn gum-btn--primary gum-btn--lg" onClick={play}>
                  <GumIcon name="play" size={16} /> {playLabel}
                </button>
                <ExternalPlayerMenu
                  item={next}
                  resumeSec={resuming ? resumeAt(next) ?? next.positionSec : undefined}
                  label={t('gum.title.playOptions')}
                  onSetUp={onOpenExternalPlayerSettings}
                />
              </div>
            )}
            {!title.onDisk && (
              <button type="button" className="gum-btn gum-btn--primary gum-btn--lg" onClick={() => onFindDownload(title)}>
                <GumIcon name="download" size={16} /> {t('gum.title.findDownload')}
              </button>
            )}
            <label className="gum-field">
              <span>{t('gum.title.status')}</span>
              <GumStatusSelect title={title} busy={busy} onCommit={(status) => void edit({ status })} />
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
                <button type="button" className="gum-icon-btn" disabled={title.progress <= 0} aria-busy={busy || undefined} onClick={() => { if (!busy) void edit({ progress: Math.max(0, title.progress - 1) }); }} aria-label={t('gum.title.progressDown')}>
                  <GumIcon name="minus" size={12} />
                </button>
                <strong aria-live="polite">{title.episodeCount ? `${title.progress} / ${title.episodeCount}` : title.progress}</strong>
                <button type="button" className="gum-icon-btn" disabled={title.episodeCount !== undefined && title.progress >= title.episodeCount} aria-busy={busy || undefined} onClick={() => { if (!busy) void edit({ progress: title.progress + 1 }); }} aria-label={t('gum.title.progressUp')}>
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
        {tab === 'episodes' && missingCount > 0 && (
          <div className="gum-episodes__bar">
            <span className="gum-muted">{t('gum.title.missingCount', { count: missingCount })}</span>
            <button type="button" className="gum-btn gum-btn--ghost gum-btn--sm" onClick={() => onFindDownload(title)}>
              <GumIcon name="download" size={13} /> {t('gum.title.findMissing')}
            </button>
          </div>
        )}
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
                  onSetUpExternal={onOpenExternalPlayerSettings}
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
              {title.year && <div><dt>{t('gum.facts.year')}</dt><dd>{String(title.year)}</dd></div>}
              {facts.aired && <div><dt>{t('gum.facts.aired')}</dt><dd>{facts.aired}</dd></div>}
              {facts.airing && <div><dt>{t('gum.facts.airing')}</dt><dd>{facts.airing}</dd></div>}
              {title.genres.length > 0 && <div><dt>{t('gum.facts.genres')}</dt><dd>{title.genres.join(', ')}</dd></div>}
              {title.episodeCount && title.kind !== 'film' && <div><dt>{t('gum.facts.episodes')}</dt><dd>{formatCount(title.episodeCount, lang)}</dd></div>}
              {title.runtimeMin && (
                <div>
                  <dt>{t('gum.facts.runtime')}</dt>
                  <dd>{title.kind === 'film' ? formatRuntime(t, title.runtimeMin) : formatPerEpisode(t, title.runtimeMin)}</dd>
                </div>
              )}
              {facts.studio && <div><dt>{t('gum.facts.studio')}</dt><dd>{facts.studio}</dd></div>}
              <MediaCreditsFacts items={title.items} />
              {facts.network && <div><dt>{t('gum.facts.network')}</dt><dd>{facts.network}</dd></div>}
              {title.score !== undefined && <div><dt>{t('gum.facts.myRating')}</dt><dd>{formatScore(title, ratingDisplay, lang)}</dd></div>}
              {title.providerScore && <div><dt>{t('gum.facts.providerRating')}</dt><dd>{formatDecimal(title.providerScore, lang)}</dd></div>}
              <div><dt>{t('gum.facts.onDisk')}</dt><dd>{title.onDisk ? t('gum.facts.files', { count: title.items.length }) : t('gum.episode.notDownloaded')}</dd></div>
              <div><dt>{t('gum.facts.sources')}</dt><dd>{title.sources.map((source) => t(`gum.filter.source.${source}`)).join(', ')}</dd></div>
              {facts.altTitles.length > 0 && (
                <div className="gum-facts__wide">
                  <dt>{t('gum.facts.altTitles')}</dt>
                  {/* Study content: shown as the sources wrote them. */}
                  <dd>{facts.altTitles.join(' · ')}</dd>
                </div>
              )}
              {links.length > 0 && (
                <div className="gum-facts__wide">
                  <dt>{t('gum.facts.links')}</dt>
                  <dd className="gum-links">
                    {links.map((link) => (
                      <button type="button" key={link.key} className="gum-link" title={link.url} onClick={() => void window.api.openExternal(link.url)}>
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
                {entry && fileTools.onToggleStudyQueue && (
                  <label className="gum-check">
                    <input
                      type="checkbox"
                      checked={title.items.some((item) => item.studyQueue)}
                      onChange={(event) => void fileTools.onToggleStudyQueue?.(entry, event.target.checked)}
                    />
                    <span>{t('gum.title.studyQueue')}</span>
                  </label>
                )}
              </div>
              {title.watchId && (
                <button type="button" className="gum-link gum-link--danger" onClick={() => void removeTitle()}>{t('gum.title.untrack')}</button>
              )}
            </section>

            {title.items.length > 0 && (
              <section className="gum-details__block gum-details__files" aria-labelledby="gum-title-files">
                <div className="gum-details__head">
                  <h2 id="gum-title-files">{t('gum.title.filesHeading')}</h2>
                  {onOpenFiles && (
                    <button type="button" className="gum-link" onClick={onOpenFiles}>{t('gum.title.openInFiles')}</button>
                  )}
                </div>
                <ul className="gum-files">
                  {episodesBySeasonOf(title).flatMap(({ items }) => items).map((item) => (
                    <li key={item.id}>
                      <span className="gum-files__label">
                        {typeof item.episode === 'number' ? (gumEpisodeLabel(item) ?? '') : t('gum.episode.extra')}
                      </span>
                      <span className="gum-files__path" title={item.path}>{item.path}</span>
                    </li>
                  ))}
                </ul>
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
                  {/* The shared sentence says "Add one above", but here the button is beside
                      it; this page words the missing-key notice for its own layout. */}
                  {subtitleNotice.notice === 'opensubtitles-key-missing'
                    ? t('gum.subs.notice.keyMissing')
                    : t(`subtitle.notice.${subtitleNotice.notice}`, subtitleNotice.quotaResetAt
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
              {entry && onOpenFiles && (
                <button type="button" className="gum-btn gum-btn--ghost" onClick={onOpenFiles}>{t('gum.subs.moreTools')}</button>
              )}
            </div>
            {title.items.length === 0 ? (
              <p className="gum-muted">{t('gum.subs.noFiles')}</p>
            ) : (
              <table className="gum-subs-table">
                <thead>
                  <tr>
                    <th scope="col">{t('gum.subs.episode')}</th>
                    <th scope="col" lang={studyLanguage.tag}>{studyAutonym(studyLanguage.lang)}</th>
                    <th scope="col">{t('gum.subs.english')}</th>
                  </tr>
                </thead>
                <tbody>
                  {episodesBySeasonOf(title).flatMap(({ items }) => items).map((item) => {
                    const status = statuses.get(item.id);
                    const hasStudy = hasTrackIn(item, studyLanguage.lang);
                    const hasEnglish = hasTrackIn(item, 'en');
                    const cell = (state: string | undefined, has: boolean, machine?: boolean): string => {
                      const base = t(`subtitleAuto.state.${state ?? (has ? 'found' : 'none')}`);
                      return machine ? `${base} · ${t('subtitleAuto.machineTranslated')}` : base;
                    };
                    return (
                      <tr key={item.id}>
                        <th scope="row">{typeof item.episode === 'number' ? t('gum.episode.number', { n: item.episode }) : item.fileName}</th>
                        <td data-state={status?.ja ?? (hasStudy ? 'found' : 'none')}>{cell(status?.ja, hasStudy, status?.machineTranslated.ja)}</td>
                        <td data-state={status?.en ?? (hasEnglish ? 'found' : 'none')}>{cell(status?.en, hasEnglish, status?.machineTranslated.en)}</td>
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
              {view?.startedAt && <div><dt>{t('gum.history.started')}</dt><dd>{formatIsoDate(view.startedAt, lang)}</dd></div>}
              {view?.finishedAt && <div><dt>{t('gum.history.finished')}</dt><dd>{formatIsoDate(view.finishedAt, lang)}</dd></div>}
              {view?.rewatchCount ? <div><dt>{t('gum.history.rewatches')}</dt><dd>{formatCount(view.rewatchCount, lang)}</dd></div> : null}
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
              <ul className="gum-watch-history">
                {history.map((date, index) => (
                  <li key={`${date.date}-${index}`}>
                    <strong>{formatIsoDate(date.date, lang)}</strong>
                    <span>{[date.rewatch ? t('gum.history.rewatch') : null, date.stars ? formatScore({ stars: date.stars }, ratingDisplay, lang) : null, t(`gum.filter.source.${date.source}`)].filter(Boolean).join(' · ')}</span>
                  </li>
                ))}
              </ul>
            )}
            {localPlays.length > 0 && (
              <>
                <h2 className="gum-details__sub">{t('gum.history.plays')}</h2>
                <ul className="gum-watch-history">
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
