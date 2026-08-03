import { useMemo, useState } from 'react';
import { useT } from '../../../i18n';
import { useUnifiedSearchSession } from '../../../useUnifiedSearchSession';
import { partitionUnifiedSearchResults } from '../../../unifiedSearchPresentation';
import type { UnifiedSearchProviderExecutionStatus } from '../../../../shared/unifiedSearchExecution';
import SettingsCard from '../SettingsCard';
import { createUnifiedSearchManagementId, EMPTY_UNIFIED_SEARCH_FILTERS, getUnifiedSearchSuggestions, type UnifiedSearchFilters } from '../../../../shared/unifiedSearchManagement';
import { dispatchUnifiedSearchAction, loadUnifiedSearchDocument } from '../../../unifiedSearchStore';
import { clearUnifiedSearchHistory, loadUnifiedSearchHistory, recordUnifiedSearchHistory } from '../../../unifiedSearchHistoryStore';
import { loadUnifiedSearchManagement, removeUnifiedSearchFavorite, removeUnifiedSearchPreset, saveUnifiedSearchFavorite, saveUnifiedSearchPreset } from '../../../unifiedSearchManagementStore';
import { loadMediaProvidersDocument } from '../../../mediaProviderStore';
import { mergeStoredMediaResults } from '../../../../shared/mediaResultPresentation';
import { projectMergedResultsIntoUnifiedSearchSession } from '../../../unifiedSearchMergedAdapter';
import { loadMediaTrackingDocument } from '../../../mediaTrackingStore';
import { persistUnifiedSearchTrackingMutation, type UnifiedSearchTrackingMutation } from '../../../unifiedSearchTrackingMutation';
import type { UnifiedSearchMergedResult } from '../../../unifiedSearchMergedAdapter';

const PROVIDER_STATUS_KEY: Record<UnifiedSearchProviderExecutionStatus, string> = {
  queued: 'unifiedSearch.provider.queued',
  running: 'unifiedSearch.provider.running',
  succeeded: 'unifiedSearch.provider.succeeded',
  failed: 'unifiedSearch.provider.failed',
  cancelled: 'unifiedSearch.provider.cancelled',
};

/**
 * Unified Search surface (MASTER_PLAN §6). It drives the renderer search
 * coordinator through {@link useUnifiedSearchSession} and renders the per-provider
 * lifecycle. Stored provider descriptors are also projected through the pure offline
 * merge adapter; no provider execution is introduced by that integration.
 */
export default function UnifiedSearchPanel() {
  const { t } = useT();
  const { state, search, cancel, clear } = useUnifiedSearchSession();
  const [query, setQuery] = useState('');
  const [document, setDocument] = useState(loadUnifiedSearchDocument);
  const [filters, setFilters] = useState<UnifiedSearchFilters>({ ...EMPTY_UNIFIED_SEARCH_FILTERS });
  const [history, setHistory] = useState(loadUnifiedSearchHistory);
  const [management, setManagement] = useState(loadUnifiedSearchManagement);
  const [mediaDocument] = useState(loadMediaProvidersDocument);
  const [presetName, setPresetName] = useState('');
  const [trackingDocument, setTrackingDocument] = useState(loadMediaTrackingDocument);

  const trimmed = query.trim();
  const running = state.status === 'running';
  const resultPartitions = partitionUnifiedSearchResults(state.providers, filters);
  const mergedResults = useMemo(() => mergeStoredMediaResults(mediaDocument), [mediaDocument]);
  const mergedProjection = useMemo(
    () => projectMergedResultsIntoUnifiedSearchSession(state, mergedResults, filters, trackingDocument),
    [filters, mergedResults, state, trackingDocument],
  );
  const suggestions = getUnifiedSearchSuggestions(query, history, management.favorites);

  const submit = () => {
    if (!trimmed) return;
    search({ query: trimmed });
    setHistory(recordUnifiedSearchHistory(trimmed));
  };

  const updateProvider = (id: string, enabled: boolean) => {
    const result = dispatchUnifiedSearchAction({ type: 'provider/update', id, patch: { enabled } });
    if (result.ok) setDocument(result.value);
  };

  const moveProvider = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= document.providers.length) return;
    const ids = document.providers.map((provider) => provider.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    const result = dispatchUnifiedSearchAction({ type: 'provider/reorder', providerIds: ids });
    if (result.ok) setDocument(result.value);
  };

  const setFilter = <K extends keyof UnifiedSearchFilters>(key: K, value: UnifiedSearchFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const reset = () => {
    setQuery('');
    clear();
  };

  const applySearch = (nextQuery: string, nextFilters?: UnifiedSearchFilters) => {
    setQuery(nextQuery);
    if (nextFilters) setFilters(nextFilters);
  };

  const saveFavorite = () => {
    if (!trimmed) return;
    setManagement(saveUnifiedSearchFavorite(createUnifiedSearchManagementId('favorite', trimmed), trimmed, filters));
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    setManagement(saveUnifiedSearchPreset(createUnifiedSearchManagementId('preset', name), name, filters));
    setPresetName('');
  };

  const mutateTracking = (result: UnifiedSearchMergedResult, mutation: UnifiedSearchTrackingMutation) => {
    const next = persistUnifiedSearchTrackingMutation(trackingDocument, result, mutation);
    if (next.ok) setTrackingDocument(next.value);
  };

  const statusMessage = (() => {
    if (state.planStatus === 'empty-query') return t('unifiedSearch.plan.emptyQuery');
    if (state.planStatus === 'no-providers') return t('unifiedSearch.plan.noProviders');
    switch (state.status) {
      case 'running':
        return t('unifiedSearch.status.running');
      case 'completed':
        return t('unifiedSearch.status.completed');
      case 'cancelled':
        return t('unifiedSearch.status.cancelled');
      default:
        return t('unifiedSearch.status.idle');
    }
  })();

  return (
    <SettingsCard
      id="unified-search"
      title={t('unifiedSearch.title')}
      description={t('unifiedSearch.desc')}
      trailing={<span className="os-set-adv-badge">{t('unifiedSearch.providerCount', { count: state.providers.length })}</span>}
    >
      <div className="field-row">
        <label htmlFor="unified-search-query">{t('unifiedSearch.label')}</label>
        <input
          id="unified-search-query"
          type="search"
          value={query}
          placeholder={t('unifiedSearch.placeholder')}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submit(); } }}
        />
      </div>
      {(suggestions.favorites.length > 0 || suggestions.recent.length > 0) && (
        <div className="unified-search-controls" aria-label={t('unifiedSearch.suggestions')}>
          {suggestions.favorites.length > 0 && <div className="sp-seg"><span className="muted">{t('unifiedSearch.favoriteSuggestions')}</span>{suggestions.favorites.map((item) => <button type="button" className="btn" key={item.id} onClick={() => applySearch(item.query, item.filters)}>{item.query}</button>)}</div>}
          {suggestions.recent.length > 0 && <div className="sp-seg"><span className="muted">{t('unifiedSearch.recentSuggestions')}</span>{suggestions.recent.map((item) => <button type="button" className="btn" key={`${item.query}-${item.searchedAt}`} onClick={() => applySearch(item.query)}>{item.query}</button>)}</div>}
        </div>
      )}
      <fieldset className="unified-search-controls">
        <legend>{t('unifiedSearch.sources')}</legend>
        {document.providers.length === 0 && <span className="muted">{t('unifiedSearch.noSources')}</span>}
        {document.providers.map((provider, index) => (
          <div className="field-row" key={provider.id}>
            <label>
              <input type="checkbox" checked={provider.enabled} onChange={(event) => updateProvider(provider.id, event.currentTarget.checked)} />
              {provider.name}
            </label>
            <div className="sp-seg" role="group" aria-label={t('unifiedSearch.sourceOrder', { name: provider.name })}>
              <button type="button" className="btn" disabled={index === 0} onClick={() => moveProvider(index, -1)}>{t('unifiedSearch.moveUp')}</button>
              <button type="button" className="btn" disabled={index === document.providers.length - 1} onClick={() => moveProvider(index, 1)}>{t('unifiedSearch.moveDown')}</button>
            </div>
          </div>
        ))}
      </fieldset>
      <fieldset className="unified-search-controls">
        <legend>{t('unifiedSearch.filters')}</legend>
        <div className="field-row">
          <label htmlFor="unified-search-source-filter">{t('unifiedSearch.source')}</label>
          <select id="unified-search-source-filter" value={filters.providerIds[0] ?? ''} onChange={(event) => setFilter('providerIds', event.currentTarget.value ? [event.currentTarget.value] : [])}>
            <option value="">{t('unifiedSearch.any')}</option>
            {document.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
          </select>
        </div>
        <div className="field-row">
          <label htmlFor="unified-search-language">{t('unifiedSearch.language')}</label>
          <input id="unified-search-language" value={filters.languages[0] ?? ''} onChange={(event) => setFilter('languages', event.currentTarget.value ? [event.currentTarget.value] : [])} />
        </div>
        <div className="field-row">
          <label htmlFor="unified-search-type">{t('unifiedSearch.type')}</label>
          <select id="unified-search-type" value={filters.mediaTypes[0] ?? ''} onChange={(event) => setFilter('mediaTypes', event.currentTarget.value ? [event.currentTarget.value as UnifiedSearchFilters['mediaTypes'][number]] : [])}>
            <option value="">{t('unifiedSearch.any')}</option>
            {['anime', 'movie', 'tv', 'ova', 'special', 'manga', 'novel', 'other'].map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
        <div className="field-row">
          <label htmlFor="unified-search-genre">{t('unifiedSearch.genre')}</label>
          <input id="unified-search-genre" value={filters.genres[0] ?? ''} onChange={(event) => setFilter('genres', event.currentTarget.value ? [event.currentTarget.value] : [])} />
        </div>
        <div className="field-row">
          <label htmlFor="unified-search-season">{t('unifiedSearch.season')}</label>
          <input id="unified-search-season" value={filters.seasons[0] ?? ''} onChange={(event) => setFilter('seasons', event.currentTarget.value ? [event.currentTarget.value] : [])} />
        </div>
        <div className="field-row">
          <label htmlFor="unified-search-status">{t('unifiedSearch.statusFilter')}</label>
          <select id="unified-search-status" value={filters.trackingStatuses[0] ?? ''} onChange={(event) => setFilter('trackingStatuses', event.currentTarget.value ? [event.currentTarget.value as UnifiedSearchFilters['trackingStatuses'][number]] : [])}>
            <option value="">{t('unifiedSearch.any')}</option>
            {['untracked', 'planned', 'watching', 'completed', 'paused', 'dropped', 'unknown'].map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
        <div className="field-row">
          <label htmlFor="unified-search-year-from">{t('unifiedSearch.year')}</label>
          <div className="sp-seg">
            <input id="unified-search-year-from" type="number" placeholder={t('unifiedSearch.from')} value={filters.yearFrom ?? ''} onChange={(event) => setFilter('yearFrom', event.currentTarget.value ? Number(event.currentTarget.value) : null)} />
            <input type="number" aria-label={t('unifiedSearch.to')} placeholder={t('unifiedSearch.to')} value={filters.yearTo ?? ''} onChange={(event) => setFilter('yearTo', event.currentTarget.value ? Number(event.currentTarget.value) : null)} />
          </div>
        </div>
        <button type="button" className="btn" onClick={() => setFilters({ ...EMPTY_UNIFIED_SEARCH_FILTERS })}>{t('unifiedSearch.clearFilters')}</button>
        <div className="sp-seg">
          <input aria-label={t('unifiedSearch.presetName')} placeholder={t('unifiedSearch.presetName')} value={presetName} onChange={(event) => setPresetName(event.currentTarget.value)} />
          <button type="button" className="btn" disabled={!presetName.trim()} onClick={savePreset}>{t('unifiedSearch.savePreset')}</button>
        </div>
      </fieldset>
      {management.presets.length > 0 && <fieldset className="unified-search-controls"><legend>{t('unifiedSearch.presets')}</legend>{management.presets.map((preset) => <div className="field-row" key={preset.id}><button type="button" className="btn" onClick={() => setFilters(preset.filters)}>{preset.name}</button><button type="button" className="btn" onClick={() => setManagement(removeUnifiedSearchPreset(preset.id))}>{t('unifiedSearch.remove')}</button></div>)}</fieldset>}
      {management.favorites.length > 0 && <fieldset className="unified-search-controls"><legend>{t('unifiedSearch.favorites')}</legend>{management.favorites.map((favorite) => <div className="field-row" key={favorite.id}><button type="button" className="btn" onClick={() => applySearch(favorite.query, favorite.filters)}>{favorite.query}</button><button type="button" className="btn" onClick={() => setManagement(removeUnifiedSearchFavorite(favorite.id))}>{t('unifiedSearch.remove')}</button></div>)}</fieldset>}
      {history.length > 0 && (
        <fieldset className="unified-search-controls">
          <legend>{t('unifiedSearch.history')}</legend>
          <div className="sp-seg">
            {history.slice(0, 8).map((entry) => <button type="button" className="btn" key={`${entry.query}-${entry.searchedAt}`} onClick={() => setQuery(entry.query)}>{entry.query}</button>)}
            <button type="button" className="btn" onClick={() => { clearUnifiedSearchHistory(); setHistory([]); }}>{t('unifiedSearch.clearHistory')}</button>
          </div>
        </fieldset>
      )}
      <div className="sp-seg" role="group" aria-label={t('unifiedSearch.actions')}>
        <button type="button" className="btn primary" disabled={!trimmed} onClick={submit}>
          {t('unifiedSearch.searchButton')}
        </button>
        <button type="button" className="btn" disabled={!trimmed} onClick={saveFavorite}>{t('unifiedSearch.saveFavorite')}</button>
        <button type="button" className="btn" disabled={!running} onClick={() => cancel()}>
          {t('unifiedSearch.cancelButton')}
        </button>
        <button type="button" className="btn" disabled={state.status === 'idle'} onClick={reset}>
          {t('unifiedSearch.clearButton')}
        </button>
      </div>

      <p className="muted" role="status">{statusMessage}</p>

      {mergedProjection.partitions.length > 0 && (
        <ul className="unified-search-providers" aria-label={t('mediaProvider.libraryLegend')}>
          {mergedProjection.partitions.map((partition) => (
            <li key={partition.partition} className="unified-search-provider" data-identity-partition={partition.partition}>
              <div className="unified-search-provider-heading">
                <span className="unified-search-provider-name">{partition.contentType}</span>
                <span className="muted">{t('unifiedSearch.resultCount', { count: partition.results.length })}</span>
              </div>
              <ul className="unified-search-results">
                {partition.results.map((result) => (
                  <li key={result.identityId} className="unified-search-result" data-identity-id={result.identityId}>
                    <div className="unified-search-result-copy">
                      <strong>{result.title}</strong>
                      <span className="muted">
                        {[result.contentType, result.language, result.availability, result.year].filter((value) => value !== null).join(' · ')}
                      </span>
                      <span className="muted">{t('mediaProvider.sourceCount', { count: result.sourceCount })}: {result.sources.map((source) => source.providerName).join(', ')}</span>
                      {Object.keys(result.conflicts).length > 0 && (
                        <span className="muted">{Object.entries(result.conflicts).map(([field, values]) => `${field}: ${values?.join(' / ')}`).join(' · ')}</span>
                      )}
                      {result.trackingProgress && (
                        <span className="muted">
                          {result.trackingRecord?.status} · {result.trackingProgress.watchedCount}/{result.trackingProgress.totalCount ?? '—'}
                        </span>
                      )}
                    </div>
                    <div className="sp-seg" role="group" aria-label={`Tracking actions for ${result.title}`}>
                      <button type="button" className="btn" onClick={() => mutateTracking(result, { type: 'status/set', status: 'planned' })}>Plan</button>
                      <button type="button" className="btn" onClick={() => mutateTracking(result, { type: 'status/set', status: 'on-hold' })}>Pause</button>
                      {result.trackingProgress?.kind === 'episodic' && (
                        <button type="button" className="btn" onClick={() => mutateTracking(result, {
                          type: 'progress/update',
                          episode: {
                            season: result.trackingProgress?.furthestEpisode?.season ?? 1,
                            episode: (result.trackingProgress?.furthestEpisode?.episode ?? 0) + 1,
                          },
                        })}>+1 episode</button>
                      )}
                      {result.trackingProgress?.kind === 'unit' && !result.trackingProgress.isComplete && (
                        <button type="button" className="btn" onClick={() => mutateTracking(result, { type: 'progress/update', watched: true })}>Watched</button>
                      )}
                      <button type="button" className="btn" onClick={() => mutateTracking(result, { type: 'status/set', status: 'completed' })}>Complete</button>
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {resultPartitions.length > 0 && (
        <ul className="unified-search-providers" aria-label={t('unifiedSearch.resultsLabel')}>
          {state.providers.map((provider, providerIndex) => (
            <li key={provider.providerId} className="unified-search-provider">
              <div className="unified-search-provider-heading">
                <span className="unified-search-provider-name">{provider.providerName}</span>
                <span className={`unified-search-provider-status status-${provider.status}`}>
                  {t(PROVIDER_STATUS_KEY[provider.status])}
                </span>
                <span className="muted">{t('unifiedSearch.resultCount', { count: provider.results.length })}</span>
              </div>
              {provider.error && <span className="unified-search-provider-error">{provider.error}</span>}
              {resultPartitions[providerIndex].results.length > 0 && (
                <ul className="unified-search-results" aria-label={`${provider.providerName}: ${t('unifiedSearch.resultCount', { count: provider.results.length })}`}>
                  {resultPartitions[providerIndex].results.map((result) => (
                    <li key={result.id} className="unified-search-result" data-provider-id={provider.providerId}>
                      {result.coverUrl && <img className="unified-search-result-cover" src={result.coverUrl} alt="" loading="lazy" />}
                      <div className="unified-search-result-copy">
                        <strong>{result.title}</strong>
                        <span className="muted">
                          {[result.mediaType, result.language, result.availability].filter(Boolean).join(' · ')}
                        </span>
                        {(result.episodeCount !== null || result.metadataQuality !== null || result.trackingStatus !== 'unknown') && (
                          <span className="muted">
                            {[
                              result.episodeCount === null ? null : `${result.episodeCount} ep`,
                              result.metadataQuality === null ? null : `${result.metadataQuality}%`,
                              result.trackingStatus === 'unknown' ? null : result.trackingStatus,
                            ].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="muted">{t('unifiedSearch.inertNote')}</p>
    </SettingsCard>
  );
}
