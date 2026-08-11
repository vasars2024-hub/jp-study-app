import { useEffect, useRef, useState } from 'react';
import type { LibraryItem } from '../../../shared/types';
import {
  buildReadingDiscoveryLearnerContext,
  startReadingDiscovery,
  type ReadingDiscoveryResult,
  type ReadingDiscoverySearch,
  type ReadingDiscoverySnapshot,
} from '../../../shared/readingDiscovery';
import { normalizeReadingWorkspaceLibrary } from '../../../shared/readingWorkspace';
import { NOVELS } from '../../data/novels';
import type { ReadingSite } from '../../data/readingSites';
import {
  createReadingDiscoveryProviders,
  readingDiscoveryCoverUrl,
} from '../../readingDiscoveryProviders';
import { useT } from '../../i18n';
import Icon from '../Icons';
import './readingUnifiedDiscovery.css';

export interface ReadingUnifiedDiscoveryProps {
  query: string;
  sites: readonly ReadingSite[];
  onOpenBook: (item: LibraryItem) => void;
  onSelectSite: (site: ReadingSite) => void;
}

function actionLabelKey(result: ReadingDiscoveryResult): string {
  if (result.action.type === 'inspect-site') return 'reading.openSite';
  if (result.action.type === 'open-external') return 'novels.action.openSource';
  if (result.action.type === 'open-plan') return 'novels.action.plan';
  return 'common.open';
}

export default function ReadingUnifiedDiscovery({
  query,
  sites,
  onOpenBook,
  onSelectSite,
}: ReadingUnifiedDiscoveryProps) {
  const { t } = useT();
  const activeRef = useRef<ReadingDiscoverySearch | null>(null);
  const generationRef = useRef(0);
  const [snapshot, setSnapshot] = useState<ReadingDiscoverySnapshot | null>(null);
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [preparing, setPreparing] = useState(false);

  useEffect(() => () => {
    generationRef.current += 1;
    activeRef.current?.cancel();
  }, []);
  useEffect(() => {
    if (query.trim() === submittedQuery) return;
    generationRef.current += 1;
    activeRef.current?.cancel();
    activeRef.current = null;
    setPreparing(false);
    setSnapshot(null);
    setSubmittedQuery('');
  }, [query, submittedQuery]);

  const run = async () => {
    const nextQuery = query.trim();
    if (!nextQuery) return;
    activeRef.current?.cancel();
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setPreparing(true);
    setSubmittedQuery(nextQuery);
    const libraryLoad = Promise.resolve(window.api.listLibrary?.() ?? []);
    const libraryPayload = await libraryLoad.catch(() => []);
    if (generationRef.current !== generation) return;
    const learnerContext = buildReadingDiscoveryLearnerContext(
      normalizeReadingWorkspaceLibrary(libraryPayload),
    );
    const providers = createReadingDiscoveryProviders({
      sites,
      novels: NOVELS,
      listLibrary: () => libraryLoad,
      searchJiten: (value) => window.api.jitenSearchDecks({
        query: value,
        mediaTypes: [4, 8],
        limit: 50,
        sortBy: 'difficulty',
      }),
    });
    const search = startReadingDiscovery(nextQuery, providers, {
      learnerContext,
      onSnapshot: setSnapshot,
    });
    activeRef.current = search;
    setPreparing(false);
    void search.completion.finally(() => {
      if (activeRef.current === search) activeRef.current = null;
    });
  };

  const cancel = () => {
    generationRef.current += 1;
    setPreparing(false);
    activeRef.current?.cancel();
  };

  const act = async (result: ReadingDiscoveryResult) => {
    if (result.action.type === 'inspect-site') {
      const site = sites.find((candidate) => candidate.id === result.action.siteId);
      if (site) onSelectSite(site);
      return;
    }
    if (result.action.type === 'open-external') {
      await window.api.openExternal(result.action.url);
      return;
    }
    if (result.action.type === 'open-plan') {
      window.dispatchEvent(new CustomEvent('os:open', { detail: 'novels' }));
      return;
    }
    const items = await Promise.resolve(window.api.listLibrary?.() ?? []);
    const item = Array.isArray(items)
      ? items.find((candidate: LibraryItem) => candidate.id === result.action.itemId)
      : undefined;
    if (item) onOpenBook(item);
  };

  const statusKey = snapshot
    ? `unifiedSearch.status.${snapshot.status}`
    : 'unifiedSearch.status.idle';
  const running = preparing || snapshot?.status === 'running';

  return (
    <section className="reading-unified-discovery" aria-label={t('unifiedSearch.title')}>
      <header className="reading-unified-head">
        <div>
          <h2>{t('unifiedSearch.title')}</h2>
          <p className="muted" aria-live="polite">{t(statusKey)}</p>
        </div>
        <div className="reading-unified-actions">
          {snapshot ? (
            <span className="muted">
              {t('unifiedSearch.resultCount', { count: snapshot.results.length })}
            </span>
          ) : null}
          {running ? (
            <button
              type="button"
              className="btn subtle"
              onClick={cancel}
            >
              {t('common.cancel')}
            </button>
          ) : (
            <button type="button" className="btn primary" disabled={!query.trim()} onClick={() => void run()}>
              <Icon name="search" size={14} />
              {t('unifiedSearch.searchButton')}
            </button>
          )}
        </div>
      </header>

      {snapshot ? (
        <div
          className="reading-unified-provider-strip"
          aria-label={t('unifiedSearch.resultsLabel')}
        >
          {snapshot.providers.map((provider) => (
            <span key={provider.id} data-provider-status={provider.status}>
              {t(provider.labelKey)} · {t(`unifiedSearch.provider.${provider.status}`)} · {provider.resultCount}
            </span>
          ))}
        </div>
      ) : null}

      {snapshot?.status !== 'running' && snapshot?.results.length === 0 ? (
        <div className="jiten-empty">{t('novels.table.empty')}</div>
      ) : null}

      {snapshot?.results.length ? (
        <div className="reading-unified-results" role="list">
          {snapshot.results.map((result) => {
            const coverUrl = readingDiscoveryCoverUrl(result.entry);
            return (
            <article
              key={result.entry.key}
              className="reading-unified-card"
              role="listitem"
              data-recommendation-score={result.recommendation?.score}
              data-recommendation-reasons={result.recommendation?.reasons.join(' ')}
            >
              <div className="reading-unified-card-cover" aria-hidden="true">
                {coverUrl
                  ? <img src={coverUrl} alt="" />
                  : <Icon name="novels" size={24} />}
              </div>
              <div className="reading-unified-card-copy">
                <span className="reading-unified-meta">
                  <span className="reading-unified-source">{t(result.providerLabelKey)}</span>
                  {result.recommendation ? (
                    <span className="reading-unified-match">
                      {t('mediaWorkspace.study.matchScore', { score: result.recommendation.score })}
                    </span>
                  ) : null}
                </span>
                <b lang="ja">{result.entry.work.title}</b>
                <small className="muted">{result.entry.tags.slice(0, 3).join(' · ')}</small>
              </div>
              <button type="button" className="btn" onClick={() => void act(result)}>
                {t(actionLabelKey(result))}
              </button>
            </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
