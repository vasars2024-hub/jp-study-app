/**
 * Reading Finder logic and body, shared by Study OS's `ReadingFinderView` and
 * Blanc's `BlancReadingFinderPanel`.
 *
 * Split into a state hook and a presentational body (Pillar 0): Study OS feeds
 * the hook's result into its `AppChrome` menu bar and status bar, Blanc feeds
 * the same result into Blanc fieldsets. Neither duplicates the filtering,
 * fetching, or import logic, and nothing here may import window furniture.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Icon from '../Icons';
import { useModalKeyboard } from '../ui/useModalKeyboard';
import './readingSiteDrawer.css';
import {
  READING_SITES,
  type ReadingGenre,
  type ReadingLength,
  type ReadingPricing,
  type ReadingSite,
} from '../../data/readingSites';
import { getUserLevel } from '../../levelService';
import { tierLabel, type LevelTier } from '../../../shared/levelScale';
import {
  knownPercent,
  scoreTextComprehensibility,
  type ComprehensibilityScore,
} from '../../comprehensibility';
import type { LibraryItem } from '../../../shared/types';
import { useT } from '../../i18n';

const ADULT_KEY = 'jp-reading-adult';
export const ALL_LEVELS: LevelTier[] = [1, 2, 3, 4, 5, 6, 7];
const ALL_LENGTHS: ReadingLength[] = ['short', 'serial', 'novel'];
const ALL_GENRES: ReadingGenre[] = Array.from(
  new Set(READING_SITES.flatMap((s) => s.genres)),
).sort();

function openLink(url: string): void {
  void window.api.openExternal(url);
}

function isWebSourced(item: LibraryItem): boolean {
  return !!item.sourcePath && /^https?:\/\//i.test(item.sourcePath);
}

export function levelRangeLabel(t: (key: string) => string, levels: LevelTier[]): string {
  const min = Math.min(...levels) as LevelTier;
  const max = Math.max(...levels) as LevelTier;
  return min === max
    ? tierLabel(t, 'ja', min)
    : `${tierLabel(t, 'ja', min)}–${tierLabel(t, 'ja', max)}`;
}

function genreLabel(t: (key: string) => string, genre: ReadingGenre): string {
  return t(`reading.genre.${genre}`);
}

function lengthLabel(t: (key: string) => string, length: ReadingLength): string {
  return t(`reading.length.${length}`);
}

function pricingLabel(t: (key: string) => string, pricing: ReadingPricing): string {
  return t(`reading.pricing.${pricing.toLowerCase()}`);
}

function loadAdultPref(): boolean {
  try {
    return localStorage.getItem(ADULT_KEY) === '1';
  } catch {
    return false;
  }
}

export type ReadingFinderState = ReturnType<typeof useReadingFinder>;

export function useReadingFinder() {
  const userLevel = useMemo(() => {
    try {
      return getUserLevel('ja');
    } catch {
      return 1 as LevelTier;
    }
  }, []);

  const [query, setQuery] = useState('');
  const [levels, setLevels] = useState<Set<LevelTier>>(
    () =>
      new Set([
        Math.max(1, userLevel - 1),
        userLevel,
        Math.min(7, userLevel + 1),
      ] as LevelTier[]),
  );
  const [genre, setGenre] = useState<'All' | ReadingGenre>('All');
  const [length, setLength] = useState<'All' | ReadingLength>('All');
  const [furiganaOnly, setFuriganaOnly] = useState(false);
  const [pricing, setPricing] = useState<'All' | ReadingPricing>('All');
  const [showAdult, setShowAdult] = useState(loadAdultPref);
  const [selected, setSelected] = useState<ReadingSite | null>(null);
  const [library, setLibrary] = useState<LibraryItem[]>([]);

  useEffect(() => {
    // Guarded: a bridge that hands back a non-array (an older preload, or the
    // dev harness, which stubs only part of window.api) must not take the whole
    // panel down — Continue Reading just stays empty.
    const accept = (items: unknown) => setLibrary(Array.isArray(items) ? items : []);
    void Promise.resolve(window.api.listLibrary?.()).then(accept).catch(() => accept([]));
    return window.api.onLibraryChanged?.(accept);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ADULT_KEY, showAdult ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  }, [showAdult]);

  const toggleLevel = (lv: LevelTier) => {
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(lv)) next.delete(lv);
      else next.add(lv);
      return next;
    });
  };

  const continueReading = useMemo(
    () =>
      library
        .filter(
          (i) =>
            isWebSourced(i) &&
            (i.progress?.percent ?? 0) > 0 &&
            (i.progress?.percent ?? 0) < 0.98,
        )
        .sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0))
        .slice(0, 8),
    [library],
  );

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return READING_SITES.filter(
      (s) =>
        (showAdult || !s.adult) &&
        (levels.size === 0 || s.levels.some((lv) => levels.has(lv))) &&
        (genre === 'All' || s.genres.includes(genre)) &&
        (length === 'All' || s.lengthKinds.includes(length)) &&
        (!furiganaOnly || s.furigana) &&
        (pricing === 'All' || s.pricing === pricing) &&
        (!q || `${s.name} ${s.notes}`.toLowerCase().includes(q)),
    );
  }, [query, levels, genre, length, furiganaOnly, pricing, showAdult]);

  const surpriseMe = (): void => {
    if (list.length === 0) return;
    setSelected(list[Math.floor(Math.random() * list.length)]);
  };

  const resetFilters = (): void => {
    setGenre('All');
    setLength('All');
    setFuriganaOnly(false);
    setPricing('All');
    setLevels(new Set(ALL_LEVELS));
  };

  return {
    query,
    setQuery,
    levels,
    toggleLevel,
    genre,
    setGenre,
    length,
    setLength,
    furiganaOnly,
    setFuriganaOnly,
    pricing,
    setPricing,
    showAdult,
    setShowAdult,
    selected,
    setSelected,
    continueReading,
    list,
    surpriseMe,
    resetFilters,
  };
}

export function ReadingFinderControls({ state }: { state: ReadingFinderState }) {
  const { t } = useT();
  const {
    query,
    setQuery,
    levels,
    toggleLevel,
    genre,
    setGenre,
    length,
    setLength,
    furiganaOnly,
    setFuriganaOnly,
    pricing,
    setPricing,
    showAdult,
    setShowAdult,
    list,
    surpriseMe,
  } = state;

  return (
    <div className="rf-controls">
      <div className="rf-level-row">
        <span className="rf-level-label">{t('reading.controls.level')}</span>
        {ALL_LEVELS.map((lv) => (
          <button
            key={lv}
            className={`gram-level-btn ${levels.has(lv) ? 'active' : ''}`}
            aria-pressed={levels.has(lv)}
            onClick={() => toggleLevel(lv)}
            title={tierLabel(t, 'ja', lv)}
          >
            {tierLabel(t, 'ja', lv)}
          </button>
        ))}
        <button
          className="rf-surprise-btn"
          disabled={list.length === 0}
          onClick={surpriseMe}
          title={t('reading.controls.surprise')}
        >
          <Icon name="sparkle" size={13} style={{ marginRight: 5, verticalAlign: '-2px' }} />
          {t('reading.controls.surprise')}
        </button>
      </div>

      <div className="rf-control-line">
        <input
          className="gram-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('reading.controls.search.placeholder')}
          lang="ja"
        />
        <label className="nov-select">
          {t('reading.controls.genre')}
          <select value={genre} onChange={(e) => setGenre(e.target.value as 'All' | ReadingGenre)}>
            <option value="All">{t('reading.controls.genreAll')}</option>
            {ALL_GENRES.map((g) => (
              <option key={g} value={g}>
                {genreLabel(t, g)}
              </option>
            ))}
          </select>
        </label>
        <label className="nov-select">
          {t('reading.controls.length')}
          <select
            value={length}
            onChange={(e) => setLength(e.target.value as 'All' | ReadingLength)}
          >
            <option value="All">{t('reading.controls.lengthAll')}</option>
            {ALL_LENGTHS.map((l) => (
              <option key={l} value={l}>
                {lengthLabel(t, l)}
              </option>
            ))}
          </select>
        </label>
        <label className="nov-select">
          {t('reading.controls.pricing')}
          <select
            value={pricing}
            onChange={(e) => setPricing(e.target.value as 'All' | ReadingPricing)}
          >
            <option value="All">{t('reading.controls.pricingAll')}</option>
            <option value="Free">{pricingLabel(t, 'Free')}</option>
            <option value="Freemium">{pricingLabel(t, 'Freemium')}</option>
            <option value="Paid">{pricingLabel(t, 'Paid')}</option>
          </select>
        </label>
        <button
          className={`gram-level-btn ${furiganaOnly ? 'active' : ''}`}
          aria-pressed={furiganaOnly}
          onClick={() => setFuriganaOnly((v) => !v)}
        >
          {t('reading.controls.furiganaOnly')}
        </button>
        <button
          className={`gram-level-btn ${showAdult ? 'active' : ''}`}
          aria-pressed={showAdult}
          onClick={() => setShowAdult((v) => !v)}
          title={t('reading.controls.adultToggle')}
        >
          18+
        </button>
      </div>
    </div>
  );
}

export function ContinueReadingRow({
  state,
  onOpenBook,
}: {
  state: ReadingFinderState;
  onOpenBook: (item: LibraryItem) => void;
}) {
  const { t } = useT();
  if (state.continueReading.length === 0) return null;
  return (
    <div className="rf-continue-row">
      {state.continueReading.map((item) => {
        const pct = Math.round((item.progress?.percent ?? 0) * 100);
        return (
          <button key={item.id} className="rf-continue-card" onClick={() => onOpenBook(item)}>
            <span className="rf-continue-title" lang="ja">
              {item.title}
            </span>
            <span className="rf-continue-meta">
              <span className="rf-continue-bar">
                <span style={{ width: `${pct}%` }} />
              </span>
              {t('reading.continue.progress', { pct })}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function ReadingSiteGrid({ state }: { state: ReadingFinderState }) {
  const { t } = useT();
  const { list, setSelected, genre, length, furiganaOnly, pricing, levels, resetFilters } = state;

  if (list.length === 0) {
    // `resetFilters` used to be reachable ONLY from the View menu, and `AppChrome`
    // renders its children bare — no menu bar at all — on every theme except the
    // secret Aero/wired material sets. So on the default theme this empty state was
    // a dead end: Genre=Classics alone reaches it, and nothing on screen undoes it.
    // The escape belongs in the empty state itself, where the user already is.
    // An EMPTY `levels` set filters nothing (see `list`'s `levels.size === 0 ||`),
    // so it is not a narrowing and must not offer a reset that changes nothing.
    const narrowed =
      genre !== 'All' ||
      length !== 'All' ||
      furiganaOnly ||
      pricing !== 'All' ||
      (levels.size !== 0 && levels.size !== ALL_LEVELS.length);
    return (
      <div className="res-empty muted">
        {t('reading.noMatches')}
        {narrowed && (
          <>
            {' '}
            <button type="button" className="rf-empty-reset" onClick={resetFilters}>
              {t('reading.menu.showAll')}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="res-grid">
      {list.map((s) => (
        <button key={s.id} className="res-card rf-card" onClick={() => setSelected(s)}>
          <span className="res-card-top">
            <span className="res-name" lang="ja">
              {s.name}
            </span>
            <span className={`res-cost cost-${s.pricing.toLowerCase()}`}>
              {pricingLabel(t, s.pricing)}
            </span>
          </span>
          <span className="res-desc">{s.notes}</span>
          <span className="rf-card-badges">
            <span className="rf-level-badge">{levelRangeLabel(t, s.levels)}</span>
            {s.furigana && (
              <span className="rf-furigana-badge">
                <Icon name="check" size={10} style={{ marginRight: 3, verticalAlign: '-1px' }} />
                {t('reading.furiganaBadge')}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

type FetchState = 'idle' | 'loading' | 'error' | 'ready' | 'importing';

interface FetchedChapter {
  title: string;
  content: string;
  text: string;
  sourceUrl: string;
  pages: number;
  partial?: boolean;
}

export function ReadingSiteDetail({
  site,
  onClose,
  onOpenBook,
}: {
  site: ReadingSite;
  onClose: () => void;
  onOpenBook: (item: LibraryItem) => void;
}) {
  const { t } = useT();
  const [url, setUrl] = useState('');
  const [state, setState] = useState<FetchState>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<FetchedChapter | null>(null);
  const [score, setScore] = useState<ComprehensibilityScore | null>(null);
  const headingId = useId();
  const drawerRef = useRef<HTMLElement | null>(null);

  // A drawer that opens without focus is unreachable by keyboard, and one that
  // drops focus on close strands the caret at the top of the document. Focus
  // moves in on mount and returns to the card that opened it.
  //
  // This was a hand-rolled effect doing only those two halves. It is now the
  // shared hook, which adds the two that were missing: a Tab trap, and Escape
  // at the DOCUMENT rather than on the panel's own `onKeyDown`. Those are not
  // decoration here — `.rf-drawer-layer` is `position: fixed; inset: 0` and
  // `.rf-drawer-scrim` paints `rgb(0 0 0 / 0.28)` over the whole viewport and
  // swallows clicks, so one Tab out of the drawer landed on a grid that dims
  // and refuses the mouse, and Escape then stopped closing anything because the
  // handler had gone out of scope with the focus.
  useModalKeyboard({ panelRef: drawerRef, onEscape: onClose });

  const fetchChapter = async (): Promise<void> => {
    const u = url.trim();
    if (!u) return;
    setState('loading');
    setError('');
    setResult(null);
    setScore(null);
    try {
      const res = await window.api.fetchReadingContent(u);
      if (!res.ok || !res.content) {
        setState('error');
        setError(res.error ?? t('reading.fetch.genericError'));
        return;
      }
      const chapter: FetchedChapter = {
        title: res.title ?? u,
        content: res.content,
        text: res.text ?? '',
        sourceUrl: res.url ?? u,
        pages: res.pages ?? 1,
        partial: res.partial,
      };
      setResult(chapter);
      setState('ready');
      const sc = await scoreTextComprehensibility(chapter.text);
      setScore(sc);
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const openInReader = async (): Promise<void> => {
    if (!result) return;
    setState('importing');
    try {
      const items = await window.api.importGenerated({
        title: result.title,
        html: result.content,
        source: result.sourceUrl,
      });
      const item = items.find((i) => i.sourcePath === result.sourceUrl) ?? items[0];
      if (item) onOpenBook(item);
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="rf-drawer-layer">
      <div className="rf-drawer-scrim" onClick={onClose} />
      <aside
        className="rf-drawer"
        role="dialog"
        // The scrim dims the whole viewport and blocks the mouse, so the grid
        // behind is already unusable to a sighted user. `aria-modal` is what
        // says the same thing to a screen reader; without it the catalogue
        // stayed in the a11y tree as though it were still reachable.
        aria-modal="true"
        // Labelled by the site's own name rather than a new string: the heading
        // already says what this panel is, in the catalogue's own language.
        aria-labelledby={headingId}
        ref={drawerRef}
        tabIndex={-1}
      >
        <div className="rf-drawer-head">
          <h2 id={headingId} lang="ja">{site.name}</h2>
          <button className="rf-drawer-x" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>
        <div className="rf-drawer-body">
          <p className="nov-synopsis">{site.notes}</p>

          <div className="nov-meta">
            <span>
              <b>{t('reading.meta.level')}</b> {levelRangeLabel(t, site.levels)}
            </span>
            <span>
              <b>{t('reading.meta.pricing')}</b> {pricingLabel(t, site.pricing)}
            </span>
            <span>
              <b>{t('reading.meta.genres')}</b>{' '}
              {site.genres.map((g) => genreLabel(t, g)).join(' · ')}
            </span>
          </div>

          <div className="nov-links">
            <button className="nov-link nov-link-external" onClick={() => openLink(site.url)}>
              {t('reading.openSite')}
              <Icon name="external" size={11} style={{ marginLeft: 4, verticalAlign: '-1px' }} />
            </button>
          </div>

          <div className="rf-fetch-panel">
            <h3>{t('reading.fetch.title')}</h3>
            <p className="muted">{t('reading.fetch.hint')}</p>
            <div className="rf-fetch-row">
              <input
                className="gram-search"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t('reading.fetch.placeholder')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void fetchChapter();
                }}
              />
              <button
                className="btn"
                disabled={!url.trim() || state === 'loading'}
                onClick={() => void fetchChapter()}
              >
                {state === 'loading' ? t('reading.fetch.loading') : t('reading.fetch.go')}
              </button>
            </div>

            {state === 'error' && <p className="rf-fetch-error">{error}</p>}

            {result && (
              <div className="rf-preview">
                <div className="rf-preview-title" lang="ja">
                  {result.title}
                </div>
                {score && (
                  <div className="rf-comprehension">
                    <div className="rf-comprehension-bar">
                      <span style={{ width: `${knownPercent(score)}%` }} />
                    </div>
                    <span className="rf-comprehension-pct">
                      {t('reading.comprehension', { pct: knownPercent(score) })}
                    </span>
                  </div>
                )}
                {result.partial && (
                  <p className="rf-partial-note muted">
                    {t('reading.fetch.partial', { pages: result.pages })}
                  </p>
                )}
                <button
                  className="nov-link nov-link-planned"
                  disabled={state === 'importing'}
                  onClick={() => void openInReader()}
                >
                  {state === 'importing'
                    ? t('reading.fetch.opening')
                    : t('reading.fetch.openInReader')}
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
