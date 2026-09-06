/**
 * Aero v1.0 audit item 5.4 — "Combine Translator settings with Model and
 * Dictionary configurations."
 *
 * DECISION, recorded here because the item's wording admits three readings and
 * the re-derivation (`docs/ACTIVE/V1_AUDIT_SECTION5_REDERIVATION.md`, 5.4)
 * flagged the choice rather than defaulting it:
 *
 *   (a) merge the `study` and `storage` nav pages into one,
 *   (b) put them in a nav group,
 *   (c) leave both pages alone and add the missing translator surface to the
 *       page that already IS "Models & dictionaries".
 *
 * (c) is taken. (a) and (b) restructure two large, working pages to satisfy a
 * word in an audit item, and `StoragePage`'s `GROUP_ORDER` already excludes
 * Whisper on purpose, so neither is the naive concatenation it looks like. The
 * measured user-visible defect is narrower than either: the Settings app has NO
 * translator surface at all, and searching it for "translator" returns nothing,
 * so the Translate app's languages are reachable only from inside the Translate
 * app. (c) closes exactly that, and is reversible.
 *
 * This is NOT a second editor for the same setting — the mistake item 5.3 had
 * just finished undoing on the Scraper page. The Translate toolbar's pickers are
 * a working control on live text; this card is the same preference reached from
 * where a user goes looking for language configuration. Both write through the
 * SINGLE owner of each key (`translateSource.ts`, `translateTarget.ts`), which
 * broadcasts, so the two cannot drift: change it here and a mounted Translate
 * view updates in place.
 */
import { useEffect, useState } from 'react';
import { useT } from '../../../i18n';
import SettingsCard from '../SettingsCard';
import { openSectionSurface } from '../../../sectionSurface';
import { getStudyLang } from '../../../studyEnvironment';
import {
  getTranslateSource,
  onTranslateSourceChanged,
  setTranslateSource,
} from '../../../translateSource';
import {
  getTranslateTarget,
  onTranslateTargetChanged,
  setTranslateTarget,
} from '../../../translateTarget';
import { LANG_LABELS, UI_LANGS, type UiLang } from '../../../../shared/i18n/core';

/**
 * The four translate languages are the four UI languages, with the same native
 * labels, so this reads the shared list rather than declaring a fifth copy of
 * it. `TranslateContent`'s own `LANG_ORDER` is left alone: it orders the
 * toolbar, and importing that module here would drag the translator, the
 * history store and the deck writer into the Settings bundle.
 */
export default function TranslatorDefaultsCard() {
  const { t } = useT();
  const [source, setSource] = useState(() => getTranslateSource(getStudyLang()));
  const [target, setTarget] = useState(() => getTranslateTarget());

  useEffect(() => onTranslateSourceChanged(setSource), []);
  useEffect(() => onTranslateTargetChanged(setTarget), []);

  /** Same rule the Translate toolbar enforces: never the same language twice. */
  const pickSource = (code: string) => {
    if (code === target) setTarget(setTranslateTarget(source));
    setSource(setTranslateSource(code));
  };
  const pickTarget = (code: string) => {
    if (code === source) setSource(setTranslateSource(target));
    setTarget(setTranslateTarget(code));
  };

  const options = (selected: string) =>
    UI_LANGS.map((code: UiLang) => (
      <option key={code} value={code}>
        {LANG_LABELS[code]}
      </option>
    )).concat(
      // A stored code outside the four (an older build, a hand-edited profile)
      // must still be shown, or this control would silently rewrite it on the
      // first change the user makes to the OTHER field.
      (UI_LANGS as readonly string[]).includes(selected)
        ? []
        : [<option key={selected} value={selected}>{selected}</option>],
    );

  return (
    <SettingsCard
      id="translator-languages"
      title={t('translator.card.title')}
      description={t('translator.card.desc')}
    >
      <div className="sp-row">
        <label htmlFor="translator-source">{t('translator.source')}</label>
        <select
          id="translator-source"
          className="set-select"
          value={source}
          onChange={(event) => pickSource(event.currentTarget.value)}
        >
          {options(source)}
        </select>
      </div>
      <div className="sp-row">
        <label htmlFor="translator-target">{t('translator.target')}</label>
        <select
          id="translator-target"
          className="set-select"
          value={target}
          onChange={(event) => pickTarget(event.currentTarget.value)}
        >
          {options(target)}
        </select>
      </div>
      <p className="muted">{t('translator.card.note')}</p>
      <div className="fm-actions">
        <button type="button" className="btn" onClick={() => openSectionSurface('translate')}>
          {t('translator.openApp')}
        </button>
      </div>
    </SettingsCard>
  );
}
