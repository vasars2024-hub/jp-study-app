import { useMemo, useState } from 'react';
import {
  getVideoServerPreferenceOrder,
  removeVideoServerProfile,
  setVideoServerPreferenceOrder,
  upsertVideoServerProfile,
  type VideoServerProfile,
  type VideoServerProfilesDocument,
  type VideoServerWebsiteCompatibility,
} from '../../../../shared/videoServerProfiles';
import {
  exportVideoServerProfilesDocument,
  importVideoServerProfilesDocument,
  loadVideoServerProfilesDocument,
  saveVideoServerProfilesDocument,
} from '../../../videoServerProfilesStore';
import SettingsCard from '../SettingsCard';
import { useT } from '../../../i18n';

type Draft = Pick<VideoServerProfile, 'id' | 'name' | 'provider' | 'description' | 'status' | 'reliabilityScore' | 'supportedWebsiteIds' | 'notes' | 'capabilities' | 'websiteCompatibility'>;
type NullableMetric = 'reliabilityScore' | 'detectionSuccessRate' | 'averageExtractionTimeMs';

// Module-level, so each entry carries an i18n KEY resolved with t() at render.
const capabilityOptions: Array<{ key: keyof VideoServerProfile['capabilities']; labelKey: string }> = [
  { key: 'streamDiscovery', labelKey: 'videoServer.cap.streamDiscovery' },
  { key: 'multipleQualities', labelKey: 'videoServer.cap.multipleQualities' },
  { key: 'subtitles', labelKey: 'videoServer.cap.subtitles' },
  { key: 'multipleAudioTracks', labelKey: 'videoServer.cap.multipleAudioTracks' },
  { key: 'episodeSwitching', labelKey: 'videoServer.cap.episodeSwitching' },
  { key: 'mirrors', labelKey: 'videoServer.cap.mirrors' },
  { key: 'resumePlayback', labelKey: 'videoServer.cap.resumePlayback' },
  { key: 'authorizedDownloads', labelKey: 'videoServer.cap.authorizedDownloads' },
  { key: 'thumbnails', labelKey: 'videoServer.cap.thumbnails' },
  { key: 'chapters', labelKey: 'videoServer.cap.chapters' },
];

// Labels for the stored status enum; the <option value> stays the enum.
const STATUS_KEY: Record<VideoServerProfile['status'], string> = {
  active: 'videoServer.status.active',
  experimental: 'videoServer.status.experimental',
  inactive: 'videoServer.status.inactive',
  deprecated: 'videoServer.status.deprecated',
};

const emptyCompatibility = (): VideoServerWebsiteCompatibility => ({
  websiteId: '', reliabilityScore: null, lastVerifiedAt: null, preferredByDefault: false,
  detectionSuccessRate: null, averageExtractionTimeMs: null, notes: '',
});

const emptyDraft = (): Draft => ({
  id: '', name: '', provider: '', description: '', status: 'experimental', reliabilityScore: 0,
  supportedWebsiteIds: [], notes: '',
  capabilities: {
    streamDiscovery: false, multipleQualities: false, subtitles: false,
    multipleAudioTracks: false, episodeSwitching: false, mirrors: false,
    resumePlayback: false, authorizedDownloads: false, thumbnails: false, chapters: false,
  },
  websiteCompatibility: [],
});

export default function VideoServerProfilesManager() {
  const { t } = useT();
  const [document, setDocument] = useState<VideoServerProfilesDocument>(loadVideoServerProfilesDocument);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [websiteId, setWebsiteId] = useState('');
  const [portableJson, setPortableJson] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const order = useMemo(() => getVideoServerPreferenceOrder(document, websiteId || undefined), [document, websiteId]);
  const profiles = new Map(document.profiles.map((profile) => [profile.id, profile]));
  const persist = (next: VideoServerProfilesDocument) => setDocument(saveVideoServerProfilesDocument(next).value);
  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    persist(setVideoServerPreferenceOrder(document, next, websiteId || undefined));
  };
  const edit = (profile: VideoServerProfile) => setDraft({
    id: profile.id, name: profile.name, provider: profile.provider, description: profile.description,
    status: profile.status, reliabilityScore: profile.reliabilityScore,
    supportedWebsiteIds: [...profile.supportedWebsiteIds], notes: profile.notes,
    capabilities: { ...profile.capabilities },
    websiteCompatibility: profile.websiteCompatibility.map((item) => ({ ...item })),
  });
  const updateCompatibility = (index: number, patch: Partial<VideoServerWebsiteCompatibility>) => {
    if (!draft) return;
    setDraft({ ...draft, websiteCompatibility: draft.websiteCompatibility.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  };
  const updateNullableMetric = (index: number, key: NullableMetric, value: string) => {
    updateCompatibility(index, { [key]: value === '' ? null : Number(value) });
  };

  return <SettingsCard id="video-server-profiles" title={t('videoServer.title')} description={t('videoServer.description')}>
    <div className="verified-sites-toolbar">
      <button type="button" className="btn primary" onClick={() => setDraft(emptyDraft())}>{t('videoServer.addProfile')}</button>
      <label>{t('videoServer.preferenceScope')}<input value={websiteId} placeholder={t('videoServer.scopePlaceholder')} onChange={(event) => setWebsiteId(event.currentTarget.value.trim().toLowerCase())} /></label>
    </div>
    {message && <p className="muted" role="status">{message}</p>}
    <div className="video-server-order" aria-label={websiteId ? t('videoServer.orderForSite', { site: websiteId }) : t('videoServer.orderGlobal')}>
      {order.map((id, index) => {
        const profile = profiles.get(id);
        if (!profile) return null;
        return <article className="video-server-row" key={id}>
          <span className="video-server-rank">{index + 1}</span>
          <span><strong>{profile.name}</strong><small className="muted">{profile.provider || t('videoServer.noProvider')} · {t(STATUS_KEY[profile.status] ?? STATUS_KEY.experimental)} · {t('videoServer.reliabilitySuffix', { score: profile.reliabilityScore })}</small></span>
          <div className="verified-sites-actions">
            <button type="button" className="btn small" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t('videoServer.moveUp', { name: profile.name })}>{t('videoServer.up')}</button>
            <button type="button" className="btn small" disabled={index === order.length - 1} onClick={() => move(index, 1)} aria-label={t('videoServer.moveDown', { name: profile.name })}>{t('videoServer.down')}</button>
            <button type="button" className="btn small" onClick={() => edit(profile)}>{t('videoServer.edit')}</button>
            <button type="button" className="btn small danger" onClick={() => { if (window.confirm(t('videoServer.confirmDelete', { name: profile.name }))) { persist(removeVideoServerProfile(document, profile.id)); setMessage(t('videoServer.deleted')); } }}>{t('videoServer.delete')}</button>
          </div>
        </article>;
      })}
      {!order.length && <p className="muted">{t('videoServer.empty')}</p>}
    </div>
    {draft && <div className="verified-site-editor" aria-label={t('videoServer.editorLabel')}>
      <div className="verified-sites-grid">
        <label>{t('videoServer.serverId')}<input disabled={document.profiles.some((profile) => profile.id === draft.id)} value={draft.id} placeholder={t('videoServer.serverIdPlaceholder')} onChange={(event) => setDraft({ ...draft, id: event.currentTarget.value })} /></label>
        <label>{t('videoServer.name')}<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })} /></label>
        <label>{t('videoServer.provider')}<input value={draft.provider} onChange={(event) => setDraft({ ...draft, provider: event.currentTarget.value })} /></label>
        <label>{t('videoServer.statusLabel')}<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.currentTarget.value as Draft['status'] })}><option value="active">{t(STATUS_KEY.active)}</option><option value="experimental">{t(STATUS_KEY.experimental)}</option><option value="inactive">{t(STATUS_KEY.inactive)}</option><option value="deprecated">{t(STATUS_KEY.deprecated)}</option></select></label>
        <label>{t('videoServer.reliability')}<input type="number" min={0} max={100} value={draft.reliabilityScore} onChange={(event) => setDraft({ ...draft, reliabilityScore: Number(event.currentTarget.value) })} /></label>
        <label>{t('videoServer.supportedWebsiteIds')}<input value={draft.supportedWebsiteIds.join(', ')} onChange={(event) => setDraft({ ...draft, supportedWebsiteIds: event.currentTarget.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></label>
      </div>
      <label className="verified-site-wide">{t('videoServer.descriptionField')}<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.currentTarget.value })} /></label>
      <label className="verified-site-wide">{t('videoServer.notes')}<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.currentTarget.value })} /></label>
      <fieldset className="video-server-detail-section">
        <legend>{t('videoServer.capabilitiesLegend')}</legend>
        <p className="muted">{t('videoServer.capabilitiesHint')}</p>
        <div className="video-server-capabilities">
          {capabilityOptions.map(({ key, labelKey }) => <label className="video-server-capability" key={key}>
            <input type="checkbox" checked={draft.capabilities[key]} onChange={(event) => setDraft({ ...draft, capabilities: { ...draft.capabilities, [key]: event.currentTarget.checked } })} />
            <span>{t(labelKey)}</span>
          </label>)}
        </div>
      </fieldset>
      <fieldset className="video-server-detail-section">
        <legend>{t('videoServer.compatLegend')}</legend>
        <p className="muted">{t('videoServer.compatHint')}</p>
        <div className="video-server-compatibility-list">
          {draft.websiteCompatibility.map((item, index) => <section className="video-server-compatibility" key={index} aria-label={t('videoServer.compatItemLabel', { number: index + 1 })}>
            <div className="verified-sites-grid">
              <label>{t('videoServer.websiteId')}<input value={item.websiteId} placeholder={t('videoServer.websiteIdPlaceholder')} onChange={(event) => updateCompatibility(index, { websiteId: event.currentTarget.value })} /></label>
              <label>{t('videoServer.reliabilityScore')}<input type="number" min={0} max={100} value={item.reliabilityScore ?? ''} placeholder={t('videoServer.unknown')} onChange={(event) => updateNullableMetric(index, 'reliabilityScore', event.currentTarget.value)} /></label>
              <label>{t('videoServer.detectionSuccessRate')}<input type="number" min={0} max={100} value={item.detectionSuccessRate ?? ''} placeholder={t('videoServer.unknown')} onChange={(event) => updateNullableMetric(index, 'detectionSuccessRate', event.currentTarget.value)} /></label>
              <label>{t('videoServer.avgExtractionTime')}<input type="number" min={0} max={3600000} value={item.averageExtractionTimeMs ?? ''} placeholder={t('videoServer.unknown')} onChange={(event) => updateNullableMetric(index, 'averageExtractionTimeMs', event.currentTarget.value)} /></label>
              <label>{t('videoServer.lastVerified')}<input type="date" value={item.lastVerifiedAt?.slice(0, 10) ?? ''} onChange={(event) => updateCompatibility(index, { lastVerifiedAt: event.currentTarget.value || null })} /></label>
              <label className="video-server-preferred"><input type="checkbox" checked={item.preferredByDefault} onChange={(event) => updateCompatibility(index, { preferredByDefault: event.currentTarget.checked })} /><span>{t('videoServer.preferredByDefault')}</span></label>
            </div>
            <label className="verified-site-wide">{t('videoServer.compatNotes')}<textarea value={item.notes} onChange={(event) => updateCompatibility(index, { notes: event.currentTarget.value })} /></label>
            <button type="button" className="btn small danger" onClick={() => setDraft({ ...draft, websiteCompatibility: draft.websiteCompatibility.filter((_, itemIndex) => itemIndex !== index) })}>{t('videoServer.removeWebsite')}</button>
          </section>)}
          {!draft.websiteCompatibility.length && <p className="muted">{t('videoServer.noCompat')}</p>}
        </div>
        <button type="button" className="btn small" onClick={() => setDraft({ ...draft, websiteCompatibility: [...draft.websiteCompatibility, emptyCompatibility()] })}>{t('videoServer.addCompat')}</button>
      </fieldset>
      <div className="verified-sites-actions"><button type="button" className="btn primary" onClick={() => {
        const existing = document.profiles.find((profile) => profile.id === draft.id);
        const result = upsertVideoServerProfile(document, existing ? { ...existing, ...draft } : draft);
        if (!result.value.profiles.some((profile) => profile.id === draft.id.trim().toLowerCase())) { setMessage(result.issues[0]?.message ?? t('videoServer.requireIdName')); return; }
        persist(result.value); setDraft(null); setMessage(result.issues.length ? t('videoServer.savedWithIssues', { count: result.issues.length }) : t('videoServer.saved'));
      }}>{t('videoServer.saveProfile')}</button><button type="button" className="btn" onClick={() => setDraft(null)}>{t('common.cancel')}</button></div>
    </div>}
    <details className="verified-sites-portable"><summary>{t('videoServer.portableSummary')}</summary>
      <textarea aria-label={t('videoServer.jsonLabel')} value={portableJson} onChange={(event) => setPortableJson(event.currentTarget.value)} spellCheck={false} />
      <div className="verified-sites-actions"><button type="button" className="btn" onClick={() => setPortableJson(exportVideoServerProfilesDocument(document))}>{t('videoServer.exportJson')}</button><button type="button" className="btn primary" disabled={!portableJson.trim()} onClick={() => { try { const result = importVideoServerProfilesDocument(portableJson); setDocument(result.value); setMessage(result.issues.length ? t('videoServer.importedWithIssues', { count: result.issues.length }) : t('videoServer.imported')); } catch (error) { setMessage(error instanceof Error ? error.message : t('videoServer.importFailed')); } }}>{t('videoServer.validateImport')}</button></div>
    </details>
  </SettingsCard>;
}
