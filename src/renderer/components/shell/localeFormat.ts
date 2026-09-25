/**
 * Numbers in the UI language (round-2 audit V12).
 *
 * A Russian UI printed "1.7 GB", "1.80" and "1.00×": `toFixed` always writes a
 * dot, and the size units were English literals. Everything here formats through
 * `Intl.NumberFormat` with the UI locale, and the unit words come from the
 * catalogue.
 *
 * Importing this module registers the byte-size locale with the shared
 * `formatBytes`, so every existing caller — Storage, the AI model installer, the
 * asset prompt, the Anki media panel — follows the UI language without each one
 * having to thread a locale through. It is imported by `ToastHost`, which every
 * renderer shell mounts exactly once.
 */
import { setByteFormatLocaleProvider, type ByteFormatLocale } from '../../../shared/assetRegistry';
import { LANG_TAGS, type UiLang } from '../../../shared/i18n/core';
import { getUiLang, t } from '../../i18n';

const UNIT_KEYS = ['shell.unit.byte', 'shell.unit.kb', 'shell.unit.mb', 'shell.unit.gb', 'shell.unit.tb'] as const;

/** The current UI language's byte-size locale. */
export function currentByteLocale(): ByteFormatLocale {
  return { tag: LANG_TAGS[getUiLang()], units: UNIT_KEYS.map((key) => t(key)) };
}

setByteFormatLocaleProvider(() => {
  try {
    return currentByteLocale();
  } catch {
    // i18n not initialised (a partial test double, say): keep the plain English form.
    return null;
  }
});

/**
 * A fixed-precision decimal in the UI language: `formatDecimal(1.8, 2, 'ru')` is
 * "1,80". Used by the settings steppers that used to print `toFixed`.
 */
export function formatDecimal(value: number, digits: number, lang: UiLang = getUiLang()): string {
  try {
    return new Intl.NumberFormat(LANG_TAGS[lang], {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return value.toFixed(digits);
  }
}
