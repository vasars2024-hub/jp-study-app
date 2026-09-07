import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_JITEN_DOWNLOAD_OPTIONS,
  JITEN_DOWNLOAD_TYPE_KEYS,
  JITEN_ORDER_KEYS,
  JITEN_STATUS_KEY,
  parseJitenCsvDeck,
  type JitenDeckDownloadType,
  type JitenDeckOrder,
  type JitenPlanEntry,
  type JitenStore,
} from '../../shared/jiten';
import Icon from './Icons';
import { useT } from '../i18n';
import { replaceImportedDeck } from '../flashcardDeck';

type Props = {
  initialDeckId?: number | null;
  onDeckSaved?: () => void;
};

export default function JitenMiningPanel({ initialDeckId, onDeckSaved }: Props) {
  const { t } = useT();
  const [store, setStore] = useState<JitenStore | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [minOccurrences, setMinOccurrences] = useState(DEFAULT_JITEN_DOWNLOAD_OPTIONS.minOccurrences ?? 1);
  const [maxOccurrences, setMaxOccurrences] = useState<number | null>(DEFAULT_JITEN_DOWNLOAD_OPTIONS.maxOccurrences);
  const [downloadType, setDownloadType] = useState<JitenDeckDownloadType>(DEFAULT_JITEN_DOWNLOAD_OPTIONS.downloadType);
  const [order, setOrder] = useState<JitenDeckOrder>(DEFAULT_JITEN_DOWNLOAD_OPTIONS.order);
  const [targetPercentage, setTargetPercentage] = useState(80);
  const [topWordCount, setTopWordCount] = useState(1000);
  const [excludeKana, setExcludeKana] = useState(DEFAULT_JITEN_DOWNLOAD_OPTIONS.excludeKana);
  const [excludeExampleSentences, setExcludeExampleSentences] = useState(
    DEFAULT_JITEN_DOWNLOAD_OPTIONS.excludeExampleSentences,
  );
  const [downloading, setDownloading] = useState(false);
  const [status, setStatus] = useState('');
  const [previewCount, setPreviewCount] = useState(0);

  const jitenPlans = useMemo(
    () => (store?.plan ?? []).filter((entry) => entry.jitenDeckId != null),
    [store],
  );
  const selectedEntry = useMemo(
    () => jitenPlans.find((entry) => entry.id === selectedPlanId) ?? jitenPlans[0] ?? null,
    [jitenPlans, selectedPlanId],
  );

  async function refresh(): Promise<void> {
    const next = await window.api.jitenGetStore();
    setStore(next);
    setSelectedPlanId((prev) => {
      if (prev && next.plan.some((entry) => entry.id === prev)) return prev;
      const fromPending = initialDeckId
        ? next.plan.find((entry) => entry.jitenDeckId === initialDeckId)
        : undefined;
      return fromPending?.id ?? next.plan.find((entry) => entry.jitenDeckId != null)?.id ?? '';
    });
  }

  useEffect(() => {
    void refresh();
  }, [initialDeckId]);

  async function mineDeck(entry: JitenPlanEntry): Promise<void> {
    if (!entry.jitenDeckId) return;
    setDownloading(true);
    setStatus('');
    setPreviewCount(0);
    try {
      const result = await window.api.jitenDownloadDeck(entry.jitenDeckId, {
        ...DEFAULT_JITEN_DOWNLOAD_OPTIONS,
        downloadType,
        order,
        minOccurrences,
        maxOccurrences,
        maxFrequency: downloadType === 2 || downloadType === 3 || downloadType === 4 ? topWordCount : 0,
        targetPercentage: downloadType === 5 ? targetPercentage : null,
        excludeKana,
        excludeExampleSentences,
      });
      if (!result.ok || !result.content) {
        setStatus(result.error ?? t('jiten.mining.err.noDeck'));
        return;
      }
      const cards = parseJitenCsvDeck(result.content);
      if (!cards.length) {
        setStatus(t('jiten.mining.err.noCards'));
        return;
      }
      const bookId = `jiten-${entry.jitenDeckId}`;
      const bookTitle = entry.titleJp;
      replaceImportedDeck(
        bookId,
        bookTitle,
        cards.map((card) => ({
          word: card.word,
          reading: card.reading,
          meaning: card.meaning,
          sentence: card.sentence,
          front: card.front,
          back: card.back,
          source: 'jiten' as const,
          bookId,
          bookTitle,
        })),
      );
      const updated = await window.api.jitenUpdatePlan(entry.id, {
        acquisitionStatus: 'mined',
        minedAt: Date.now(),
        error: undefined,
      });
      setStore(updated);
      setPreviewCount(cards.length);
      setStatus(t('jiten.mining.saved', { count: cards.length, title: entry.titleJp }));
      onDeckSaved?.();

      // Cache the deck's cover locally the first time it's mined, so the
      // Flashcards filing view can show it (production CSP blocks remote
      // https: <img> sources — see main.ts's registerContentSecurityPolicy).
      if (entry.coverUrl && !entry.coverCachePath) {
        void window.api.jitenCacheCover(entry.id, entry.jitenDeckId, entry.coverUrl).then((res) => {
          if (res.ok) void refresh();
        });
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="jiten-mining">
      {status && <div className="banner mining-status-top">{status}</div>}

      <section className="anki-card jiten-mining-block">
        <div className="jiten-mining-head">
          <div>
            <h2>{t('jiten.mining.title')}</h2>
            <p className="muted">{t('jiten.mining.desc')}</p>
          </div>
          <button type="button" className="btn subtle" onClick={() => void refresh()}>
            <Icon name="refresh" size={14} />
            {t('jiten.mining.refresh')}
          </button>
        </div>

        {jitenPlans.length === 0 ? (
          <p className="muted">{t('jiten.mining.empty')}</p>
        ) : (
          <>
            <div className="jiten-mining-grid">
              <label>
                {t('jiten.mining.plannedTitle')}
                <select value={selectedEntry?.id ?? ''} onChange={(e) => setSelectedPlanId(e.target.value)}>
                  {jitenPlans.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.titleJp}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('jiten.mining.deckScope')}
                <select
                  value={downloadType}
                  onChange={(e) => setDownloadType(Number(e.target.value) as JitenDeckDownloadType)}
                >
                  {Object.entries(JITEN_DOWNLOAD_TYPE_KEYS).map(([value, key]) => (
                    <option key={value} value={value}>
                      {t(key)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('jiten.mining.cardOrder')}
                <select value={order} onChange={(e) => setOrder(Number(e.target.value) as JitenDeckOrder)}>
                  {Object.entries(JITEN_ORDER_KEYS).map(([value, key]) => (
                    <option key={value} value={value}>
                      {t(key)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('jiten.mining.minOccurrences')}
                <input
                  type="number"
                  min={1}
                  value={minOccurrences}
                  onChange={(e) => setMinOccurrences(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
              <label>
                {t('jiten.mining.maxOccurrences')}
                <input
                  type="number"
                  min={0}
                  value={maxOccurrences ?? ''}
                  placeholder={t('jiten.mining.noLimit')}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setMaxOccurrences(e.target.value === '' || !Number.isFinite(n) || n <= 0 ? null : Math.floor(n));
                  }}
                />
              </label>
              {(downloadType === 2 || downloadType === 3 || downloadType === 4) && (
                <label>
                  {t('jiten.mining.topWords')}
                  <input
                    type="number"
                    min={1}
                    value={topWordCount}
                    onChange={(e) => setTopWordCount(Math.max(1, Number(e.target.value) || 1000))}
                  />
                </label>
              )}
              {downloadType === 5 && (
                <label>
                  {t('jiten.mining.targetCoverage')}
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={targetPercentage}
                    onChange={(e) => setTargetPercentage(Math.min(100, Math.max(1, Number(e.target.value) || 80)))}
                  />
                </label>
              )}
              <label className="jiten-mining-check">
                <input
                  type="checkbox"
                  checked={excludeKana}
                  onChange={(e) => setExcludeKana(e.target.checked)}
                />
                {t('jiten.mining.excludeKana')}
              </label>
              <label className="jiten-mining-check">
                <input
                  type="checkbox"
                  checked={excludeExampleSentences}
                  onChange={(e) => setExcludeExampleSentences(e.target.checked)}
                />
                {t('jiten.mining.skipExamples')}
              </label>
            </div>

            {selectedEntry && (
              <div className="jiten-mining-summary">
                <span>{selectedEntry.difficultyLabel ?? t('jiten.mining.unknownDifficulty')}</span>
                <span>{selectedEntry.tags.slice(0, 4).join(', ') || t('jiten.mining.noTags')}</span>
                {/* The status was printed as its raw wire value ("analyzed"), in
                    every language. Novels resolves the same enum through the
                    same map — see JITEN_STATUS_KEY. */}
                <span>{t(JITEN_STATUS_KEY[selectedEntry.acquisitionStatus] ?? 'novels.status.planned')}</span>
              </div>
            )}

            <div className="jiten-mining-actions">
              <button
                type="button"
                className="btn primary"
                disabled={!selectedEntry || downloading}
                onClick={() => selectedEntry && void mineDeck(selectedEntry)}
              >
                <Icon name="download" size={16} />
                {downloading ? t('jiten.mining.downloading') : t('jiten.mining.mine')}
              </button>
              {previewCount > 0 && (
                <span className="muted">{t('jiten.mining.importedCount', { count: previewCount })}</span>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
