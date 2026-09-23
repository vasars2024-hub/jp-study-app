/**
 * Home: the hero (what you are in the middle of), then the viewer's own
 * arrangement of shelves.
 *
 * Rearranging is in place — "Customise" turns every section header into a Liquid
 * handle bar (drag, move up/down, size, pin, hide) instead of opening a settings
 * page. Drag uses @dnd-kit with its keyboard sensor, so Space picks a section up,
 * the arrows move it, Space drops it and Escape puts it back; the up/down buttons
 * are the same move for anyone who never discovers that.
 */
import { useCallback, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { MediaItem } from '../../../../shared/types';
import { providerEpisodeTitle } from '../../../../shared/mediaLibraryEntries';
import { useT } from '../../../i18n';
import { ContextualSurface } from '../../liquid/LiquidSurface';
import { LiquidLoading } from '../../liquid/LiquidLoading';
import type { ContinueWatchingRow } from '../ContinueWatchingShelf';
import GumIcon from './GumIcons';
import { GumArt, GumEpisodeCard, GumPosterCard, formatRuntime, typeLabelKey, useHeroArt } from './GumCards';
import {
  GUM_DENSITIES,
  arrangeSections,
  densityOf,
  moveSection,
  moveSectionTo,
  setSectionDensity,
  setSectionHidden,
  setSectionPinned,
  setViewOnHome,
  type GumArrival,
  type GumBadge,
  type GumDensity,
  type GumHomeLayout,
  type GumSavedView,
  type GumSectionId,
} from './gumLayout';
import {
  completedTitles,
  continueCards,
  genreRows,
  hasFreshImport,
  justAddedCards,
  listRows,
  pickHero,
  planTitles,
  savedViewTitles,
  titleIndex,
  typeShelf,
  upNextCards,
  type GumHeroPick,
  type GumJustAddedCard,
} from './gumShelves';
import { gumEpisodeLabel, type GumFilters, type GumStatusTab, type GumTitle, type GumTypeTab } from './gumModel';

const HOME_BADGES: Record<GumBadge, boolean> = { type: true, progress: true, onDisk: true, score: true };
const SHELF_LIMIT = 24;

export interface GumBrowseRequest {
  status?: GumStatusTab;
  type?: GumTypeTab;
  filters?: GumFilters;
}

export interface GumHomeProps {
  titles: GumTitle[];
  continueRows: ContinueWatchingRow[];
  arrivals: GumArrival[];
  savedViews: GumSavedView[];
  layout: GumHomeLayout;
  setLayout: (next: GumHomeLayout | ((current: GumHomeLayout) => GumHomeLayout)) => void;
  onResetLayout: () => void;
  loading: boolean;
  onOpenTitle: (title: GumTitle) => void;
  onPlayTitle: (title: GumTitle) => void;
  onPlayItem: (item: MediaItem, startAtSec?: number) => void;
  onResumeRow: (row: ContinueWatchingRow) => void;
  onBrowse: (request: GumBrowseRequest) => void;
  onAddFiles: () => void;
  onAddFolder: () => void;
  onImport: () => void;
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function HeroBackdrop({ pick }: { pick: GumHeroPick }) {
  // The series' art lives on the file that carries its metadata, which the hero's
  // episode may not be; the title's artwork item is asked first for that reason.
  const itemId = pick.title?.artworkId ?? pick.item?.id ?? null;
  const { url, soft } = useHeroArt(itemId);
  return (
    <div className="gum-hero__backdrop" aria-hidden="true" data-soft={soft ? 'true' : undefined}>
      {url ? (
        <img src={url} alt="" decoding="async" draggable={false} />
      ) : pick.title ? (
        <GumArt title={pick.title} variant="banner" ratio="auto" />
      ) : null}
    </div>
  );
}

function GumHero({
  pick,
  onResume,
  onDetails,
}: {
  pick: GumHeroPick;
  onResume: () => void;
  onDetails?: () => void;
}) {
  const { t } = useT();
  const title = pick.title;
  const item = pick.item;
  const name = title?.title ?? pick.row?.entry.title ?? item?.seriesTitle ?? item?.title ?? '';
  const native = title?.originalTitle;
  const episode = gumEpisodeLabel(item);
  const episodeName = item ? providerEpisodeTitle(item) : null;
  const percent = pick.row?.entry.percent ?? null;
  const duration = pick.row?.entry.durationSec ?? item?.durationSec;
  const position = pick.row?.entry.positionSec ?? item?.positionSec ?? 0;
  const left = duration && position > 0 ? Math.max(1, Math.round((duration - position) / 60)) : null;
  const meta = [
    title ? t(typeLabelKey(title)) : null,
    title?.year ? String(title.year) : null,
    title?.genres.slice(0, 2).join(', ') || null,
    item?.season && title?.kind !== 'film' ? t('gum.meta.season', { n: item.season }) : null,
    title?.kind === 'film' ? formatRuntime(t, title.runtimeMin) : null,
  ].filter(Boolean) as string[];
  const synopsis = episode
    ? [t('gum.hero.episodeLine', { episode }), episodeName ? `“${episodeName}”` : null].filter(Boolean).join(' · ')
    : null;
  const subs = title ? [title.hasJa ? t('gum.subs.ja') : null, title.hasEn ? t('gum.subs.en') : null].filter(Boolean).join(' + ') : '';
  const eyebrow = t(`gum.hero.reason.${pick.reason}`);
  const resumeLabel = pick.reason === 'continue'
    ? (episode ? t('gum.hero.resumeEpisode', { episode }) : t('gum.hero.resume'))
    : (episode ? t('gum.hero.playEpisode', { episode }) : t('gum.hero.play'));
  return (
    <section className="gum-hero" aria-labelledby="gum-hero-title">
      <HeroBackdrop pick={pick} />
      <div className="gum-hero__fade" aria-hidden="true" />
      <div className="gum-hero__copy">
        <span className="gum-eyebrow">{eyebrow}</span>
        <div className="gum-hero__names">
          <h1 id="gum-hero-title" className="gum-hero__title">{name}</h1>
          {native && native !== name && <div className="gum-hero__native" lang="ja">{native}</div>}
        </div>
        {meta.length > 0 && (
          <div className="gum-hero__meta">
            {meta.map((part, index) => (
              <span key={`${part}-${index}`}>{index > 0 && <i aria-hidden="true">•</i>}{part}</span>
            ))}
          </div>
        )}
        {(synopsis || title?.synopsis) && (
          <p className="gum-hero__synopsis">{synopsis ?? title?.synopsis}</p>
        )}
        {(percent !== null || left !== null) && (
          <div className="gum-hero__progress">
            {percent !== null && (
              <span
                className="gum-progress gum-progress--bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(percent * 100)}
                aria-label={t('gum.hero.progress')}
              >
                <i style={{ width: `${Math.round(percent * 100)}%` }} />
              </span>
            )}
            <small>
              {[left !== null ? t('gum.card.minutesLeft', { m: left }) : null, subs ? t('gum.hero.subsReady', { langs: subs }) : null]
                .filter(Boolean).join(' · ')}
            </small>
          </div>
        )}
        <div className="gum-hero__actions">
          <button type="button" className="gum-btn gum-btn--primary gum-btn--lg" onClick={onResume}>
            <GumIcon name="play" size={16} /> {resumeLabel}
          </button>
          {onDetails && (
            <button type="button" className="gum-btn gum-btn--ghost gum-btn--lg" onClick={onDetails}>
              {t('gum.hero.details')}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

interface SectionModel {
  id: GumSectionId;
  title: string;
  hint?: string;
  count: number;
  /** Explains a smart rule, shown in Customise. */
  smartNote?: string;
  seeAll?: () => void;
  body: (density: GumDensity) => ReactNode;
}

function Row({ children, kind = 'poster', label }: { children: ReactNode; kind?: 'poster' | 'episode'; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useT();
  const scroll = (direction: number): void => {
    const node = ref.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * 0.85, behavior: 'smooth' });
  };
  return (
    <div className="gum-row-wrap">
      <button type="button" className="gum-row-nudge gum-row-nudge--prev" onClick={() => scroll(-1)} aria-label={t('gum.row.prev')} tabIndex={-1}>
        <GumIcon name="chevron-down" size={16} style={{ transform: 'rotate(90deg)' }} />
      </button>
      <div ref={ref} className={`gum-row gum-row--${kind}`} role="list" aria-label={label}>
        {children}
      </div>
      <button type="button" className="gum-row-nudge gum-row-nudge--next" onClick={() => scroll(1)} aria-label={t('gum.row.next')} tabIndex={-1}>
        <GumIcon name="chevron-down" size={16} style={{ transform: 'rotate(-90deg)' }} />
      </button>
    </div>
  );
}

/** The cell that ends a capped row: says how many more there are, and opens them. */
function MoreTile({ count, onClick }: { count: number; onClick?: () => void }) {
  const { t } = useT();
  return (
    <div role="listitem" className="gum-row__cell gum-row__more-cell">
      <button type="button" className="gum-row__more" onClick={onClick} disabled={!onClick}>
        <strong>{t('common.moreNotShown', { count })}</strong>
        {onClick && <span>{t('gum.section.seeAll')}</span>}
      </button>
    </div>
  );
}

function badgeText(t: Translate, card: GumJustAddedCard): string {
  switch (card.badge) {
    case 'newEpisode':
      return t('gum.badge.newEpisode');
    case 'film':
      return t('gum.badge.film');
    case 'season':
      return t('gum.badge.season', { n: card.season ?? 2 });
    default:
      return t('gum.badge.new');
  }
}

interface SectionShellProps {
  model: SectionModel;
  layout: GumHomeLayout;
  editing: boolean;
  index: number;
  total: number;
  onChange: (next: (layout: GumHomeLayout) => GumHomeLayout) => void;
}

function SortableSection({ model, layout, editing, index, total, onChange }: SectionShellProps) {
  const { t } = useT();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: model.id,
    disabled: !editing,
  });
  const density = densityOf(layout, model.id);
  const hidden = layout.hidden.includes(model.id);
  const pinned = layout.pinned.includes(model.id);
  const style: CSSProperties = {
    transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined,
    transition: transition ?? undefined,
  };
  const headingId = `gum-sec-${model.id.replace(/[^\w-]/g, '_')}`;
  return (
    <section
      ref={setNodeRef}
      style={style}
      className="gum-section"
      data-density={density}
      data-editing={editing ? 'true' : undefined}
      data-hidden={hidden ? 'true' : undefined}
      data-dragging={isDragging ? 'true' : undefined}
      aria-labelledby={headingId}
    >
      {editing ? (
        <ContextualSurface className="gum-section__editbar">
          <button
            type="button"
            ref={setActivatorNodeRef}
            className="gum-handle"
            aria-label={t('gum.customise.dragHandle', { section: model.title })}
            {...attributes}
            {...listeners}
          >
            <GumIcon name="grip" size={16} />
          </button>
          <div className="gum-section__edit-title">
            <h2 id={headingId}>{model.title}</h2>
            <small>
              {model.count === 0 ? t('gum.customise.emptyHides') : model.smartNote ?? t('gum.section.count', { count: model.count })}
            </small>
          </div>
          <div className="gum-section__edit-tools">
            <button type="button" className="gum-icon-btn" onClick={() => onChange((l) => moveSection(l, model.id, -1))} disabled={index === 0} aria-label={t('gum.customise.moveUp', { section: model.title })}>
              <GumIcon name="arrow-up" size={14} />
            </button>
            <button type="button" className="gum-icon-btn" onClick={() => onChange((l) => moveSection(l, model.id, 1))} disabled={index === total - 1} aria-label={t('gum.customise.moveDown', { section: model.title })}>
              <GumIcon name="arrow-down" size={14} />
            </button>
            <div className="gum-seg" role="radiogroup" aria-label={t('gum.customise.size', { section: model.title })}>
              {GUM_DENSITIES.map((value) => (
                <button
                  type="button"
                  key={value}
                  role="radio"
                  aria-checked={density === value}
                  onClick={() => onChange((l) => setSectionDensity(l, model.id, value))}
                >
                  {t(`gum.density.${value}`)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="gum-icon-btn"
              aria-pressed={pinned}
              onClick={() => onChange((l) => setSectionPinned(l, model.id, !pinned))}
              title={t('gum.customise.pinHint')}
              aria-label={t('gum.customise.pin', { section: model.title })}
            >
              <GumIcon name="pin" size={14} />
            </button>
            <button
              type="button"
              className="gum-icon-btn"
              aria-pressed={!hidden}
              onClick={() => onChange((l) => setSectionHidden(l, model.id, !hidden))}
              aria-label={t('gum.customise.show', { section: model.title })}
            >
              <GumIcon name={hidden ? 'eye-off' : 'check'} size={14} />
            </button>
          </div>
        </ContextualSurface>
      ) : (
        <header className="gum-section__head">
          <div>
            <h2 id={headingId}>{model.title}</h2>
            {model.hint && <span className="gum-section__hint">{model.hint}</span>}
          </div>
          {model.seeAll && (
            <button type="button" className="gum-link" onClick={model.seeAll}>{t('gum.section.seeAll')}</button>
          )}
        </header>
      )}
      {(!editing || !hidden) && model.count > 0 && (
        <div className="gum-section__body">{model.body(density)}</div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export default function GumHome(props: GumHomeProps) {
  const {
    titles, continueRows, arrivals, savedViews, layout, setLayout, onResetLayout, loading,
    onOpenTitle, onPlayTitle, onPlayItem, onResumeRow, onBrowse, onAddFiles, onAddFolder, onImport,
  } = props;
  const { t, lang } = useT();
  const [editing, setEditing] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const now = Date.now();

  const index = useMemo(() => titleIndex(titles), [titles]);
  const cont = useMemo(() => continueCards(continueRows, index), [continueRows, index]);
  const upNext = useMemo(() => upNextCards(titles), [titles]);
  const added = useMemo(() => justAddedCards(titles, arrivals, now), [titles, arrivals]);
  const plan = useMemo(() => planTitles(titles), [titles]);
  const completed = useMemo(() => completedTitles(titles), [titles]);
  const lists = useMemo(() => listRows(titles), [titles]);
  const genres = useMemo(() => genreRows(titles), [titles]);
  const anime = useMemo(() => typeShelf(titles, 'anime'), [titles]);
  const tv = useMemo(() => typeShelf(titles, 'tv'), [titles]);
  const films = useMemo(() => typeShelf(titles, 'film'), [titles]);
  const hero = useMemo(() => pickHero(cont, added, titles), [cont, added, titles]);

  const posterRow = useCallback((list: GumTitle[], label: string, flags?: Map<string, string>, onMore?: () => void) => (
    <Row label={label}>
      {list.slice(0, SHELF_LIMIT).map((title) => (
        <div role="listitem" key={title.id} className="gum-row__cell">
          <GumPosterCard
            title={title}
            badges={HOME_BADGES}
            flag={flags?.get(title.id)}
            onOpen={onOpenTitle}
            onPlay={onPlayTitle}
          />
        </div>
      ))}
      {list.length > SHELF_LIMIT && <MoreTile count={list.length - SHELF_LIMIT} onClick={onMore} />}
    </Row>
  ), [onOpenTitle, onPlayTitle]);

  const models = useMemo((): Map<GumSectionId, SectionModel> => {
    const map = new Map<GumSectionId, SectionModel>();
    const continueLabel = t('gum.section.continue');
    map.set('continue', {
      id: 'continue',
      title: continueLabel,
      count: cont.length,
      smartNote: t('gum.smart.continue'),
      seeAll: () => onBrowse({ status: 'watching' }),
      body: () => (
        <Row kind="episode" label={continueLabel}>
          {cont.slice(0, SHELF_LIMIT).map(({ row, title }) => {
            const item = row.item;
            const episode = gumEpisodeLabel(item);
            const epName = item ? providerEpisodeTitle(item) : null;
            return (
              <div role="listitem" key={row.entry.pathKey} className="gum-row__cell">
                <GumEpisodeCard
                  name={title?.title ?? row.entry.title}
                  caption={[episode, epName].filter(Boolean).join('  ') || (title?.kind === 'film' && title.year ? t('gum.meta.filmYear', { year: title.year }) : null)}
                  item={item}
                  fallbackTitle={title}
                  positionSec={row.entry.positionSec}
                  durationSec={row.entry.durationSec}
                  percent={row.entry.percent ?? null}
                  kindLabel={title ? t(typeLabelKey(title)) : undefined}
                  onPlay={() => onResumeRow(row)}
                  onOpen={title ? () => onOpenTitle(title) : undefined}
                  playLabel={t('gum.card.resume', { title: row.entry.title })}
                />
              </div>
            );
          })}
          {cont.length > SHELF_LIMIT && <MoreTile count={cont.length - SHELF_LIMIT} onClick={() => onBrowse({ status: 'watching' })} />}
        </Row>
      ),
    });
    const upNextLabel = t('gum.section.upNext');
    map.set('upNext', {
      id: 'upNext',
      title: upNextLabel,
      hint: t('gum.section.upNextHint'),
      count: upNext.length,
      body: () => (
        <Row kind="episode" label={upNextLabel}>
          {upNext.slice(0, SHELF_LIMIT).map(({ title, item }) => {
            const episode = gumEpisodeLabel(item);
            const epName = providerEpisodeTitle(item);
            return (
              <div role="listitem" key={item.id} className="gum-row__cell">
                <GumEpisodeCard
                  name={title.title}
                  caption={[episode, epName].filter(Boolean).join('  ')}
                  item={item}
                  fallbackTitle={title}
                  kindLabel={t(typeLabelKey(title))}
                  onPlay={() => onPlayItem(item)}
                  onOpen={() => onOpenTitle(title)}
                  playLabel={t('gum.card.playEpisodeOf', { episode: episode ?? item.title, title: title.title })}
                />
              </div>
            );
          })}
          {upNext.length > SHELF_LIMIT && <MoreTile count={upNext.length - SHELF_LIMIT} onClick={() => onBrowse({ status: 'watching' })} />}
        </Row>
      ),
    });
    const flags = new Map(added.map((card) => [card.title.id, badgeText(t, card)]));
    map.set('justAdded', {
      id: 'justAdded',
      title: t('gum.section.justAdded'),
      hint: t('gum.section.justAddedHint'),
      count: added.length,
      smartNote: t('gum.smart.justAdded'),
      seeAll: () => onBrowse({ status: 'all', filters: { added: '30d' } }),
      body: () => posterRow(added.map((card) => card.title), t('gum.section.justAdded'), flags, () => onBrowse({ status: 'all', filters: { added: '30d' } })),
    });
    map.set('plan', {
      id: 'plan',
      title: t('gum.section.plan'),
      count: plan.length,
      seeAll: () => onBrowse({ status: 'plan' }),
      body: () => posterRow(plan, t('gum.section.plan'), undefined, () => onBrowse({ status: 'plan' })),
    });
    map.set('completed', {
      id: 'completed',
      title: t('gum.section.completed'),
      count: completed.length,
      seeAll: () => onBrowse({ status: 'completed' }),
      body: () => posterRow(completed, t('gum.section.completed'), undefined, () => onBrowse({ status: 'completed' })),
    });
    map.set('lists', {
      id: 'lists',
      title: t('gum.section.lists'),
      count: lists.length,
      body: () => (
        <div className="gum-subrows">
          {lists.map((row) => (
            <div key={row.name} className="gum-subrow">
              <div className="gum-subrow__head">
                <h3>{row.name}</h3>
                <button type="button" className="gum-link" onClick={() => onBrowse({ status: 'all', filters: { lists: [row.name] } })}>
                  {t('gum.section.seeAllCount', { count: row.titles.length })}
                </button>
              </div>
              {posterRow(row.titles, row.name, undefined, () => onBrowse({ status: 'all', filters: { lists: [row.name] } }))}
            </div>
          ))}
        </div>
      ),
    });
    map.set('genres', {
      id: 'genres',
      title: t('gum.section.genres'),
      count: genres.length,
      body: () => (
        <div className="gum-subrows">
          {genres.map((row) => (
            <div key={row.name} className="gum-subrow">
              <div className="gum-subrow__head">
                <h3>{row.name}</h3>
                <button type="button" className="gum-link" onClick={() => onBrowse({ status: 'all', filters: { genres: [row.name] } })}>
                  {t('gum.section.seeAllCount', { count: row.titles.length })}
                </button>
              </div>
              {posterRow(row.titles, row.name, undefined, () => onBrowse({ status: 'all', filters: { genres: [row.name] } }))}
            </div>
          ))}
        </div>
      ),
    });
    map.set('anime', {
      id: 'anime',
      title: t('gum.section.anime'),
      count: anime.length,
      seeAll: () => onBrowse({ status: 'all', type: 'anime' }),
      body: () => posterRow(anime, t('gum.section.anime'), undefined, () => onBrowse({ status: 'all', type: 'anime' })),
    });
    map.set('tv', {
      id: 'tv',
      title: t('gum.section.tv'),
      count: tv.length,
      seeAll: () => onBrowse({ status: 'all', type: 'tv' }),
      body: () => posterRow(tv, t('gum.section.tv'), undefined, () => onBrowse({ status: 'all', type: 'tv' })),
    });
    map.set('films', {
      id: 'films',
      title: t('gum.section.films'),
      count: films.length,
      seeAll: () => onBrowse({ status: 'all', type: 'film' }),
      body: () => posterRow(films, t('gum.section.films'), undefined, () => onBrowse({ status: 'all', type: 'film' })),
    });
    for (const view of savedViews) {
      const list = savedViewTitles(titles, view, now);
      map.set(`view:${view.id}`, {
        id: `view:${view.id}`,
        title: view.name,
        hint: t('gum.section.savedView'),
        count: list.length,
        seeAll: () => onBrowse({ status: view.status, type: view.type, filters: view.filters }),
        body: () => posterRow(list, view.name, undefined, () => onBrowse({ status: view.status, type: view.type, filters: view.filters })),
      });
    }
    return map;
  }, [cont, upNext, added, plan, completed, lists, genres, anime, tv, films, savedViews, titles, lang, posterRow, onBrowse, onOpenTitle, onPlayItem, onResumeRow]);

  const counts = useMemo(() => {
    const out: Partial<Record<GumSectionId, number>> = {};
    for (const [id, model] of models) out[id] = model.count;
    return out;
  }, [models]);

  const arranged = arrangeSections(layout, {
    counts,
    inProgress: cont.length > 0,
    freshImport: hasFreshImport(arrivals, now),
  }, editing);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const titleOf = (id: string | number): string => models.get(String(id) as GumSectionId)?.title ?? String(id);
  const accessibility = {
    screenReaderInstructions: { draggable: t('gum.customise.dragInstructions') },
    announcements: {
      onDragStart: ({ active }: { active: { id: string | number } }) => t('gum.customise.pickedUp', { section: titleOf(active.id) }),
      onDragOver: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
        over ? t('gum.customise.movedOver', { section: titleOf(active.id), over: titleOf(over.id) }) : undefined,
      onDragEnd: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
        over ? t('gum.customise.dropped', { section: titleOf(active.id), over: titleOf(over.id) }) : t('gum.customise.cancelled', { section: titleOf(active.id) }),
      onDragCancel: ({ active }: { active: { id: string | number } }) => t('gum.customise.cancelled', { section: titleOf(active.id) }),
    },
  };

  const onDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLayout((current) => moveSectionTo(current, active.id as GumSectionId, over.id as GumSectionId));
  };

  const change = (next: (current: GumHomeLayout) => GumHomeLayout): void => {
    setLayout((current) => {
      const updated = next(current);
      if (updated.order !== current.order) {
        const moved = updated.order.find((id, i) => current.order[i] !== id);
        if (moved) setAnnouncement(t('gum.customise.position', { section: titleOf(moved), n: updated.order.indexOf(moved) + 1, total: updated.order.length }));
      }
      return updated;
    });
  };

  const empty = !loading && titles.length === 0 && continueRows.length === 0;
  const offHome = savedViews.filter((view) => !layout.order.includes(`view:${view.id}`));

  const heroTitle = hero?.title;
  return (
    <div className="gum-page gum-home" data-editing={editing ? 'true' : undefined}>
      {hero && !editing ? (
        <GumHero
          pick={hero}
          onResume={() => {
            if (hero.row) onResumeRow(hero.row);
            else if (hero.item) onPlayItem(hero.item);
            else if (heroTitle) onPlayTitle(heroTitle);
          }}
          onDetails={heroTitle ? () => onOpenTitle(heroTitle) : undefined}
        />
      ) : null}

      <div className="gum-home__body">
        <div className="gum-home__bar">
          {editing ? (
            <ContextualSurface className="gum-customise-bar" role="group" aria-label={t('gum.customise.title')}>
              <div>
                <strong>{t('gum.customise.title')}</strong>
                <small>{t('gum.customise.detail')}</small>
              </div>
              <div className="gum-customise-bar__actions">
                {offHome.length > 0 && (
                  <select
                    className="gum-select"
                    aria-label={t('gum.customise.addView')}
                    value=""
                    onChange={(event) => {
                      const id = event.target.value;
                      if (id) setLayout((current) => setViewOnHome(current, id, true));
                    }}
                  >
                    <option value="">{t('gum.customise.addView')}</option>
                    {offHome.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
                  </select>
                )}
                <button type="button" className="gum-btn gum-btn--ghost" onClick={onResetLayout}>{t('gum.customise.reset')}</button>
                <button type="button" className="gum-btn gum-btn--primary" onClick={() => setEditing(false)}>{t('gum.customise.done')}</button>
              </div>
            </ContextualSurface>
          ) : (
            !empty && (
              <button type="button" className="gum-btn gum-btn--quiet" onClick={() => setEditing(true)}>
                <GumIcon name="sliders" size={14} /> {t('gum.customise.open')}
              </button>
            )
          )}
        </div>

        {loading && titles.length === 0 ? (
          <LiquidLoading layout="library" />
        ) : empty ? (
          <div className="gum-empty" role="status">
            <strong>{t('gum.empty.title')}</strong>
            <p>{t('gum.empty.detail')}</p>
            <div className="gum-empty__actions">
              <button type="button" className="gum-btn gum-btn--primary" onClick={onAddFolder}>{t('gum.empty.addFolder')}</button>
              <button type="button" className="gum-btn gum-btn--ghost" onClick={onAddFiles}>{t('gum.empty.addFiles')}</button>
              <button type="button" className="gum-btn gum-btn--ghost" onClick={onImport}>{t('gum.empty.import')}</button>
            </div>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={accessibility}>
            <SortableContext items={arranged} strategy={verticalListSortingStrategy}>
              {arranged.map((id, position) => {
                const model = models.get(id);
                if (!model) return null;
                return (
                  <SortableSection
                    key={id}
                    model={model}
                    layout={layout}
                    editing={editing}
                    index={position}
                    total={arranged.length}
                    onChange={change}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        )}
        <div className="gum-sr" role="status" aria-live="polite">{announcement}</div>
      </div>
    </div>
  );
}

