import { useCallback, useEffect, useMemo, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import { useT } from '../../../i18n';
import { useAssetInstalled } from '../../../assetStore';
import {
  getChineseScript,
  getStudyLang,
  onChineseScriptChanged,
  onStudyLangChanged,
  requiredAssetIds,
  requiredAssetsSizeLabel,
  setChineseScript,
  setStudyLang,
  type ChineseScript,
  type StudyLang,
} from '../../../studyEnvironment';
import { segButton as seg } from '../../ui/segButton';
import {
  STUDY_LANG_NAME_KEY,
  STUDY_LANG_NATIVE_NAME,
  STUDY_LANGS,
  studyLangTag,
} from '../../../../shared/studyLang';


/** Settings > Study — environment switch + missing starter assets CTA. */
export default function StudyLanguageSection() {
  const { t, lang: uiLang } = useT();
  const { focusSettingId } = useSettings();
  const [studyLang, setStudyLangState] = useState<StudyLang>(getStudyLang);
  const required = useMemo(() => requiredAssetIds(studyLang), [studyLang]);
  const primaryId = required[0] ?? '';
  const { installed } = useAssetInstalled(primaryId || 'cc-cedict');
  const [busy, setBusy] = useState(false);

  useEffect(() => onStudyLangChanged(setStudyLangState), []);
  const [chineseScript, setChineseScriptState] = useState<ChineseScript>(getChineseScript);
  useEffect(() => onChineseScriptChanged(setChineseScriptState), []);

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
          {STUDY_LANGS.map((code) => (
            <button
              key={code}
              type="button"
              {...seg(studyLang === code)}
              onClick={() => setStudyLang(code)}
              lang={studyLangTag(code, chineseScript)}
              title={t(STUDY_LANG_NAME_KEY[code])}
            >
              {STUDY_LANG_NATIVE_NAME[code]}
            </button>
          ))}
        </div>
        {studyLang === 'zh' && (
          <div className="sp-seg" role="group" aria-label={t('settings.study.zhScript.aria')}>
            <button
              type="button"
              {...seg(chineseScript === 'simplified')}
              onClick={() => setChineseScript('simplified')}
              lang="zh-Hans"
              title={t('settings.study.zhScript.simplified')}
            >
              简体
            </button>
            <button
              type="button"
              {...seg(chineseScript === 'traditional')}
              onClick={() => setChineseScript('traditional')}
              lang="zh-Hant"
              title={t('settings.study.zhScript.traditional')}
            >
              繁體
            </button>
          </div>
        )}
        <p className="muted os-set-hint">{t('settings.study.lang.imeHint')}</p>
      </SettingsCard>

      {missing && (
        <SettingsCard
          id="study-language-setup"
          title={t('settings.study.setup.title', {
            lang: t(STUDY_LANG_NAME_KEY[studyLang]),
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
