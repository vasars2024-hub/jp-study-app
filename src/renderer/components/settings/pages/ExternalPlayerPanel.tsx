import { useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useT } from '../../../i18n';
import {
  externalPlayerPresetFor,
  type ExternalPlayerContentType,
  type ExternalPlayerPreferences,
  type ExternalPlayerProfile,
} from '../../../../shared/externalPlayer';
import {
  commitExternalPlayerPreferences,
  hydrateExternalPlayerPreferences,
  loadExternalPlayerPreferences,
  onExternalPlayerPreferencesChanged,
} from '../../../externalPlayerStore';
import { Select, SwitchRow } from '../../ui';

const blank = (): ExternalPlayerProfile => ({
  id: `player-${Date.now()}`,
  name: '',
  executablePath: '',
  os: 'all',
  contentType: 'video',
  arguments: ['{media}'],
  supportsSubtitles: false,
  supportsResume: false,
});

/** Placeholders are passed as variables so no catalog ever has to spell them. */
const PLACEHOLDERS: Record<string, string> = Object.fromEntries(
  ['media', 'subtitle', 'position', 'title'].map((name) => [name, `{${name}}`]),
);

export default function ExternalPlayerPanel() {
  const { t } = useT();
  const [preferences, setPreferences] = useState(loadExternalPlayerPreferences);
  const [draft, setDraft] = useState<ExternalPlayerProfile | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'status'; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void hydrateExternalPlayerPreferences().then((value) => { if (alive) setPreferences(value); });
    const off = onExternalPlayerPreferencesChanged((value) => setPreferences(value));
    return () => { alive = false; off(); };
  }, []);

  const commit = async (next: ExternalPlayerPreferences): Promise<boolean> => {
    setMessage(null);
    try {
      const result = await commitExternalPlayerPreferences(next);
      setPreferences(result.preferences);
      if (result.rejected.length) {
        const profile = next.profiles.find((entry) => entry.id === result.rejected[0].id);
        setMessage({
          kind: 'error',
          text: t(`externalPlayer.error.${result.rejected[0].problem}`, { name: profile?.name ?? '', path: profile?.executablePath ?? '' }),
        });
        return false;
      }
      return true;
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
      return false;
    }
  };

  const edit = (profile: ExternalPlayerProfile) => setDraft({ ...profile, arguments: [...profile.arguments] });

  /** A known player (VLC, mpv, MPC, PotPlayer, IINA) gets working arguments without the user typing any. */
  const setPath = (executablePath: string) => {
    if (!draft) return;
    const untouched = draft.arguments.join('\n').trim() === '{media}';
    const preset = untouched ? externalPlayerPresetFor(executablePath) : null;
    const guessedName = executablePath.split(/[\\/]/).pop()?.replace(/\.(exe|com|app)$/i, '') ?? '';
    setDraft({
      ...draft,
      executablePath,
      name: draft.name || guessedName,
      ...(preset ?? {}),
    });
  };

  const browse = async () => {
    const picked = await window.api?.externalPlayerChooseExecutable?.().catch(() => null);
    if (picked) setPath(picked);
  };

  const saveDraft = async () => {
    if (!draft?.name.trim() || !draft.executablePath.trim()) return;
    const cleaned = { ...draft, arguments: draft.arguments.map((line) => line.trim()).filter(Boolean) };
    const profiles = preferences.profiles.some((p) => p.id === cleaned.id)
      ? preferences.profiles.map((p) => (p.id === cleaned.id ? cleaned : p))
      : [...preferences.profiles, cleaned];
    const ok = await commit({ ...preferences, profiles, defaultProfileId: preferences.defaultProfileId ?? cleaned.id });
    if (ok) setDraft(null);
  };

  const remove = (id: string) => void commit({
    ...preferences,
    profiles: preferences.profiles.filter((p) => p.id !== id),
    defaultProfileId: preferences.defaultProfileId === id ? null : preferences.defaultProfileId,
    lastUsedProfileId: preferences.lastUsedProfileId === id ? null : preferences.lastUsedProfileId,
  });

  const contentLabel = (type: ExternalPlayerContentType): string => t(`externalPlayer.contentType.${type}`);

  return <SettingsCard id="external-players" title={t('externalPlayer.title')} description={t('externalPlayer.desc')}>
    <div className="ui-control-row">
      <label htmlFor="external-default">{t('externalPlayer.default')}</label>
      <select
        id="external-default"
        className="media-model-select"
        value={preferences.defaultProfileId ?? ''}
        // Choosing a default is a statement about which player to use, so it
        // supersedes the remembered last-used one.
        onChange={(e) => void commit({ ...preferences, defaultProfileId: e.currentTarget.value || null, lastUsedProfileId: null })}
      >
        <option value="">{t('externalPlayer.chooseDefault')}</option>
        {preferences.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
    {preferences.profiles.map((profile) => <div className="ui-control-row" key={profile.id}>
      <span>
        <strong>{profile.name}</strong>
        <small className="muted">
          {profile.executablePath} · {contentLabel(profile.contentType)}
          {preferences.lastUsedProfileId === profile.id ? ` · ${t('externalPlayer.lastUsed')}` : ''}
        </small>
      </span>
      <button className="btn" type="button" onClick={() => edit(profile)}>{t('externalPlayer.edit')}</button>
      <button className="btn" type="button" onClick={() => remove(profile.id)}>{t('externalPlayer.remove')}</button>
    </div>)}
    {draft && <fieldset className="ui-group">
      <legend className="ui-group__title">{preferences.profiles.some((p) => p.id === draft.id) ? t('externalPlayer.editTitle') : t('externalPlayer.addTitle')}</legend>
      <div className="ui-control-row">
        <label htmlFor="external-name">{t('externalPlayer.name')}</label>
        <input id="external-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })} />
      </div>
      <div className="ui-control-row">
        <label htmlFor="external-path">{t('externalPlayer.path')}</label>
        <input
          id="external-path"
          value={draft.executablePath}
          onChange={(e) => setPath(e.currentTarget.value)}
        />
        <button className="btn" type="button" onClick={() => void browse()}>{t('externalPlayer.browse')}</button>
      </div>
      <div className="ui-control-row">
        <label htmlFor="external-type">{t('externalPlayer.contentType')}</label>
        <Select id="external-type" value={draft.contentType} onChange={(e) => setDraft({ ...draft, contentType: e.currentTarget.value as ExternalPlayerContentType })}>
          <option value="video">{contentLabel('video')}</option>
          <option value="audio">{contentLabel('audio')}</option>
          <option value="any">{contentLabel('any')}</option>
        </Select>
      </div>
      <div className="ui-control-row">
        <label htmlFor="external-args">{t('externalPlayer.arguments')}</label>
        <textarea id="external-args" value={draft.arguments.join('\n')} onChange={(e) => setDraft({ ...draft, arguments: e.currentTarget.value.split(/\r?\n/) })} />
      </div>
      <small className="muted">{t('externalPlayer.argumentsHint', PLACEHOLDERS)}</small>
      <SwitchRow
        title={t('externalPlayer.subtitles')}
        description={t('externalPlayer.subtitlesHint', PLACEHOLDERS)}
        checked={draft.supportsSubtitles}
        onChange={(e) => setDraft({ ...draft, supportsSubtitles: e.currentTarget.checked })}
      />
      <SwitchRow
        title={t('externalPlayer.resume')}
        description={t('externalPlayer.resumeHint', PLACEHOLDERS)}
        checked={draft.supportsResume}
        onChange={(e) => setDraft({ ...draft, supportsResume: e.currentTarget.checked })}
      />
      <button type="button" className="btn primary" onClick={() => void saveDraft()} disabled={!draft.name.trim() || !draft.executablePath.trim()}>{t('externalPlayer.save')}</button>
      {' '}
      <button type="button" className="btn" onClick={() => setDraft(null)}>{t('externalPlayer.cancel')}</button>
    </fieldset>}
    {!draft && <button type="button" className="btn primary" onClick={() => setDraft(blank())}>{t('externalPlayer.add')}</button>}
    {preferences.profiles.length === 0 && <p className="muted">{t('externalPlayer.empty')}</p>}
    {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'subtitle-test-fail' : 'muted'}>{message.text}</p>}
  </SettingsCard>;
}
