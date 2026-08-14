/**
 * What a dictionary says about *how a sense is used* — colloquial, honorific,
 * archaic, a dialect word, a term of art.
 *
 * The plan calls this "register" and it has never reached a reader, for a
 * mechanical reason rather than a missing source: a Yomitan term-bank row is
 * `[term, reading, definitionTags, rules, score, glossary, sequence, termTags]`
 * and `parseTermBank` read only 0, 1, 4 and 5. Column 2 — the sense's own tags —
 * was dropped at import, which is also why every legacy sense on an existing
 * installation carries `partsOfSpeech: []` (see `lexiconPartOfSpeech.ts`, which
 * had to go to the morphological analyser instead).
 *
 * The tags themselves are opaque codes: `col`, `hon`, `arch`, `ksb`, `v5r`. A
 * v3 dictionary ships `tag_bank_*.json` rows of `[name, category, order, notes,
 * score]` that name them, and that file is the only grounded source of what a
 * code means. So the rule this module holds to:
 *
 * - **A tag the dictionary does not describe is not shown.** No built-in JMdict
 *   code table, no guessing from the string. Inventing "col means colloquial"
 *   would be exactly the fabrication the Workbench is supposed to refuse, and a
 *   dictionary with no tag bank has told us nothing to display.
 * - **The bank's own `category` decides the split**, not a list of tag names.
 *   `partOfSpeech` is grammar and belongs on the existing part-of-speech line;
 *   everything else the dictionary bothered to tag a sense with is usage.
 */

/** One `tag_bank_*.json` row, reduced to the two fields that carry meaning. */
export interface DictTagMeta {
  /** Yomitan tag category, e.g. `partOfSpeech`, `misc`, `dialect`, `field`. */
  category: string;
  /** The dictionary's own readable note, e.g. `colloquialism`. May be empty. */
  notes: string;
}

/** key = tag name exactly as a term row spells it. */
export type DictTagBank = Record<string, DictTagMeta>;

/** The category whose tags are grammar rather than usage. */
export const POS_TAG_CATEGORY = 'partOfSpeech';

/**
 * Fold `tag_bank_*.json` rows into `out`.
 *
 * First writer wins: a dictionary that ships the same tag twice across two bank
 * files is describing one tag, and taking the later row would make the result
 * depend on zip entry order.
 */
export function parseTagBankRows(rows: readonly unknown[], out: DictTagBank): void {
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const name = String(row[0] ?? '').trim();
    if (!name || Object.prototype.hasOwnProperty.call(out, name)) continue;
    out[name] = {
      category: String(row[1] ?? '').trim(),
      notes: String(row[3] ?? '').trim(),
    };
  }
}

/**
 * A term row's `definitionTags` column as a list.
 *
 * Yomitan writes them space-separated in one string; a few generators emit an
 * array instead. Both are accepted because a dictionary the user supplies is not
 * required to have come from the same generator as the bundled ones.
 */
export function splitTagField(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v ?? '').trim()).filter(Boolean);
  }
  if (typeof raw !== 'string') return [];
  return raw.split(/\s+/).map((v) => v.trim()).filter(Boolean);
}

/**
 * Split one sense's raw tags into grammar and usage, using only what the
 * dictionary's own tag bank describes.
 *
 * Usage labels come back as the bank's `notes` when it wrote one, because that
 * is the readable sentence fragment a reader needs ("colloquialism"), and as the
 * bare code otherwise. Parts of speech stay as the short code, which is the
 * convention the existing `dict-pos` line and the Blanc gloss prefix already
 * render and the form a dictionary user expects to see abbreviated.
 *
 * Order is the sense's own tag order; duplicates are dropped per output list, so
 * two tags whose notes collapse to the same words show once.
 */
export function splitSenseTags(
  raw: readonly string[],
  bank: DictTagBank,
): { partsOfSpeech: string[]; usage: string[] } {
  const partsOfSpeech: string[] = [];
  const usage: string[] = [];
  const seenPos = new Set<string>();
  const seenUsage = new Set<string>();

  for (const tag of raw) {
    const meta = Object.prototype.hasOwnProperty.call(bank, tag) ? bank[tag] : undefined;
    if (!meta) continue;
    if (meta.category === POS_TAG_CATEGORY) {
      if (seenPos.has(tag)) continue;
      seenPos.add(tag);
      partsOfSpeech.push(tag);
      continue;
    }
    const label = meta.notes || tag;
    if (seenUsage.has(label)) continue;
    seenUsage.add(label);
    usage.push(label);
  }

  return { partsOfSpeech, usage };
}
