import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryItem } from '../../shared/types';
import type {
  EpubDeckRow,
  EpubMiningAnalysis,
  FrequencyDictionarySummary,
  MiningEnrichProgress,
} from '../../shared/mining';
import {
  buildEpubDeckExport,
  describeEpubFilterPipeline,
  filterEpubCandidates,
  mergeEnrichedCandidates,
} from '../../shared/mining';
import { buildSimpleEpubConfig, type SimpleEpubFilterMode } from '../../shared/simpleEpubMining';
import { useT } from '../i18n';
import EpubFilterPipelinePanel from './EpubFilterPipelinePanel';
import Icon from './Icons';
import MiningProgressPanel from './MiningProgressPanel';
import { addDeckCards } from '../flashcardDeck';

type Props = {
  onDeckSaved?: () => void;
  initialBookId?: string;
};

export default function EpubMiningSimplePanel({ onDeckSaved, initialBookId }: Props) {
  const { t } = useT();
  const [books, setBooks] = useState<LibraryItem[]>([]);
  const [selectedBookId, setSelectedBookId] = useState('');
  const [deckLabel, setDeckLabel] = useState('');
  const [filterMode, setFilterMode] = useState<SimpleEpubFilterMode>('book');
  const [freqMin, setFreqMin] = useState(0);
  const [freqMax, setFreqMax] = useState(0);
  const [minOccurrences, setMinOccurrences] = useState(1);
  const [excludeKanaOnly, setExcludeKanaOnly] = useState(true);
  const [analysis, setAnalysis] = useState<EpubMiningAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState('');
  const [enrichProgress, setEnrichProgress] = useState<MiningEnrichProgress | null>(null);
  const [freqDicts, setFreqDicts] = useState<FrequencyDictionarySummary[]>([]);
  const analyzeGenRef = useRef(0);

  const config = useMemo(
    () =>
      buildSimpleEpubConfig(filterMode, {
        freqMin,
        freqMax,
        minOccurrences,
        excludeKanaOnly,
      }),
    [filterMode, freqMin, freqMax, minOccurrences, excludeKanaOnly],
  );

  const filteredCandidates = useMemo(() => {
    if (!analysis) return [];
    return filterEpubCandidates(analysis.candidates, config);
  }, [analysis, config]);

  const filterPipeline = useMemo(() => {
    if (!analysis) return null;
    return describeEpubFilterPipeline(analysis.candidates, config);
  }, [analysis, config]);

  const rangeCap = Math.max((analysis?.candidates.length ?? 1) - 1, 0);
  const enabledJaFreqDicts = useMemo(
    () =>
      freqDicts.filter(
        (dict) =>
          dict.enabled && (!dict.language || dict.language === 'ja' || !dict.id.startsWith('bundled-freq-')),
      ),
    [freqDicts],
  );

  const rankedCandidateCount = useMemo(
    () => analysis?.candidates.filter((candidate) => candidate.frequencies.primary != null).length ?? 0,
    [analysis],
  );

  const rankedRange = useMemo(() => {
    if (!analysis) return null;
    const ranks = analysis.candidates
      .map((candidate) => candidate.frequencies.primary)
      .filter((rank): rank is number => rank != null)
      .sort((a, b) => a - b);
    if (!ranks.length) return null;
    return { min: ranks[0], max: ranks[ranks.length - 1] };
  }, [analysis]);

  const persistMinFrequency = useCallback(async (next: number): Promise<void> => {
    const cfg = await window.api.miningGetConfig();
    await window.api.miningSetConfig({
      ...cfg,
      limits: { ...cfg.limits, minFrequency: next },
    });
  }, []);

  useEffect(() => {
    void window.api.listLibrary().then((items) => {
      const bookItems = items.filter((item) => item.kind === 'book' && item.epubFile?.toLowerCase().endsWith('.epub'));
      setBooks(bookItems);
      setSelectedBookId((prev) => {
        if (initialBookId && bookItems.some((book) => book.id === initialBookId)) return initialBookId;
        return prev || bookItems[0]?.id || '';
      });
    });
    void window.api.miningListFrequencyDicts().then(setFreqDicts);
    void window.api.miningGetConfig().then((cfg) => {
      setMinOccurrences(Math.max(1, cfg.limits.minFrequency || 1));
    });
  }, [initialBookId]);

  useEffect(() => {
    const unsub = window.api.onMiningEnrichProgress((p) => setEnrichProgress(p as MiningEnrichProgress));
    return unsub;
  }, []);

  function updateMinOccurrences(raw: number): void {
    const next = Math.max(1, raw || 1);
    setMinOccurrences(next);
    void persistMinFrequency(next);
  }

  async function runAnalysis(): Promise<void> {
    if (!selectedBookId) return;
    const gen = ++analyzeGenRef.current;
    setAnalyzing(true);
    setStatus('');
    try {
      const result = await window.api.miningAnalyzeEpub(selectedBookId, config);
      if (analyzeGenRef.current !== gen) return;
      setAnalysis(result);
      setDeckLabel(result.title);
      const pipeline = describeEpubFilterPipeline(result.candidates, config);
      setStatus(t('epub.mining.simple.status.ready', { count: pipeline.final }));
    } catch (error) {
      if (analyzeGenRef.current !== gen) return;
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      if (analyzeGenRef.current === gen) {
        setAnalyzing(false);
        setEnrichProgress(null);
      }
    }
  }

  function saveLocally(rows: EpubDeckRow[]): void {
    if (!analysis || !rows.length) return;
    addDeckCards(
      rows.map((row) => ({
        word: row.expression,
        reading: row.reading,
        meaning: row.back.split('\n')[0]?.trim() || '',
        sentence: row.sentence,
        front: row.front,
        back: row.back,
        source: 'epub' as const,
        bookId: analysis.itemId,
        bookTitle: deckLabel.trim() || analysis.title,
      })),
    );
    onDeckSaved?.();
  }

  async function downloadDeck(): Promise<void> {
    if (!analysis || !filteredCandidates.length) return;
    setExporting(true);
    setStatus(t('epub.mining.simple.status.building'));
    try {
      const result = await window.api.miningRenderEpubDeck(
        { ...analysis, candidates: filteredCandidates },
        config,
      );
      setAnalysis({
        ...analysis,
        candidates: mergeEnrichedCandidates(analysis.candidates, result.enrichedCandidates),
      });
      const deck = buildEpubDeckExport(
        { ...analysis, candidates: result.enrichedCandidates },
        config,
        undefined,
        { skipFilter: true },
      );
      saveLocally(deck.rows);
      const safe = (deckLabel.trim() || analysis.title).replace(/[^\w -]+/g, '').trim() || 'deck';
      const res = await window.api.miningSaveEpubDeckFile(deck.csv, safe, 'csv');
      if (res.ok && res.path) {
        setStatus(t('epub.mining.simple.status.saved', { count: deck.cardCount, path: res.path }));
      } else if (res.error !== 'cancelled') {
        setStatus(t('epub.mining.simple.status.imported', { count: deck.cardCount }));
      } else {
        setStatus(t('epub.mining.simple.status.imported', { count: deck.cardCount }));
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(false);
      setEnrichProgress(null);
    }
  }

  return (
    <div className="epub-mining-simple">
      {status && <div className="banner mining-status-top">{status}</div>}

      <section className="anki-card epub-simple-block">
        <h2 className="epub-simple-title">{t('epub.mining.simple.step1')}</h2>
        <div className="epub-simple-fields">
          <label>
            {t('epub.mining.simple.epub')}
            <select
              className="epub-simple-input"
              value={selectedBookId}
              onChange={(e) => setSelectedBookId(e.target.value)}
            >
              <option value="">{t('epub.mining.simple.selectBook')}</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('epub.mining.simple.deckName')}
            <input
              className="epub-simple-input"
              value={deckLabel}
              onChange={(e) => setDeckLabel(e.target.value)}
              placeholder={t('epub.mining.simple.deckName.placeholder')}
            />
          </label>
        </div>
      </section>

      <section className="anki-card epub-simple-block">
        <h2 className="epub-simple-title">{t('epub.mining.simple.step2')}</h2>
        <p className="muted epub-simple-lead">{t('epub.mining.simple.lead')}</p>
        <p className="muted epub-simple-lead">{t('epub.mining.simple.sharedFreq')}</p>
        <div className="epub-simple-filter-tabs">
          <button
            type="button"
            className={`epub-simple-filter-tab${filterMode === 'book' ? ' active' : ''}`}
            onClick={() => setFilterMode('book')}
          >
            {t('epub.mining.simple.filter.book')}
          </button>
          <button
            type="button"
            className={`epub-simple-filter-tab${filterMode === 'dictionary' ? ' active' : ''}`}
            onClick={() => setFilterMode('dictionary')}
          >
            {t('epub.mining.simple.filter.dict')}
          </button>
        </div>
        <div className="epub-simple-controls">
          <label>
            {t('epub.mining.simple.minFrequency')}
            <input
              className="epub-simple-input"
              type="number"
              min={1}
              value={minOccurrences}
              onChange={(e) => updateMinOccurrences(Number(e.target.value) || 1)}
            />
          </label>
          {filterMode === 'book' ? (
            <>
              <label>
                {t('epub.mining.simple.rankStart')}
                <input
                  className="epub-simple-input"
                  type="number"
                  min={0}
                  max={rangeCap}
                  value={freqMin}
                  onChange={(e) => setFreqMin(Math.max(0, Number(e.target.value) || 0))}
                  disabled={!analysis}
                />
              </label>
              <label>
                {t('epub.mining.simple.rankEnd')}
                <input
                  className="epub-simple-input"
                  type="number"
                  min={0}
                  max={rangeCap}
                  value={freqMax}
                  onChange={(e) => setFreqMax(Math.max(0, Number(e.target.value) || 0))}
                  disabled={!analysis}
                />
              </label>
            </>
          ) : (
            <>
              <label>
                {t('epub.mining.simple.dictFrom')}
                <input
                  className="epub-simple-input"
                  type="number"
                  min={0}
                  value={freqMin}
                  onChange={(e) => setFreqMin(Math.max(0, Number(e.target.value) || 0))}
                />
              </label>
              <label>
                {t('epub.mining.simple.dictTo')}
                <input
                  className="epub-simple-input"
                  type="number"
                  min={0}
                  value={freqMax}
                  onChange={(e) => setFreqMax(Math.max(0, Number(e.target.value) || 0))}
                />
              </label>
            </>
          )}
        </div>
        <label className="epub-simple-check">
          <input
            type="checkbox"
            checked={excludeKanaOnly}
            onChange={(e) => setExcludeKanaOnly(e.target.checked)}
          />
          <span>{t('epub.mining.simple.excludeKana')}</span>
        </label>
        {analysis && (
          <>
            <p className="epub-simple-count">
              <b>{filteredCandidates.length}</b> {t('epub.mining.simple.cardsSelectedSuffix', { count: filteredCandidates.length })}
            </p>
            {filterPipeline && <EpubFilterPipelinePanel breakdown={filterPipeline} />}
            {filterMode === 'dictionary' && enabledJaFreqDicts.length === 0 && (
              <p className="muted epub-simple-hint">{t('epub.mining.simple.hint.needFreqList')}</p>
            )}
            {filterMode === 'dictionary' && enabledJaFreqDicts.length > 0 && rankedCandidateCount === 0 && (
              <p className="muted epub-simple-hint">{t('epub.mining.simple.hint.noRankMatches')}</p>
            )}
            {filterMode === 'dictionary' &&
              enabledJaFreqDicts.length > 0 &&
              rankedCandidateCount > 0 &&
              filteredCandidates.length === 0 &&
              rankedRange && (
                <p className="muted epub-simple-hint">
                  {t('epub.mining.simple.hint.rankRange', { min: rankedRange.min, max: rankedRange.max })}
                </p>
              )}
          </>
        )}
      </section>

      <section className="anki-card epub-simple-block epub-simple-actions-block">
        <h2 className="epub-simple-title">{t('epub.mining.simple.step3')}</h2>
        <p className="muted epub-simple-card-preview">{t('epub.mining.simple.cardPreview')}</p>
        {(analyzing || exporting) && enrichProgress && (
          <MiningProgressPanel progress={enrichProgress} />
        )}
        <div className="epub-simple-actions">
          <button
            type="button"
            className="btn primary epub-simple-btn"
            disabled={!selectedBookId || analyzing}
            onClick={() => void runAnalysis()}
          >
            {analyzing
              ? t('epub.mining.simple.analyzing')
              : analysis
                ? t('epub.mining.simple.reanalyze')
                : t('epub.mining.simple.analyze')}
          </button>
          <button
            type="button"
            className="btn primary epub-simple-btn"
            disabled={!analysis || !filteredCandidates.length || exporting}
            onClick={() => void downloadDeck()}
          >
            <Icon name="download" size={18} />
            {exporting ? t('epub.mining.simple.saving') : t('epub.mining.simple.save')}
          </button>
        </div>
      </section>
    </div>
  );
}
