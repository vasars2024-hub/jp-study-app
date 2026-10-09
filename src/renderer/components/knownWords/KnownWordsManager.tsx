/**
 * The known-words store as something a learner can manage in bulk (kw2).
 *
 * Until this, the only ways to change a word's level were one word at a time —
 * the popup's four grade buttons, the reader, a card review — or an Anki sync
 * that overwrites everything it touches except hand-set words. A learner coming
 * from another app with 6,000 known words, or one whose sync marked a deck of
 * leeches "familiar", had no way to act on the store as a whole. This is that:
 * filter by level, source (by hand / automatic) and level list, search, select,
 * set or hand back to automatic grading in one write; import a list (plain text,
 * CSV, an Anki notes export); export; and see how much of the most frequent
 * vocabulary the store covers, when a frequency corpus is installed.
 *
 * Words are study content and are shown as stored, never translated.
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useT } from '../../i18n';
import {
  bulkClearManual,
  bulkSetLevels,
  importKnownWords,
  listKnowledgeEntries,
  onKnowledgeChanged,
  type WkLevel,
} from '../../knownWords';
import {
  DEFAULT_KNOWLEDGE_FILTER,
  exportKnowledgeRows,
  filterKnowledgeRows,
  frequencyCoverage,
  knowledgeRowStats,
  parseKnownWordsImport,
  type CoverageBand,
  type KnowledgeFilter,
  type KnowledgeLevelFilter,
  type KnowledgeSourceFilter,
} from '../../knownWordsBulk';
import { levelListWordKeys, loadLevelLists, onLevelListsChanged } from '../../levelLists';
import { getStudyLang, onStudyLangChanged, studyContentLang } from '../../studyEnvironment';
import { gradeKeyFor } from '../../studyTokens';
import { tokenizeSync, tokenizerReady } from '../../tokenizer';
import { MAX_FREQUENCY_BATCH } from '../../../shared/lexiconFrequency';
import type { StudyLang } from '../../../shared/studyLang';
import { KNOWLEDGE_LEVEL_KEYS } from '../lexicon/WordKnowledge';
import './knownWordsManager.css';

/** Rows rendered per page; the store can hold tens of thousands. */
const PAGE = 200;

/**
 * The store key an imported word is filed under — the key the reader looks it up
 * by. Japanese: the dictionary form when kuromoji reads the entry as ONE word
 * (食べた → 食べる); a compound or an unbuilt tokenizer keeps the entry as written.
 * Russian: the graded form or shared stem (`gradeKeyFor`). Chinese: as written.
 */
function importKeyFor(word: string, lang: StudyLang): string {
  if (lang === 'ru') return gradeKeyFor(word, 'ru');
  if (lang !== 'ja' || !tokenizerReady()) return word;
  try {
    const tokens = tokenizeSync(word).filter((token) => token.surface.trim());
    const content = tokens.filter((token) => token.content);
    if (content.length === 1 && tokens.length <= 2 && content[0].lemma) return content[0].lemma;
  } catch {
    /* keep the word as written */
  }
  return word;
}

function saveTextFile(fileName: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function measureCoverage(words: string[], lang: StudyLang): Promise<Record<string, number> | null> {
  const api = window.api?.dictFrequencyRanks;
  if (typeof api !== 'function') return null;
  const ranks: Record<string, number> = {};
  for (let i = 0; i < words.length; i += MAX_FREQUENCY_BATCH) {
    Object.assign(ranks, await api(words.slice(i, i + MAX_FREQUENCY_BATCH), { sourceLangs: [lang] }));
  }
  return ranks;
}

const LEVEL_FILTERS: ReadonlyArray<[KnowledgeLevelFilter, string]> = [
  ['all', 'kw2.filter.levelAll'],
  ['known', 'lexicon.knowledge.known'],
  ['familiar', 'lexicon.knowledge.familiar'],
  ['learning', 'lexicon.knowledge.learning'],
  ['pinnedNew', 'kw2.filter.pinnedNew'],
];

const SOURCE_FILTERS: ReadonlyArray<[KnowledgeSourceFilter, string]> = [
  ['all', 'kw2.filter.sourceAll'],
  ['manual', 'kw2.source.manual'],
  ['auto', 'kw2.source.auto'],
];

const SET_LEVELS: ReadonlyArray<WkLevel> = [3, 2, 1, 0];

export default function KnownWordsManager() {
  const { t, lang: uiLang } = useT();
  const [studyLang, setStudyLang] = useState<StudyLang>(getStudyLang);
  const [tick, setTick] = useState(0);
  const [listsTick, setListsTick] = useState(0);
  const [filter, setFilter] = useState<KnowledgeFilter>(DEFAULT_KNOWLEDGE_FILTER);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [shown, setShown] = useState(PAGE);
  const [message, setMessage] = useState('');
  const [importText, setImportText] = useState('');
  const [importLevel, setImportLevel] = useState<1 | 2 | 3>(3);
  const [coverage, setCoverage] = useState<{ state: 'idle' | 'measuring' | 'done' | 'none'; bands: CoverageBand[] }>({
    state: 'idle',
    bands: [],
  });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => onKnowledgeChanged(() => setTick((n) => n + 1)), []);
  useEffect(() => onStudyLangChanged((next) => {
    setStudyLang(next);
    setSelected(new Set());
  }), []);
  useEffect(() => onLevelListsChanged(() => setListsTick((n) => n + 1)), []);

  // `tick` is the knowledge subscription: re-read the store after any write.
  const rows = useMemo(() => listKnowledgeEntries(), [tick, studyLang]);
  const lists = useMemo(() => loadLevelLists(), [listsTick]);
  const listKeys = useMemo(
    () => new Map(lists.map((list) => [list.id, levelListWordKeys(list)] as const)),
    [lists],
  );
  const filtered = useMemo(() => filterKnowledgeRows(rows, filter, listKeys), [rows, filter, listKeys]);
  const stats = useMemo(() => knowledgeRowStats(rows), [rows]);
  const contentLang = studyContentLang(studyLang);
  const number = (value: number): string => value.toLocaleString(uiLang);

  // Coverage of the most frequent words, measured once per study language and
  // re-measured when the known set changes size (not on every single grade).
  const knownCount = stats.known + stats.familiar;
  useEffect(() => {
    let alive = true;
    const words = rows.filter((row) => row.level >= 2).map((row) => row.word);
    setCoverage({ state: 'measuring', bands: [] });
    void measureCoverage(words, studyLang)
      .then((ranks) => {
        if (!alive) return;
        // No rank for any known word: either no corpus is installed or none of the
        // words are on it. Neither is "0% coverage", so nothing is charted.
        const bands = ranks ? frequencyCoverage(rows, ranks) : null;
        setCoverage(bands ? { state: 'done', bands } : { state: 'none', bands: [] });
      })
      .catch(() => {
        if (alive) setCoverage({ state: 'none', bands: [] });
      });
    return () => {
      alive = false;
    };
    // `rows` is read for the measurement, but the effect is keyed on what changes it.
  }, [knownCount, studyLang]);

  const update = (patch: Partial<KnowledgeFilter>): void => {
    setFilter((prev) => ({ ...prev, ...patch }));
    setShown(PAGE);
  };

  const toggle = (word: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(word)) next.delete(word);
      else next.add(word);
      return next;
    });
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((row) => selected.has(row.word));
  const toggleAll = (): void => {
    setSelected(allFilteredSelected ? new Set() : new Set(filtered.map((row) => row.word)));
  };

  const applyLevel = (level: WkLevel): void => {
    const changed = bulkSetLevels([...selected], level);
    setMessage(t('kw2.bulk.setDone', { count: changed, level: t(KNOWLEDGE_LEVEL_KEYS[level]) }));
  };

  const resetAuto = (): void => {
    const changed = bulkClearManual([...selected]);
    setMessage(t('kw2.bulk.resetDone', { count: changed }));
  };

  const runImport = (raw: string): void => {
    const words = parseKnownWordsImport(raw).map((word) => importKeyFor(word, studyLang));
    if (!words.length) {
      setMessage(t('kw2.import.empty'));
      return;
    }
    const result = importKnownWords(words, importLevel);
    setMessage(t('kw2.import.done', { added: result.added, raised: result.raised, kept: result.kept }));
    setImportText('');
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      runImport(await file.text());
    } catch {
      setMessage(t('kw2.import.readFailed'));
    }
  };

  const exportAs = (format: 'txt' | 'csv'): void => {
    const text = exportKnowledgeRows(filtered, format);
    saveTextFile(
      `known-words-${studyLang}.${format}`,
      text,
      format === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8',
    );
    setMessage(t('kw2.export.done', { count: filtered.length }));
  };

  return (
    <section className="kw2-manager" aria-label={t('kw2.title')}>
      <h3>{t('kw2.title')}</h3>

      <ul className="kw2-stats" aria-label={t('kw2.stats.label')}>
        <li><b>{number(stats.known)}</b> {t('lexicon.knowledge.known')}</li>
        <li><b>{number(stats.familiar)}</b> {t('lexicon.knowledge.familiar')}</li>
        <li><b>{number(stats.learning)}</b> {t('lexicon.knowledge.learning')}</li>
        <li><b>{number(stats.pinnedNew)}</b> {t('kw2.filter.pinnedNew')}</li>
        <li><b>{number(stats.manual)}</b> {t('kw2.source.manual')}</li>
        <li><b>{number(stats.auto)}</b> {t('kw2.source.auto')}</li>
      </ul>

      <div className="kw2-coverage">
        <h4>{t('kw2.coverage.title')}</h4>
        {coverage.state === 'measuring' && <p className="muted" role="status">{t('kw2.coverage.measuring')}</p>}
        {coverage.state === 'none' && <p className="muted">{t('kw2.coverage.none')}</p>}
        {coverage.state === 'done' && (
          <ul className="kw2-coverage-bands">
            {coverage.bands.map((band) => {
              const pct = Math.round(band.share * 100);
              const label = t('kw2.coverage.band', { band: number(band.band) });
              return (
                <li key={band.band}>
                  <span className="kw2-coverage-label">{label}</span>
                  <span
                    className="kw2-coverage-bar"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                    aria-label={t('kw2.coverage.aria', { band: number(band.band), pct, known: number(band.known) })}
                  >
                    <span className="kw2-coverage-fill" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="kw2-coverage-pct">
                    {band.share.toLocaleString(uiLang, { style: 'percent', maximumFractionDigits: 0 })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {coverage.state === 'done' && <p className="muted kw2-note">{t('kw2.coverage.note')}</p>}
      </div>

      <div className="kw2-filters">
        <input
          type="search"
          value={filter.search}
          aria-label={t('kw2.filter.search')}
          placeholder={t('kw2.filter.search')}
          lang={contentLang}
          onChange={(e) => update({ search: e.target.value })}
        />
        <select
          aria-label={t('kw2.filter.level')}
          value={filter.level}
          onChange={(e) => update({ level: e.target.value as KnowledgeLevelFilter })}
        >
          {LEVEL_FILTERS.map(([value, key]) => (
            <option key={value} value={value}>{t(key)}</option>
          ))}
        </select>
        <select
          aria-label={t('kw2.filter.source')}
          value={filter.source}
          onChange={(e) => update({ source: e.target.value as KnowledgeSourceFilter })}
        >
          {SOURCE_FILTERS.map(([value, key]) => (
            <option key={value} value={value}>{t(key)}</option>
          ))}
        </select>
        {lists.length > 0 && (
          <select aria-label={t('kw2.filter.list')} value={filter.list} onChange={(e) => update({ list: e.target.value })}>
            <option value="all">{t('kw2.filter.listAll')}</option>
            {lists.map((list) => (
              <option key={list.id} value={list.id}>{list.label}</option>
            ))}
            <option value="none">{t('kw2.filter.listNone')}</option>
          </select>
        )}
      </div>

      <div className="kw2-bulk" role="group" aria-label={t('kw2.bulk.label')}>
        <label className="kw2-select-all">
          <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} disabled={!filtered.length} />
          {t('kw2.bulk.selectAll', { count: filtered.length })}
        </label>
        <span className="muted">{t('kw2.bulk.selected', { count: selected.size })}</span>
        {SET_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            className="btn small"
            disabled={!selected.size}
            onClick={() => applyLevel(level)}
          >
            {t('kw2.bulk.setTo', { level: t(KNOWLEDGE_LEVEL_KEYS[level]) })}
          </button>
        ))}
        <button type="button" className="btn small" disabled={!selected.size} onClick={resetAuto} title={t('final.knownWords.resetAutoTitle')}>
          {t('kw2.bulk.resetAuto')}
        </button>
        <button type="button" className="btn small" disabled={!selected.size} onClick={() => setSelected(new Set())}>
          {t('kw2.bulk.clearSelection')}
        </button>
      </div>

      {message && <p className="kw2-message" role="status">{message}</p>}

      {filtered.length === 0 ? (
        <p className="muted">{rows.length ? t('kw2.list.noMatch') : t('kw2.list.empty')}</p>
      ) : (
        <ul className="kw2-list" aria-label={t('kw2.list.label', { count: filtered.length })}>
          {filtered.slice(0, shown).map((row) => (
            <li key={row.word} className="kw2-row">
              <label>
                <input type="checkbox" checked={selected.has(row.word)} onChange={() => toggle(row.word)} />
                <span className="kw2-word" lang={contentLang}>{row.word}</span>
              </label>
              <span className={`kw2-level wk-g-${row.level}`}>{t(KNOWLEDGE_LEVEL_KEYS[row.level])}</span>
              <span className="kw2-source muted">{row.manual ? t('kw2.source.manual') : t('kw2.source.auto')}</span>
            </li>
          ))}
        </ul>
      )}
      {filtered.length > shown && (
        <button type="button" className="btn small" onClick={() => setShown((n) => n + PAGE)}>
          {t('kw2.list.showMore', { count: Math.min(PAGE, filtered.length - shown) })}
        </button>
      )}

      <div className="kw2-io">
        <h4>{t('kw2.import.title')}</h4>
        <p className="muted kw2-note">{t('kw2.import.hint')}</p>
        <textarea
          rows={4}
          value={importText}
          lang={contentLang}
          aria-label={t('kw2.import.paste')}
          placeholder={t('kw2.import.paste')}
          onChange={(e) => setImportText(e.target.value)}
        />
        <div className="kw2-io-row">
          <select
            aria-label={t('kw2.import.level')}
            value={importLevel}
            onChange={(e) => setImportLevel(Number(e.target.value) as 1 | 2 | 3)}
          >
            {([3, 2, 1] as const).map((level) => (
              <option key={level} value={level}>{t(KNOWLEDGE_LEVEL_KEYS[level])}</option>
            ))}
          </select>
          <button type="button" className="btn small primary" disabled={!importText.trim()} onClick={() => runImport(importText)}>
            {t('kw2.import.run')}
          </button>
          <button type="button" className="btn small" onClick={() => fileRef.current?.click()}>
            {t('kw2.import.file')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.csv,.tsv,text/plain,text/csv"
            hidden
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => void onFile(e)}
          />
        </div>
        <h4>{t('kw2.export.title')}</h4>
        <div className="kw2-io-row">
          <button type="button" className="btn small" disabled={!filtered.length} onClick={() => exportAs('txt')}>
            {t('kw2.export.txt', { count: filtered.length })}
          </button>
          <button type="button" className="btn small" disabled={!filtered.length} onClick={() => exportAs('csv')}>
            {t('kw2.export.csv', { count: filtered.length })}
          </button>
        </div>
      </div>
    </section>
  );
}
