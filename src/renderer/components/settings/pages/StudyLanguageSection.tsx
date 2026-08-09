import { useCallback, useEffect, useMemo, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import { useT } from '../../../i18n';
import { useAssetInstalled } from '../../../assetStore';
import {
  getStudyLang,
  onStudyLangChanged,
  requiredAssetIds,
  requiredAssetsSizeLabel,
  setStudyLang,
  type StudyLang,
} from '../../../studyEnvironment';

function seg(active: boolean): string {
  return `btn small ${active ? 'primary' : ''}`;
}

/** Settings > Study — environment switch + missing starter assets CTA. */
export default function StudyLanguageSection() {
  const { t, lang: uiLang } = useT();
  const { focusSettingId } = useSettings();
  const [studyLang, setStudyLangState] = useState<StudyLang>(getStudyLang);
  const required = useMemo(() => requiredAssetIds(studyLang), [studyLang]);
  const primaryId = required[0] ?? '';
  const { installed, status } = useAssetInstalled(primaryId || 'cc-cedict');
  const [busy, setBusy] = useState(false);

  useEffect(() => onStudyLangChanged(setStudyLangState), []);

  useEffect(() => {
    if (status?.state === 'installed' && primaryId === 'cc-cedict') {
      // The CC-CEDICT index now lives in main (Phase 4), so this drops main's
      // cache rather than the renderer's.
      void window.api.resetChineseDictCache();
    }
  }, [status?.state, primaryId]);

  const missing = required.length > 0 && !installed;
  const sizeLabel = useMemo(() => requiredAssetsSizeLabel(studyLang), [studyLang, uiLang]);

  const startSetup = useCallback(async () => {
    if (!required.length || busy) return;
    setBusy(true);
    try {
      for (const id of required) {
        await window.api.assetsStart(id);
      }
    } finally {
      setBusy(false);
    }
  }, [required, busy]);

  return (
    <>
      <SettingsCard
        id="study-language"
        title={t('settings.study.lang.title')}
        description={t('settings.study.lang.desc')}
        highlight={focusSettingId === 'study-language'}
      >
        <div className="sp-seg" role="group" aria-label={t('settings.study.lang.aria')}>
          <button
            type="button"
            className={seg(studyLang === 'ja')}
            onClick={() => setStudyLang('ja')}
            lang="ja"
          >
            日本語
          </button>
          <button
            type="button"
            className={seg(studyLang === 'zh')}
            onClick={() => setStudyLang('zh')}
            lang="zh"
          >
            中文
          </button>
        </div>
        <p className="muted os-set-hint">{t('settings.study.lang.imeHint')}</p>
      </SettingsCard>

      {missing && (
        <SettingsCard
          id="study-language-setup"
          title={t('settings.study.setup.title', {
            lang: studyLang === 'zh' ? t('settings.study.lang.zh') : t('settings.study.lang.ja'),
          })}
          description={t('settings.study.setup.desc', {
            count: required.length,
            size: sizeLabel,
          })}
          highlight={focusSettingId === 'study-language-setup'}
        >
          <button type="button" className="btn primary" onClick={() => void startSetup()} disabled={busy}>
            {busy
              ? t('settings.study.setup.working')
              : t('settings.study.setup.cta', {
                  count: required.length,
                  size: sizeLabel,
                })}
          </button>
        </SettingsCard>
      )}
    </>
  );
}
