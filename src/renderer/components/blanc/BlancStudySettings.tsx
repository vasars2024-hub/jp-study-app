/**
 * The Study OS settings a Blanc user actually needs, without leaving Blanc.
 *
 * Study OS's Settings app is a full window (and Blanc never mounts a Study OS
 * `*View`), so these were reachable only through a Study OS pop-out — in a
 * Blanc-only session, that meant opening the whole desktop to change the study
 * language or to see whether the extension is connected. This section reads
 * and writes the same stores and IPC the Settings app uses; nothing is
 * duplicated, and the fuller pages stay one click away.
 */
import { useCallback, useEffect, useState } from 'react';
import { LANG_LABELS } from '../../../shared/i18n/core';
import { STUDY_LANGS, type StudyLang } from '../../../shared/studyLang';
import type { AnkiStatus } from '../../../shared/types';
import { useT } from '../../i18n';
import { getStudyLang, onStudyLangChanged, setStudyLang } from '../../studyEnvironment';
import { getActiveProfile } from '../../profileState';

interface ExtensionState {
  running: boolean;
  version: string;
}

interface DictionaryState {
  sources: number;
  entries: number;
}

export function BlancStudySettings({ onOpenDeck }: { onOpenDeck: () => void }) {
  const { t } = useT();
  const [studyLang, setStudyLangState] = useState<StudyLang>(() => getStudyLang());
  const [anki, setAnki] = useState<AnkiStatus | null>(null);
  const [extension, setExtension] = useState<ExtensionState | null>(null);
  const [dictionary, setDictionary] = useState<DictionaryState | null>(null);
  const [version, setVersion] = useState('');
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => onStudyLangChanged(setStudyLangState), []);

  const refresh = useCallback(() => {
    // Each probe is independent and may fail on its own (Anki closed, an older
    // main build): a failure shows as "unavailable", never as a stuck panel.
    void window.api.ankiStatus().then(setAnki).catch(() => setAnki({ connected: false, decks: [], models: [] }));
    void window.api.extensionStatus()
      .then((status) => setExtension({ running: status.running, version: status.extensionVersion }))
      .catch(() => setExtension(null));
    void window.api.dictListSources()
      .then((sources) => {
        const enabled = sources.filter((source) => source.enabled);
        setDictionary({ sources: enabled.length, entries: enabled.reduce((sum, s) => sum + (s.entryCount || 0), 0) });
      })
      .catch(() => setDictionary(null));
    void window.api.appVersion().then(setVersion).catch(() => setVersion(''));
  }, []);

  useEffect(() => refresh(), [refresh]);

  const checkUpdates = async (): Promise<void> => {
    setChecking(true);
    setNote('');
    try {
      const { checkForAppRelease } = await import('../../releaseCheck');
      await checkForAppRelease({ force: true });
      setNote(t('blanc.refine.study.updatesChecked'));
    } catch (error) {
      setNote(t('blanc.refine.study.updatesFailed', { detail: error instanceof Error ? error.message : String(error) }));
    } finally {
      setChecking(false);
    }
  };

  const profileDeck = getActiveProfile().anki.deckName || '';

  return (
    <fieldset data-blanc-setting="study" tabIndex={-1}>
      <legend>{t('blanc.refine.study.legend')}</legend>
      <p className="blanc-note">{t('blanc.refine.study.note')}</p>

      <label>
        {t('blanc.refine.study.language')}
        <select
          value={studyLang}
          onChange={(event) => {
            const next = event.target.value as StudyLang;
            setStudyLang(next);
            setStudyLangState(next);
          }}
        >
          {STUDY_LANGS.map((lang) => (
            <option key={lang} value={lang} lang={lang}>
              {LANG_LABELS[lang]}
            </option>
          ))}
        </select>
      </label>

      <div className="blanc-status-row">
        <span className={`blanc-status-dot${anki?.connected ? ' ok' : ''}`} aria-hidden />
        <span>
          {anki === null
            ? t('blanc.refine.study.checking')
            : anki.connected
              ? t('blanc.refine.study.ankiConnected', { count: anki.decks.length })
              : t('blanc.refine.study.ankiOffline')}
        </span>
        {profileDeck && <span>{t('blanc.refine.study.ankiDeck', { deck: profileDeck })}</span>}
        <button type="button" onClick={onOpenDeck}>{t('blanc.refine.study.ankiOpen')}</button>
      </div>

      <div className="blanc-status-row">
        <span>
          {dictionary === null
            ? t('blanc.refine.study.dictUnavailable')
            : t('blanc.refine.study.dictStatus', { count: dictionary.sources, entries: dictionary.entries })}
        </span>
      </div>

      <div className="blanc-status-row">
        <span className={`blanc-status-dot${extension?.running ? ' ok' : ''}`} aria-hidden />
        <span>
          {extension === null
            ? t('blanc.refine.study.extensionUnavailable')
            : extension.running
              ? t('blanc.refine.study.extensionRunning', { version: extension.version || '—' })
              : t('blanc.refine.study.extensionStopped')}
        </span>
      </div>

      <div className="blanc-status-row">
        {version && <span>{t('blanc.refine.study.version', { version })}</span>}
        <button type="button" disabled={checking} onClick={() => void checkUpdates()}>
          {checking ? t('blanc.refine.study.checkingUpdates') : t('blanc.refine.study.checkUpdates')}
        </button>
        <button type="button" onClick={refresh}>{t('blanc.refine.study.refresh')}</button>
      </div>
      {note && <p className="blanc-note" role="status">{note}</p>}
    </fieldset>
  );
}
