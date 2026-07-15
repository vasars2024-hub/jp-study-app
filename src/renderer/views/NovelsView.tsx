import { useMemo, useState, type CSSProperties } from 'react';
import Icon from '../components/Icons';
import { useT } from '../i18n';
import {
  AppChrome,
  StatusBarField,
  StatusBarSpacer,
  Toolbar,
  ToolbarSpacer,
  type MenuBarMenu,
  useAeroMaterials,
} from '../components/ui';
import {
  NOVELS,
  NOVEL_TYPES,
  DIFFICULTY_ORDER,
  GENRES,
  type Novel,
  type NovelType,
  type Difficulty,
  type Genre,
} from '../data/novels';

type TypeFilter = 'All' | NovelType;
type DiffFilter = 'All' | Difficulty;
type GenreFilter = 'All' | Genre;
type SortKey = 'difficulty' | 'title' | 'year' | 'author';

function openLink(url: string): void {
  void window.api.openExternal(url);
}

// ----- "Plan to read" list (novel ids, persisted locally) -----
const PLAN_KEY = 'jp-novels-planned';
function loadPlanned(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(PLAN_KEY) ?? '[]') as string[];
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}
function savePlanned(s: Set<string>): void {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify([...s]));
  } catch {
    /* storage unavailable */
  }
}

// A stable two-tone gradient per title, so each card reads as its own "cover".
function coverStyle(seed: string): CSSProperties {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  const h2 = (h + 40) % 360;
  return { background: `linear-gradient(135deg, hsl(${h} 45% 32%), hsl(${h2} 50% 22%))` };
}

function matches(nv: Novel, q: string): boolean {
  const hay = `${nv.titleJp} ${nv.reading ?? ''} ${nv.titleEn ?? ''} ${nv.author} ${
    nv.authorEn ?? ''
  } ${nv.genres.join(' ')} ${nv.synopsis}`.toLowerCase();
  return hay.includes(q);
}

const DIFFICULTY_CLASS: Record<Difficulty, string> = {
  Beginner: 'd-beginner',
  Easy: 'd-easy',
  Moderate: 'd-moderate',
  Hard: 'd-hard',
  'Very Hard': 'd-veryhard',
};

export default function NovelsView() {
  const { t } = useT();
  const aero = useAeroMaterials();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<TypeFilter>('All');
  const [diff, setDiff] = useState<DiffFilter>('All');
  const [genre, setGenre] = useState<GenreFilter>('All');
  const [sort, setSort] = useState<SortKey>('difficulty');
  const [selected, setSelected] = useState<Novel | null>(null);
  const [planned, setPlanned] = useState<Set<string>>(loadPlanned);
  const [planOnly, setPlanOnly] = useState(false);

  const togglePlanned = (id: string) => {
    setPlanned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      savePlanned(next);
      return next;
    });
  };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = NOVELS.filter(
      (nv) =>
        (!planOnly || planned.has(nv.id)) &&
        (type === 'All' || nv.type === type) &&
        (diff === 'All' || nv.difficulty === diff) &&
        (genre === 'All' || nv.genres.includes(genre)) &&
        (!q || matches(nv, q)),
    );
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'title':
          return (a.reading ?? a.titleJp).localeCompare(b.reading ?? b.titleJp, 'ja');
        case 'year':
          return (a.year ?? 0) - (b.year ?? 0);
        case 'author':
          return a.author.localeCompare(b.author, 'ja');
        case 'difficulty':
        default:
          return (
            DIFFICULTY_ORDER.indexOf(a.difficulty) - DIFFICULTY_ORDER.indexOf(b.difficulty) ||
            (a.year ?? 0) - (b.year ?? 0)
          );
      }
    });
    return sorted;
  }, [query, type, diff, genre, sort, planOnly, planned]);

  const selectedNovel = selected ?? list[0] ?? null;
  const menus: MenuBarMenu[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'clear-search', label: 'Clear search', disabled: !query, onSelect: () => setQuery('') },
        { id: 'show-all', label: 'Show all titles', onSelect: () => { setType('All'); setDiff('All'); setGenre('All'); setPlanOnly(false); } },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { id: 'planned', label: planOnly ? 'Show full catalogue' : 'Show plan to read', onSelect: () => setPlanOnly((v) => !v) },
        { id: 'sort-difficulty', label: 'Sort by difficulty', onSelect: () => setSort('difficulty') },
        { id: 'sort-title', label: 'Sort by title', onSelect: () => setSort('title') },
        { id: 'sort-year', label: 'Sort by year', onSelect: () => setSort('year') },
      ],
    },
  ];

  if (aero) {
    return (
      <AppChrome
        menus={menus}
        status={
          <>
            <StatusBarField>{list.length} titles</StatusBarField>
            <StatusBarField>{planned.size} planned</StatusBarField>
            <StatusBarSpacer />
            <StatusBarField>{selectedNovel?.titleJp ?? 'No selection'}</StatusBarField>
          </>
        }
        className="aero-novels-chrome"
      >
        <div className="aero-novels">
          <Toolbar className="aero-novels-toolbar" aria-label="Novel catalogue commands">
            <input
              className="aero-novels-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find title, author, or theme..."
              lang="ja"
            />
            <label>
              Genre
              <select value={genre} onChange={(e) => setGenre(e.target.value as GenreFilter)}>
                <option value="All">All</option>
                {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
            <label>
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="difficulty">Difficulty</option>
                <option value="title">Title</option>
                <option value="year">Year</option>
                <option value="author">Author</option>
              </select>
            </label>
            <ToolbarSpacer />
            <button className={`aero-novels-command ${planOnly ? 'active' : ''}`} onClick={() => setPlanOnly((v) => !v)}>
              Plan {planned.size > 0 ? `(${planned.size})` : ''}
            </button>
          </Toolbar>

          <div className="aero-novels-workbench">
            <aside className="aero-novels-tree" aria-label="Novel filters">
              <div className="aero-novels-tree-group">
                <b>Type</b>
                <button className={type === 'All' ? 'active' : ''} onClick={() => setType('All')}>All types</button>
                {NOVEL_TYPES.map((t) => (
                  <button key={t} className={type === t ? 'active' : ''} onClick={() => setType(t)}>{t}</button>
                ))}
              </div>
              <div className="aero-novels-tree-group">
                <b>Difficulty</b>
                <button className={diff === 'All' ? 'active' : ''} onClick={() => setDiff('All')}>Any level</button>
                {DIFFICULTY_ORDER.map((d) => (
                  <button key={d} className={diff === d ? 'active' : ''} onClick={() => setDiff(d)}>{d}</button>
                ))}
              </div>
            </aside>

            <main className="aero-novels-list" aria-label="Novel titles">
              <div className="aero-novel-row aero-novel-row-head">
                <span>Title</span>
                <span>Author</span>
                <span>Type</span>
                <span>Level</span>
                <span>Year</span>
              </div>
              {list.length === 0 ? (
                <div className="aero-novels-empty">No titles match those filters.</div>
              ) : (
                list.map((nv) => (
                  <button
                    key={nv.id}
                    className={`aero-novel-row ${selectedNovel?.id === nv.id ? 'active' : ''}`}
                    onClick={() => setSelected(nv)}
                  >
                    <span lang="ja">{nv.titleJp}</span>
                    <span>{nv.authorEn ?? nv.author}</span>
                    <span>{nv.type}</span>
                    <span>{nv.difficulty}{nv.jlpt ? ` / ${nv.jlpt}` : ''}</span>
                    <span>{nv.year ?? '-'}</span>
                  </button>
                ))
              )}
            </main>

            <aside className="aero-novels-inspector" aria-label="Novel details">
              {selectedNovel ? (
                <>
                  <div className="aero-novel-cover" style={coverStyle(selectedNovel.id)}>
                    <span lang="ja">{selectedNovel.titleJp}</span>
                  </div>
                  {selectedNovel.titleEn && <h2>{selectedNovel.titleEn}</h2>}
                  <dl>
                    <div><dt>Author</dt><dd>{selectedNovel.author}</dd></div>
                    <div><dt>Type</dt><dd>{selectedNovel.type}</dd></div>
                    <div><dt>Difficulty</dt><dd>{selectedNovel.difficulty}{selectedNovel.jlpt ? ` / ${selectedNovel.jlpt}` : ''}</dd></div>
                    {selectedNovel.year && <div><dt>Year</dt><dd>{selectedNovel.year}</dd></div>}
                  </dl>
                  <p>{selectedNovel.synopsis}</p>
                  <div className="aero-novel-inspector-actions">
                    <button onClick={() => togglePlanned(selectedNovel.id)}>
                      <Icon name="star" size={13} fill={planned.has(selectedNovel.id)} />
                      {planned.has(selectedNovel.id) ? 'Remove from plan' : 'Plan to read'}
                    </button>
                    {selectedNovel.links.map((l) => (
                      <button key={l.url} onClick={() => openLink(l.url)}>
                        {l.label}
                        <Icon name="external" size={11} />
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="aero-novels-empty">No selection.</div>
              )}
            </aside>
          </div>
        </div>
      </AppChrome>
    );
  }

  return (
    <div className="nov-view">
      <div className="view-head">
        <p className="muted">{t('novels.intro')}</p>
        <div className="nov-refs">
          <button className="btn small" onClick={() => openLink('https://learnnatively.com/languages/japanese/')}>
            {t('novels.ref.natively')}
            <Icon name="external" size={11} style={{ marginLeft: 4, verticalAlign: '-1px' }} />
          </button>
          <button className="btn small" onClick={() => openLink('https://jpdb.io/prebuilt_decks?lang=japanese')}>
            {t('novels.ref.jpdb')}
            <Icon name="external" size={11} style={{ marginLeft: 4, verticalAlign: '-1px' }} />
          </button>
        </div>
      </div>

      <div className="nov-controls">
        <div className="nov-chip-row">
          <button
            className={`gram-level-btn ${type === 'All' ? 'active' : ''}`}
            onClick={() => setType('All')}
          >
            {t('novels.filter.allTypes')}
          </button>
          {NOVEL_TYPES.map((nt) => (
            <button
              key={nt}
              className={`gram-level-btn ${type === nt ? 'active' : ''}`}
              onClick={() => setType(nt)}
            >
              {nt}
            </button>
          ))}
          <span className="nov-chip-sep" />
          <button
            className={`gram-level-btn ${diff === 'All' ? 'active' : ''}`}
            onClick={() => setDiff('All')}
          >
            {t('novels.filter.anyLevel')}
          </button>
          {DIFFICULTY_ORDER.map((d) => (
            <button
              key={d}
              className={`gram-level-btn ${diff === d ? 'active' : ''}`}
              onClick={() => setDiff(d)}
            >
              {d}
            </button>
          ))}
          <span className="nov-chip-sep" />
          <button
            className={`gram-level-btn nov-plan-chip ${planOnly ? 'active' : ''}`}
            onClick={() => setPlanOnly((v) => !v)}
            title={t('novels.planChip.title')}
          >
            <Icon name="library" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
            {t('novels.planChip.label')}
            {planned.size > 0 ? ` (${planned.size})` : ''}
          </button>
        </div>

        <div className="nov-control-line">
          <input
            className="gram-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('novels.search.placeholder')}
            lang="ja"
          />
          <label className="nov-select">
            {t('novels.genre.label')}
            <select value={genre} onChange={(e) => setGenre(e.target.value as GenreFilter)}>
              <option value="All">{t('novels.genre.all')}</option>
              {GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="nov-select">
            {t('novels.sort.label')}
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="difficulty">{t('novels.sort.easiest')}</option>
              <option value="title">{t('novels.sort.titleOrder')}</option>
              <option value="year">{t('novels.sort.year')}</option>
              <option value="author">{t('novels.sort.author')}</option>
            </select>
          </label>
        </div>
      </div>

      <div className="gram-count muted">{t('novels.count', { count: list.length })}</div>

      {list.length === 0 ? (
        <div className="res-empty muted">{t('novels.noMatches')}</div>
      ) : (
        <div className="nov-grid">
          {list.map((nv) => (
            <button key={nv.id} className="nov-card" onClick={() => setSelected(nv)}>
              <span className="nov-cover" style={coverStyle(nv.id)}>
                <span className="nov-cover-title" lang="ja">
                  {nv.titleJp}
                </span>
                {nv.freeOnAozora && <span className="nov-free-tag">{t('novels.freeTag')}</span>}
                <span
                  className={`nov-plan-star ${planned.has(nv.id) ? 'active' : ''}`}
                  title={planned.has(nv.id) ? t('novels.plan.remove') : t('novels.plan.add')}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlanned(nv.id);
                  }}
                >
                  <Icon name="star" size={13} fill={planned.has(nv.id)} />
                </span>
              </span>
              <span className="nov-card-body">
                <span className="nov-card-titles">
                  {nv.titleEn && <span className="nov-en">{nv.titleEn}</span>}
                  <span className="nov-author">{nv.authorEn ?? nv.author}</span>
                </span>
                <span className="nov-badges">
                  <span className="nov-type">{nv.type}</span>
                  <span className={`nov-diff ${DIFFICULTY_CLASS[nv.difficulty]}`}>
                    {nv.difficulty}
                  </span>
                  {nv.jlpt && <span className="nov-jlpt">{nv.jlpt}</span>}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <NovelDetail
          novel={selected}
          planned={planned.has(selected.id)}
          onTogglePlanned={() => togglePlanned(selected.id)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function NovelDetail({
  novel,
  planned,
  onTogglePlanned,
  onClose,
}: {
  novel: Novel;
  planned: boolean;
  onTogglePlanned: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
  return (
    <div className="nov-modal-backdrop" onClick={onClose}>
      <div className="nov-modal" onClick={(e) => e.stopPropagation()}>
        <button className="nov-modal-x" onClick={onClose} aria-label={t('common.close')}>
          ×
        </button>
        <div className="nov-modal-head" style={coverStyle(novel.id)}>
          <span className="nov-modal-title" lang="ja">
            {novel.titleJp}
          </span>
          {novel.reading && novel.reading !== novel.titleJp && (
            <span className="nov-modal-reading" lang="ja">
              {novel.reading}
            </span>
          )}
        </div>

        <div className="nov-modal-body">
          {novel.titleEn && <p className="nov-modal-en">{novel.titleEn}</p>}

          <div className="nov-meta">
            <span>
              <b>{t('novels.meta.author')}</b> {novel.author}
              {novel.authorEn ? ` · ${novel.authorEn}` : ''}
            </span>
            <span>
              <b>{t('novels.meta.type')}</b> {novel.type}
            </span>
            {novel.year && (
              <span>
                <b>{t('novels.meta.year')}</b> {novel.year}
              </span>
            )}
            <span>
              <b>{t('novels.meta.difficulty')}</b>{' '}
              <span className={`nov-diff ${DIFFICULTY_CLASS[novel.difficulty]}`}>
                {novel.difficulty}
              </span>
              {novel.jlpt ? ` · ${novel.jlpt}+` : ''}
            </span>
          </div>

          <div className="nov-genre-tags">
            {novel.genres.map((g) => (
              <span key={g} className="nov-genre">
                {g}
              </span>
            ))}
          </div>

          <p className="nov-synopsis">{novel.synopsis}</p>

          <div className="nov-links">
            <button
              className={`nov-link ${planned ? 'nov-link-planned' : 'nov-link-plan'}`}
              onClick={onTogglePlanned}
            >
              <Icon name="star" size={13} fill={planned} style={{ marginRight: 5, verticalAlign: '-2px' }} />
              {planned ? t('novels.onListRemove') : t('novels.plan.add')}
            </button>
            {novel.links.map((l) => (
              <button
                key={l.url}
                className={`nov-link nov-link-${l.kind}`}
                onClick={() => openLink(l.url)}
              >
                {l.label}
                <Icon name="external" size={11} style={{ marginLeft: 4, verticalAlign: '-1px' }} />
              </button>
            ))}
          </div>

          {novel.freeOnAozora && (
            <p className="nov-free-note muted">
              <Icon name="check" size={12} style={{ marginRight: 4, verticalAlign: '-1px' }} />
              {t('novels.freeNote')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
