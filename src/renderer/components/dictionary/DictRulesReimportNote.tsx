// The note on a Yomitan dictionary row (Settings → Study → Dictionaries) that
// was imported before the term bank's rules column (`row[3]`) was read.
//
// The import now folds that column into the part-of-speech list the
// de-inflection check reads (`main/dictionary/yomitanZip.ts`). An older store
// cannot be upgraded in place because the zip is not kept, so the row says what
// is missing and how to get it. Bundled dictionaries are provisioned by the app
// and carry their parts of speech in the definition tags, so they never show it.
//
// Strings are their own lazy pack (shared/i18n/dictRulesUi): English is bundled
// as the fallback, the other three load the first time a row needs them.

import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { translate, type Catalog, type UiLang } from '../../../shared/i18n/core';
import { DICT_RULES_UI_EN } from '../../../shared/i18n/dictRulesUi/en';
import type { YomitanDictInfo } from '../../../shared/types';

/** Whether this dictionary row should offer the re-import. */
export function needsRulesReimport(d: Pick<YomitanDictInfo, 'hasTerms' | 'bundled' | 'rulesColumn'>): boolean {
  return d.hasTerms && !d.bundled && d.rulesColumn !== true;
}

const packs = new Map<UiLang, Catalog>([['en', DICT_RULES_UI_EN]]);

function importPack(lang: UiLang): Promise<Catalog> {
  // Literal paths, so the bundler emits one chunk per language.
  switch (lang) {
    case 'ja':
      return import('../../../shared/i18n/dictRulesUi/ja').then((m) => m.DICT_RULES_UI_JA);
    case 'zh':
      return import('../../../shared/i18n/dictRulesUi/zh').then((m) => m.DICT_RULES_UI_ZH);
    case 'ru':
      return import('../../../shared/i18n/dictRulesUi/ru').then((m) => m.DICT_RULES_UI_RU);
    default:
      return Promise.resolve(DICT_RULES_UI_EN);
  }
}

/** Load the note's strings for `lang`. Never rejects: a failed chunk leaves English. */
export function loadDictRulesStrings(lang: UiLang): Promise<void> {
  if (packs.has(lang)) return Promise.resolve();
  return importPack(lang).then(
    (pack) => {
      packs.set(lang, pack);
    },
    () => undefined,
  );
}

export default function DictRulesReimportNote({ dict }: { dict: YomitanDictInfo }) {
  const { lang } = useT();
  const [, setLoaded] = useState(0);
  const show = needsRulesReimport(dict);

  useEffect(() => {
    if (!show || packs.has(lang)) return undefined;
    let alive = true;
    void loadDictRulesStrings(lang).then(() => {
      if (alive) setLoaded((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [show, lang]);

  if (!show) return null;
  const text = translate('dictRules.reimport.note', undefined, {
    lang,
    catalog: packs.get(lang) ?? DICT_RULES_UI_EN,
    fallback: DICT_RULES_UI_EN,
  });
  return (
    <div className="set-row-desc muted" data-dict-rules-reimport={dict.id}>
      {text}
    </div>
  );
}
