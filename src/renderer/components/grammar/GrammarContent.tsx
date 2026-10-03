/**
 * Grammar content components shared by Study OS's `GrammarView` and Blanc's
 * `BlancGrammarPanel`.
 *
 * These were view-local until the Blanc refinement work (Pillar 0): Blanc must
 * not mount `GrammarView`, but both surfaces need the same point detail and
 * guide browser. Extracted here so there is one implementation with two
 * presentations — nothing in this file may import `AppChrome`/`MenuBar`/
 * `StatusBar`, because Blanc composes it directly.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GRAMMAR,
  GUIDES,
  GUIDE_CATEGORIES,
  type GrammarFunctionId,
  type GrammarLevel,
  type GrammarPoint,
  type Guide,
  type GuideCategory,
} from '../../data/grammar';
import type { PracticeFilters } from '../../data/grammar/practiceFilters';
import { explanationCopiesMeaning, structureCopiesTitle } from '../../data/grammar/hollow';
import type { ExampleSentence } from '../../../shared/types';
import { AGENT_NAVIGATION_SECTION_LABEL_KEYS } from '../../../shared/agentNavigation';
import {
  grammarPatternAgentContext,
  handOffToAgent,
  routeAgentContext,
} from '../../agentContextHandoff';
import { useT } from '../../i18n';
import { contentLangOf } from '../../studyEnvironment';
import { normalizeStudyLang } from '../../../shared/studyLang';
import ContentImportDialog from '../ContentImportDialog';
import {
  EXAMPLE_TEMPLATE_CSV,
  EXAMPLE_TEMPLATE_JSON,
  addUserExamples,
  assignExampleRows,
  parseExampleImport,
  removeUserExample,
  useUserExamples,
  type ExampleImportRow,
} from '../../data/grammar/userExamples';
import { findCaptureSentences, findDeckSentences, type DeckSentenceHit } from '../../data/grammar/deckSentences';
import { READING_LENS_HISTORY_LIMIT, type ReadingLensHistoryEntry } from '../../../shared/readingLensHistory';
import { FLASHCARD_DECK_EVENT, loadDeck } from '../../flashcardDeck';
import { requestFlashcardsFocus } from '../../openIntents';

type ExState = 'idle' | 'loading' | 'done' | 'error';
type CatFilter = 'All' | GuideCategory;
type Translate = ReturnType<typeof useT>['t'];

export const GUIDE_CAT_KEYS: Record<GuideCategory, string> = {
  Hacks: 'grammar.aero.cat.hacks',
  Reading: 'grammar.aero.cat.reading',
  Writing: 'grammar.aero.cat.writing',
  Literature: 'grammar.aero.cat.literature',
  Speaking: 'grammar.aero.cat.speaking',
  Culture: 'grammar.aero.cat.culture',
};

/**
 * Turn a grammar title (e.g. "〜ないではいられない", "も〜ば〜も") into the most
 * distinctive searchable chunk for Tatoeba: drop (…) notes, split on the ～
 * placeholder and slashes, and keep the longest fragment.
 */
export function exampleQuery(point: GrammarPoint): string {
  const cleaned = point.title.replace(/[（(][^）)]*[）)]/g, '').trim();
  const parts = cleaned
    .split(/[～〜/／・,、]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const longest = parts.sort((a, b) => b.length - a.length)[0] ?? cleaned;
  return longest;
}

function guideCategoryFilterLabel(cat: CatFilter, t: Translate): string {
  if (cat === 'All') return t('grammar.filter.all');
  return t(GUIDE_CAT_KEYS[cat]);
}

function matchesGuide(g: Guide, q: string): boolean {
  const body = g.sections.map((s) => `${s.heading} ${s.body.join(' ')}`).join(' ');
  const hay = `${g.title} ${g.summary} ${g.category} ${body}`.toLowerCase();
  return hay.includes(q);
}

function MatchedSentence({ hit }: { hit: DeckSentenceHit }) {
  return (
    <>
      {hit.sentence.slice(0, hit.matchStart)}
      <mark>{hit.sentence.slice(hit.matchStart, hit.matchEnd)}</mark>
      {hit.sentence.slice(hit.matchEnd)}
    </>
  );
}

export function GrammarDetail({ point }: { point: GrammarPoint }) {
  const [exState, setExState] = useState<ExState>('idle');
  const [examples, setExamples] = useState<ExampleSentence[]>([]);
  const [exError, setExError] = useState('');
  const { t } = useT();
  // Sentences the learner imported or kept for this point.
  const ownExamples = useUserExamples(point.id);
  const [importOpen, setImportOpen] = useState(false);
  const [keptNote, setKeptNote] = useState('');
  const [deckRev, setDeckRev] = useState(0);
  const [captures, setCaptures] = useState<ReadingLensHistoryEntry[]>([]);
  useEffect(() => {
    let active = true;
    // History is bounded and loaded asynchronously, once per detail mount.
    window.api?.lensHistoryList?.({ limit: READING_LENS_HISTORY_LIMIT })
      .then((entries) => { if (active) setCaptures(entries); })
      .catch(() => { /* Optional examples must not block the grammar lesson. */ });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const bump = () => setDeckRev((n) => n + 1);
    window.addEventListener(FLASHCARD_DECK_EVENT, bump);
    return () => window.removeEventListener(FLASHCARD_DECK_EVENT, bump);
  }, []);
  const deckSentences = useMemo(
    () => findDeckSentences(loadDeck(), exampleQuery(point)),
    // deckRev re-runs the search when the deck changes.
    [point, deckRev],
  );
  const captureSentences = useMemo(
    () => findCaptureSentences(captures, exampleQuery(point)),
    [captures, point],
  );
  const commitExamples = useCallback(
    (rows: ExampleImportRow[]) => {
      const { byPoint, unmatched } = assignExampleRows(rows, point, GRAMMAR);
      let added = 0;
      for (const [id, list] of byPoint) {
        added += addUserExamples(id, list, id === point.id ? point.examples : []);
      }
      const others = [...byPoint.keys()].filter((id) => id !== point.id).length;
      return t('grammar.examples.own.imported', { added, others, unmatched });
    },
    [point, t],
  );
  const keepFound = () => {
    const added = addUserExamples(
      point.id,
      examples.map((ex) => ({ jp: ex.jp, en: ex.en, fromTatoeba: true })),
      point.examples,
    );
    setKeptNote(t('grammar.examples.own.kept', { count: added }));
  };

  async function loadExamples() {
    setExState('loading');
    setExError('');
    // The point's own language: a Chinese or Russian pattern's examples are not Japanese.
    const r = await window.api.searchExamples(exampleQuery(point), undefined, normalizeStudyLang(point.lang));
    if (r.error) {
      setExState('error');
      setExError(r.error);
      return;
    }
    setExamples(r.examples);
    setExState('done');
  }

  /*
   * L5 bullet 1's Grammar end of the selection contract.
   *
   * `grammarPatternAgentContext` derives its shelf identity from the point id, so
   * the same pattern arrives under one id however it is titled — which is what
   * makes a Grammar → Dictionary → Agent round trip *retain* context rather than
   * accumulate near-duplicates. The preview carries meaning, structure and
   * explanation because a pattern named alone is a poor prompt; the contract
   * clamps it, so nothing here needs a second length rule.
   */
  const askAgent = (): void => {
    const summary = [
      point.meaning,
      structureCopiesTitle(point) ? '' : point.structure,
      explanationCopiesMeaning(point) ? '' : point.explanation,
    ]
      .map((part) => (part ?? '').trim())
      .filter(Boolean)
      .join(' — ');
    void handOffToAgent(
      grammarPatternAgentContext(point.id, point.title, summary),
      t('agent.conversation.fromGrammar', { label: point.title }),
      routeAgentContext('grammar', t(AGENT_NAVIGATION_SECTION_LABEL_KEYS.grammar)),
    );
  };

  return (
    <article className="gram-card">
      {/* `lq-hit-scope`: the Ask-agent button measured 209x31 live — half a pixel
          under the floor, which no reviewer would ever see and the walk reports. */}
      <header className="gram-card-head lq-hit-scope">
        <h2 lang={contentLangOf(point.lang)}>{point.title}</h2>
        <span className={`gram-badge lv-${point.level}`}>{point.level}</span>
        <button data-ai-entry type="button" className="gram-ask-agent" onClick={askAgent}>
          {t('grammar.askAgent')}
        </button>
      </header>
      <p className="gram-gloss">{point.meaning}</p>

      {/* A block that only repeats the title or the gloss says nothing; hide it
          rather than print the same words twice under a heading. */}
      {!structureCopiesTitle(point) && (
        <div className="gram-block">
          <h3>{t('grammar.structure')}</h3>
          <p className="gram-structure" lang={contentLangOf(point.lang)}>
            {point.structure}
          </p>
        </div>
      )}

      {!explanationCopiesMeaning(point) && (
        <div className="gram-block">
          <h3>{t('grammar.howToUse')}</h3>
          <p>{point.explanation}</p>
        </div>
      )}

      <div className="gram-block">
        <h3>{t('grammar.examples')}</h3>
        {point.examples.length === 0 && ownExamples.length === 0 ? (
          <p className="gram-more-status muted">{t('grammar.noExamplesYet')}</p>
        ) : point.examples.length === 0 ? null : (
          <ul className="gram-examples">
            {point.examples.map((ex, i) => (
              <li key={i}>
                <span className="gram-ex-jp" lang={contentLangOf(point.lang)}>
                  {ex.jp}
                </span>
                {ex.reading && (
                  <span className="gram-ex-reading" lang={point.lang === 'zh' ? 'zh-Latn-pinyin' : contentLangOf(point.lang)}>
                    {ex.reading}
                  </span>
                )}
                <span className="gram-ex-en">{ex.en}</span>
              </li>
            ))}
          </ul>
        )}

        {ownExamples.length > 0 && (
          <ul className="gram-examples gram-examples-own" aria-label={t('grammar.examples.own.label')}>
            {ownExamples.map((ex) => (
              <li key={ex.jp}>
                <span className="gram-ex-jp" lang={contentLangOf(point.lang)}>
                  {ex.jp}
                </span>
                {ex.reading && (
                  <span className="gram-ex-reading" lang={point.lang === 'zh' ? 'zh-Latn-pinyin' : contentLangOf(point.lang)}>
                    {ex.reading}
                  </span>
                )}
                {ex.en && <span className="gram-ex-en">{ex.en}</span>}
                <span className="gram-ex-own-row">
                  <span className="gram-ex-own-tag">{t('grammar.examples.own.tag')}</span>
                  <button
                    type="button"
                    className="gram-ex-own-remove"
                    onClick={() => removeUserExample(point.id, ex.jp)}
                    aria-label={t('grammar.examples.own.remove')}
                    title={t('grammar.examples.own.remove')}
                  >
                    {t('grammar.examples.own.removeShort')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="gram-more-actions">
          {exState === 'idle' && (
            <button className="gram-more-btn" onClick={loadExamples}>
              {t('grammar.moreExamples')}
            </button>
          )}
          <button className="gram-more-btn" onClick={() => setImportOpen(true)}>
            {t('grammar.examples.own.add')}
          </button>
        </div>
        <ContentImportDialog<ExampleImportRow>
          open={importOpen}
          onClose={() => setImportOpen(false)}
          title={t('grammar.examples.own.importTitle', { pattern: point.title })}
          description={t('grammar.examples.own.importDesc')}
          templates={{ csv: EXAMPLE_TEMPLATE_CSV, json: EXAMPLE_TEMPLATE_JSON }}
          templateName="grammar-examples"
          parse={parseExampleImport}
          columns={[
            { label: t('grammar.curation.col.example'), value: (r) => r.jp, lang: () => contentLangOf(point.lang) },
            { label: t('grammar.examples.own.colTranslation'), value: (r) => r.en },
            { label: t('grammar.curation.col.pattern'), value: (r) => r.pattern ?? point.title, lang: () => contentLangOf(point.lang) },
          ]}
          onCommit={commitExamples}
        />
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
          <>
            <ul className="gram-examples gram-examples-extra">
              {examples.map((ex, i) => (
                <li key={i}>
                  <span className="gram-ex-jp" lang={contentLangOf(point.lang)}>
                    {ex.jp}
                  </span>
                  <span className="gram-ex-en">{ex.en}</span>
                </li>
              ))}
            </ul>
            <div className="gram-more-actions">
              <button className="gram-more-btn" onClick={keepFound}>
                {t('grammar.examples.own.keep')}
              </button>
              {keptNote && <span className="gram-more-status muted" role="status">{keptNote}</span>}
            </div>
          </>
        )}
        {deckSentences.length > 0 && (
          <>
            <h4 className="gram-more-status muted">{t('grammar.deckSentences.label')}</h4>
            <ul className="gram-examples gram-examples-deck">
              {deckSentences.map((hit) => (
                <li key={hit.id}>
                  <button type="button" className="gram-more-btn gram-ex-jp" lang={contentLangOf(point.lang)}
                    onClick={() => requestFlashcardsFocus({ folder: null, cardId: hit.id })}>
                    <MatchedSentence hit={hit} />
                  </button>
                  <span className="gram-ex-en" lang={contentLangOf(point.lang)}>
                    {hit.word}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {captureSentences.length > 0 && (
          <>
            <h4 className="gram-more-status muted">{t('grammar.captureSentences.label')}</h4>
            <ul className="gram-examples gram-examples-captures">
              {captureSentences.map((hit) => (
                <li key={hit.id}>
                  <span className="gram-ex-jp" lang={contentLangOf(point.lang)}>
                    <MatchedSentence hit={hit} />
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {(point.examples.some((ex) => ex.source === 'tatoeba') ||
          ownExamples.some((ex) => ex.source === 'tatoeba') ||
          (exState === 'done' && examples.length > 0)) && (
          <p className="gram-ex-credit muted">
            <a href="https://tatoeba.org" target="_blank" rel="noreferrer">
              {t('grammar.examples.tatoebaCredit')}
            </a>
          </p>
        )}
      </div>
    </article>
  );
}

/* ------------------------------ Guides & hacks ------------------------------ */

export function GuidesBrowser() {
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
          {/* `aria-pressed`, not just the `active` class: the class is paint, and a
              screen reader announced all seven category filters identically whichever
              one was on. Measured live 2026-09-06 across four open windows — six
              controls carried `active` and exposed no state at all. */}
          {(['All', ...GUIDE_CATEGORIES] as CatFilter[]).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={cat === c}
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
          {/* `aria-current`, not `aria-pressed`: opening a guide is navigation within a
              list of 19, not a toggle — nothing is "un-pressed" by choosing another. */}
          {list.map((g) => (
            <button
              key={g.id}
              type="button"
              aria-current={selected?.id === g.id ? true : undefined}
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

export type { CatFilter };

/**
 * Parses the `grammar:open-practice` deep link into practice filters. Lives
 * here rather than in `GrammarView` so Blanc can use it without importing a
 * module that pulls in `AppChrome`.
 */
export function parsePracticeDeepLink(detail: unknown): Partial<PracticeFilters> | undefined {
  if (!detail || typeof detail !== 'object') return undefined;
  const d = detail as Record<string, unknown>;
  const out: Partial<PracticeFilters> = {};
  if (d.lang === 'ja' || d.lang === 'zh' || d.lang === 'ru' || d.lang === 'all') out.lang = d.lang;
  if (typeof d.level === 'string') out.levels = [d.level as GrammarLevel];
  if (Array.isArray(d.levels)) out.levels = d.levels as GrammarLevel[];
  if (typeof d.functions === 'string') out.functions = [d.functions as GrammarFunctionId];
  if (Array.isArray(d.functions)) out.functions = d.functions as GrammarFunctionId[];
  if (typeof d.query === 'string') out.query = d.query;
  return out;
}
