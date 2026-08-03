import { useState } from 'react';
import SettingsCard from '../SettingsCard';
import { type ExternalPlayerContentType, type ExternalPlayerProfile } from '../../../../shared/externalPlayer';
import { loadExternalPlayerPreferences, saveExternalPlayerPreferences } from '../../../externalPlayerStore';

const blank = (): ExternalPlayerProfile => ({ id: `player-${Date.now()}`, name: '', executablePath: '', os: 'all', contentType: 'video', arguments: ['{media}'], supportsSubtitles: false, supportsResume: false });

export default function ExternalPlayerPanel() {
  const [preferences, setPreferences] = useState(loadExternalPlayerPreferences);
  const [draft, setDraft] = useState<ExternalPlayerProfile | null>(null);
  const commit = (next: typeof preferences) => setPreferences(saveExternalPlayerPreferences(next));
  const edit = (profile: ExternalPlayerProfile) => setDraft({ ...profile, arguments: [...profile.arguments] });
  const saveDraft = () => {
    if (!draft?.name.trim() || !draft.executablePath.trim()) return;
    const profiles = preferences.profiles.some((p) => p.id === draft.id)
      ? preferences.profiles.map((p) => p.id === draft.id ? draft : p)
      : [...preferences.profiles, draft];
    commit({ ...preferences, profiles, defaultProfileId: preferences.defaultProfileId ?? draft.id });
    setDraft(null);
  };
  const remove = (id: string) => commit({ ...preferences, profiles: preferences.profiles.filter((p) => p.id !== id), defaultProfileId: preferences.defaultProfileId === id ? null : preferences.defaultProfileId, lastUsedProfileId: preferences.lastUsedProfileId === id ? null : preferences.lastUsedProfileId });
  return <SettingsCard id="external-players" title="External players" description="Delegate playback to VLC, mpv, IINA, or another local application. Media stays outside this app.">
    <div className="field-row"><label htmlFor="external-default">Default player</label><select id="external-default" className="media-model-select" value={preferences.defaultProfileId ?? ''} onChange={(e) => commit({ ...preferences, defaultProfileId: e.currentTarget.value || null })}><option value="">Choose a player</option>{preferences.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
    {preferences.profiles.map((profile) => <div className="field-row" key={profile.id}><span><strong>{profile.name}</strong><small className="muted">{profile.executablePath} · {profile.contentType}</small></span><button type="button" onClick={() => edit(profile)}>Edit</button><button type="button" onClick={() => remove(profile.id)}>Remove</button></div>)}
    {draft && <fieldset className="unified-search-controls"><legend>{preferences.profiles.some((p) => p.id === draft.id) ? 'Edit player' : 'Add player'}</legend>
      <div className="field-row"><label htmlFor="external-name">Name</label><input id="external-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })} /></div>
      <div className="field-row"><label htmlFor="external-path">Application path</label><input id="external-path" value={draft.executablePath} placeholder="C:\\Program Files\\VideoLAN\\VLC\\vlc.exe" onChange={(e) => setDraft({ ...draft, executablePath: e.currentTarget.value })} /></div>
      <div className="field-row"><label htmlFor="external-type">Content type</label><select id="external-type" value={draft.contentType} onChange={(e) => setDraft({ ...draft, contentType: e.currentTarget.value as ExternalPlayerContentType })}><option value="video">Video</option><option value="audio">Audio</option><option value="any">Any</option></select></div>
      <div className="field-row"><label htmlFor="external-args">Arguments (one per line)</label><textarea id="external-args" value={draft.arguments.join('\n')} onChange={(e) => setDraft({ ...draft, arguments: e.currentTarget.value.split(/\r?\n/) })} /></div>
      <label className="os-set-toggle-row"><span><strong>Subtitle support</strong><small className="muted">Pass {`{subtitle}`} when a subtitle file is selected.</small></span><input type="checkbox" checked={draft.supportsSubtitles} onChange={(e) => setDraft({ ...draft, supportsSubtitles: e.currentTarget.checked })} /></label>
      <label className="os-set-toggle-row"><span><strong>Resume support</strong><small className="muted">The handoff includes the saved position when available.</small></span><input type="checkbox" checked={draft.supportsResume} onChange={(e) => setDraft({ ...draft, supportsResume: e.currentTarget.checked })} /></label>
      <button type="button" className="btn primary" onClick={saveDraft} disabled={!draft.name.trim() || !draft.executablePath.trim()}>Save player</button> <button type="button" className="btn" onClick={() => setDraft(null)}>Cancel</button>
    </fieldset>}
    {!draft && <button type="button" className="btn primary" onClick={() => setDraft(blank())}>Add player</button>}
    {preferences.profiles.length === 0 && <p className="muted">No player profiles yet. Add one to enable playback handoff.</p>}
  </SettingsCard>;
}
