// Pure parsing helpers for Anki .apkg imports (Plan 0.5). The heavy I/O — unzip,
// sql.js, zstd — lives in src/main/anki/apkgImport.ts; everything here is pure
// string/JSON work so it can be unit-tested in the node vitest environment
// (no Electron, adm-zip, sql.js, or DOM imports).

/** Anki joins a note's fields with the ASCII Unit Separator (0x1f). */
export const FIELD_SEP = String.fromCharCode(0x1f);

/** Result of importing an .apkg (main → renderer over IPC). */
export interface ApkgImportResult {
  ok: boolean;
  /** Unique raw expressions (pre-lemmatization); dedup by lemma happens in the renderer. */
  expressions?: string[];
  /** Total notes scanned (before dedup) — for the "X cards → Y words" UI. */
  noteCount?: number;
  /** Base file name, for labeling. */
  fileName?: string;
  error?: string;
}

/** One note type from Anki's `col.models` JSON blob. */
export interface AnkiModel {
  name: string;
  flds: { name: string; ord: number }[];
}
export type AnkiModels = Record<string, AnkiModel>;

export interface NormalizedAnkiFieldRow {
  mid: string;
  modelName: string;
  ord: number;
  fieldName: string;
}

/** Build the legacy model map from Anki's newer normalized notetypes/fields tables. */
export function modelsFromNormalizedRows(rows: readonly NormalizedAnkiFieldRow[]): AnkiModels {
  const output: AnkiModels = {};
  for (const row of rows) {
    const mid = String(row.mid);
    const model = output[mid] ?? {
      name: typeof row.modelName === 'string' ? row.modelName : '',
      flds: [],
    };
    model.flds.push({
      name: typeof row.fieldName === 'string' ? row.fieldName : '',
      ord: Number.isFinite(row.ord) ? Math.max(0, Math.floor(row.ord)) : model.flds.length,
    });
    output[mid] = model;
  }
  for (const model of Object.values(output)) {
    model.flds.sort((a, b) => a.ord - b.ord);
  }
  return output;
}

/**
 * Which field of a note holds the studied word. Mirrors the `term` role regex
 * in src/main/anki/fieldMapper.ts (kept in sync deliberately — the two live in
 * different module trees; renderer/shared code cannot import from src/main).
 */
// Chinese and Russian study decks name the field differently (Hanzi,
// Simplified, 词语, Слово); without them a Chinese deck fell back to a
// positional guess and could mine the Pinyin field as the word.
export const EXPRESSION_FIELD_RE =
  /^(term|expression|word|front|vocab(ulary)?|単語|表現|見出し語?|漢字|hanzi|simplified|traditional|汉字|简体|繁體|繁体|词语|詞語|单词|單詞|слово|лексема)$/i;

export function parseModels(modelsJson: string): AnkiModels {
  const raw = JSON.parse(modelsJson) as Record<string, unknown>;
  const out: AnkiModels = {};
  for (const [mid, m] of Object.entries(raw)) {
    const model = m as { name?: unknown; flds?: unknown };
    const flds = Array.isArray(model.flds)
      ? (model.flds as Array<{ name?: unknown; ord?: unknown }>).map((f, i) => ({
          name: typeof f?.name === 'string' ? f.name : '',
          ord: typeof f?.ord === 'number' ? f.ord : i,
        }))
      : [];
    out[mid] = { name: typeof model.name === 'string' ? model.name : '', flds };
  }
  return out;
}

/** Split a note's `flds` column into its individual field values, in ord order. */
export function splitFields(flds: string): string[] {
  return flds.split(FIELD_SEP);
}

/**
 * The 0-based index into splitFields() that holds the expression, for a given
 * model. Falls back to the first field (Anki's convention for the sort field).
 */
export function pickExpressionOrd(model: AnkiModel | undefined): number {
  if (!model || model.flds.length === 0) return 0;
  const ordered = [...model.flds].sort((a, b) => a.ord - b.ord);
  const hitIndex = ordered.findIndex((f) => EXPRESSION_FIELD_RE.test(f.name.trim()));
  return hitIndex >= 0 ? hitIndex : 0;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? m;
  });
}

/**
 * Reduce a raw Anki expression field to the bare word/phrase for lemmatization:
 * strips [sound:…] tags, ruby readings, remaining HTML, cloze wrappers, Anki
 * furigana macros and bracket furigana (漢字[かんじ] → 漢字), then decodes
 * entities and collapses whitespace. The reading in bracket/ruby furigana is
 * discarded so lookups hit the base kanji word, not its kana reading.
 */
export function stripFieldHtml(raw: string): string {
  if (!raw) return '';
  let s = raw;
  // [sound:foo.mp3] media references.
  s = s.replace(/\[sound:[^\]]*\]/gi, ' ');
  // Ruby readings: drop the <rt>/<rp> content entirely before removing tags, or
  // stripping tags would fuse 漢 + かん into "漢かん".
  s = s.replace(/<rt\b[^>]*>[\s\S]*?<\/rt>/gi, '');
  s = s.replace(/<rp\b[^>]*>[\s\S]*?<\/rp>/gi, '');
  // {{furigana:漢字[かんじ]}} and other field macros → keep inner text.
  s = s.replace(/\{\{(?:furigana|kanji|kana|type):([\s\S]*?)\}\}/gi, '$1');
  // Cloze deletions {{c1::answer::hint}} → answer.
  s = s.replace(/\{\{c\d+::([\s\S]*?)(?:::[\s\S]*?)?\}\}/gi, '$1');
  // Any remaining HTML tags.
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  // Bracket furigana: a space-separated reading in [] after a word. By this
  // point [sound:] is gone, so remaining brackets are readings.
  s = s.replace(/\s*[[［][^\]］]*[\]］]/g, '');
  // Collapse whitespace.
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Extract expression strings from raw note rows. `notes` are (mid, flds) pairs.
 * Deduplicates by exact stripped string (cheap payload reduction — the caller
 * still lemmatizes and dedupes by lemma afterward). Returns the unique
 * expressions in first-seen order plus the count of notes seen.
 */
/**
 * A modern .apkg carries a decoy `collection.anki2` holding one note telling
 * old Anki clients to upgrade. If that ever gets read instead of the real
 * collection, the import "succeeds" with a single nonsense word — so detect the
 * shape (a lone note that talks about upgrading) and fail loudly instead.
 */
const UPGRADE_STUB_RE = /(update|upgrade|newer version|new version).{0,40}(anki|version)|anki.{0,40}(update|upgrade)/i;

export function looksLikeUpgradeStub(expressions: string[], noteCount: number): boolean {
  if (noteCount > 2) return false;
  return expressions.some((e) => UPGRADE_STUB_RE.test(e));
}

export function extractExpressions(
  notes: Array<{ mid: string; flds: string }>,
  models: AnkiModels,
): { expressions: string[]; noteCount: number } {
  const seen = new Set<string>();
  const expressions: string[] = [];
  for (const note of notes) {
    const model = models[note.mid];
    const ord = pickExpressionOrd(model);
    const fields = splitFields(note.flds);
    const expr = stripFieldHtml(fields[ord] ?? fields[0] ?? '');
    if (expr && !seen.has(expr)) {
      seen.add(expr);
      expressions.push(expr);
    }
  }
  return { expressions, noteCount: notes.length };
}
