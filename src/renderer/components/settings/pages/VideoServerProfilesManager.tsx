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

type Draft = Pick<VideoServerProfile, 'id' | 'name' | 'provider' | 'description' | 'status' | 'reliabilityScore' | 'supportedWebsiteIds' | 'notes' | 'capabilities' | 'websiteCompatibility'>;
type NullableMetric = 'reliabilityScore' | 'detectionSuccessRate' | 'averageExtractionTimeMs';

const capabilityOptions: Array<{ key: keyof VideoServerProfile['capabilities']; label: string }> = [
  { key: 'streamDiscovery', label: 'Stream discovery' },
  { key: 'multipleQualities', label: 'Multiple qualities' },
  { key: 'subtitles', label: 'Subtitle support' },
  { key: 'multipleAudioTracks', label: 'Multiple audio tracks' },
  { key: 'episodeSwitching', label: 'Episode switching' },
  { key: 'mirrors', label: 'Mirror support' },
  { key: 'resumePlayback', label: 'Resume playback' },
  { key: 'authorizedDownloads', label: 'Authorized downloads' },
  { key: 'thumbnails', label: 'Thumbnail extraction' },
  { key: 'chapters', label: 'Chapter support' },
];

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

  return <SettingsCard id="video-server-profiles" title="Video server profiles" description="Manage inert local server metadata and explicit preference ordering. No server code is run from this surface.">
    <div className="verified-sites-toolbar">
      <button type="button" className="btn primary" onClick={() => setDraft(emptyDraft())}>Add profile</button>
      <label>Preference scope<input value={websiteId} placeholder="Global, or enter website ID" onChange={(event) => setWebsiteId(event.currentTarget.value.trim().toLowerCase())} /></label>
    </div>
    {message && <p className="muted" role="status">{message}</p>}
    <div className="video-server-order" aria-label={websiteId ? `Preferred server order for ${websiteId}` : 'Global preferred server order'}>
      {order.map((id, index) => {
        const profile = profiles.get(id);
        if (!profile) return null;
        return <article className="video-server-row" key={id}>
          <span className="video-server-rank">{index + 1}</span>
          <span><strong>{profile.name}</strong><small className="muted">{profile.provider || 'No provider'} · {profile.status} · {profile.reliabilityScore}% recorded reliability</small></span>
          <div className="verified-sites-actions">
            <button type="button" className="btn small" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${profile.name} up`}>Up</button>
            <button type="button" className="btn small" disabled={index === order.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${profile.name} down`}>Down</button>
            <button type="button" className="btn small" onClick={() => edit(profile)}>Edit</button>
            <button type="button" className="btn small danger" onClick={() => { if (window.confirm(`Delete ${profile.name}?`)) { persist(removeVideoServerProfile(document, profile.id)); setMessage('Profile deleted locally.'); } }}>Delete</button>
          </div>
        </article>;
      })}
      {!order.length && <p className="muted">No video server profiles saved yet.</p>}
    </div>
    {draft && <div className="verified-site-editor" aria-label="Video server profile editor">
      <div className="verified-sites-grid">
        <label>Server ID<input disabled={document.profiles.some((profile) => profile.id === draft.id)} value={draft.id} placeholder="server-a" onChange={(event) => setDraft({ ...draft, id: event.currentTarget.value })} /></label>
        <label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })} /></label>
        <label>Provider<input value={draft.provider} onChange={(event) => setDraft({ ...draft, provider: event.currentTarget.value })} /></label>
        <label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.currentTarget.value as Draft['status'] })}><option value="active">Active</option><option value="experimental">Experimental</option><option value="inactive">Inactive</option><option value="deprecated">Deprecated</option></select></label>
        <label>Recorded reliability<input type="number" min={0} max={100} value={draft.reliabilityScore} onChange={(event) => setDraft({ ...draft, reliabilityScore: Number(event.currentTarget.value) })} /></label>
        <label>Supported website IDs<input value={draft.supportedWebsiteIds.join(', ')} onChange={(event) => setDraft({ ...draft, supportedWebsiteIds: event.currentTarget.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></label>
      </div>
      <label className="verified-site-wide">Description<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.currentTarget.value })} /></label>
      <label className="verified-site-wide">Notes<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.currentTarget.value })} /></label>
      <fieldset className="video-server-detail-section">
        <legend>Supported capabilities</legend>
        <p className="muted">Descriptive metadata only. Enabling a capability does not run detection, extraction, playback, or downloads.</p>
        <div className="video-server-capabilities">
          {capabilityOptions.map(({ key, label }) => <label className="video-server-capability" key={key}>
            <input type="checkbox" checked={draft.capabilities[key]} onChange={(event) => setDraft({ ...draft, capabilities: { ...draft.capabilities, [key]: event.currentTarget.checked } })} />
            <span>{label}</span>
          </label>)}
        </div>
      </fieldset>
      <fieldset className="video-server-detail-section">
        <legend>Website compatibility</legend>
        <p className="muted">Manually recorded compatibility metadata. Blank metrics remain unknown.</p>
        <div className="video-server-compatibility-list">
          {draft.websiteCompatibility.map((item, index) => <section className="video-server-compatibility" key={index} aria-label={`Website compatibility ${index + 1}`}>
            <div className="verified-sites-grid">
              <label>Website ID<input value={item.websiteId} placeholder="site-a" onChange={(event) => updateCompatibility(index, { websiteId: event.currentTarget.value })} /></label>
              <label>Reliability score<input type="number" min={0} max={100} value={item.reliabilityScore ?? ''} placeholder="Unknown" onChange={(event) => updateNullableMetric(index, 'reliabilityScore', event.currentTarget.value)} /></label>
              <label>Detection success rate<input type="number" min={0} max={100} value={item.detectionSuccessRate ?? ''} placeholder="Unknown" onChange={(event) => updateNullableMetric(index, 'detectionSuccessRate', event.currentTarget.value)} /></label>
              <label>Average extraction time (ms)<input type="number" min={0} max={3600000} value={item.averageExtractionTimeMs ?? ''} placeholder="Unknown" onChange={(event) => updateNullableMetric(index, 'averageExtractionTimeMs', event.currentTarget.value)} /></label>
              <label>Last verified<input type="date" value={item.lastVerifiedAt?.slice(0, 10) ?? ''} onChange={(event) => updateCompatibility(index, { lastVerifiedAt: event.currentTarget.value || null })} /></label>
              <label className="video-server-preferred"><input type="checkbox" checked={item.preferredByDefault} onChange={(event) => updateCompatibility(index, { preferredByDefault: event.currentTarget.checked })} /><span>Preferred by default</span></label>
            </div>
            <label className="verified-site-wide">Compatibility notes<textarea value={item.notes} onChange={(event) => updateCompatibility(index, { notes: event.currentTarget.value })} /></label>
            <button type="button" className="btn small danger" onClick={() => setDraft({ ...draft, websiteCompatibility: draft.websiteCompatibility.filter((_, itemIndex) => itemIndex !== index) })}>Remove website</button>
          </section>)}
          {!draft.websiteCompatibility.length && <p className="muted">No website-specific compatibility recorded.</p>}
        </div>
        <button type="button" className="btn small" onClick={() => setDraft({ ...draft, websiteCompatibility: [...draft.websiteCompatibility, emptyCompatibility()] })}>Add website compatibility</button>
      </fieldset>
      <div className="verified-sites-actions"><button type="button" className="btn primary" onClick={() => {
        const existing = document.profiles.find((profile) => profile.id === draft.id);
        const result = upsertVideoServerProfile(document, existing ? { ...existing, ...draft } : draft);
        if (!result.value.profiles.some((profile) => profile.id === draft.id.trim().toLowerCase())) { setMessage(result.issues[0]?.message ?? 'A server ID and name are required.'); return; }
        persist(result.value); setDraft(null); setMessage(result.issues.length ? `Saved with ${result.issues.length} corrected value(s).` : 'Profile saved locally.');
      }}>Save profile</button><button type="button" className="btn" onClick={() => setDraft(null)}>Cancel</button></div>
    </div>}
    <details className="verified-sites-portable"><summary>Import or export JSON</summary>
      <textarea aria-label="Video Server Profiles JSON" value={portableJson} onChange={(event) => setPortableJson(event.currentTarget.value)} spellCheck={false} />
      <div className="verified-sites-actions"><button type="button" className="btn" onClick={() => setPortableJson(exportVideoServerProfilesDocument(document))}>Export JSON</button><button type="button" className="btn primary" disabled={!portableJson.trim()} onClick={() => { try { const result = importVideoServerProfilesDocument(portableJson); setDocument(result.value); setMessage(result.issues.length ? `Imported with ${result.issues.length} corrected value(s).` : 'Profiles imported.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Import failed.'); } }}>Validate and import</button></div>
    </details>
  </SettingsCard>;
}
