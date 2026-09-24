import { useState } from 'react';
import SettingsCard from '../SettingsCard';
import { type ExternalPlayerContentType, type ExternalPlayerProfile } from '../../../../shared/externalPlayer';
import { loadExternalPlayerPreferences, saveExternalPlayerPreferences } from '../../../externalPlayerStore';
import { useT } from '../../../i18n';

// Labels for the stored `contentType` enum; the <option value> stays the enum.
const CONTENT_TYPE_KEY: Record<ExternalPlayerContentType, string> = {
  video: 'externalPlayer.type.video',
  audio: 'externalPlayer.type.audio',
  any: 'externalPlayer.type.any',
};

const blank = (): ExternalPlayerProfile => ({ id: `player-${Date.now()}`, name: '', executablePath: '', os: 'all', contentType: 'video', arguments: ['{media}'], supportsSubtitles: false, supportsResume: false });

export default function ExternalPlayerPanel() {
  const { t } = useT();
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
  return <SettingsCard id="external-players" title={t('externalPlayer.title')} description={t('externalPlayer.description')}>
    <div className="field-row"><label htmlFor="external-default">{t('externalPlayer.defaultPlayer')}</label><select id="external-default" className="media-model-select" value={preferences.defaultProfileId ?? ''} onChange={(e) => commit({ ...preferences, defaultProfileId: e.currentTarget.value || null })}><option value="">{t('externalPlayer.choosePlayer')}</option>{preferences.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
    {preferences.profiles.map((profile) => <div className="field-row" key={profile.id}><span><strong>{profile.name}</strong><small className="muted">{profile.executablePath} · {t(CONTENT_TYPE_KEY[profile.contentType] ?? CONTENT_TYPE_KEY.any)}</small></span><button type="button" onClick={() => edit(profile)}>{t('externalPlayer.edit')}</button><button type="button" onClick={() => remove(profile.id)}>{t('common.remove')}</button></div>)}
    {draft && <fieldset className="unified-search-controls"><legend>{preferences.profiles.some((p) => p.id === draft.id) ? t('externalPlayer.editPlayer') : t('externalPlayer.addPlayer')}</legend>
      <div className="field-row"><label htmlFor="external-name">{t('externalPlayer.name')}</label><input id="external-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })} /></div>
      <div className="field-row"><label htmlFor="external-path">{t('externalPlayer.appPath')}</label><input id="external-path" value={draft.executablePath} placeholder={t('externalPlayer.pathPlaceholder')} onChange={(e) => setDraft({ ...draft, executablePath: e.currentTarget.value })} /></div>
      <div className="field-row"><label htmlFor="external-type">{t('externalPlayer.contentType')}</label><select id="external-type" value={draft.contentType} onChange={(e) => setDraft({ ...draft, contentType: e.currentTarget.value as ExternalPlayerContentType })}><option value="video">{t(CONTENT_TYPE_KEY.video)}</option><option value="audio">{t(CONTENT_TYPE_KEY.audio)}</option><option value="any">{t(CONTENT_TYPE_KEY.any)}</option></select></div>
      <div className="field-row"><label htmlFor="external-args">{t('externalPlayer.arguments')}</label><textarea id="external-args" value={draft.arguments.join('\n')} onChange={(e) => setDraft({ ...draft, arguments: e.currentTarget.value.split(/\r?\n/) })} /></div>
      <label className="os-set-toggle-row"><span><strong>{t('externalPlayer.subtitleSupport')}</strong><small className="muted">{t('externalPlayer.subtitleHint', { token: '{subtitle}' })}</small></span><input type="checkbox" checked={draft.supportsSubtitles} onChange={(e) => setDraft({ ...draft, supportsSubtitles: e.currentTarget.checked })} /></label>
      <label className="os-set-toggle-row"><span><strong>{t('externalPlayer.resumeSupport')}</strong><small className="muted">{t('externalPlayer.resumeHint')}</small></span><input type="checkbox" checked={draft.supportsResume} onChange={(e) => setDraft({ ...draft, supportsResume: e.currentTarget.checked })} /></label>
      <button type="button" className="btn primary" onClick={saveDraft} disabled={!draft.name.trim() || !draft.executablePath.trim()}>{t('externalPlayer.savePlayer')}</button> <button type="button" className="btn" onClick={() => setDraft(null)}>{t('common.cancel')}</button>
    </fieldset>}
    {!draft && <button type="button" className="btn primary" onClick={() => setDraft(blank())}>{t('externalPlayer.addPlayer')}</button>}
    {preferences.profiles.length === 0 && <p className="muted">{t('externalPlayer.empty')}</p>}
  </SettingsCard>;
}
