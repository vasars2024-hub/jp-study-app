import { useEffect, useState } from 'react';
import type { DictDisplayPrefs, DictResultMode } from '../../../shared/dictDisplay';
import {
  audioSourceDisplayName,
  nextLocalAudioSourceId,
  MAX_LOCAL_AUDIO_FOLDERS,
  type AudioSourceConfig,
  type AudioSourcesPrefs,
} from '../../../shared/audioSources';
import { getDictDisplayPrefs, loadDictDisplayPrefs, saveDictDisplayPrefs } from '../../dictDisplayPrefs';
import { loadAudioSources, saveAudioSources } from '../../audioSourcesClient';
import { useT } from '../../i18n';
import { LANG_TAGS } from '../../../shared/i18n/core';

/**
 * Settings → Dictionary: how results are laid out (Yomitan's "group by term"
 * vs "merge", secondary dictionaries collapsed) and where pronunciations come
 * from (an ordered list with fallback: the JapanesePod101 CDN and any local
 * folders of recordings the user installed). Which dictionaries answer, and in
 * what order, is the source list right below this in the same section.
 */
export default function DictionaryDisplaySettings() {
  const { t, lang } = useT();
  const [prefs, setPrefs] = useState<DictDisplayPrefs>(getDictDisplayPrefs);
  const [audio, setAudio] = useState<AudioSourcesPrefs | null>(null);
  const [counts, setCounts] = useState<Record<string, { files: number; truncated: boolean; exists: boolean }>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadDictDisplayPrefs(true).then((next) => {
      if (alive) setPrefs(next);
    });
    void loadAudioSources(true).then((next) => {
      if (alive) setAudio(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Recording counts for each local folder, so a wrong folder is visible at once.
  useEffect(() => {
    const api = window.api?.dictAudioFolderStats;
    if (!audio || typeof api !== 'function') return undefined;
    let alive = true;
    for (const source of audio.sources) {
      if (source.kind !== 'local' || !source.folder || counts[source.folder]) continue;
      const folder = source.folder;
      void api(folder)
        .then((stats) => {
          if (alive) setCounts((prev) => ({ ...prev, [folder]: stats }));
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [audio]);

  const setMode = (mode: DictResultMode) => {
    const next = { ...prefs, mode };
    setPrefs(next);
    void saveDictDisplayPrefs(next);
  };
  const setCollapse = (collapseSecondary: boolean) => {
    const next = { ...prefs, collapseSecondary };
    setPrefs(next);
    void saveDictDisplayPrefs(next);
  };

  const commitAudio = async (sources: AudioSourceConfig[]) => {
    setBusy(true);
    try {
      setAudio(await saveAudioSources({ sources }));
    } finally {
      setBusy(false);
    }
  };
  const moveAudio = (index: number, delta: -1 | 1) => {
    if (!audio) return;
    const target = index + delta;
    if (target < 0 || target >= audio.sources.length) return;
    const next = [...audio.sources];
    [next[index], next[target]] = [next[target], next[index]];
    void commitAudio(next);
  };
  const toggleAudio = (index: number, enabled: boolean) => {
    if (!audio) return;
    void commitAudio(audio.sources.map((source, i) => (i === index ? { ...source, enabled } : source)));
  };
  const removeAudio = (index: number) => {
    if (!audio) return;
    void commitAudio(audio.sources.filter((_, i) => i !== index));
  };
  const addFolder = async () => {
    const pick = window.api?.dictAudioFolderPick;
    if (!audio || typeof pick !== 'function') return;
    const folder = await pick();
    if (!folder || audio.sources.some((source) => source.folder === folder)) return;
    // A new folder goes first: someone who installs recordings wants them used.
    void commitAudio([{ id: nextLocalAudioSourceId(audio), kind: 'local', enabled: true, folder }, ...audio.sources]);
  };

  const localCount = audio?.sources.filter((source) => source.kind === 'local').length ?? 0;

  return (
    <>
      <h3 className="set-subhead">{t('dict3.settings.layoutTitle')}</h3>
      <p className="set-row-desc muted">{t('dict3.settings.layoutIntro')}</p>
      <div className="set-row" role="radiogroup" aria-label={t('dict3.settings.layoutTitle')}>
        <label className="set-row-title">
          <input type="radio" name="dict-layout" checked={prefs.mode === 'grouped'} onChange={() => setMode('grouped')} />{' '}
          {t('dict3.settings.grouped')}
        </label>
        <label className="set-row-title">
          <input type="radio" name="dict-layout" checked={prefs.mode === 'merged'} onChange={() => setMode('merged')} />{' '}
          {t('dict3.settings.merged')}
        </label>
      </div>
      <div className="set-row">
        <label className="set-row-title">
          <input
            type="checkbox"
            checked={prefs.collapseSecondary}
            disabled={prefs.mode !== 'grouped'}
            onChange={(event) => setCollapse(event.target.checked)}
          />{' '}
          {t('dict3.settings.collapse')}
        </label>
      </div>

      <h3 className="set-subhead">{t('dict3.settings.audioTitle')}</h3>
      <p className="set-row-desc muted">{t('dict3.settings.audioIntro')}</p>
      {audio && (
        <ul className="dict-manage-list">
          {audio.sources.map((source, index) => {
            const name = audioSourceDisplayName(source);
            const stats = source.folder ? counts[source.folder] : undefined;
            return (
              <li className={`dict-manage-row ${source.enabled ? '' : 'off'}`} key={source.id}>
                <label className="dict-manage-toggle" title={t('dict3.settings.audioUse')}>
                  <input
                    type="checkbox"
                    aria-label={`${t('dict3.settings.audioUse')}: ${name}`}
                    checked={source.enabled}
                    disabled={busy}
                    onChange={(event) => toggleAudio(index, event.target.checked)}
                  />
                </label>
                <div className="dict-manage-info">
                  <div className="set-row-title">{name}</div>
                  <div className="set-row-desc muted">
                    {source.kind === 'jpod101'
                      ? t('dict3.settings.audioCdn')
                      : stats && !stats.exists
                        ? t('dict3.settings.audioMissingFolder')
                        : stats
                          ? t('dict3.settings.audioFiles', {
                              count: stats.files,
                              files: stats.files.toLocaleString(LANG_TAGS[lang]),
                            })
                          : source.folder}
                  </div>
                </div>
                <div className="dict-manage-actions">
                  <button
                    className="btn small"
                    title={t('dict3.settings.audioUp')}
                    aria-label={`${t('dict3.settings.audioUp')}: ${name}`}
                    disabled={busy || index === 0}
                    onClick={() => moveAudio(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="btn small"
                    title={t('dict3.settings.audioDown')}
                    aria-label={`${t('dict3.settings.audioDown')}: ${name}`}
                    disabled={busy || index === audio.sources.length - 1}
                    onClick={() => moveAudio(index, 1)}
                  >
                    ↓
                  </button>
                  {source.kind === 'local' && (
                    <button className="btn small" disabled={busy} onClick={() => removeAudio(index)}>
                      {t('common.remove')}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="set-profile-actions">
        <button
          className="btn"
          disabled={busy || !audio || localCount >= MAX_LOCAL_AUDIO_FOLDERS}
          onClick={() => void addFolder()}
        >
          {t('dict3.settings.audioAddFolder')}
        </button>
      </div>
      <p className="set-row-desc muted">{t('dict3.settings.audioLayouts')}</p>
    </>
  );
}
