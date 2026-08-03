import { useMemo, useState } from 'react';
import { useT } from '../../../i18n';
import SettingsCard from '../SettingsCard';
import {
  planMediaProviderCapabilities,
  type MediaContentType,
  type MediaProviderCapability,
  type MediaProvidersDocument,
} from '../../../../shared/mediaProviders';
import { resolveMediaIdentities } from '../../../../shared/mediaIdentity';
import { getMediaTrackingRecord, summarizeMediaTrackingProgress, type MediaTrackingStatus } from '../../../../shared/mediaTracking';
import {
  exportMediaProvidersDocument,
  importMediaProvidersDocument,
  loadMediaProvidersDocument,
  removeMediaProviderRecord,
  reorderMediaProviders,
  setMediaProviderEnabled,
} from '../../../mediaProviderStore';
import {
  loadMediaTrackingDocument,
  removeMediaTrackingEntry,
  upsertMediaTrackingEntry,
} from '../../../mediaTrackingStore';

const CONTENT_TYPES: MediaContentType[] = [
  'anime', 'jdrama', 'cdrama', 'kdrama', 'movie', 'tv', 'documentary', 'special', 'ova', 'webseries',
];
const CAPABILITIES: MediaProviderCapability[] = ['search', 'metadata', 'episodes', 'artwork', 'tracking', 'subtitles'];
const TRACKING_STATUSES: MediaTrackingStatus[] = ['planned', 'watching', 'completed', 'on-hold', 'dropped'];

/**
 * Media provider, identity, and tracking surface (MASTER_PLAN §7). It wires the
 * offline data-model layers (`mediaProviders`/`mediaIdentity`/`mediaTracking`) into
 * one settings card: enable/disable/reorder providers, preview the inert capability
 * routing plan, and track the identities resolved from stored descriptors. Result
 * merging, playback/downloads, authentication, scraping, and provider execution are
 * all deferred — nothing here performs I/O beyond localStorage persistence.
 */
export default function MediaProviderPanel() {
  const { t } = useT();
  const [providers, setProviders] = useState<MediaProvidersDocument>(loadMediaProvidersDocument);
  const [tracking, setTracking] = useState(loadMediaTrackingDocument);
  const [contentType, setContentType] = useState<MediaContentType>('anime');
  const [capability, setCapability] = useState<MediaProviderCapability>('search');
  const [portableJson, setPortableJson] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const plan = useMemo(
    () => planMediaProviderCapabilities(providers, { contentType, capability }),
    [providers, contentType, capability],
  );
  const identities = useMemo(() => resolveMediaIdentities(providers).identities, [providers]);
  const descriptorsById = useMemo(
    () => new Map(providers.descriptors.map((descriptor) => [descriptor.id, descriptor])),
    [providers],
  );

  const toggleProvider = (id: string, enabled: boolean) => {
    setProviders(setMediaProviderEnabled(id, enabled));
    setMessage(null);
  };

  const moveProvider = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= providers.providers.length) return;
    const ids = providers.providers.map((provider) => provider.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setProviders(reorderMediaProviders(ids));
  };

  const removeProvider = (id: string) => {
    setProviders(removeMediaProviderRecord(id));
    setTracking(loadMediaTrackingDocument());
  };

  const setStatus = (identityId: string, type: MediaContentType, status: MediaTrackingStatus) => {
    setTracking(upsertMediaTrackingEntry(identityId, type, { status }));
  };

  const toggleFavorite = (identityId: string, type: MediaContentType, favorite: boolean) => {
    setTracking(upsertMediaTrackingEntry(identityId, type, { favorite }));
  };

  const untrack = (identityId: string) => {
    setTracking(removeMediaTrackingEntry(identityId));
  };

  return (
    <SettingsCard
      id="media-providers"
      title={t('mediaProvider.title')}
      description={t('mediaProvider.desc')}
      trailing={<span className="os-set-adv-badge">{t('mediaProvider.providerCount', { count: providers.providers.length })}</span>}
    >
      <fieldset className="unified-search-controls">
        <legend>{t('mediaProvider.providersLegend')}</legend>
        {providers.providers.length === 0 && <span className="muted">{t('mediaProvider.noProviders')}</span>}
        {providers.providers.map((provider, index) => (
          <div className="field-row" key={provider.id}>
            <label>
              <input type="checkbox" checked={provider.enabled} onChange={(event) => toggleProvider(provider.id, event.currentTarget.checked)} />
              {provider.name}
              <small className="muted"> {provider.role} · {provider.availability}</small>
            </label>
            <div className="sp-seg" role="group" aria-label={t('mediaProvider.sourceOrder', { name: provider.name })}>
              <button type="button" className="btn" disabled={index === 0} onClick={() => moveProvider(index, -1)}>{t('mediaProvider.moveUp')}</button>
              <button type="button" className="btn" disabled={index === providers.providers.length - 1} onClick={() => moveProvider(index, 1)}>{t('mediaProvider.moveDown')}</button>
              <button type="button" className="btn" onClick={() => removeProvider(provider.id)}>{t('mediaProvider.remove')}</button>
            </div>
          </div>
        ))}
      </fieldset>

      <fieldset className="unified-search-controls">
        <legend>{t('mediaProvider.planLegend')}</legend>
        <div className="field-row">
          <label htmlFor="media-provider-content-type">{t('mediaProvider.contentType')}</label>
          <select id="media-provider-content-type" className="media-model-select" value={contentType} onChange={(event) => setContentType(event.currentTarget.value as MediaContentType)}>
            {CONTENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
        <div className="field-row">
          <label htmlFor="media-provider-capability">{t('mediaProvider.capability')}</label>
          <select id="media-provider-capability" className="media-model-select" value={capability} onChange={(event) => setCapability(event.currentTarget.value as MediaProviderCapability)}>
            {CAPABILITIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <p className="muted" role="status">
          {plan.status === 'ready' ? t('mediaProvider.planStepCount', { count: plan.steps.length }) : t(`mediaProvider.plan.${plan.status}`)}
        </p>
        {plan.steps.length > 0 && (
          <ol className="unified-search-providers" aria-label={t('mediaProvider.planLegend')}>
            {plan.steps.map((step) => (
              <li key={step.providerId} className="unified-search-provider">
                <span className="unified-search-provider-name">{step.providerName}</span>
                <span className="muted"> {step.role} · {step.availability}</span>
              </li>
            ))}
          </ol>
        )}
      </fieldset>

      <fieldset className="unified-search-controls">
        <legend>{t('mediaProvider.libraryLegend')}</legend>
        {identities.length === 0 && <span className="muted">{t('mediaProvider.noIdentities')}</span>}
        {identities.map((identity) => {
          const descriptor = descriptorsById.get(identity.representativeDescriptorId);
          const record = getMediaTrackingRecord(tracking, identity.id);
          const summary = record ? summarizeMediaTrackingProgress(record) : null;
          return (
            <div className="field-row" key={identity.id}>
              <span>
                <strong>{descriptor?.title ?? identity.representativeDescriptorId}</strong>
                <small className="muted">
                  {' '}{identity.contentType} · {t('mediaProvider.sourceCount', { count: identity.providerIds.length })}
                  {summary && summary.totalCount !== null ? ` · ${summary.watchedCount}/${summary.totalCount}` : ''}
                </small>
              </span>
              <div className="sp-seg" role="group" aria-label={descriptor?.title ?? identity.id}>
                <select
                  className="media-model-select"
                  aria-label={t('mediaProvider.statusLabel')}
                  value={record?.status ?? ''}
                  onChange={(event) => setStatus(identity.id, identity.contentType, event.currentTarget.value as MediaTrackingStatus)}
                >
                  <option value="" disabled>{t('mediaProvider.untracked')}</option>
                  {TRACKING_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
                <label>
                  <input type="checkbox" checked={record?.favorite ?? false} onChange={(event) => toggleFavorite(identity.id, identity.contentType, event.currentTarget.checked)} />
                  {t('mediaProvider.favorite')}
                </label>
                {record && <button type="button" className="btn" onClick={() => untrack(identity.id)}>{t('mediaProvider.untrackButton')}</button>}
              </div>
            </div>
          );
        })}
      </fieldset>

      <fieldset className="unified-search-controls">
        <legend>{t('mediaProvider.importExportLegend')}</legend>
        <div className="field-row">
          <label htmlFor="media-provider-json">{t('mediaProvider.jsonLabel')}</label>
          <textarea
            id="media-provider-json"
            value={portableJson}
            spellCheck={false}
            placeholder={t('mediaProvider.importPlaceholder')}
            onChange={(event) => setPortableJson(event.currentTarget.value)}
            style={{ minHeight: 120 }}
          />
        </div>
        <div className="sp-seg" role="group" aria-label={t('mediaProvider.importExportLegend')}>
          <button type="button" className="btn" onClick={() => { setPortableJson(exportMediaProvidersDocument()); setMessage(t('mediaProvider.exported')); }}>
            {t('mediaProvider.exportButton')}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!portableJson.trim()}
            onClick={() => {
              try {
                const imported = importMediaProvidersDocument(portableJson);
                setProviders(imported.value);
                setMessage(imported.issues.length
                  ? t('mediaProvider.importedWithIssues', { count: imported.issues.length })
                  : t('mediaProvider.imported'));
              } catch (error) {
                setMessage(error instanceof Error ? error.message : t('mediaProvider.importFailed'));
              }
            }}
          >
            {t('mediaProvider.importButton')}
          </button>
        </div>
        {message && <p className="form-msg" role="status">{message}</p>}
      </fieldset>

      <p className="muted">{t('mediaProvider.inertNote')}</p>
    </SettingsCard>
  );
}
