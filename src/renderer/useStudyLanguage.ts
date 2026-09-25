/**
 * The study language as React state: `{ lang, script, tag }`, re-rendering on a
 * switch in Settings > Study (and on a Simplified/Traditional change). Surfaces
 * that label or tag study-language content read it here instead of assuming
 * Japanese — a Chinese or Russian learner must not see "日本語" columns or
 * `lang="ja"` on their subtitles.
 */
import { useEffect, useState } from 'react';
import {
  getChineseScript,
  getStudyLang,
  onChineseScriptChanged,
  onStudyLangChanged,
  studyContentLang,
  type ChineseScript,
  type StudyLang,
} from './studyEnvironment';

export interface StudyLanguageInfo {
  lang: StudyLang;
  script: ChineseScript;
  /** `ja`, `ru`, `zh-Hans` or `zh-Hant` — for `lang` attributes. */
  tag: string;
}

function read(): StudyLanguageInfo {
  const lang = getStudyLang();
  return { lang, script: getChineseScript(), tag: studyContentLang(lang) };
}

export function useStudyLanguage(): StudyLanguageInfo {
  const [info, setInfo] = useState<StudyLanguageInfo>(read);
  useEffect(() => {
    const update = (): void => setInfo(read());
    const offLang = onStudyLangChanged(update);
    const offScript = onChineseScriptChanged(update);
    return () => {
      offLang();
      offScript();
    };
  }, []);
  return info;
}
