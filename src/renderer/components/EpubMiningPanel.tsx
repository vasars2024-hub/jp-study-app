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
  buildEpubDeckExport,
  BUILTIN_JUNK_EXPRESSIONS,
  computeFillReport,
  describeEpubFilterPipeline,
  exportDeckFileContent,
  filterEpubCandidates,
  mergeEnrichedCandidates,
  migrateEpubCardTemplates,
} from '../../shared/mining';
import { AI_PROVIDERS, providerKeyBucket } from '../../shared/aiProviders';
import CollapsibleSection from './CollapsibleSection';
import EpubCardLayoutEditor from './EpubCardLayoutEditor';
import EpubFilterPipelinePanel from './EpubFilterPipelinePanel';
import EpubTestCard from './EpubTestCard';
import FieldHint from './FieldHint';
import { getActiveProfile } from '../profileState';
import Icon from './Icons';
import MiningProgressPanel from './MiningProgressPanel';
import { addDeckCards } from '../flashcardDeck';

const FORMAT_OPTIONS: Array<{
  id: EpubExportFormat;
  label: string;
  sub: string;
  disabled?: boolean;
  hint: string;
}> = [
  {
    id: 'anki',
    label: 'Anki',
    sub: 'Anki deck (.csv)',
    hint: 'Generates a CSV with Expression, Front, and Back columns for Anki import.',
  },
  {
    id: 'txt',
    label: 'Text',
    sub: 'Vocabulary List (.txt)',
    hint: 'Plain list of mined expressions, one per line.',
  },
  {
    id: 'txt-rep',
    label: 'Text (Rep)',
    sub: 'Repeated vocab (.txt)',
    hint: 'Tab-separated expression, reading, and example sentence.',
  },
  {
    id: 'csv',
    label: 'CSV',
    sub: 'Spreadsheet',
    hint: 'Expression, Front, and Back columns for spreadsheets or other tools.',
  },
  {
    id: 'yomitan',
    label: 'Yomitan',
    sub: 'Occurrences dic (.json)',
    hint: 'JSON map of expressions to reading and sample sentence for Yomitan-style tools.',
  },
];

type Props = {
  onDeckSaved?: () => void;
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

export default function EpubMiningPanel({ onDeckSaved }: Props) {
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
  const selectedFormat = FORMAT_OPTIONS.find((f) => f.id === exp.format) ?? FORMAT_OPTIONS[0];
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
      const label =
        payload.phase === 'gloss'
          ? 'Resolving definitions'
          : payload.phase === 'translation'
            ? 'Translating'
            : payload.phase === 'export'
              ? 'Building deck'
              : 'Analyzing';
      setEnrichPhase(payload.message ?? `${label}… ${payload.done}/${payload.total}`);
      setEnrichProgress(payload as MiningEnrichProgress);
    });
    return unsub;
  }, []);

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
      const exp = miningConfig.export ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export;
      const migratedExport = {
        ...DEFAULT_TRADITIONAL_MINING_CONFIG.export,
        ...exp,
        excludeNames: {
          ...DEFAULT_EXCLUDE_NAMES,
          ...(exp.excludeNames ?? {}),
        },
        translationTargetLang: exp.translationTargetLang ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export.translationTargetLang,
        fillTranslations: exp.fillTranslations ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export.fillTranslations,
        translationEngine: exp.translationEngine ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export.translationEngine,
        translationApiProvider:
          exp.translationApiProvider ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export.translationApiProvider,
        translateSentences: exp.translateSentences ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export.translateSentences,
        ...(exp.freqRangeMin === 0 && exp.freqRangeMax === 5000 ? { freqRangeMax: 0 } : {}),
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
      setSelectedBookId((prev) => prev || bookItems[0]?.id || '');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

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
        `${result.cancelled ? 'Partially analyzed (cancelled)' : 'Analyzed'} ${result.title}: ` +
          `${result.candidates.length} unique terms (${glossCount} with dictionary definitions). ` +
          'Adjust filters, then download — Qwen runs only on the export set.',
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
    setStatus('Cancelled.');
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
    setStatus(`Preparing ${filteredCandidates.length} cards…`);
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
        setStatus('Download cancelled — any dictionary-filled fields were kept.');
        return;
      }
      const deck = result.deck;
      const format = exp.format === 'anki' ? 'csv' : exp.format;
      const file = exportDeckFileContent(deck, format);
      const title = deckLabel.trim() || deck.title;
      const res = await window.api.miningSaveEpubDeckFile(file.content, title, file.ext);
      if (res.ok && res.path) {
        saveDeckLocally(deck.rows);
        setStatus(
          `Downloaded ${deck.cardCount} cards → ${res.path}. Saved to EPUB decks overview.`,
        );
        onDeckSaved?.();
      } else if (res.error !== 'cancelled') {
        setStatus(res.error ?? 'Could not save deck file.');
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
      setStatus(result.error ?? 'Could not import frequency dictionary.');
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
          title="Choose EPUB"
          lead="Select a library book and name the deck file."
          ready={Boolean(selectedBookId)}
        />
        <div className="mining-form-grid mining-form-grid-wide">
          <label>
            Library EPUB
            <select value={selectedBookId} onChange={(e) => setSelectedBookId(e.target.value)}>
              <option value="">Select a library book…</option>
              {books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Deck label
            <input
              value={deckLabel}
              onChange={(e) => setDeckLabel(e.target.value)}
              placeholder="Filename and deck explorer group name"
            />
          </label>
        </div>
      </section>

      <section className="anki-card epub-mining-step">
        <EpubStepHeader
          step={2}
          title="Card layout & format"
          lead="Pick export format and front/back fields. Dictionary languages follow your template."
        />
        <div className="download-deck-section">
          <span className="download-deck-label">Format</span>
          <div className="download-deck-format-grid">
            {FORMAT_OPTIONS.map((fmt) => {
              const selected = exp.format === fmt.id;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  className={`download-deck-format-tile ${selected ? 'selected' : ''}`}
                  disabled={fmt.disabled}
                  onClick={() => patchExport({ format: fmt.id })}
                >
                  {selected && <span className="download-deck-check" aria-hidden>✓</span>}
                  <span className="download-deck-format-name">{fmt.label}</span>
                  <span className="download-deck-format-sub">{fmt.sub}</span>
                </button>
              );
            })}
            <button type="button" className="download-deck-format-tile disabled" disabled title="Login required">
              <span className="download-deck-format-name">Learn</span>
              <span className="download-deck-format-sub">Bulk vocabulary update (Login required)</span>
            </button>
          </div>
          <div className="download-deck-info">{selectedFormat.hint}</div>
        </div>
        <div className="download-deck-section download-deck-card-layout">
          <span className="download-deck-label">Card layout</span>
          <EpubCardLayoutEditor
            preset={exp.cardLayoutPreset ?? 'ja-en'}
            front={config.templates.front}
            back={config.templates.back}
            onApply={applyCardLayout}
          />
        </div>
        <CollapsibleSection
          title="Export formatting"
          summary="Separators, reading style, CSV options"
          defaultOpen={false}
          className="mining-collapse"
        >
          <div className="download-deck-filters">
            <label>
              Field separator
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
                <option value="newline">New line</option>
                <option value="space">Space</option>
                <option value="dash">Dash ( — )</option>
                <option value="br">HTML &lt;br&gt;</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label>
              Custom separator
              <input
                type="text"
                value={exp.tokenSeparator === '\n' ? '' : exp.tokenSeparator ?? ''}
                placeholder="e.g. ' | '"
                onChange={(e) => patchExport({ tokenSeparator: e.target.value || '\n' })}
              />
            </label>
            <label>
              CSV delimiter
              <select
                value={exp.csvDelimiter ?? ','}
                onChange={(e) => patchExport({ csvDelimiter: e.target.value as ',' | ';' | 'tab' })}
              >
                <option value=",">Comma (,)</option>
                <option value=";">Semicolon (;)</option>
                <option value="tab">Tab</option>
              </select>
            </label>
            <label>
              Reading kana
              <select
                value={exp.readingStyle ?? 'hiragana'}
                onChange={(e) => patchExport({ readingStyle: e.target.value as 'hiragana' | 'katakana' })}
              >
                <option value="hiragana">ひらがな (hiragana)</option>
                <option value="katakana">カタカナ (katakana)</option>
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
                <b>CSV header row</b>
                <span className="muted">Include the Expression / Front / Back header line.</span>
              </span>
            </label>
            <label className="download-deck-option">
              <input
                type="checkbox"
                checked={exp.fsMarker !== false}
                onChange={(e) => patchExport({ fsMarker: e.target.checked })}
              />
              <span>
                <b>Mark fail-switch values in preview</b>
                <span className="muted">Shows [FS] on Qwen-filled fields in the review step only.</span>
              </span>
            </label>
            <label className="download-deck-option">
              <input
                type="checkbox"
                checked={Boolean(exp.excludeIncomplete)}
                onChange={(e) => patchExport({ excludeIncomplete: e.target.checked })}
              />
              <span>
                <b>Exclude incomplete cards</b>
                <span className="muted">Skips cards that still have unfilled template fields.</span>
              </span>
            </label>
          </div>
        </CollapsibleSection>
      </section>

      <section className="anki-card epub-mining-step">
        <EpubStepHeader
          step={3}
          title="Filters & translation"
          lead="Narrow the deck and choose translation behavior. Updates live after analyze — no re-run needed."
        />
        <div className="download-deck-section">
          <span className="download-deck-label">Download strategy</span>
          <div className="download-deck-tabs">
            <button
              type="button"
              className={`download-deck-tab ${exp.strategy === 'manual' ? 'active' : ''}`}
              onClick={() => patchExport({ strategy: 'manual' })}
            >
              Manual
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
              Occurrences
            </button>
            <button type="button" className="download-deck-tab disabled" disabled title="Login required">
              Coverage % (Login req.)
            </button>
          </div>

          {exp.strategy === 'occurrences' ? (
            <div className="download-deck-occurrence">
              <p className="muted collapse-lead">
                Filter words by how many times they appear in this EPUB.
              </p>
              <div className="download-deck-filters">
                <label>
                  Filter type
                  <select
                    value={exp.occurrenceFilterOp ?? 'gte'}
                    onChange={(e) =>
                      patchExport({ occurrenceFilterOp: e.target.value as typeof exp.occurrenceFilterOp })
                    }
                  >
                    <option value="gte">Over or equal to (≥)</option>
                    <option value="lte">Under or equal to (≤)</option>
                    <option value="eq">Exactly (=)</option>
                  </select>
                </label>
                <label>
                  Threshold
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
                  Then sort by
                  <select
                    value={exp.sortBy}
                    onChange={(e) => patchExport({ sortBy: e.target.value as typeof exp.sortBy })}
                  >
                    <option value="deck-frequency">Deck frequency</option>
                    <option value="alphabetical">Alphabetical</option>
                  </select>
                </label>
              </div>
            </div>
          ) : (
            <>
              <div className="download-deck-filters">
                <label>
                  <span className="field-label-row">
                    Filter by
                    <FieldHint title="Filter by">
                      <p>
                        <b>EPUB rank window</b> — sorts words by how often they appear in{' '}
                        <em>this book</em>, then keeps a slice of that list. Example: ranks 0–500
                        are the 500 most repeated terms in the EPUB. Best when you want vocabulary
                        that is actually prominent in the novel you are reading.
                      </p>
                      <p>
                        <b>Dictionary rank</b> — uses general Japanese frequency data (bundled
                        lists / Yomitan). Lower rank means a more common word in the language
                        overall. The min–max range keeps only terms in that band; words with no
                        frequency entry are dropped. Best when you want a JLPT-style common-word
                        deck regardless of how rare a word was in this specific book.
                      </p>
                    </FieldHint>
                  </span>
                  <select
                    value={exp.filterBy}
                    onChange={(e) => patchExport({ filterBy: e.target.value as typeof exp.filterBy })}
                  >
                    <option value="term-frequency">EPUB rank window</option>
                    <option value="deck-frequency">Dictionary rank</option>
                  </select>
                </label>
                <label>
                  Then sort by
                  <select
                    value={exp.sortBy}
                    onChange={(e) => patchExport({ sortBy: e.target.value as typeof exp.sortBy })}
                  >
                    <option value="deck-frequency">By frequency</option>
                    <option value="alphabetical">Alphabetical</option>
                  </select>
                </label>
              </div>

              <div className="download-deck-freq">
                <div className="download-deck-freq-head">
                  <span className="download-deck-label">
                    {exp.filterBy === 'deck-frequency' ? 'Dictionary rank range' : 'Rank window'}
                  </span>
                  <span className="muted download-deck-freq-sub">
                    {exp.filterBy === 'deck-frequency'
                      ? 'Keep terms whose dictionary rank falls in this range. Stacks after Minimum frequency.'
                      : `Sorted position in book (0–${rangeCap}). End blank = all terms.`}
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
                      placeholder={exp.filterBy === 'deck-frequency' ? 'Max' : 'All'}
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
          <span className="download-deck-label">Word filters</span>
          <div className="download-deck-options">
            <label className="download-deck-option">
              <input
                type="checkbox"
                checked={exp.excludeKanaOnly}
                onChange={(e) => patchExport({ excludeKanaOnly: e.target.checked })}
              />
              <span>
                <b>Exclude kana-only words</b>
                <span className="muted">Removes words that have no kanji (e.g. こころ, それでも, …).</span>
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
                <b>Exclude 日本人名</b>
                <span className="muted">Japanese personal names (kuromoji 人名 / 固有名詞).</span>
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
                <b>Exclude 中文名</b>
                <span className="muted">
                  Chinese names as they appear in Japanese text — katakana spellings like リュウ, リン.
                </span>
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
                <b>Exclude русские имена</b>
                <span className="muted">
                  Russian names as they appear in Japanese text — katakana spellings like イワン, …スキー.
                </span>
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
                <b>Exclude 地名</b>
                <span className="muted">Place names (kuromoji 地域).</span>
              </span>
            </label>
          </div>
        </div>

        <div className="download-deck-section">
          <span className="download-deck-label">Translation</span>
          <div className="download-deck-options">
            <label className="download-deck-option">
              <input
                type="checkbox"
                checked={exp.fillTranslations !== false}
                onChange={(e) => patchExport({ fillTranslations: e.target.checked })}
              />
              <span>
                <b>Fill translations on download</b>
                <span className="muted">
                  Dictionary first — only gaps go to the fail-switch engine below.
                </span>
              </span>
            </label>
          </div>
          {exp.fillTranslations !== false && (
            <div className="mining-translation-engine">
              <span className="download-deck-label">Fail-switch engine</span>
              <div className="mining-engine-tabs">
                <button
                  type="button"
                  className={`mining-engine-tab${translationEngine === 'qwen' ? ' active' : ''}`}
                  onClick={() => patchExport({ translationEngine: 'qwen' })}
                >
                  Offline Qwen3
                </button>
                <button
                  type="button"
                  className={`mining-engine-tab${translationEngine === 'api' ? ' active' : ''}`}
                  onClick={() => patchExport({ translationEngine: 'api' })}
                >
                  Cloud API
                </button>
              </div>
              {translationEngine === 'qwen' ? (
                <p className={`muted mining-engine-status${qwenReady ? ' ok' : ' warn'}`}>
                  {qwenReady === null
                    ? 'Checking local Qwen model…'
                    : qwenReady
                      ? 'Qwen3 model found — runs locally, no API key needed.'
                      : 'Qwen3 model not found. Place Qwen3-1.7B.gguf in Downloads or install via Translate view.'}
                </p>
              ) : (
                <div className="mining-api-engine-fields">
                  <label>
                    Provider
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
                    API key
                    <input
                      type="password"
                      value={apiKeyDraft}
                      onChange={(e) => setApiKeyDraft(e.target.value)}
                      placeholder={apiKeySaved ? 'Replace saved key…' : `Paste ${selectedApiProvider.label} key`}
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
                    {savingApiKey ? 'Saving…' : 'Save key'}
                  </button>
                  <p className={`muted mining-engine-status${apiKeySaved ? ' ok' : ' warn'}`}>
                    {apiKeySaved
                      ? `${selectedApiProvider.label} key saved — faster than local Qwen for large decks.`
                      : `Save a ${selectedApiProvider.label} key to use cloud translation.`}
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
                <b>Translate context sentences</b>
                <span className="muted">Slow — enables {'{sentence-translation:*}'} variables.</span>
              </span>
            </label>
          </div>
        </div>
      </section>

      <section className="anki-card epub-mining-step">
        <EpubStepHeader
          step={4}
          title="Analyze EPUB"
          lead="Tokenize the book and resolve dictionary glosses. Fast — Qwen runs only on download."
          ready={Boolean(analysis)}
        />
        <div className="actions">
          <button
            className="btn primary"
            type="button"
            disabled={analyzing || !selectedBookId}
            onClick={() => void runAnalysis()}
          >
            {analyzing ? enrichPhase || 'Analyzing…' : analysis ? 'Re-analyze EPUB' : 'Analyze EPUB'}
          </button>
          {analyzing && (
            <button type="button" className="btn subtle" onClick={cancelAnalysis}>
              Cancel
            </button>
          )}
        </div>
        {(analyzing || exporting) && (
          <MiningProgressPanel
            progress={enrichProgress}
            active={Boolean(enrichProgress && enrichProgress.total > 0)}
          />
        )}
        {!selectedBookId && <p className="muted epub-mining-step-note">Select a library EPUB in step 1.</p>}
        {selectedBookId && !analysis && !analyzing && (
          <p className="muted epub-mining-step-note">Run analyze to see the fill report and download.</p>
        )}

        <CollapsibleSection
          title="Analysis settings"
          summary="Tokenizer, cutoffs, blacklist, frequency dictionaries"
          defaultOpen={false}
          className="mining-collapse"
        >
          <p className="muted collapse-lead">
            These apply when you <b>Analyze</b> or <b>Re-analyze EPUB</b>. Re-analyze after changing them.
          </p>
          {exp.strategy === 'occurrences' && (
            <p className="muted collapse-lead">
              Minimum frequency is not used for Occurrences export filtering — use Threshold in step 3
              instead. Minimum frequency still applies during analysis.
            </p>
          )}
          <div className="mining-form-grid mining-form-grid-wide">
            <label>
              Analyzer
              <select
                value={config.analyzer}
                onChange={(e) => void persistConfig({ ...config, analyzer: e.target.value as TraditionalMiningConfig['analyzer'] })}
              >
                <option value="kuromoji">Japanese lemma tokenizer</option>
                <option value="simple">Simple word tokenizer</option>
              </select>
            </label>
            {exp.strategy !== 'occurrences' && (
              <label>
                Minimum frequency
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
              Max common-rank cutoff
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
            <p className="muted collapse-lead">
              Max common-rank cutoff is ignored while Dictionary rank filtering is selected.
            </p>
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
              <b>Built-in junk filter</b>
              <span className="muted">
                Drops copula, auxiliaries, demonstratives, fillers, and one-mora kana during analyze
                (Jiten/JL-style — POS + lemma rules). {BUILTIN_JUNK_EXPRESSIONS.size} expressions.
              </span>
            </span>
          </label>
          <label className="field-row">
            <span>Custom blacklist</span>
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
              placeholder="One expression per line — merged with built-in junk when enabled"
              lang={getActiveProfile().targetLang}
            />
          </label>
          <div className="mining-freq-list">
            <p className="muted collapse-lead">
              Bundled and imported frequency lists for dictionary-rank filtering and sorting.
            </p>
            {freqDictsLoading && <p className="muted">Loading frequency dictionaries…</p>}
            {!freqDictsLoading && freqDicts.length === 0 && (
              <p className="muted">No frequency dictionaries loaded.</p>
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
                      <b>{dict.label}</b> <span className="muted">· {dict.entryCount} entries</span>
                    </span>
                  </label>
                </div>
              ))}
            {!freqDictsLoading && otherLangFreqDicts.length > 0 && (
              <CollapsibleSection
                title="Other language lists"
                summary={`${otherLangFreqDicts.length} optional (Chinese, Russian)`}
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
                        <b>{dict.label}</b> <span className="muted">· {dict.entryCount} entries</span>
                      </span>
                    </label>
                  </div>
                ))}
              </CollapsibleSection>
            )}
            <button type="button" className="btn subtle" onClick={() => void importFrequencyDictionary()}>
              Import frequency dictionary
            </button>
          </div>
        </CollapsibleSection>
      </section>

      <section className={`anki-card epub-mining-step epub-mining-step-final ${analysis ? 'is-ready' : ''}`}>
        <EpubStepHeader
          step={5}
          title="Review & download"
          lead="Check fill coverage, preview cards, then export the filtered deck."
          ready={Boolean(analysis && cardCount)}
        />

        {fillReport && (
          <div className="download-deck-section">
            <span className="download-deck-label">Fill report</span>
            {exp.fillTranslations !== false && (
              <p className="muted collapse-lead">
                Per-field counts from analyze (dictionary glosses). On download, those slots skip Qwen;
                only gaps are translated — the button progress uses the same dictionary total.
              </p>
            )}
            <ul className="epub-fill-report">
              {fillReport.tokens.map((t) => {
                const filled = t.total - t.missing;
                const parts: string[] = [];
                if (t.dict > 0) parts.push(`${t.dict} dictionary`);
                if (t.api > 0) parts.push(`${t.api} API`);
                if (t.qwen > 0) parts.push(`${t.qwen} Qwen FS`);
                if (t.mined > 0) parts.push(`${t.mined} mined`);
                return (
                  <li key={t.token} className={t.missing > 0 ? 'has-missing' : 'complete'}>
                    <code>{`{${t.token}}`}</code>
                    <span>
                      {filled}/{t.total} filled
                      {parts.length ? ` (${parts.join(' · ')})` : ''}
                      {t.missing > 0 ? ` · ${t.missing} missing` : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
            {fillReport.incompleteCount > 0 && (
              <p className="muted collapse-lead">
                {fillReport.incompleteCount} of {fillReport.totalCards} cards have unfilled fields
                {exp.excludeIncomplete ? ' and will be excluded from the export.' : '. Enable “Exclude incomplete cards” in step 2 to skip them.'}
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
              <span className="flash-section-title">Deck preview</span>
              <span className="muted">{`First ${stripRows.length} cards`}</span>
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
            Result: approx{' '}
            <b>
              {analysis
                ? exp.excludeIncomplete && fillReport
                  ? cardCount - fillReport.incompleteCount
                  : cardCount
                : '—'}
            </b>{' '}
            cards
            {analysis && (
              <span className="muted"> · {analysis.candidates.length} terms mined</span>
            )}
          </span>
          <button
            className="btn primary download-deck-btn"
            type="button"
            disabled={!analysis || !cardCount || exporting || analyzing}
            onClick={() => void downloadDeck()}
          >
            <Icon name="download" size={16} />
            {exporting ? enrichPhase || 'Preparing deck…' : 'Download Deck'}
          </button>
          {exporting && (
            <button type="button" className="btn subtle" onClick={cancelAnalysis}>
              Cancel
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
