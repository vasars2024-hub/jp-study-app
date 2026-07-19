import { useEffect, useMemo, useState } from 'react';
import {
  GRAMMAR,
  GUIDES,
  GUIDE_CATEGORIES,
  type GrammarFunctionId,
  type GrammarLevel,
  type GrammarPoint,
  type Guide,
  type GuideCategory,
} from '../data/grammar';
import type { ExampleSentence } from '../../shared/types';
import { useT } from '../i18n';
import {
  AppChrome,
  Button,
  StatusBarField,
  StatusBarSpacer,
  useAeroMaterials,
} from '../components/ui';
import GrammarPracticePanel from '../components/grammar/GrammarPracticePanel';
import GrammarCurationPanel from '../components/grammar/GrammarCurationPanel';
import GrammarExplorer from '../components/grammar/GrammarExplorer';
import {
  dedupeGrammarByTitle,
  type PracticeFilters,
} from '../data/grammar/practiceFilters';

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

type Mode = 'grammar' | 'practice' | 'guides' | 'review';
type CatFilter = 'All' | GuideCategory;

type Translate = ReturnType<typeof useT>['t'];

const GUIDE_CAT_KEYS: Record<GuideCategory, string> = {
  Hacks: 'grammar.aero.cat.hacks',
  Reading: 'grammar.aero.cat.reading',
  Writing: 'grammar.aero.cat.writing',
  Literature: 'grammar.aero.cat.literature',
  Speaking: 'grammar.aero.cat.speaking',
  Culture: 'grammar.aero.cat.culture',
};

function guideCategoryFilterLabel(cat: CatFilter, t: Translate): string {
  if (cat === 'All') return t('grammar.filter.all');
  return t(GUIDE_CAT_KEYS[cat]);
}

function matchesGuide(g: Guide, q: string): boolean {
  const body = g.sections.map((s) => `${s.heading} ${s.body.join(' ')}`).join(' ');
  const hay = `${g.title} ${g.summary} ${g.category} ${body}`.toLowerCase();
  return hay.includes(q);
}

function parsePracticeDeepLink(detail: unknown): Partial<PracticeFilters> | undefined {
  if (!detail || typeof detail !== 'object') return undefined;
  const d = detail as Record<string, unknown>;
  const out: Partial<PracticeFilters> = {};
  if (d.lang === 'ja' || d.lang === 'zh' || d.lang === 'all') out.lang = d.lang;
  if (typeof d.level === 'string') out.levels = [d.level as GrammarLevel];
  if (Array.isArray(d.levels)) out.levels = d.levels as GrammarLevel[];
  if (typeof d.functions === 'string') out.functions = [d.functions as GrammarFunctionId];
  if (Array.isArray(d.functions)) out.functions = d.functions as GrammarFunctionId[];
  return out;
}

export default function GrammarView() {
  const aero = useAeroMaterials();
  const corpusSize = useMemo(() => dedupeGrammarByTitle(GRAMMAR).length, []);
  const [mode, setMode] = useState<Mode>('grammar');
  const [practiceSeed, setPracticeSeed] = useState<Partial<PracticeFilters> | undefined>();
  const { t } = useT();

  useEffect(() => {
    const onPractice = (ev: Event) => {
      const detail = (ev as CustomEvent).detail;
      setPracticeSeed(parsePracticeDeepLink(detail));
      setMode('practice');
    };
    window.addEventListener('grammar:open-practice', onPractice);
    return () => window.removeEventListener('grammar:open-practice', onPractice);
  }, []);

  /*
   * Phase 2 removed the theme branch that used to live here. It returned a
   * separate Aero explorer before the mode switch, which made Practice and Test
   * unreachable in that theme and silently swallowed the `grammar:open-practice`
   * deep link. Both explorers are now one component skinned by CSS, so the mode
   * switch below is the only thing that decides what renders.
   */

  const modeLabel =
    mode === 'grammar'
      ? t('grammar.mode.points')
      : mode === 'practice'
        ? t('grammar.mode.practice')
        : mode === 'review'
          ? t('grammar.mode.review')
          : t('grammar.mode.guides');

  const classicStatus = (
    <>
      <StatusBarField>SYN / PARSE UNIT READY</StatusBarField>
      <StatusBarField>{modeLabel}</StatusBarField>
      <StatusBarSpacer />
      {/*
        Deduped, not raw: the Explorer lists the collapsed corpus, and a status
        bar claiming 2,227 next to a list of 1,893 is the same kind of
        unbacked number this redesign has been removing everywhere else.
      */}
      <StatusBarField>{t('grammar.count', { count: corpusSize })}</StatusBarField>
    </>
  );

  return (
    <AppChrome status={classicStatus} className="gram-chrome">
    <div className="gram-view">
      <div className="view-head">
        <p className="muted">{t('grammar.intro')}</p>
        <div className="gram-mode-toggle">
          <button
            className={`gram-mode-btn ${mode === 'grammar' ? 'active' : ''}`}
            onClick={() => setMode('grammar')}
          >
            {t('grammar.mode.points')}
          </button>
          <button
            className={`gram-mode-btn ${mode === 'practice' ? 'active' : ''}`}
            onClick={() => setMode('practice')}
          >
            {t('grammar.mode.practice')}
          </button>
          <button
            className={`gram-mode-btn ${mode === 'guides' ? 'active' : ''}`}
            onClick={() => setMode('guides')}
          >
            {t('grammar.mode.guides')}
          </button>
          <button
            className={`gram-mode-btn ${mode === 'review' ? 'active' : ''}`}
            onClick={() => setMode('review')}
          >
            {t('grammar.mode.review')}
          </button>
        </div>
      </div>

      {mode === 'grammar' ? (
        <GrammarExplorer
          className={aero ? 'gram-x--aero' : ''}
          renderDetail={(point) => <GrammarDetail key={point.id} point={point} />}
        />
      ) : mode === 'practice' ? (
        <GrammarPracticePanel initialFilters={practiceSeed} />
      ) : mode === 'review' ? (
        <GrammarCurationPanel />
      ) : (
        <GuidesBrowser />
      )}
    </div>
    </AppChrome>
  );
}


function GrammarDetail({ point }: { point: GrammarPoint }) {
  const [exState, setExState] = useState<ExState>('idle');
  const [examples, setExamples] = useState<ExampleSentence[]>([]);
  const [exError, setExError] = useState('');
  const { t } = useT();

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
        <h3>{t('grammar.structure')}</h3>
        <p className="gram-structure" lang="ja">
          {point.structure}
        </p>
      </div>

      <div className="gram-block">
        <h3>{t('grammar.howToUse')}</h3>
        <p>{point.explanation}</p>
      </div>

      <div className="gram-block">
        <h3>{t('grammar.examples')}</h3>
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
            {t('grammar.moreExamples')}
          </button>
        )}
        {exState === 'loading' && (
          <p className="gram-more-status muted">{t('grammar.searchingTatoeba')}</p>
        )}
        {exState === 'error' && <p className="gram-more-status muted">{exError}</p>}
        {exState === 'done' && examples.length === 0 && (
          <p className="gram-more-status muted">
            {t('grammar.noExtraExamples', { query: exampleQuery(point) })}
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
  const { t } = useT();

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
              {guideCategoryFilterLabel(c, t)}
            </button>
          ))}
        </div>
        <input
          className="gram-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('grammar.guideSearch.placeholder')}
        />
      </div>

      <div className="gram-count muted">{t('grammar.guideCount', { count: list.length })}</div>

      <div className="gram-body">
        <div className="gram-list guide-list">
          {list.length === 0 && <div className="gram-empty muted">{t('grammar.guidesEmpty')}</div>}
          {list.map((g) => (
            <button
              key={g.id}
              className={`guide-item ${selected?.id === g.id ? 'active' : ''}`}
              onClick={() => setSelectedId(g.id)}
            >
              <span className="guide-item-text">
                <span className="guide-item-top">
                  <span className="guide-item-title">{g.title}</span>
                  <span className="guide-cat-badge">{t(GUIDE_CAT_KEYS[g.category])}</span>
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
            <div className="gram-detail-empty muted">{t('grammar.selectGuidePrompt')}</div>
          )}
        </div>
      </div>
    </>
  );
}

function GuideArticle({ guide }: { guide: Guide }) {
  const { t } = useT();
  return (
    <article className="guide-article">
      <header className="guide-article-head">
        <div>
          <h2>{guide.title}</h2>
          <p className="guide-article-summary">{guide.summary}</p>
          <div className="guide-article-meta">
            <span className="guide-cat-badge">{t(GUIDE_CAT_KEYS[guide.category])}</span>
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
