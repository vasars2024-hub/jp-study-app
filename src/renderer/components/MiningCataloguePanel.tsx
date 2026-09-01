/**
 * MINING gate 10 — the catalogue, on the Mining surface.
 *
 * "One Mining surface hosts the catalogue, replacing the epub-only 'simple
 * mining' entry point without losing any capability it had."
 *
 * Before this, opening Flashcards → Mining offered three tabs and every one of
 * them was a *book* tool: Simple, Advanced and Jiten all take an EPUB from the
 * library. A transcript the app had written itself, or a subtitle file sitting
 * beside a downloaded video, could only be mined from the Files app. This panel
 * is the fourth tab and it lists **every mineable asset across every store** —
 * so the Mining surface stops being epub-only.
 *
 * Two constraints from `MINING_UNIFICATION_PLAN.md` are load-bearing here:
 *
 * - **Unify the surface, not the extractors.** The mine walk is imported from
 *   `filesapp/filesMineChain`, the same function the Files app calls. A second
 *   copy would let the two surfaces mine one file to two different results.
 * - **Categorise on text provenance, not on "movie".** The primary filter is
 *   human subs / auto captions / transcript / book text, because that is what
 *   decides whether a card is trustworthy; media type is the secondary filter.
 *   Every provenance is listed WITH ITS COUNT even at zero — an empty category
 *   that says so is the gate's requirement, an omitted one is a finding.
 *
 * Not a gatekeeper in either direction: the three epub tabs are untouched and
 * still the whole of what they were, and this panel offers the fuller Files app
 * beside it rather than replacing it.
 */
import { useCallback, useMemo, useState } from 'react';
import { useT } from '../i18n';
import type { FilesItem, FilesProvenance } from '../../shared/filesApp/catalog';
import { isMachineDerived } from '../../shared/filesApp/catalog';
import { FILES_MINE_MAX_CARDS, mineabilityOf } from '../../shared/filesApp/mining';
import { useFilesIndex } from './filesapp/useFilesIndex';
import { mineFilesItem, undoMinedCards, type MineState } from './filesapp/filesMineChain';
import { formatSize } from './filesapp/format';
import { openSectionSurface } from '../sectionSurface';
import './miningCatalogue.css';

/**
 * The provenance axis, in the order the plan names it. `unknown` is last and
 * present on purpose: a subtitle sidecar whose origin no record claims is a real
 * row in this index, and dropping it from the filters would hide assets that
 * mine perfectly well.
 */
const PROVENANCE_FILTERS: readonly FilesProvenance[] = [
  'human-subs',
  'auto-captions',
  'whisper-transcript',
  'book-text',
  'unknown',
];

/** Secondary axis. Deliberately coarse: it filters, it does not categorise. */
type MediaFilter = 'all' | 'transcript' | 'subtitle' | 'book';
const MEDIA_FILTERS: readonly MediaFilter[] = ['all', 'transcript', 'subtitle', 'book'];

interface Props {
  /** Test seam: the panel is otherwise driven entirely by the live index. */
  onMined?: () => void;
}

export default function MiningCataloguePanel({ onMined }: Props) {
  // `lang` travels with `t` because `formatSize` needs it: a bare
  // `toLocaleString()` formats digits in the SYSTEM locale, not the UI one.
  const { t, lang } = useT();
  const { state, refresh, refreshing } = useFilesIndex();
  const [provenance, setProvenance] = useState<FilesProvenance | 'all'>('all');
  const [media, setMedia] = useState<MediaFilter>('all');
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mineState, setMineState] = useState<MineState>({ status: 'idle' });

  /** Every mineable row in the index, judged by the production predicate. */
  const mineable = useMemo<FilesItem[]>(() => {
    if (state.status !== 'ready') return [];
    return state.snapshot.items.filter((item) => mineabilityOf(item).mineable);
  }, [state]);

  /**
   * Counts per provenance, computed over the media-filtered set so the chip
   * numbers describe what clicking them would actually show. A count that does
   * not match its own list is the defect this ordering avoids.
   */
  const byMedia = useMemo(
    () => (media === 'all' ? mineable : mineable.filter((item) => item.kind === media)),
    [mineable, media],
  );
  const provenanceCounts = useMemo(() => {
    const counts = new Map<FilesProvenance, number>();
    for (const key of PROVENANCE_FILTERS) counts.set(key, 0);
    for (const item of byMedia) {
      counts.set(item.provenance, (counts.get(item.provenance) ?? 0) + 1);
    }
    return counts;
  }, [byMedia]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return byMedia
      .filter((item) => provenance === 'all' || item.provenance === provenance)
      .filter((item) => !needle || item.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [byMedia, provenance, query]);

  const onMine = useCallback(
    async (item: FilesItem) => {
      setActiveId(item.id);
      setMineState({ status: 'reading' });
      const result = await mineFilesItem(item);
      setMineState(result);
      if (result.status === 'done') onMined?.();
    },
    [onMined],
  );

  const onUndo = useCallback(() => {
    if (mineState.status !== 'done') return;
    const count = undoMinedCards(mineState.addedIds);
    setMineState({ status: 'undone', count });
  }, [mineState]);

  /* -------- honest states: an index that failed and one that is empty
     are different things, and neither is a blank list. -------- */
  if (state.status === 'loading') {
    return <p className="mining-catalogue-state muted">{t('filesApp.state.loading')}</p>;
  }
  if (state.status === 'unavailable') {
    return <p className="mining-catalogue-state muted">{t('filesApp.state.unavailable')}</p>;
  }
  if (state.status === 'error') {
    return (
      <div className="mining-catalogue-state">
        <p className="mining-catalogue-error">{t('filesApp.state.error')}</p>
        <p className="muted">{state.error}</p>
        <button type="button" className="mining-catalogue-refresh" onClick={refresh}>
          {t('mining.catalogue.refresh')}
        </button>
      </div>
    );
  }

  return (
    <div className="mining-catalogue">
      <div className="mining-catalogue-bar">
        <input
          type="search"
          className="mining-catalogue-search"
          value={query}
          placeholder={t('mining.catalogue.searchPlaceholder')}
          aria-label={t('mining.catalogue.searchPlaceholder')}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          className="mining-catalogue-refresh"
          onClick={refresh}
          disabled={refreshing}
        >
          {refreshing ? t('mining.catalogue.refreshing') : t('mining.catalogue.refresh')}
        </button>
        <button
          type="button"
          className="mining-catalogue-refresh"
          onClick={() => openSectionSurface('files')}
        >
          {t('mining.catalogue.openFiles')}
        </button>
      </div>

      <div className="mining-catalogue-filters" role="group" aria-label={t('mining.catalogue.provenanceLabel')}>
        <span className="mining-catalogue-filter-label">{t('mining.catalogue.provenanceLabel')}</span>
        <button
          type="button"
          className={`mining-catalogue-chip${provenance === 'all' ? ' active' : ''}`}
          aria-pressed={provenance === 'all'}
          onClick={() => setProvenance('all')}
        >
          {t('mining.catalogue.filter.all', { count: byMedia.length })}
        </button>
        {PROVENANCE_FILTERS.map((key) => (
          <button
            key={key}
            type="button"
            className={`mining-catalogue-chip${provenance === key ? ' active' : ''}`}
            aria-pressed={provenance === key}
            data-empty={provenanceCounts.get(key) === 0 ? 'true' : undefined}
            onClick={() => setProvenance(key)}
          >
            {t(`filesApp.provenance.${key}`)} ({provenanceCounts.get(key) ?? 0})
          </button>
        ))}
      </div>

      <div className="mining-catalogue-filters" role="group" aria-label={t('mining.catalogue.mediaLabel')}>
        <span className="mining-catalogue-filter-label">{t('mining.catalogue.mediaLabel')}</span>
        {MEDIA_FILTERS.map((key) => (
          <button
            key={key}
            type="button"
            className={`mining-catalogue-chip${media === key ? ' active' : ''}`}
            aria-pressed={media === key}
            onClick={() => {
              setMedia(key);
              setProvenance('all');
            }}
          >
            {key === 'all' ? t('mining.catalogue.media.all') : t(`filesApp.kind.${key}`)}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="mining-catalogue-state muted">
          {mineable.length === 0 ? t('mining.catalogue.empty') : t('filesApp.state.noMatches')}
        </p>
      ) : (
        <ul className="mining-catalogue-list">
          {visible.map((item) => (
            <li key={item.id} className="mining-catalogue-row" data-active={item.id === activeId ? 'true' : undefined}>
              <div className="mining-catalogue-row-main">
                <span className="mining-catalogue-name" title={item.name}>
                  {item.name}
                </span>
                <span className="mining-catalogue-meta">
                  <span
                    className="mining-catalogue-provenance"
                    data-machine={isMachineDerived(item.provenance) ? 'true' : undefined}
                  >
                    {t(`filesApp.provenance.${item.provenance}`)}
                  </span>
                  <span className="muted">{t(`filesApp.kind.${item.kind}`)}</span>
                  {item.sizeBytes !== null ? (
                    <span className="muted">{formatSize(item.sizeBytes, t, lang)}</span>
                  ) : null}
                </span>
              </div>
              <button
                type="button"
                className="mining-catalogue-mine"
                disabled={mineState.status === 'reading'}
                onClick={() => void onMine(item)}
              >
                {mineState.status === 'reading' && item.id === activeId
                  ? t('filesApp.action.mining')
                  : t('filesApp.action.mine')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* The receipt. Reuses the Files app's own result strings, so one mine
          reads identically wherever it was run from. */}
      {mineState.status === 'refused' ? (
        <p className="mining-catalogue-receipt refused" role="status">
          {t(mineState.reasonKey, mineState.values)}
          {mineState.detail ? ` ${mineState.detail}` : ''}
        </p>
      ) : null}
      {mineState.status === 'done' ? (
        <div className="mining-catalogue-receipt" role="status">
          <p>{t('filesApp.mine.added', { count: mineState.added, read: mineState.passagesRead })}</p>
          <p className="muted">
            {t('filesApp.mine.skipped', {
              notJapanese: mineState.skippedNotJapanese,
              duplicate: mineState.skippedDuplicate,
            })}
          </p>
          {mineState.skippedOverCap > 0 ? (
            <p className="muted">
              {t('filesApp.mine.capped', {
                max: FILES_MINE_MAX_CARDS,
                overCap: mineState.skippedOverCap,
              })}
            </p>
          ) : null}
          {mineState.machineDerived ? (
            <p className="mining-catalogue-machine">{t('filesApp.mine.machineMark')}</p>
          ) : null}
          <button type="button" className="mining-catalogue-refresh" onClick={onUndo}>
            {t('filesApp.action.undoMine')}
          </button>
        </div>
      ) : null}
      {mineState.status === 'undone' ? (
        <p className="mining-catalogue-receipt" role="status">
          {t('filesApp.mine.undone', { count: mineState.count })}
        </p>
      ) : null}
    </div>
  );
}
