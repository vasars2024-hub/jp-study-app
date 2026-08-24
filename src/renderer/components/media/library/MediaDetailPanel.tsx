/**
 * The right-hand detail drawer: hero art, facts, primary actions, and tabs over
 * the episode list, the study column, and the file's own details.
 *
 * Favorite and Study Queue toggle optimistically and roll back on failure — a
 * toggle that waits for a disk write feels broken, and one that silently fails
 * is worse.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, IconButton, Select, Tabs, showToast } from '../../ui';
import Icon from '../../Icons';
import { useT } from '../../../i18n';
import MediaArtwork from './MediaArtwork';
import MediaEpisodeRow from './MediaEpisodeRow';
import MediaStudyPanel from './MediaStudyPanel';
import MediaStatusPill from './MediaStatusPill';
import MediaMatchDialog from './MediaMatchDialog';
import NyaaSubtitleDialog from './NyaaSubtitleDialog';
import { useMediaJobs } from './useMediaJobs';
import { episodesBySeason, providerEpisodeTitle, type LibraryEntry } from '../../../../shared/mediaLibraryEntries';
import { mediaSubtitleStatus } from '../../../../shared/mediaSubtitleStatus';
import {
  fusionArbitrationStatus,
  fusionCueCounts,
  type FusionTrackMeta,
} from '../../../../shared/subtitleFusionMeta';
import type { MediaItem } from '../../../../shared/types';

export interface MediaDetailPanelProps {
  entry: LibraryEntry | null;
  /** Id of whatever the player currently has open, for the active row. */
  currentId: string | null;
  onClose: () => void;
  onPlay: (id: string) => void;
  onToggleFavorite: (entry: LibraryEntry, next: boolean) => Promise<void> | void;
  onToggleStudyQueue: (entry: LibraryEntry, next: boolean) => Promise<void> | void;
  onNoteChange: (item: MediaItem, note: string) => Promise<void> | void;
  /** Applies a user-chosen provider result to the whole series. */
  onRematch: (entry: LibraryEntry, hit: import('../../../../shared/mediaMetadataIpc').MediaMetadataSearchHit) => Promise<void> | void;
  /** Loads a stored track into the player. Absent when no player is attached. */
  onUseSubtitle?: (mediaId: string, recordId: string) => Promise<void> | void;
  activeSubtitleName?: string;
}

function fileFacts(item: MediaItem): Array<{ labelKey: string; value: string }> {
  const facts: Array<{ labelKey: string; value: string }> = [
    { labelKey: 'media.info.fileName', value: item.fileName },
  ];
  if (item.resolution) facts.push({ labelKey: 'media.info.resolution', value: `${item.resolution}p` });
  if (item.releaseGroup) facts.push({ labelKey: 'media.info.releaseGroup', value: item.releaseGroup });
  if (item.lang) facts.push({ labelKey: 'media.info.language', value: item.lang });
  if (item.kind) facts.push({ labelKey: 'media.info.kind', value: item.kind });
  return facts;
}

export default function MediaDetailPanel({
  entry,
  currentId,
  onClose,
  onPlay,
  onToggleFavorite,
  onToggleStudyQueue,
  onNoteChange,
  onRematch,
  onUseSubtitle,
  activeSubtitleName,
}: MediaDetailPanelProps) {
  const { t, lang } = useT();
  const [tab, setTab] = useState('episodes');
  const [season, setSeason] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [expanded, setExpanded] = useState(false);
  // Mirrors of the persisted flags so the toggle paints before the write lands.
  const [pendingFavorite, setPendingFavorite] = useState<boolean | null>(null);
  const [pendingQueue, setPendingQueue] = useState<boolean | null>(null);
  const [matching, setMatching] = useState(false);
  const [searching, setSearching] = useState(false);
  const [nyaaOpen, setNyaaOpen] = useState(false);
  /** Which track has been armed for removal, and which one is in flight. */
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  // Provenance sidecars for fused tracks, by record id. A track with no entry has
  // no sidecar to show — fusion before F6, or a file that is not one.
  const [fusionMeta, setFusionMeta] = useState<Record<string, FusionTrackMeta>>({});
  const { transcribing } = useMediaJobs();

  const entryId = entry?.id ?? null;

  useEffect(() => {
    setSeason(null);
    setExpanded(false);
    setPendingFavorite(null);
    setPendingQueue(null);
    setMatching(false);
    setNyaaOpen(false);
    setConfirmRemove(null);
    setNote(entry?.primary.note ?? '');
  }, [entryId, entry?.primary.note]);

  const seasons = useMemo(() => (entry ? episodesBySeason(entry) : []), [entry]);
  const tracks = entry?.primary.subtitles ?? [];

  /**
   * Drop one track from the item.
   *
   * The list refreshes through the library's own `media:changed` broadcast, so
   * nothing is mirrored locally: an optimistic removal here would disagree with
   * disk the moment main refused.
   */
  const removeTrack = useCallback(async (mediaId: string, track: { id: string; label?: string; lang: string }) => {
    setRemoving(track.id);
    try {
      const result = await window.api.detachSubtitleRecord(mediaId, track.id);
      showToast(result.ok
        ? { message: t('media.subtitles.removed', { name: track.label ?? track.lang }), kind: 'success' }
        : { message: result.message, kind: 'error' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : String(error), kind: 'error' });
    } finally {
      setRemoving(null);
      setConfirmRemove(null);
    }
  }, [t]);
  const episodeLabel = entry ? (providerEpisodeTitle(entry.primary) ?? entry.primary.title) : '';

  /**
   * Fusion borrows an English track's cue timing; without one there is nothing to
   * fuse against, and the button says that rather than failing after the queue
   * has already spun up ffmpeg.
   */
  const englishTrack = useMemo(
    () => tracks.find((track) => /^en\b/i.test(track.lang.trim())),
    [tracks],
  );

  const primaryId = entry?.primary.id ?? null;
  // Joined so the effect below depends on the *contents*, not on the array identity
  // a fresh `?? []` produces on every render.
  const fusedTrackIds = tracks
    .filter((track) => track.derivation === 'en-ja-fusion')
    .map((track) => track.id)
    .join(',');

  useEffect(() => {
    setFusionMeta({});
  }, [primaryId]);

  useEffect(() => {
    // A sidecar is optional metadata about an optional track, so a failure here
    // costs the badge and nothing else — the track list must still render.
    if (!primaryId || tab !== 'subtitles' || !fusedTrackIds) return undefined;
    if (typeof window.api?.fusionTrackMeta !== 'function') return undefined;
    let live = true;
    void (async () => {
      for (const trackId of fusedTrackIds.split(',')) {
        try {
          const meta = await window.api.fusionTrackMeta(primaryId, trackId);
          if (!live || !meta) continue;
          setFusionMeta((previous) => ({ ...previous, [trackId]: meta }));
        } catch {
          // No sidecar, no badge. Deliberately silent.
        }
      }
    })();
    return () => { live = false; };
  }, [primaryId, tab, fusedTrackIds]);

  /**
   * Searches for the *primary* episode only. A whole-series sweep is the import
   * path's job; from here the user is looking at one episode and expects the
   * button to act on that one.
   */
  const search = useCallback(async () => {
    if (!entry) return;
    setSearching(true);
    try {
      const result = await window.api.runSubtitleDiscovery({
        mediaIds: [entry.primary.id],
        force: true,
      });
      showToast(result.ok
        ? { message: t('media.subtitles.searchDone', { count: result.files }), kind: result.files ? 'success' : 'default' }
        : { message: result.error ?? t('media.subtitles.searchFailed'), kind: 'error' });
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : t('media.subtitles.searchFailed'),
        kind: 'error',
      });
    } finally {
      setSearching(false);
    }
  }, [entry, t]);

  const tabs = useMemo(() => [
    { id: 'episodes', label: t('media.detail.tab.episodes') },
    { id: 'subtitles', label: t('media.detail.tab.subtitles') },
    { id: 'study', label: t('media.detail.tab.study') },
    { id: 'info', label: t('media.detail.tab.info') },
  ], [lang]);

  if (!entry) {
    return (
      <aside className="medialib-drawer" aria-label={t('media.detail.label')}>
        <div className="medialib-drawer__empty">
          <Icon name="video" size={30} />
          <span>{t('media.detail.empty')}</span>
        </div>
      </aside>
    );
  }

  const favorite = pendingFavorite ?? entry.favorite;
  const queued = pendingQueue ?? entry.studyQueue;
  const activeSeason = season ?? seasons[0]?.season ?? 1;
  const visible = seasons.find((s) => s.season === activeSeason)?.items ?? entry.items;
  const isSeries = entry.grouping !== 'none';

  const toggle = async (
    next: boolean,
    setPending: (value: boolean | null) => void,
    commit: (entry: LibraryEntry, next: boolean) => Promise<void> | void,
  ): Promise<void> => {
    setPending(next);
    try {
      await commit(entry, next);
    } catch {
      setPending(null); // roll back to whatever the store still says
    }
  };

  const info = entry.metadataItem;
  // Provider format ("TV") beats the local category word once a sweep has run.
  const meta: string[] = [info.format ?? t(`media.category.${entry.category}`)];
  if (entry.year) meta.push(String(entry.year));
  if (isSeries) {
    // "X of Y" only makes sense while the library is short of the published run.
    // Holding more files than the provider lists is normal — a multi-season rip
    // grouped under one title, or a provider that counts only season one — and
    // rendering it as "26 of 13 episodes" is just wrong.
    const published = info.episodeCount;
    meta.push(published && entry.episodeCount < published
      ? t('media.detail.episodeProgress', { have: entry.episodeCount, total: published })
      : t('media.detail.episodeCount', { count: entry.episodeCount }));
  }
  if (info.studio) meta.push(info.studio);
  if (info.status) meta.push(info.status);
  if (!info.metadataSource && entry.primary.releaseGroup) meta.push(entry.primary.releaseGroup);

  return (
    <aside className="medialib-drawer" aria-label={t('media.detail.label')}>
      <div className="medialib-drawer__hero">
        <MediaArtwork
          id={entry.artworkItem.id}
          title={entry.title}
          variant="banner"
          ratio="16 / 9"
          // The drawer is a labelled region and its body opens with the title as
          // an `h3`; the banner is the backdrop to that heading, not the name of it.
          decorative
        />
        <button type="button" className="medialib-drawer__close" onClick={onClose} aria-label={t('common.close')}>
          <Icon name="close" size={14} />
        </button>
      </div>

      <div className="medialib-drawer__body">
        <h3 className="medialib-drawer__title">{entry.title}</h3>
        {info.nativeTitle && <span className="medialib-drawer__native">{info.nativeTitle}</span>}
        <div className="medialib-drawer__meta">
          {meta.map((fact) => <span key={fact}>{fact}</span>)}
        </div>

        {(info.rating || info.rank) && (
          <div className="medialib-drawer__score">
            {info.rating != null && (
              <span className="medialib-drawer__rating">
                <Icon name="star" size={13} />
                {info.rating.toFixed(2)}
              </span>
            )}
            {info.rank != null && (
              <span className="muted">{t('media.detail.rank', { rank: info.rank })}</span>
            )}
          </div>
        )}

        {entry.metadataNeedsReview && (
          <div className="medialib-drawer__review" role="status">
            <MediaStatusPill status={{ tone: 'warning', labelKey: 'media.subStatus.reviewMatch' }} />
            <button type="button" className="medialib-drawer__more" onClick={() => setMatching(true)}>
              {t('media.match.change')}
            </button>
          </div>
        )}

        <div className="medialib-drawer__actions">
          <Button
            variant="primary"
            leftIcon={<Icon name="player" size={14} />}
            onClick={() => onPlay(entry.primary.id)}
          >
            {isSeries && entry.watchedCount > 0
              ? t('media.detail.playNext')
              : t('media.detail.play')}
          </Button>
          <IconButton
            label={favorite ? t('media.detail.unfavorite') : t('media.detail.favorite')}
            aria-pressed={favorite}
            onClick={() => void toggle(!favorite, setPendingFavorite, onToggleFavorite)}
          >
            <Icon name="heart" size={15} />
          </IconButton>
          <IconButton
            label={queued ? t('media.detail.dequeue') : t('media.detail.enqueue')}
            aria-pressed={queued}
            onClick={() => void toggle(!queued, setPendingQueue, onToggleStudyQueue)}
          >
            <Icon name="library" size={15} />
          </IconButton>
        </div>

        {info.synopsis && (
          <>
            <p className="medialib-drawer__synopsis" data-clamped={!expanded}>
              {info.synopsis}
            </p>
            <button type="button" className="medialib-drawer__more" onClick={() => setExpanded((v) => !v)}>
              {expanded ? t('media.detail.less') : t('media.detail.more')}
            </button>
          </>
        )}

        <Tabs tabs={tabs} value={tab} onChange={setTab} aria-label={t('media.detail.label')} />

        {tab === 'episodes' && (
          <div className="medialib-drawer__section">
            {seasons.length > 1 && (
              <Select
                aria-label={t('media.detail.season')}
                value={String(activeSeason)}
                onChange={(e) => setSeason(Number(e.target.value))}
              >
                {seasons.map((s) => (
                  <option key={s.season} value={s.season}>
                    {t('media.detail.seasonN', { season: s.season })}
                  </option>
                ))}
              </Select>
            )}
            <div className="medialib-eplist">
              {visible.map((item, index) => (
                <MediaEpisodeRow
                  key={item.id}
                  item={item}
                  ordinal={index + 1}
                  active={item.id === currentId}
                  status={mediaSubtitleStatus()}
                  onOpen={onPlay}
                />
              ))}
            </div>

            {entry.extras.length > 0 && (
              <div className="medialib-drawer__section">
                <h4>{t('media.detail.extras')}</h4>
                <div className="medialib-eplist">
                  {entry.extras.map((item, index) => (
                    <MediaEpisodeRow
                      key={item.id}
                      item={item}
                      ordinal={index + 1}
                      active={item.id === currentId}
                      onOpen={onPlay}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'subtitles' && (
          <div className="medialib-drawer__section">
            <div className="medialib-drawer__review">
              <h4>{t('media.subtitles.forEpisode', { title: episodeLabel })}</h4>
              <Button size="sm" disabled={searching} onClick={() => void search()}>
                {searching ? t('media.subtitles.searching') : t('media.subtitles.search')}
              </Button>
              <Button size="sm" onClick={() => setNyaaOpen(true)}>
                {t('media.subtitles.nyaa.open')}
              </Button>
              <Button
                size="sm"
                disabled={transcribing.has(entry.primary.id)}
                onClick={() => {
                  void window.api.enqueueTranscription({ mediaId: entry.primary.id, lang: 'ja' });
                  showToast({ message: t('media.subtitles.transcribeQueued'), kind: 'default' });
                }}
              >
                {transcribing.has(entry.primary.id)
                  ? t('media.subtitles.transcribing')
                  : t('media.subtitles.transcribe')}
              </Button>
              <Button
                size="sm"
                disabled={!englishTrack || transcribing.has(entry.primary.id)}
                onClick={() => {
                  void window.api.enqueueTranscription({
                    mediaId: entry.primary.id,
                    lang: 'ja',
                    kind: 'fuse-en-ja',
                  });
                  showToast({ message: t('media.subtitles.fuse.queued'), kind: 'default' });
                }}
              >
                {t('media.subtitles.fuse.action')}
              </Button>
            </div>
            {!englishTrack && (
              <p className="muted">{t('media.subtitles.fuse.needsEnglish')}</p>
            )}
            {nyaaOpen && (
              <NyaaSubtitleDialog
                mediaId={entry.primary.id}
                languages={[]}
                onCancel={() => setNyaaOpen(false)}
                onAttached={(attachedLang) => {
                  setNyaaOpen(false);
                  showToast({
                    message: t('media.subtitles.nyaa.attached', { lang: attachedLang }),
                    kind: 'success',
                  });
                }}
              />
            )}
            {tracks.length === 0 ? (
              <p className="muted">
                {entry.primary.subtitlesCheckedAt
                  ? t('media.subtitles.none')
                  : t('media.subtitles.notSearched')}
              </p>
            ) : (
              <ul className="medialib-tracks">
                {tracks.map((track) => {
                  const label = track.label ?? track.path;
                  // Two ways to be the active track, because there are two players.
                  // `activeSubtitleName` is the inline player's live state; the stored
                  // id is the choice itself, and it is the only one the media workspace
                  // — a separate player that never sees this shell's state — acts on.
                  const active = (activeSubtitleName != null && activeSubtitleName === label)
                    || entry.primary.preferredSubtitleId === track.id;
                  // What the fusion pipeline itself thinks of the track it wrote.
                  // Only ever present for a fused track that has its F6 sidecar.
                  const meta = fusionMeta[track.id];
                  const counts = meta ? fusionCueCounts(meta) : null;
                  // Why the unverified lines above are unverified. Silent for
                  // `unknown` (a sidecar that predates the field cannot testify),
                  // for `ok`, and for a skip that is not a failure — nothing
                  // disputed, or a cancelled run. The two cases worth a line need
                  // different actions from the user: configure a model, or retry.
                  const arbiter = meta ? fusionArbitrationStatus(meta) : { kind: 'unknown' as const };
                  const arbiterLine = arbiter.kind === 'failed'
                    ? t('media.subtitles.fusion.arbiterFailed', { count: arbiter.failedBatches })
                    : arbiter.kind === 'partial'
                      ? t('media.subtitles.fusion.arbiterPartial', {
                        applied: arbiter.applied,
                        attempted: arbiter.attempted,
                      })
                      : arbiter.kind === 'off' && arbiter.reason === 'no-key'
                        ? t('media.subtitles.fusion.arbiterOff')
                        : null;
                  const detail = [
                    t(`media.subtitles.source.${track.source}`),
                    track.format.toUpperCase(),
                    track.providerId,
                    track.confidence != null
                      ? t('media.subtitles.confidence', { percent: Math.round(track.confidence) })
                      : null,
                    track.machineGenerated ? t('media.subtitles.machine') : null,
                    // Precedence matters, and "all cross-checked" is the claim
                    // that has to be earned. A track fused with no translator
                    // installed has nothing to cross-check against, so it takes
                    // the unrefereed line and says why; only a track where every
                    // line actually faced a reference reaches `allChecked`.
                    counts
                      ? (counts.unrefereed
                        ? t('media.subtitles.fusion.unrefereed', {
                          count: counts.unrefereed,
                          total: counts.total,
                        })
                        : counts.uncertain
                          ? t('media.subtitles.fusion.uncertain', {
                            count: counts.uncertain,
                            total: counts.total,
                          })
                          : t('media.subtitles.fusion.allChecked', { count: counts.total }))
                      : null,
                    // Separate from the two above: a repaired line is trusted, but
                    // it is text the arbiter wrote rather than text Whisper heard,
                    // and a learner comparing the track to the audio should know.
                    counts?.corrected ? t('media.subtitles.fusion.repaired', {
                      count: counts.corrected,
                    }) : null,
                    arbiterLine,
                  ].filter(Boolean).join(' · ');

                  const body = (
                    <>
                      <span className="medialib-track__lang">{track.lang}</span>
                      <span className="medialib-track__text">
                        <span className="medialib-track__label" title={label}>{label}</span>
                        <span className="muted">{detail}</span>
                      </span>
                      {active && <Icon name="check" size={13} className="medialib-track__check" />}
                    </>
                  );

                  // Without a player attached the row is still worth listing —
                  // it just is not worth pretending it can be clicked.
                  return (
                    <li key={track.id} className="medialib-track-row">
                      {onUseSubtitle ? (
                        <button
                          type="button"
                          className="medialib-track medialib-track--action"
                          data-active={active || undefined}
                          aria-pressed={active}
                          onClick={() => {
                            void Promise.resolve(onUseSubtitle(entry.primary.id, track.id)).catch((error: unknown) => {
                              showToast({
                                message: error instanceof Error ? error.message : String(error),
                                kind: 'error',
                              });
                            });
                          }}
                        >
                          {body}
                        </button>
                      ) : (
                        <div className="medialib-track">{body}</div>
                      )}
                      {/* The reverse of every add above it. Two clicks rather
                          than one: this deletes the cue file the app wrote, and
                          a corrected transcript is user work with no undo. */}
                      {confirmRemove === track.id ? (
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={removing === track.id}
                          onClick={() => { void removeTrack(entry.primary.id, track); }}
                        >
                          {removing === track.id
                            ? t('media.subtitles.removing')
                            : t('media.subtitles.removeConfirm')}
                        </Button>
                      ) : (
                        <IconButton
                          size="sm"
                          label={t('media.subtitles.remove')}
                          onClick={() => setConfirmRemove(track.id)}
                        >
                          <Icon name="trash" size={13} />
                        </IconButton>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {tab === 'study' && (
          <div className="medialib-drawer__section">
            <MediaStudyPanel item={entry.primary} transcriptionPending={transcribing.has(entry.primary.id)} />
            <h4>{t('media.detail.note')}</h4>
            <textarea
              className="medialib-note"
              aria-label={t('media.detail.note')}
              placeholder={t('media.detail.notePlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => {
                if (note !== (entry.primary.note ?? '')) void onNoteChange(entry.primary, note);
              }}
            />
          </div>
        )}

        {tab === 'info' && (
          <div className="medialib-drawer__section">
            <h4>{t('media.detail.tab.info')}</h4>
            {info.genres && info.genres.length > 0 && (
              <div className="medialib-tags">
                {info.genres.map((genre) => <span key={genre} className="medialib-tag">{genre}</span>)}
              </div>
            )}
            <dl className="medialib-facts">
              {fileFacts(entry.primary).map((fact) => (
                <div key={fact.labelKey}>
                  <dt>{t(fact.labelKey)}</dt>
                  <dd title={fact.value}>{fact.value}</dd>
                </div>
              ))}
            </dl>
            {info.relatedTitles && info.relatedTitles.length > 0 && (
              <>
                <h4>{t('media.detail.related')}</h4>
                <div className="medialib-tags">
                  {info.relatedTitles.map((title) => (
                    <span key={title} className="medialib-tag">{title}</span>
                  ))}
                </div>
              </>
            )}
            <Button size="sm" onClick={() => setMatching(true)}>
              {info.metadataSource && info.metadataSource !== 'unmatched'
                ? t('media.match.change')
                : t('media.match.find')}
            </Button>
          </div>
        )}

        {matching && (
          <MediaMatchDialog
            initialQuery={entry.title}
            onCancel={() => setMatching(false)}
            onPick={(hit) => {
              setMatching(false);
              void onRematch(entry, hit);
            }}
          />
        )}
      </div>
    </aside>
  );
}
