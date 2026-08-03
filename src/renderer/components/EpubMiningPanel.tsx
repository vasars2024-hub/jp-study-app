import { useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryItem } from '../../shared/types';
import type {
  EpubDeckRow,
  EpubExportFormat,
  EpubMiningAnalysis,
  FrequencyDictionarySummary,
  MiningEnrichProgress,
  TraditionalMiningConfig,
  AiEngineConfig,
} from '../../shared/mining';
import {
  DEFAULT_TRADITIONAL_MINING_CONFIG,
  DEFAULT_EXCLUDE_NAMES,
  BUILTIN_JUNK_EXPRESSIONS,
  computeFillReport,
  mergeEnrichedCandidates,
} from '../../shared/mining';
import {
  buildEpubDeckExport,
  describeEpubFilterPipeline,
  exportDeckFileContent,
  filterEpubCandidates,
  migrateEpubCardTemplates,
} from '../../shared/epubDeck';
import { AI_PROVIDERS, providerKeyBucket } from '../../shared/aiProviders';
import { useT } from '../i18n';
import CollapsibleSection from './CollapsibleSection';
import EpubCardLayoutEditor from './EpubCardLayoutEditor';
import EpubFilterPipelinePanel from './EpubFilterPipelinePanel';
import EpubTestCard from './EpubTestCard';
import FieldHint from './FieldHint';
import { getActiveProfile } from '../profileState';
import Icon from './Icons';
import MiningProgressPanel from './MiningProgressPanel';
import { addDeckCards } from '../flashcardDeck';

const FORMAT_IDS: EpubExportFormat[] = ['anki', 'txt', 'txt-rep', 'csv', 'yomitan'];

type Props = {
  onDeckSaved?: () => void;
  initialBookId?: string;
};

function EpubStepHeader({
  step,
  title,
  lead,
  ready,
}: {
  step: number;
  title: string;
  lead: string;
  ready?: boolean;
}): JSX.Element {
  return (
    <header className={`epub-mining-step-header ${ready ? 'is-ready' : ''}`}>
      <span className="epub-mining-step-badge" aria-hidden>
        {step}
      </span>
      <div className="epub-mining-step-titles">
        <h2 className="epub-mining-step-title">{title}</h2>
        <p className="muted epub-mining-step-lead">{lead}</p>
      </div>
    </header>
  );
}

export default function EpubMiningPanel({ onDeckSaved, initialBookId }: Props) {
  const { t, lang } = useT();
  const [books, setBooks] = useState<LibraryItem[]>([]);
  const [config, setConfig] = useState<TraditionalMiningConfig>(DEFAULT_TRADITIONAL_MINING_CONFIG);
  const [freqDicts, setFreqDicts] = useState<FrequencyDictionarySummary[]>([]);
  const [freqDictsLoading, setFreqDictsLoading] = useState(true);
  const [analysis, setAnalysis] = useState<EpubMiningAnalysis | null>(null);
  const [selectedBookId, setSelectedBookId] = useState('');
  const [deckLabel, setDeckLabel] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState('');
  const [stripRows, setStripRows] = useState<EpubDeckRow[]>([]);
  const [enrichPhase, setEnrichPhase] = useState('');
  const [enrichProgress, setEnrichProgress] = useState<MiningEnrichProgress | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [aiConfig, setAiConfig] = useState<AiEngineConfig | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [qwenReady, setQwenReady] = useState<boolean | null>(null);
  // Bumped on Cancel so a late analyze result can never overwrite panel state.
  const analyzeGenRef = useRef(0);

  const exp = config.export ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export;

  const formatOptions = useMemo(
    () =>
      FORMAT_IDS.map((id) => {
        if (id === 'anki') {
          return {
            id,
            label: 'Anki',
            sub: t('epub.mining.format.anki.sub'),
            hint: t('epub.mining.format.anki.hint'),
          };
        }
        if (id === 'txt') {
          return {
            id,
            label: t('epub.mining.format.txt.label'),
            sub: t('epub.mining.format.txt.sub'),
            hint: t('epub.mining.format.txt.hint'),
          };
        }
        if (id === 'txt-rep') {
          return {
            id,
            label: t('epub.mining.format.txtRep.label'),
            sub: t('epub.mining.format.txtRep.sub'),
            hint: t('epub.mining.format.txtRep.hint'),
          };
        }
        if (id === 'csv') {
          return {
            id,
            label: t('epub.mining.format.csv.label'),
            sub: t('epub.mining.format.csv.sub'),
            hint: t('epub.mining.format.csv.hint'),
          };
        }
        return {
          id,
          label: 'Yomitan',
          sub: t('epub.mining.format.yomitan.sub'),
          hint: t('epub.mining.format.yomitan.hint'),
        };
      }),
    [t, lang],
  );

  const selectedFormat = formatOptions.find((f) => f.id === exp.format) ?? formatOptions[0];
  const jaFreqDicts = freqDicts.filter(
    (d) => !d.language || d.language === 'ja' || !d.id.startsWith('bundled-freq-'),
  );
  const otherLangFreqDicts = freqDicts.filter(
    (d) => d.language && d.language !== 'ja' && d.id.startsWith('bundled-freq-'),
  );

  const filteredCandidates = useMemo(() => {
    if (!analysis) return [];
    return filterEpubCandidates(analysis.candidates, config);
  }, [analysis, config]);

  const filterPipeline = useMemo(() => {
    if (!analysis) return null;
    return describeEpubFilterPipeline(analysis.candidates, config);
  }, [analysis, config]);

  // Pre-download verification: per-token fill counts + incomplete-card count.
  const fillReport = useMemo(() => {
    if (!analysis || !filteredCandidates.length) return null;
    return computeFillReport(filteredCandidates, config);
  }, [analysis, filteredCandidates, config]);

  const cardCount = filteredCandidates.length;
  const rangeCap = Math.max((analysis?.candidates.length ?? 1) - 1, 0);
  const displayRangeMax = exp.freqRangeMax > 0 ? Math.min(exp.freqRangeMax, rangeCap) : rangeCap;

  useEffect(() => {
    if (!filteredCandidates.length || !analysis) {
      setStripRows([]);
      return;
    }
    const deck = buildEpubDeckExport(
      { ...analysis, candidates: filteredCandidates.slice(0, 32) },
      config,
      undefined,
      { skipFilter: true },
    );
    setStripRows(deck.rows);
  }, [filteredCandidates, analysis, config]);

  const translationEngine = exp.translationEngine ?? 'qwen';
  const translationApiProvider =
    exp.translationApiProvider ?? aiConfig?.providerId ?? 'gemini-2.5-flash';
  const selectedApiProvider =
    AI_PROVIDERS.find((p) => p.id === translationApiProvider) ?? AI_PROVIDERS[0];
  const apiKeySaved = Boolean(aiConfig?.apiKeysSet?.[providerKeyBucket(translationApiProvider)]);

  useEffect(() => {
    void window.api.aiGetConfig().then(setAiConfig).catch(() => setAiConfig(null));
    void window.api.translateStatus().then((s) => setQwenReady(s.modelFound)).catch(() => setQwenReady(false));
  }, []);

  useEffect(() => {
    const unsub = window.api.onMiningEnrichProgress((payload) => {
      const labelKey =
        payload.phase === 'gloss'
          ? 'epub.mining.phase.gloss'
          : payload.phase === 'translation'
            ? 'epub.mining.phase.translation'
            : payload.phase === 'export'
              ? 'epub.mining.phase.export'
              : 'epub.mining.phase.analyzing';
      const label = t(labelKey);
      setEnrichPhase(payload.message ?? t('epub.mining.phase.progress', { label, done: payload.done, total: payload.total }));
      setEnrichProgress(payload as MiningEnrichProgress);
    });
    return unsub;
  }, [t, lang]);

  async function loadFrequencyDicts(): Promise<void> {
    setFreqDictsLoading(true);
    try {
      const dictionaries = await window.api.miningListFrequencyDicts();
      setFreqDicts(dictionaries);
    } catch (error) {
      setFreqDicts([]);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setFreqDictsLoading(false);
    }
  }

  async function refresh(): Promise<void> {
    void loadFrequencyDicts();
    try {
      const [items, miningConfig] = await Promise.all([
        window.api.listLibrary(),
        window.api.miningGetConfig(),
      ]);
      const bookItems = items.filter((item) => item.kind === 'book' && item.epubFile?.toLowerCase().endsWith('.epub'));
      setBooks(bookItems);
      const expCfg = miningConfig.export ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export;
      const migratedExport = {
        ...DEFAULT_TRADITIONAL_MINING_CONFIG.export,
        ...expCfg,
        excludeNames: {
          ...DEFAULT_EXCLUDE_NAMES,
          ...(expCfg.excludeNames ?? {}),
        },
        translationTargetLang: expCfg.translationTargetLang ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export.translationTargetLang,
        fillTranslations: expCfg.fillTranslations ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export.fillTranslations,
        translationEngine: expCfg.translationEngine ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export.translationEngine,
        translationApiProvider:
          expCfg.translationApiProvider ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export.translationApiProvider,
        translateSentences: expCfg.translateSentences ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export.translateSentences,
        ...(expCfg.freqRangeMin === 0 && expCfg.freqRangeMax === 5000 ? { freqRangeMax: 0 } : {}),
      };
      const migratedLimits = {
        ...DEFAULT_TRADITIONAL_MINING_CONFIG.limits,
        ...miningConfig.limits,
        useBuiltinJunkFilter:
          miningConfig.limits?.useBuiltinJunkFilter ??
          DEFAULT_TRADITIONAL_MINING_CONFIG.limits.useBuiltinJunkFilter,
      };
      const migratedTraditional = migrateEpubCardTemplates({
        ...miningConfig,
        limits: migratedLimits,
        export: migratedExport,
      });
      const migrated = { ...migratedTraditional, limits: migratedLimits, export: migratedExport };
      setConfig(migrated);
      if (JSON.stringify(migrated) !== JSON.stringify(miningConfig)) void window.api.miningSetConfig(migrated);
      setSelectedBookId((prev) => {
        if (initialBookId && bookItems.some((book) => book.id === initialBookId)) return initialBookId;
        return prev || bookItems[0]?.id || '';
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    void refresh();
  }, [initialBookId]);

  function persistConfig(next: TraditionalMiningConfig): void {
    setConfig(next);
    void window.api.miningSetConfig(next);
  }

  function patchExport(patch: Partial<TraditionalMiningConfig['export']>): void {
    setConfig((prev) => {
      const current = prev.export ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export;
      const next = { ...prev, export: { ...current, ...patch } };
      void window.api.miningSetConfig(next);
      return next;
    });
  }

  async function runAnalysis(): Promise<void> {
    if (!selectedBookId) return;
    const gen = ++analyzeGenRef.current;
    setAnalyzing(true);
    setStatus('');
    setWarnings([]);
    setEnrichPhase('');
    setEnrichProgress(null);
    try {
      const result = await window.api.miningAnalyzeEpub(selectedBookId, config);
      // A cancelled or superseded run must never snap the panel back.
      if (analyzeGenRef.current !== gen) return;
      setAnalysis(result);
      setDeckLabel(result.title);
      setWarnings(result.warnings ?? []);
      const glossCount = result.candidates.filter((c) => c.glosses && Object.keys(c.glosses).length).length;
      setStatus(
        t(result.cancelled ? 'epub.mining.status.partial' : 'epub.mining.status.analyzed', {
          title: result.title,
          terms: result.candidates.length,
          glossCount,
        }),
      );
    } catch (error) {
      if (analyzeGenRef.current !== gen) return;
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      if (analyzeGenRef.current === gen) {
        setAnalyzing(false);
        setEnrichPhase('');
        setEnrichProgress(null);
      }
    }
  }

  function cancelAnalysis(): void {
    analyzeGenRef.current += 1;
    void window.api.miningCancelAnalyze();
    setAnalyzing(false);
    setExporting(false);
    setEnrichPhase('');
    setEnrichProgress(null);
    setStatus(t('epub.mining.status.cancelled'));
  }

  function handleCandidateEnriched(updated: import('../../shared/mining').MiningCandidate): void {
    if (!analysis) return;
    setAnalysis({
      ...analysis,
      candidates: analysis.candidates.map((c) =>
        c.expression === updated.expression && (c.reading ?? '') === (updated.reading ?? '')
          ? updated
          : c,
      ),
    });
  }

  function saveDeckLocally(rows: EpubDeckRow[]): void {
    if (!analysis || !rows.length) return;
    addDeckCards(
      rows.map((row) => ({
        word: row.expression,
        reading: row.reading,
        meaning: '',
        sentence: row.sentence,
        front: row.front,
        back: row.back,
        source: 'epub' as const,
        bookId: analysis.itemId,
        bookTitle: deckLabel.trim() || analysis.title,
      })),
    );
  }

  function applyCardLayout(next: {
    preset: typeof exp.cardLayoutPreset;
    front: string;
    back: string;
  }): void {
    setConfig((prev) => {
      const updated = {
        ...prev,
        templates: { ...prev.templates, front: next.front, back: next.back, resetToAutomatic: false },
        export: {
          ...(prev.export ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export),
          cardLayoutPreset: next.preset,
        },
      };
      void window.api.miningSetConfig(updated);
      return updated;
    });
  }

  async function downloadDeck(): Promise<void> {
    if (!analysis || !filteredCandidates.length) return;
    setExporting(true);
    setStatus(t('epub.mining.status.preparing', { count: filteredCandidates.length }));
    setWarnings([]);
    setEnrichPhase('');
    setEnrichProgress(null);
    try {
      const result = await window.api.miningRenderEpubDeck(
        { ...analysis, candidates: filteredCandidates },
        // Exported cards are always clean: the [FS] fail-switch tags are a
        // preview-only verification aid and must never land in the Anki deck.
        {
          ...config,
          export: {
            ...(config.export ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export),
            fsMarker: false,
          },
        },
      );
      setAnalysis({
        ...analysis,
        candidates: mergeEnrichedCandidates(analysis.candidates, result.enrichedCandidates),
      });
      if (result.warnings?.length) setWarnings(result.warnings);
      if (result.cancelled) {
        setStatus(t('epub.mining.status.downloadCancelled'));
        return;
      }
      const deck = result.deck;
      const format = exp.format === 'anki' ? 'csv' : exp.format;
      const file = exportDeckFileContent(deck, format);
      const title = deckLabel.trim() || deck.title;
      const res = await window.api.miningSaveEpubDeckFile(file.content, title, file.ext);
      if (res.ok && res.path) {
        saveDeckLocally(deck.rows);
        setStatus(t('epub.mining.status.downloaded', { count: deck.cardCount, path: res.path }));
        onDeckSaved?.();
      } else if (res.error !== 'cancelled') {
        setStatus(res.error ?? t('epub.mining.status.saveFailed'));
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(false);
      setEnrichPhase('');
      setEnrichProgress(null);
    }
  }

  async function importFrequencyDictionary(): Promise<void> {
    const result = await window.api.miningImportFrequencyDict();
    if (!result.ok && result.error !== 'cancelled') {
      setStatus(result.error ?? t('epub.mining.status.importFailed'));
      return;
    }
    await refresh();
  }

  return (
    <div className="mining-studio epub-mining">
      {status && <div className="banner mining-status-top">{status}</div>}
      {warnings.map((w) => (
        <div key={w} className="banner mining-status-top mining-warning">
          {w}
        </div>
      ))}

      <section className="anki-card epub-mining-step">
        <EpubStepHeader
          step={1}
          title={t('epub.mining.step1.title')}
          lead={t('epub.mining.step1.lead')}
          ready={Boolean(selectedBookId)}
        />
        <div className="mining-form-grid mining-form-grid-wide">
          <label>
            {t('epub.mining.libraryEpub')}
            <select value={selectedBookId} onChange={(e) => setSelectedBookId(e.target.value)}>
              <option value="">{t('epub.mining.selectBook')}</option>
              {books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('epub.mining.deckLabel')}
            <input
              value={deckLabel}
              onChange={(e) => setDeckLabel(e.target.value)}
              placeholder={t('epub.mining.deckLabel.placeholder')}
            />
          </label>
        </div>
      </section>

      <section className="anki-card epub-mining-step">
        <EpubStepHeader
          step={2}
          title={t('epub.mining.step2.title')}
          lead={t('epub.mining.step2.lead')}
        />
        <div className="download-deck-section">
          <span className="download-deck-label">{t('epub.mining.format')}</span>
          <div className="download-deck-format-grid">
            {formatOptions.map((fmt) => {
              const selected = exp.format === fmt.id;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  className={`download-deck-format-tile ${selected ? 'selected' : ''}`}
                  onClick={() => patchExport({ format: fmt.id })}
                >
                  {selected && <span className="download-deck-check" aria-hidden>✓</span>}
                  <span className="download-deck-format-name">{fmt.label}</span>
                  <span className="download-deck-format-sub">{fmt.sub}</span>
                </button>
              );
            })}
            <button
              type="button"
              className="download-deck-format-tile disabled"
              disabled
              title={t('epub.mining.format.loginRequired')}
            >
              <span className="download-deck-format-name">{t('epub.mining.format.learn.label')}</span>
              <span className="download-deck-format-sub">{t('epub.mining.format.learn.sub')}</span>
            </button>
          </div>
          <div className="download-deck-info">{selectedFormat.hint}</div>
        </div>
        <div className="download-deck-section download-deck-card-layout">
          <span className="download-deck-label">{t('epub.mining.cardLayout')}</span>
          <EpubCardLayoutEditor
            preset={exp.cardLayoutPreset ?? 'ja-en'}
            front={config.templates.front}
            back={config.templates.back}
            onApply={applyCardLayout}
          />
        </div>
        <CollapsibleSection
          title={t('epub.mining.exportFormatting')}
          summary={t('epub.mining.exportFormatting.summary')}
          defaultOpen={false}
          className="mining-collapse"
        >
          <div className="download-deck-filters">
            <label>
              {t('epub.mining.fieldSeparator')}
              <select
                value={
                  exp.tokenSeparator === undefined || exp.tokenSeparator === '\n'
                    ? 'newline'
                    : exp.tokenSeparator === ' '
                      ? 'space'
                      : exp.tokenSeparator === ' — '
                        ? 'dash'
                        : exp.tokenSeparator === '<br>'
                          ? 'br'
                          : 'custom'
                }
                onChange={(e) => {
                  const v = e.target.value;
                  patchExport({
                    tokenSeparator:
                      v === 'newline' ? '\n' : v === 'space' ? ' ' : v === 'dash' ? ' — ' : v === 'br' ? '<br>' : exp.tokenSeparator ?? '\n',
                  });
                }}
              >
                <option value="newline">{t('epub.mining.sep.newline')}</option>
                <option value="space">{t('epub.mining.sep.space')}</option>
                <option value="dash">{t('epub.mining.sep.dash')}</option>
                <option value="br">{t('epub.mining.sep.br')}</option>
                <option value="custom">{t('epub.mining.sep.custom')}</option>
              </select>
            </label>
            <label>
              {t('epub.mining.customSeparator')}
              <input
                type="text"
                value={exp.tokenSeparator === '\n' ? '' : exp.tokenSeparator ?? ''}
                placeholder={t('epub.mining.customSeparator.placeholder')}
                onChange={(e) => patchExport({ tokenSeparator: e.target.value || '\n' })}
              />
            </label>
            <label>
              {t('epub.mining.csvDelimiter')}
              <select
                value={exp.csvDelimiter ?? ','}
                onChange={(e) => patchExport({ csvDelimiter: e.target.value as ',' | ';' | 'tab' })}
              >
                <option value=",">{t('epub.mining.csv.comma')}</option>
                <option value=";">{t('epub.mining.csv.semicolon')}</option>
                <option value="tab">{t('epub.mining.csv.tab')}</option>
              </select>
            </label>
            <label>
              {t('epub.mining.readingKana')}
              <select
                value={exp.readingStyle ?? 'hiragana'}
                onChange={(e) => patchExport({ readingStyle: e.target.value as 'hiragana' | 'katakana' })}
              >
                <option value="hiragana">{t('epub.mining.reading.hiragana')}</option>
                <option value="katakana">{t('epub.mining.reading.katakana')}</option>
              </select>
            </label>
          </div>
          <div className="download-deck-options">
            <label className="download-deck-option">
              <input
                type="checkbox"
                checked={exp.csvHeader !== false}
                onChange={(e) => patchExport({ csvHeader: e.target.checked })}
              />
              <span>
                <b>{t('epub.mining.csvHeader')}</b>
                <span className="muted">{t('epub.mining.csvHeader.hint')}</span>
              </span>
            </label>
            <label className="download-deck-option">
              <input
                type="checkbox"
                checked={exp.fsMarker !== false}
                onChange={(e) => patchExport({ fsMarker: e.target.checked })}
              />
              <span>
                <b>{t('epub.mining.fsMarker')}</b>
                <span className="muted">{t('epub.mining.fsMarker.hint')}</span>
              </span>
            </label>
            <label className="download-deck-option">
              <input
                type="checkbox"
                checked={Boolean(exp.excludeIncomplete)}
                onChange={(e) => patchExport({ excludeIncomplete: e.target.checked })}
              />
              <span>
                <b>{t('epub.mining.excludeIncomplete')}</b>
                <span className="muted">{t('epub.mining.excludeIncomplete.hint')}</span>
              </span>
            </label>
          </div>
        </CollapsibleSection>
      </section>

      <section className="anki-card epub-mining-step">
        <EpubStepHeader
          step={3}
          title={t('epub.mining.step3.title')}
          lead={t('epub.mining.step3.lead')}
        />
        <div className="download-deck-section">
          <span className="download-deck-label">{t('epub.mining.downloadStrategy')}</span>
          <div className="download-deck-tabs">
            <button
              type="button"
              className={`download-deck-tab ${exp.strategy === 'manual' ? 'active' : ''}`}
              onClick={() => patchExport({ strategy: 'manual' })}
            >
              {t('epub.mining.strategy.manual')}
            </button>
            <button
              type="button"
              className={`download-deck-tab ${exp.strategy === 'occurrences' ? 'active' : ''}`}
              onClick={() =>
                patchExport({
                  strategy: 'occurrences',
                  filterBy: 'term-frequency',
                  sortBy: 'deck-frequency',
                })
              }
            >
              {t('epub.mining.strategy.occurrences')}
            </button>
            <button
              type="button"
              className="download-deck-tab disabled"
              disabled
              title={t('epub.mining.format.loginRequired')}
            >
              {t('epub.mining.strategy.coverage')}
            </button>
          </div>

          {exp.strategy === 'occurrences' ? (
            <div className="download-deck-occurrence">
              <p className="muted collapse-lead">{t('epub.mining.occurrences.lead')}</p>
              <div className="download-deck-filters">
                <label>
                  {t('epub.mining.filterType')}
                  <select
                    value={exp.occurrenceFilterOp ?? 'gte'}
                    onChange={(e) =>
                      patchExport({ occurrenceFilterOp: e.target.value as typeof exp.occurrenceFilterOp })
                    }
                  >
                    <option value="gte">{t('epub.mining.op.gte')}</option>
                    <option value="lte">{t('epub.mining.op.lte')}</option>
                    <option value="eq">{t('epub.mining.op.eq')}</option>
                  </select>
                </label>
                <label>
                  {t('epub.mining.threshold')}
                  <input
                    type="number"
                    min={1}
                    value={exp.occurrenceThreshold ?? 2}
                    onChange={(e) =>
                      patchExport({
                        occurrenceThreshold: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                  />
                </label>
                <label>
                  {t('epub.mining.thenSortBy')}
                  <select
                    value={exp.sortBy}
                    onChange={(e) => patchExport({ sortBy: e.target.value as typeof exp.sortBy })}
                  >
                    <option value="deck-frequency">{t('epub.mining.sort.deckFrequency')}</option>
                    <option value="alphabetical">{t('epub.mining.sort.alphabetical')}</option>
                  </select>
                </label>
              </div>
            </div>
          ) : (
            <>
              <div className="download-deck-filters">
                <label>
                  <span className="field-label-row">
                    {t('epub.mining.filterBy')}
                    <FieldHint title={t('epub.mining.filterBy.hintTitle')}>
                      <p>
                        <b>{t('epub.mining.filterBy.hint.epubRankTitle')}</b>
                        {' — '}
                        {t('epub.mining.filterBy.hint.epubRankBody')}
                      </p>
                      <p>
                        <b>{t('epub.mining.filterBy.hint.dictRankTitle')}</b>
                        {' — '}
                        {t('epub.mining.filterBy.hint.dictRankBody')}
                      </p>
                    </FieldHint>
                  </span>
                  <select
                    value={exp.filterBy}
                    onChange={(e) => patchExport({ filterBy: e.target.value as typeof exp.filterBy })}
                  >
                    <option value="term-frequency">{t('epub.mining.filter.epubRank')}</option>
                    <option value="deck-frequency">{t('epub.mining.filter.dictRank')}</option>
                  </select>
                </label>
                <label>
                  {t('epub.mining.thenSortBy')}
                  <select
                    value={exp.sortBy}
                    onChange={(e) => patchExport({ sortBy: e.target.value as typeof exp.sortBy })}
                  >
                    <option value="deck-frequency">{t('epub.mining.sort.byFrequency')}</option>
                    <option value="alphabetical">{t('epub.mining.sort.alphabetical')}</option>
                  </select>
                </label>
              </div>

              <div className="download-deck-freq">
                <div className="download-deck-freq-head">
                  <span className="download-deck-label">
                    {exp.filterBy === 'deck-frequency'
                      ? t('epub.mining.dictRankRange')
                      : t('epub.mining.rankWindow')}
                  </span>
                  <span className="muted download-deck-freq-sub">
                    {exp.filterBy === 'deck-frequency'
                      ? t('epub.mining.dictRankRange.sub')
                      : t('epub.mining.rankWindow.sub', { rangeCap })}
                  </span>
                </div>
                <div className="download-deck-freq-row">
                  {exp.filterBy === 'term-frequency' && analysis && (
                    <div className="download-deck-slider-wrap">
                      <input
                        type="range"
                        min={0}
                        max={rangeCap}
                        step={1}
                        value={Math.min(exp.freqRangeMin, displayRangeMax)}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          const end = exp.freqRangeMax > 0 ? exp.freqRangeMax : rangeCap;
                          patchExport({ freqRangeMin: Math.min(v, end) });
                        }}
                        className="download-deck-slider download-deck-slider-min"
                        aria-label={t('a11y.slider.freqRankMin')}
                      />
                      <input
                        type="range"
                        min={0}
                        max={rangeCap}
                        step={1}
                        value={displayRangeMax}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (v >= rangeCap) patchExport({ freqRangeMax: 0 });
                          else patchExport({ freqRangeMax: Math.max(v, exp.freqRangeMin) });
                        }}
                        className="download-deck-slider download-deck-slider-max"
                        aria-label={t('a11y.slider.freqRankMax')}
                      />
                    </div>
                  )}
                  <label className="download-deck-freq-input">
                    <input
                      type="number"
                      min={0}
                      max={exp.filterBy === 'deck-frequency' ? 100000 : rangeCap}
                      value={exp.freqRangeMin}
                      onChange={(e) =>
                        patchExport({
                          freqRangeMin: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                    />
                  </label>
                  <label className="download-deck-freq-input">
                    <input
                      type="number"
                      min={0}
                      max={exp.filterBy === 'deck-frequency' ? 100000 : rangeCap}
                      value={exp.freqRangeMax > 0 ? exp.freqRangeMax : ''}
                      placeholder={
                        exp.filterBy === 'deck-frequency'
                          ? t('epub.mining.freqMax')
                          : t('epub.mining.freqAll')
                      }
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        if (!raw) patchExport({ freqRangeMax: 0 });
                        else patchExport({ freqRangeMax: Math.max(0, Number(raw) || 0) });
                      }}
                    />
                  </label>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="download-deck-section">
          <span className="download-deck-label">{t('epub.mining.wordFilters')}</span>
          <div className="download-deck-options">
            <label className="download-deck-option">
              <input
                type="checkbox"
                checked={exp.excludeKanaOnly}
                onChange={(e) => patchExport({ excludeKanaOnly: e.target.checked })}
              />
              <span>
                <b>{t('epub.mining.excludeKanaOnly')}</b>
                <span className="muted">{t('epub.mining.excludeKanaOnly.hint')}</span>
              </span>
            </label>
            <label className="download-deck-option">
              <input
                type="checkbox"
                checked={exp.excludeNames?.japanese ?? false}
                onChange={(e) =>
                  patchExport({
                    excludeNames: { ...(exp.excludeNames ?? DEFAULT_EXCLUDE_NAMES), japanese: e.target.checked },
                  })
                }
              />
              <span>
                <b>{t('epub.mining.excludeJpNames')}</b>
                <span className="muted">{t('epub.mining.excludeJpNames.hint')}</span>
              </span>
            </label>
            <label className="download-deck-option">
              <input
                type="checkbox"
                checked={exp.excludeNames?.chinese ?? false}
                onChange={(e) =>
                  patchExport({
                    excludeNames: { ...(exp.excludeNames ?? DEFAULT_EXCLUDE_NAMES), chinese: e.target.checked },
                  })
                }
              />
              <span>
                <b>{t('epub.mining.excludeZhNames')}</b>
                <span className="muted">{t('epub.mining.excludeZhNames.hint')}</span>
              </span>
            </label>
            <label className="download-deck-option">
              <input
                type="checkbox"
                checked={exp.excludeNames?.russian ?? false}
                onChange={(e) =>
                  patchExport({
                    excludeNames: { ...(exp.excludeNames ?? DEFAULT_EXCLUDE_NAMES), russian: e.target.checked },
                  })
                }
              />
              <span>
                <b>{t('epub.mining.excludeRuNames')}</b>
                <span className="muted">{t('epub.mining.excludeRuNames.hint')}</span>
              </span>
            </label>
            <label className="download-deck-option">
              <input
                type="checkbox"
                checked={exp.excludeNames?.places ?? false}
                onChange={(e) =>
                  patchExport({
                    excludeNames: { ...(exp.excludeNames ?? DEFAULT_EXCLUDE_NAMES), places: e.target.checked },
                  })
                }
              />
              <span>
                <b>{t('epub.mining.excludePlaces')}</b>
                <span className="muted">{t('epub.mining.excludePlaces.hint')}</span>
              </span>
            </label>
          </div>
        </div>

        <div className="download-deck-section">
          <span className="download-deck-label">{t('epub.mining.translation')}</span>
          <div className="download-deck-options">
            <label className="download-deck-option">
              <input
                type="checkbox"
                checked={exp.fillTranslations !== false}
                onChange={(e) => patchExport({ fillTranslations: e.target.checked })}
              />
              <span>
                <b>{t('epub.mining.fillTranslations')}</b>
                <span className="muted">{t('epub.mining.fillTranslations.hint')}</span>
              </span>
            </label>
          </div>
          {exp.fillTranslations !== false && (
            <div className="mining-translation-engine">
              <span className="download-deck-label">{t('epub.mining.failSwitch')}</span>
              <div className="mining-engine-tabs">
                <button
                  type="button"
                  className={`mining-engine-tab${translationEngine === 'qwen' ? ' active' : ''}`}
                  onClick={() => patchExport({ translationEngine: 'qwen' })}
                >
                  {t('epub.mining.engine.qwen')}
                </button>
                <button
                  type="button"
                  className={`mining-engine-tab${translationEngine === 'api' ? ' active' : ''}`}
                  onClick={() => patchExport({ translationEngine: 'api' })}
                >
                  {t('epub.mining.engine.api')}
                </button>
              </div>
              {translationEngine === 'qwen' ? (
                <p className={`muted mining-engine-status${qwenReady ? ' ok' : ' warn'}`}>
                  {qwenReady === null
                    ? t('epub.mining.qwen.checking')
                    : qwenReady
                      ? t('epub.mining.qwen.ready')
                      : t('epub.mining.qwen.missing')}
                </p>
              ) : (
                <div className="mining-api-engine-fields">
                  <label>
                    {t('epub.mining.provider')}
                    <select
                      value={translationApiProvider}
                      onChange={(e) =>
                        patchExport({
                          translationEngine: 'api',
                          translationApiProvider: e.target.value as typeof translationApiProvider,
                        })
                      }
                    >
                      {AI_PROVIDERS.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mining-api-key-field">
                    {t('epub.mining.apiKey')}
                    <input
                      type="password"
                      value={apiKeyDraft}
                      onChange={(e) => setApiKeyDraft(e.target.value)}
                      placeholder={
                        apiKeySaved
                          ? t('epub.mining.apiKey.replace')
                          : t('epub.mining.apiKey.paste', { provider: selectedApiProvider.label })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="btn subtle"
                    disabled={savingApiKey || !apiKeyDraft.trim()}
                    onClick={() => {
                      setSavingApiKey(true);
                      void window.api
                        .aiSetApiKey({
                          provider: providerKeyBucket(translationApiProvider),
                          apiKey: apiKeyDraft.trim(),
                        })
                        .then((result) => {
                          if (result.ok) {
                            setApiKeyDraft('');
                            setAiConfig((prev) =>
                              prev
                                ? { ...prev, apiKeysSet: result.apiKeysSet, apiKeySet: result.apiKeySet }
                                : prev,
                            );
                          }
                        })
                        .finally(() => setSavingApiKey(false));
                    }}
                  >
                    {savingApiKey ? t('epub.mining.savingKey') : t('epub.mining.saveKey')}
                  </button>
                  <p className={`muted mining-engine-status${apiKeySaved ? ' ok' : ' warn'}`}>
                    {apiKeySaved
                      ? t('epub.mining.apiKey.saved', { provider: selectedApiProvider.label })
                      : t('epub.mining.apiKey.need', { provider: selectedApiProvider.label })}
                  </p>
                </div>
              )}
            </div>
          )}
          <div className="download-deck-options">
            <label className="download-deck-option">
              <input
                type="checkbox"
                checked={Boolean(exp.translateSentences)}
                onChange={(e) => patchExport({ translateSentences: e.target.checked })}
              />
              <span>
                <b>{t('epub.mining.translateSentences')}</b>
                <span className="muted">{t('epub.mining.translateSentences.hint')}</span>
              </span>
            </label>
          </div>
        </div>
      </section>

      <section className="anki-card epub-mining-step">
        <EpubStepHeader
          step={4}
          title={t('epub.mining.step4.title')}
          lead={t('epub.mining.step4.lead')}
          ready={Boolean(analysis)}
        />
        <div className="actions">
          <button
            className="btn primary"
            type="button"
            disabled={analyzing || !selectedBookId}
            onClick={() => void runAnalysis()}
          >
            {analyzing
              ? enrichPhase || t('epub.mining.analyzing')
              : analysis
                ? t('epub.mining.reanalyze')
                : t('epub.mining.analyze')}
          </button>
          {analyzing && (
            <button type="button" className="btn subtle" onClick={cancelAnalysis}>
              {t('common.cancel')}
            </button>
          )}
        </div>
        {(analyzing || exporting) && (
          <MiningProgressPanel
            progress={enrichProgress}
            active={Boolean(enrichProgress && enrichProgress.total > 0)}
          />
        )}
        {!selectedBookId && <p className="muted epub-mining-step-note">{t('epub.mining.note.selectBook')}</p>}
        {selectedBookId && !analysis && !analyzing && (
          <p className="muted epub-mining-step-note">{t('epub.mining.note.runAnalyze')}</p>
        )}

        <CollapsibleSection
          title={t('epub.mining.analysisSettings')}
          summary={t('epub.mining.analysisSettings.summary')}
          defaultOpen={false}
          className="mining-collapse"
        >
          <p className="muted collapse-lead">{t('epub.mining.analysisSettings.lead')}</p>
          {exp.strategy === 'occurrences' && (
            <p className="muted collapse-lead">{t('epub.mining.occurrences.minFreqNote')}</p>
          )}
          <div className="mining-form-grid mining-form-grid-wide">
            <label>
              {t('epub.mining.analyzer')}
              <select
                value={config.analyzer}
                onChange={(e) => void persistConfig({ ...config, analyzer: e.target.value as TraditionalMiningConfig['analyzer'] })}
              >
                <option value="kuromoji">{t('epub.mining.analyzer.kuromoji')}</option>
                <option value="simple">{t('epub.mining.analyzer.simple')}</option>
              </select>
            </label>
            {exp.strategy !== 'occurrences' && (
              <label>
                {t('epub.mining.minFrequency')}
                <input
                  type="number"
                  min={1}
                  value={config.limits.minFrequency}
                  onChange={(e) =>
                    void persistConfig({
                      ...config,
                      limits: { ...config.limits, minFrequency: Math.max(1, Number(e.target.value) || 1) },
                    })
                  }
                />
              </label>
            )}
            <label>
              {t('epub.mining.maxCommonRank')}
              <input
                type="number"
                min={0}
                value={config.limits.maxCommonRank}
                onChange={(e) =>
                  void persistConfig({
                    ...config,
                    limits: { ...config.limits, maxCommonRank: Math.max(0, Number(e.target.value) || 0) },
                  })
                }
              />
            </label>
          </div>
          {exp.filterBy === 'deck-frequency' && config.limits.maxCommonRank > 0 && (
            <p className="muted collapse-lead">{t('epub.mining.maxCommonRank.ignored')}</p>
          )}
          <label className="field-row anki-check">
            <input
              type="checkbox"
              checked={config.limits.useBuiltinJunkFilter !== false}
              onChange={(e) =>
                void persistConfig({
                  ...config,
                  limits: { ...config.limits, useBuiltinJunkFilter: e.target.checked },
                })
              }
            />
            <span>
              <b>{t('epub.mining.junkFilter')}</b>
              <span className="muted">
                {t('epub.mining.junkFilter.hint', { count: BUILTIN_JUNK_EXPRESSIONS.size })}
              </span>
            </span>
          </label>
          <label className="field-row">
            <span>{t('epub.mining.customBlacklist')}</span>
            <textarea
              value={config.limits.blacklist.join('\n')}
              onChange={(e) =>
                void persistConfig({
                  ...config,
                  limits: {
                    ...config.limits,
                    blacklist: e.target.value.split(/\r?\n|,/).map((token) => token.trim()).filter(Boolean),
                  },
                })
              }
              rows={3}
              placeholder={t('epub.mining.customBlacklist.placeholder')}
              lang={getActiveProfile().targetLang}
            />
          </label>
          <div className="mining-freq-list">
            <p className="muted collapse-lead">{t('epub.mining.freqLists.lead')}</p>
            {freqDictsLoading && <p className="muted">{t('epub.mining.freqLists.loading')}</p>}
            {!freqDictsLoading && freqDicts.length === 0 && (
              <p className="muted">{t('epub.mining.freqLists.empty')}</p>
            )}
            {!freqDictsLoading &&
              jaFreqDicts.map((dict) => (
                <div key={dict.id} className="mining-freq-row">
                  <label className="anki-check">
                    <input
                      type="checkbox"
                      checked={dict.enabled}
                      onChange={(e) =>
                        void window.api.miningSetFrequencyEnabled(dict.id, e.target.checked).then(() => refresh())
                      }
                    />
                    <span>
                      <b>{dict.label}</b>{' '}
                      <span className="muted">
                        · {t('epub.mining.freqLists.entries', { count: dict.entryCount })}
                      </span>
                    </span>
                  </label>
                </div>
              ))}
            {!freqDictsLoading && otherLangFreqDicts.length > 0 && (
              <CollapsibleSection
                title={t('epub.mining.freqLists.otherLangs')}
                summary={t('epub.mining.freqLists.otherLangs.summary', { count: otherLangFreqDicts.length })}
                defaultOpen={false}
                className="mining-collapse nested-collapse"
              >
                {otherLangFreqDicts.map((dict) => (
                  <div key={dict.id} className="mining-freq-row">
                    <label className="anki-check">
                      <input
                        type="checkbox"
                        checked={dict.enabled}
                        onChange={(e) =>
                          void window.api.miningSetFrequencyEnabled(dict.id, e.target.checked).then(() => refresh())
                        }
                      />
                      <span>
                        <b>{dict.label}</b>{' '}
                        <span className="muted">
                          · {t('epub.mining.freqLists.entries', { count: dict.entryCount })}
                        </span>
                      </span>
                    </label>
                  </div>
                ))}
              </CollapsibleSection>
            )}
            <button type="button" className="btn subtle" onClick={() => void importFrequencyDictionary()}>
              {t('epub.mining.importFreqDict')}
            </button>
          </div>
        </CollapsibleSection>
      </section>

      <section className={`anki-card epub-mining-step epub-mining-step-final ${analysis ? 'is-ready' : ''}`}>
        <EpubStepHeader
          step={5}
          title={t('epub.mining.step5.title')}
          lead={t('epub.mining.step5.lead')}
          ready={Boolean(analysis && cardCount)}
        />

        {fillReport && (
          <div className="download-deck-section">
            <span className="download-deck-label">{t('epub.mining.fillReport')}</span>
            {exp.fillTranslations !== false && (
              <p className="muted collapse-lead">{t('epub.mining.fillReport.lead')}</p>
            )}
            <ul className="epub-fill-report">
              {fillReport.tokens.map((tok) => {
                const filled = tok.total - tok.missing;
                const parts: string[] = [];
                if (tok.dict > 0) parts.push(t('epub.mining.fill.dictionary', { count: tok.dict }));
                if (tok.api > 0) parts.push(t('epub.mining.fill.api', { count: tok.api }));
                if (tok.qwen > 0) parts.push(t('epub.mining.fill.qwen', { count: tok.qwen }));
                if (tok.mined > 0) parts.push(t('epub.mining.fill.mined', { count: tok.mined }));
                return (
                  <li key={tok.token} className={tok.missing > 0 ? 'has-missing' : 'complete'}>
                    <code>{`{${tok.token}}`}</code>
                    <span>
                      {t('epub.mining.fill.filled', { filled, total: tok.total })}
                      {parts.length ? ` (${parts.join(' · ')})` : ''}
                      {tok.missing > 0 ? ` · ${t('epub.mining.fill.missing', { count: tok.missing })}` : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
            {fillReport.incompleteCount > 0 && (
              <p className="muted collapse-lead">
                {exp.excludeIncomplete
                  ? t('epub.mining.fill.incompleteExcluded', {
                      incomplete: fillReport.incompleteCount,
                      total: fillReport.totalCards,
                    })
                  : t('epub.mining.fill.incompleteHint', {
                      incomplete: fillReport.incompleteCount,
                      total: fillReport.totalCards,
                    })}
              </p>
            )}
          </div>
        )}

        {analysis && filteredCandidates.length > 0 && filterPipeline && (
          <EpubFilterPipelinePanel breakdown={filterPipeline} className="mining-collapse" />
        )}

        {analysis && filteredCandidates.length > 0 && (
          <EpubTestCard
            candidates={filteredCandidates}
            config={config}
            onCandidateUpdated={handleCandidateEnriched}
          />
        )}

        {filteredCandidates.length > 0 && (
          <div className="flash-strip-section">
            <div className="flash-strip-head">
              <span className="flash-section-title">{t('epub.mining.deckPreview')}</span>
              <span className="muted">{t('epub.mining.deckPreview.first', { count: stripRows.length })}</span>
            </div>
            <div className="flash-strip" role="list">
              {stripRows.map((row) => (
                <article key={row.expression + row.sentence.slice(0, 16)} className="flash-strip-card" role="listitem">
                  <span className="flash-strip-word" lang="ja">
                    {row.front.split('\n')[0]?.slice(0, 32) || row.expression}
                  </span>
                  {row.front.includes('\n') && (
                    <span className="flash-strip-reading" lang="ja">
                      {row.front.split('\n').slice(1).join(' ').slice(0, 32)}
                    </span>
                  )}
                  <span className="flash-strip-meaning">{row.back.split('\n')[0]?.slice(0, 48) || '—'}</span>
                </article>
              ))}
            </div>
          </div>
        )}

        <div className="download-deck-footer">
          {(exporting || analyzing) && (
            <MiningProgressPanel
              progress={enrichProgress}
              active={Boolean(enrichProgress && enrichProgress.total > 0)}
              compact
            />
          )}
          <span className="download-deck-result">
            {t('epub.mining.result')}{' '}
            <b>
              {analysis
                ? exp.excludeIncomplete && fillReport
                  ? cardCount - fillReport.incompleteCount
                  : cardCount
                : '—'}
            </b>{' '}
            {t('epub.mining.result.cards')}
            {analysis && (
              <span className="muted">
                {' '}
                · {t('epub.mining.result.termsMined', { count: analysis.candidates.length })}
              </span>
            )}
          </span>
          <button
            className="btn primary download-deck-btn"
            type="button"
            disabled={!analysis || !cardCount || exporting || analyzing}
            onClick={() => void downloadDeck()}
          >
            <Icon name="download" size={16} />
            {exporting ? enrichPhase || t('epub.mining.preparingDeck') : t('epub.mining.downloadDeck')}
          </button>
          {exporting && (
            <button type="button" className="btn subtle" onClick={cancelAnalysis}>
              {t('common.cancel')}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
