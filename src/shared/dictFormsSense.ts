/**
 * JMdict-for-Yomitan's "forms" rows.
 *
 * The bundled JMdict (yomidevs/jmdict-yomitan) carries, next to each word's real
 * glosses, one extra term row tagged `forms` ("other surface forms and readings")
 * whose glossary is a structured-content TABLE: spellings down the side, readings
 * across the top, and a mark per cell (★ priority form, ⛬ irregular, …). Gum's
 * importer has no table renderer, so the table was flattened into one string and
 * the database merged it into the word as an ordinary sense — the dictionary
 * popups (app and browser extension) then showed `図書館としょかん★ずしょかん⛬` as if
 * it were a meaning.
 *
 * The headword and reading are already the popup's headline, so the row is
 * dropped at the lookup boundary instead of being re-rendered. Recognised by its
 * tag (raw `forms` or the tag bank's resolved description); a stored row whose
 * tags were lost is recognised by its shape: no part of speech, and every gloss
 * is the flattened table — kana/kanji plus the table's marks, no Latin text.
 */

const FORMS_TAGS = new Set(['forms', 'other surface forms and readings']);

/** The marks jmdict-yomitan writes in a forms-table cell. */
const FORMS_MARKS = /[★⛬◇△▽○◯◎❌✕]/u;
const LATIN_OR_DIGIT = /[A-Za-z0-9Ѐ-ӿ]/;
const JAPANESE = /[぀-ヿ㐀-鿿豈-﫿々〆ヶ]/u;

export interface FormsSenseLike {
  /** Part-of-speech codes (`pos` on database senses, `partsOfSpeech` on legacy ones). */
  pos?: readonly string[];
  partsOfSpeech?: readonly string[];
  tags?: readonly string[];
  /** Gloss strings (legacy `definitions`, or the database `glosses[].text`). */
  definitions?: readonly string[];
  glosses?: readonly { text: string }[];
}

/** One flattened forms table, e.g. `図書館としょかん★ずしょかん⛬`. */
export function looksLikeFlattenedFormsTable(text: string): boolean {
  const t = String(text ?? '').trim();
  if (!t || LATIN_OR_DIGIT.test(t)) return false;
  return FORMS_MARKS.test(t) && JAPANESE.test(t);
}

/** True for a sense that is JMdict's forms table rather than a meaning. */
export function isFormsSense(sense: FormsSenseLike): boolean {
  if ((sense.tags ?? []).some((tag) => FORMS_TAGS.has(String(tag).trim().toLowerCase()))) return true;
  const pos = sense.pos ?? sense.partsOfSpeech ?? [];
  if (pos.length) return false;
  const texts = sense.definitions ?? (sense.glosses ?? []).map((g) => g.text);
  return texts.length > 0 && texts.every(looksLikeFlattenedFormsTable);
}

/**
 * The entry without its forms senses; `null` when nothing else was left (a row
 * that WAS the forms table). Returns the same object when there was nothing to drop.
 */
export function withoutFormsSenses<E extends { senses: readonly FormsSenseLike[] }>(entry: E): E | null {
  const senses = entry.senses.filter((sense) => !isFormsSense(sense));
  if (senses.length === entry.senses.length) return entry;
  return senses.length ? ({ ...entry, senses } as E) : null;
}
