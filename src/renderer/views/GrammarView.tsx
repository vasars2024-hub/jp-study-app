import { useMemo, useState } from 'react';
import {
  GRAMMAR,
  LEVELS,
  GUIDES,
  GUIDE_CATEGORIES,
  type GrammarPoint,
  type JlptLevel,
  type Guide,
  type GuideCategory,
} from '../data/grammar';
import type { ExampleSentence } from '../../shared/types';

type ExState = 'idle' | 'loading' | 'done' | 'error';

// Turn a grammar title (e.g. "〜ないではいられない", "も〜ば〜も") into the most
// distinctive searchable chunk for Tatoeba: drop (…) notes, split on the ～
// placeholder and slashes, and keep the longest fragment.
function exampleQuery(point: GrammarPoint): string {
  const cleaned = point.title.replace(/[（(][^）)]*[）)]/g, '').trim();
  const parts = cleaned
    .split(/[～〜/／・,、]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const longest = parts.sort((a, b) => b.length - a.length)[0] ?? cleaned;
  return longest;
}

type Mode = 'grammar' | 'guides';
type LevelFilter = 'All' | JlptLevel;
type CatFilter = 'All' | GuideCategory;

function matchesPoint(g: GrammarPoint, q: string): boolean {
  const hay = `${g.title} ${g.meaning} ${g.structure} ${g.explanation}`.toLowerCase();
  return hay.includes(q);
}

function matchesGuide(g: Guide, q: string): boolean {
  const body = g.sections.map((s) => `${s.heading} ${s.body.join(' ')}`).join(' ');
  const hay = `${g.title} ${g.summary} ${g.category} ${body}`.toLowerCase();
  return hay.includes(q);
}

export default function GrammarView() {
  const [mode, setMode] = useState<Mode>('grammar');

  return (
    <div className="gram-view">
      <div className="view-head">
        <p className="muted">
          Every JLPT grammar point from N5 to N1, plus hand-written hacks and tutorials.
        </p>
        <div className="gram-mode-toggle">
          <button
            className={`gram-mode-btn ${mode === 'grammar' ? 'active' : ''}`}
            onClick={() => setMode('grammar')}
          >
            Grammar points
          </button>
          <button
            className={`gram-mode-btn ${mode === 'guides' ? 'active' : ''}`}
            onClick={() => setMode('guides')}
          >
            Guides &amp; hacks
          </button>
        </div>
      </div>

      {mode === 'grammar' ? <GrammarBrowser /> : <GuidesBrowser />}
    </div>
  );
}

/* ------------------------------ Grammar points ------------------------------ */

function GrammarBrowser() {
  const [filter, setFilter] = useState<LevelFilter>('All');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GRAMMAR.filter(
      (g) => (filter === 'All' || g.level === filter) && (!q || matchesPoint(g, q)),
    );
  }, [filter, query]);

  const selected = list.find((g) => g.id === selectedId) ?? list[0] ?? null;

  return (
    <>
      <div className="gram-controls">
        <div className="gram-levels">
          {(['All', ...LEVELS] as LevelFilter[]).map((lv) => (
            <button
              key={lv}
              className={`gram-level-btn ${filter === lv ? 'active' : ''}`}
              onClick={() => setFilter(lv)}
            >
              {lv}
            </button>
          ))}
        </div>
        <input
          className="gram-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search grammar or meaning…"
          lang="ja"
        />
      </div>

      <div className="gram-count muted">
        {list.length} point{list.length === 1 ? '' : 's'}
      </div>

      <div className="gram-body">
        <div className="gram-list">
          {list.length === 0 && <div className="gram-empty muted">No grammar points found.</div>}
          {list.map((g) => (
            <button
              key={g.id}
              className={`gram-item ${selected?.id === g.id ? 'active' : ''}`}
              onClick={() => setSelectedId(g.id)}
            >
              <span className="gram-item-top">
                <span className="gram-item-title" lang="ja">
                  {g.title}
                </span>
                <span className={`gram-badge lv-${g.level}`}>{g.level}</span>
              </span>
              <span className="gram-item-meaning">{g.meaning}</span>
            </button>
          ))}
        </div>

        <div className="gram-detail">
          {selected ? (
            <GrammarDetail key={selected.id} point={selected} />
          ) : (
            <div className="gram-detail-empty muted">Select a grammar point to see details.</div>
          )}
        </div>
      </div>
    </>
  );
}

function GrammarDetail({ point }: { point: GrammarPoint }) {
  const [exState, setExState] = useState<ExState>('idle');
  const [examples, setExamples] = useState<ExampleSentence[]>([]);
  const [exError, setExError] = useState('');

  async function loadExamples() {
    setExState('loading');
    setExError('');
    const r = await window.api.searchExamples(exampleQuery(point));
    if (r.error) {
      setExState('error');
      setExError(r.error);
      return;
    }
    setExamples(r.examples);
    setExState('done');
  }

  return (
    <article className="gram-card">
      <header className="gram-card-head">
        <h2 lang="ja">{point.title}</h2>
        <span className={`gram-badge lv-${point.level}`}>{point.level}</span>
      </header>
      <p className="gram-gloss">{point.meaning}</p>

      <div className="gram-block">
        <h3>Structure</h3>
        <p className="gram-structure" lang="ja">
          {point.structure}
        </p>
      </div>

      <div className="gram-block">
        <h3>How to use it</h3>
        <p>{point.explanation}</p>
      </div>

      <div className="gram-block">
        <h3>Examples</h3>
        <ul className="gram-examples">
          {point.examples.map((ex, i) => (
            <li key={i}>
              <span className="gram-ex-jp" lang="ja">
                {ex.jp}
              </span>
              {ex.reading && (
                <span className="gram-ex-reading" lang="ja">
                  {ex.reading}
                </span>
              )}
              <span className="gram-ex-en">{ex.en}</span>
            </li>
          ))}
        </ul>

        {exState === 'idle' && (
          <button className="gram-more-btn" onClick={loadExamples}>
            ＋ More examples from Tatoeba
          </button>
        )}
        {exState === 'loading' && <p className="gram-more-status muted">Searching Tatoeba…</p>}
        {exState === 'error' && <p className="gram-more-status muted">{exError}</p>}
        {exState === 'done' && examples.length === 0 && (
          <p className="gram-more-status muted">
            No extra sentences found for “{exampleQuery(point)}”.
          </p>
        )}
        {exState === 'done' && examples.length > 0 && (
          <ul className="gram-examples gram-examples-extra">
            {examples.map((ex, i) => (
              <li key={i}>
                <span className="gram-ex-jp" lang="ja">
                  {ex.jp}
                </span>
                <span className="gram-ex-en">{ex.en}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

/* ------------------------------ Guides & hacks ------------------------------ */

function GuidesBrowser() {
  const [cat, setCat] = useState<CatFilter>('All');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GUIDES.filter(
      (g) => (cat === 'All' || g.category === cat) && (!q || matchesGuide(g, q)),
    );
  }, [cat, query]);

  const selected = list.find((g) => g.id === selectedId) ?? list[0] ?? null;

  return (
    <>
      <div className="gram-controls">
        <div className="gram-levels">
          {(['All', ...GUIDE_CATEGORIES] as CatFilter[]).map((c) => (
            <button
              key={c}
              className={`gram-level-btn ${cat === c ? 'active' : ''}`}
              onClick={() => setCat(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <input
          className="gram-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search guides…"
        />
      </div>

      <div className="gram-count muted">
        {list.length} guide{list.length === 1 ? '' : 's'}
      </div>

      <div className="gram-body">
        <div className="gram-list guide-list">
          {list.length === 0 && <div className="gram-empty muted">No guides found.</div>}
          {list.map((g) => (
            <button
              key={g.id}
              className={`guide-item ${selected?.id === g.id ? 'active' : ''}`}
              onClick={() => setSelectedId(g.id)}
            >
              <span className="guide-item-text">
                <span className="guide-item-top">
                  <span className="guide-item-title">{g.title}</span>
                  <span className="guide-cat-badge">{g.category}</span>
                </span>
                <span className="guide-item-summary">{g.summary}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="gram-detail">
          {selected ? (
            <GuideArticle guide={selected} />
          ) : (
            <div className="gram-detail-empty muted">Select a guide to start reading.</div>
          )}
        </div>
      </div>
    </>
  );
}

function GuideArticle({ guide }: { guide: Guide }) {
  return (
    <article className="guide-article">
      <header className="guide-article-head">
        <div>
          <h2>{guide.title}</h2>
          <p className="guide-article-summary">{guide.summary}</p>
          <div className="guide-article-meta">
            <span className="guide-cat-badge">{guide.category}</span>
            {guide.level && <span className="guide-level-tag">{guide.level}</span>}
          </div>
        </div>
      </header>

      {guide.sections.map((sec, i) => (
        <section className="guide-section" key={i}>
          <h3>{sec.heading}</h3>
          {sec.body.map((para, j) => (
            <p key={j}>{para}</p>
          ))}

          {sec.tips && sec.tips.length > 0 && (
            <ul className="guide-tips">
              {sec.tips.map((tip, k) => (
                <li key={k}>{tip}</li>
              ))}
            </ul>
          )}

          {sec.examples && sec.examples.length > 0 && (
            <ul className="gram-examples guide-examples">
              {sec.examples.map((ex, k) => (
                <li key={k}>
                  <span className="gram-ex-jp" lang="ja">
                    {ex.jp}
                  </span>
                  {ex.reading && (
                    <span className="gram-ex-reading" lang="ja">
                      {ex.reading}
                    </span>
                  )}
                  <span className="gram-ex-en">{ex.en}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>
  );
}
