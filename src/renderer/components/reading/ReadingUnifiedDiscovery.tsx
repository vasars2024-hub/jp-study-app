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
import {
  resolveReadingWorkspaceActions,
  type ReadingWorkspaceActionId,
} from '../../../shared/readingWorkspaceActions';
import { NOVELS } from '../../data/novels';
import type { ReadingSite } from '../../data/readingSites';
import {
  createReadingDiscoveryProviders,
  readingDiscoveryCoverUrl,
} from '../../readingDiscoveryProviders';
import { coverFallbackImage } from '../../utils/coverArt';
import {
  discoveryHostedActions,
  discoveryJitenDeckId,
  discoveryNavigation,
  plannedJitenDeckIds,
} from '../../utils/readingDiscoveryActions';
import { setHandoffJson } from '../../pendingHandoff';
import { useT } from '../../i18n';
import Icon from '../Icons';
import './readingUnifiedDiscovery.css';

export interface ReadingUnifiedDiscoveryProps {
  query: string;
  sites: readonly ReadingSite[];
  onOpenBook: (item: LibraryItem) => void;
  onSelectSite: (site: ReadingSite) => void;
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
  /**
   * The Jiten decks already in the plan, read once per search.
   *
   * `JitenMiningPanel` can only mine what is in the plan, so this is what makes
   * the Jiten action honest — see `plannedJitenDeckIds`. It is refreshed with
   * the results rather than watched, because it only ever gates buttons that
   * are painted from the same snapshot.
   */
  const [plannedDecks, setPlannedDecks] = useState<ReadonlySet<number>>(() => new Set<number>());

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
    // A store that cannot be read withholds the Jiten action rather than
    // failing the search: nothing else on this surface depends on the plan.
    const planLoad = Promise.resolve(window.api.jitenGetStore?.())
      .then((store) => plannedJitenDeckIds(store?.plan))
      .catch(() => new Set<number>());
    const [libraryPayload, planned] = await Promise.all([
      libraryLoad.catch(() => []),
      planLoad,
    ]);
    if (generationRef.current !== generation) return;
    setPlannedDecks(planned);
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

  const openLibraryItem = async (itemId: string) => {
    const items = await Promise.resolve(window.api.listLibrary?.() ?? []);
    const item = Array.isArray(items)
      ? items.find((candidate: LibraryItem) => candidate.id === itemId)
      : undefined;
    if (item) onOpenBook(item);
  };

  /**
   * Performs one action from the shared Reading set.
   *
   * Every branch reuses wiring that already exists somewhere else in the app —
   * `dict:lookup` is the global dictionary overlay's own channel, and the Jiten
   * handoff is byte-for-byte what `NovelsContent.mineJitenSelected` dispatches.
   * That is the point: unifying the *set* must not fork the *mechanism*, or the
   * same button would behave differently depending on the door it was pressed
   * behind.
   */
  const runAction = async (id: ReadingWorkspaceActionId, result: ReadingDiscoveryResult) => {
    // A `const` local, because narrowing a property does not survive into the
    // `find` callback below.
    const { action } = result;
    if (id === 'read' && action.type === 'open-library') {
      await openLibraryItem(action.itemId);
      return;
    }
    if (id === 'extract' && action.type === 'inspect-site') {
      const site = sites.find((candidate) => candidate.id === action.siteId);
      if (site) onSelectSite(site);
      return;
    }
    if (id === 'dictionary') {
      // The same expression the registry's applicability rule reasons about, so
      // what is looked up is what made the action available in the first place.
      const { work } = result.entry;
      const lookup = (work.titleNative || work.title).trim();
      if (lookup) {
        window.dispatchEvent(new CustomEvent('dict:lookup', { detail: { query: lookup } }));
      }
      return;
    }
    if (id === 'jitenVocabulary') {
      const deckId = discoveryJitenDeckId(result);
      // Never reached from a rendered button — the host withholds the action
      // when the id does not parse — but the panel takes a number or nothing.
      if (deckId === null) return;
      setHandoffJson('jitenMining', { deckId, title: result.entry.work.title });
      window.dispatchEvent(new CustomEvent('os:open', { detail: 'flashcards' }));
      window.dispatchEvent(new CustomEvent('flashcards:openEpubMining'));
    }
  };

  /** Leads somewhere else; not a Reading capability, so not in the set. */
  const navigate = async (result: ReadingDiscoveryResult) => {
    if (result.action.type === 'open-external') {
      await window.api.openExternal(result.action.url);
      return;
    }
    if (result.action.type === 'open-plan') {
      window.dispatchEvent(new CustomEvent('os:open', { detail: 'novels' }));
    }
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
            const navigation = discoveryNavigation(result);
            return (
            <article
              key={result.entry.key}
              className="reading-unified-card"
              role="listitem"
              data-recommendation-score={result.recommendation?.score}
              data-recommendation-reasons={result.recommendation?.reasons.join(' ')}
            >
              <div
                className="reading-unified-card-cover"
                aria-hidden="true"
                style={{ backgroundImage: coverFallbackImage(result.entry.work.title) }}
              >
                {coverUrl ? <img src={coverUrl} alt="" /> : null}
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
              {/*
                Order, label and icon all come from the shared registry, so
                "Look up" here is the same words and the same glyph as it is in
                the Library drawer. Nothing is rendered disabled: a card lists
                only what this surface can actually carry out for it.
              */}
              <div className="reading-unified-card-actions">
                {resolveReadingWorkspaceActions(
                  result.entry,
                  discoveryHostedActions(result, plannedDecks),
                ).map(
                  (action) => (
                    <button
                      key={action.id}
                      type="button"
                      className={action.primary ? 'btn primary' : 'btn'}
                      data-reading-action={action.id}
                      onClick={() => void runAction(action.id, result)}
                    >
                      <Icon name={action.icon as Parameters<typeof Icon>[0]['name']} size={13} />
                      {t(action.labelKey)}
                    </button>
                  ),
                )}
                {navigation ? (
                  <button
                    type="button"
                    className="btn subtle"
                    data-reading-navigation={result.action.type}
                    onClick={() => void navigate(result)}
                  >
                    <Icon
                      name={navigation.icon as Parameters<typeof Icon>[0]['name']}
                      size={13}
                    />
                    {t(navigation.labelKey)}
                  </button>
                ) : null}
              </div>
            </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
