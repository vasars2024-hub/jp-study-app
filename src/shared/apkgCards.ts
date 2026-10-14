/**
 * Turning Anki notes into study cards (as opposed to bare vocabulary).
 *
 * `apkgParse.ts` already extracts *expressions* from an .apkg, because the only
 * thing that consumed a deck was the Level Meter — it needs a word list and
 * throws the rest of every note away. Importing the cards themselves did not
 * exist as a feature, so a user dropping a deck on the desktop was told, in as
 * many words, that nothing could open it.
 *
 * This module maps a whole note onto the app's own `DeckFlashcard` shape:
 * expression, reading, meaning and example sentence, each resolved by field
 * ROLE rather than by position, so a deck whose fields are ordered
 * Meaning/Term/Reading still imports correctly.
 *
 * Pure — no Electron, no sql.js, no DOM — so the mapping is unit-testable in the
 * node environment. The I/O half lives in `main/anki/apkgImport.ts`.
 */

import { pickExpressionOrd, splitFields, stripFieldHtml, type AnkiModel, type AnkiModels } from './apkgParse';
import { clampFsrsWeights, FSRS5_WEIGHT_COUNT, FSRS6_WEIGHT_COUNT, isValidFsrsWeights } from './fsrs';
import { isLocalSrsState, LOCAL_SRS_DEFAULT_EASE, LOCAL_SRS_MIN_EASE, type LocalSrsRating, type LocalSrsState } from './localSrs';
import { REVIEW_ANSWER_CAP_MS, type ReviewLogEntry } from './reviewLog';

/**
 * Field-name synonyms per role.
 *
 * Deliberately mirrors `ROLE_SYNONYMS` in `src/main/anki/fieldMapper.ts`, the
 * same way `EXPRESSION_FIELD_RE` in `apkgParse.ts` mirrors its `term` entry:
 * renderer/shared code cannot import from `src/main`, and duplicating four
 * regexes is cheaper than restructuring the Anki module tree. Keep them in step.
 */
// Reading covers every study language's pronunciation field: kana, pinyin /
// zhuyin for Chinese, stress / transcription for Russian.
export const READING_FIELD_RE =
  /^(reading|furigana|kana|yomi|よみ|読み|ルビ|pinyin|拼音|zhuyin|bopomofo|注音|pronunciation|transcription|stress|ударение|транскрипция|произношение)$/i;
export const MEANING_FIELD_RE =
  /^(meaning|definition|glossary|gloss|back|english|translation|意味|定義|訳|意思|释义|釋義|含义|英文|значение|перевод|определение)$/i;
export const SENTENCE_FIELD_RE = /(sentence|context|example|例文|用例|^文$|例句|句子|пример|предложение)/i;

export interface ApkgCard {
  /** The studied word or phrase. Never empty — cards without one are dropped. */
  word: string;
  reading: string;
  meaning: string;
  sentence?: string;
  /** Anki deck this note's first card belongs to, for grouping on import. */
  deck?: string;
  /** Anki note tags, space-separated in the source. */
  tags?: string[];
  /** Media the note's fields cite, in field order (`[sound:x]`, `<img src="x">`). */
  audioRefs?: string[];
  imageRefs?: string[];
  /** The note's first card's schedule, when the package carries one. */
  schedule?: AnkiCardSchedule;
  /** Managed copies of the first cited audio / image, set by main after extraction. */
  audioPath?: string;
  imagePath?: string;
  /** Local SRS state converted from `schedule`, set by main. */
  srs?: LocalSrsState;
  /** The first card's Anki card id, which keys its review history. */
  ankiCardId?: number;
  /** The first card's review history from Anki's `revlog`, oldest first. */
  history?: AnkiRevlogRow[];
}

/**
 * One row of Anki's `revlog` table, as much of it as the review log keeps.
 * `id` is the answer's epoch milliseconds (Anki's primary key). `ivl` and
 * `lastIvl` are days when positive and seconds when negative (a learning
 * step). `type`: 0 learn, 1 review, 2 relearn, 3 filtered deck, 4 manual
 * (a reschedule or a "Forget", with no answer), 5 rescheduled by FSRS.
 */
export interface AnkiRevlogRow {
  id: number;
  ease: number;
  ivl: number;
  lastIvl: number;
  factor: number;
  time: number;
  type: number;
}

/** What an Anki package's deck options say about FSRS for the imported cards. */
export interface ApkgFsrsSettings {
  /** FSRS-6 (21) or FSRS-5 (19) parameters, inside their bounds. */
  weights: number[];
  desiredRetention?: number;
  maximumIntervalDays?: number;
  /** The options preset's name in Anki. */
  presetName?: string;
  /** The deck most of the imported cards are in. */
  deckName?: string;
}

/**
 * What a card import could not bring across, counted so the user is told
 * exactly rather than finding out at review time. Every number is notes or
 * files, never a guess.
 */
export interface ApkgImportReport {
  /** Notes with no studied word after stripping (blank or media-only). */
  emptyNotes: number;
  /** Notes folded into an earlier one with the same word and reading. */
  duplicateNotes: number;
  /** Notes with text in fields the app has no place for (only word, reading, meaning, sentence come across). */
  extraFieldNotes: number;
  /** Cards that came with a review schedule, converted into the local SRS. */
  scheduledCards: number;
  /** Media files kept (one audio and one image per card). */
  mediaKept: number;
  /** Media the notes cite that the package does not contain. */
  mediaMissing: number;
  /** Media beyond the first audio and first image of a card, or of an unsupported type or size. */
  mediaSkipped: number;
  /** The package's media could not be read at all (unknown manifest format). */
  mediaUnreadable: boolean;
  /** Past answers (Anki `revlog` rows) carried with the imported cards. */
  historyReviews: number;
}

export function emptyApkgImportReport(): ApkgImportReport {
  return {
    emptyNotes: 0,
    duplicateNotes: 0,
    extraFieldNotes: 0,
    scheduledCards: 0,
    mediaKept: 0,
    mediaMissing: 0,
    mediaSkipped: 0,
    mediaUnreadable: false,
    historyReviews: 0,
  };
}

export interface ApkgCardsResult {
  ok: boolean;
  cards?: ApkgCard[];
  /** Notes scanned, before cards without an expression were dropped. */
  noteCount?: number;
  fileName?: string;
  error?: string;
  report?: ApkgImportReport;
  /** The FSRS parameters of the deck options the cards were studied under, when Anki had fitted some. */
  fsrs?: ApkgFsrsSettings;
}

/**
 * One card's scheduling columns, straight from Anki's `cards` table.
 * `type`: 0 new, 1 learning, 2 review, 3 relearning. `due` is a day number
 * (relative to the collection's creation) for review cards and a Unix time in
 * seconds for learning ones. `factor` is the ease in permille.
 */
export interface AnkiCardSchedule {
  type: number;
  queue: number;
  due: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
  /**
   * The card's `data` column. Anki 23.10+ keeps the FSRS memory state here as
   * JSON (`{"s": stability, "d": difficulty, ...}`); empty for SM-2 cards.
   */
  data?: string;
}

/** One raw note row, as read out of the collection. */
export interface RawNote {
  mid: string;
  flds: string;
  tags?: string;
  deck?: string;
  schedule?: AnkiCardSchedule;
  /** The first card's Anki id and its `revlog` rows, oldest first. */
  ankiCardId?: number;
  history?: AnkiRevlogRow[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * An Anki card's schedule as a local SRS state, or `undefined` for a card that
 * was never studied (the local scheduler introduces it like any new card).
 *
 * This is the CURRENT schedule: interval, ease, repetitions, lapses and when it
 * is next due. Every past answer travels separately, as the card's `history`
 * (`ankiRevlogToReviewEntries`). `lastReviewedAt` is derived as due minus
 * interval, which is exact for a card answered on time and the best available
 * estimate otherwise.
 */
export function ankiScheduleToLocalSrs(
  schedule: AnkiCardSchedule | undefined,
  collectionCreatedSec: number,
  nowMs = Date.now(),
): LocalSrsState | undefined {
  if (!schedule || schedule.type === 0 || schedule.reps <= 0) return undefined;
  const intervalDays = Math.max(0, Math.round(schedule.ivl > 0 ? schedule.ivl : 0));
  let dueAt: number;
  if (schedule.type === 2 || schedule.queue === 3) {
    // Day number since the collection was created.
    dueAt = (collectionCreatedSec + schedule.due * 86_400) * 1000;
  } else {
    // Learning: Unix seconds. A value that small is a day number after all.
    dueAt = schedule.due > 1_000_000_000 ? schedule.due * 1000 : nowMs;
  }
  if (!Number.isFinite(dueAt) || dueAt <= 0) dueAt = nowMs;
  const ease = schedule.factor > 0 ? Math.max(LOCAL_SRS_MIN_EASE, schedule.factor / 1000) : LOCAL_SRS_DEFAULT_EASE;
  const state: LocalSrsState = {
    version: 2,
    algorithm: 'sm2',
    dueAt,
    intervalDays,
    ease,
    repetitions: Math.max(0, Math.floor(schedule.reps)),
    lapses: Math.max(0, Math.floor(schedule.lapses)),
    lastReviewedAt: Math.max(0, Math.min(nowMs, dueAt - intervalDays * DAY_MS)),
    lastRating: schedule.type === 3 ? 'again' : 'good',
  };
  const memory = fsrsMemoryFromCardData(schedule.data);
  if (memory) {
    state.stability = memory.stability;
    state.difficulty = memory.difficulty;
    state.algorithm = 'fsrs';
  }
  return isLocalSrsState(state) ? state : undefined;
}

/** Anki's FSRS memory state from a card's `data` JSON, when it carries a sane one. */
export function fsrsMemoryFromCardData(data: string | undefined): { stability: number; difficulty: number } | null {
  if (!data || !data.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(data) as { s?: unknown; d?: unknown };
    const s = Number(parsed.s);
    const d = Number(parsed.d);
    if (!Number.isFinite(s) || s <= 0 || s > 36_500) return null;
    if (!Number.isFinite(d) || d < 1 || d > 10) return null;
    return { stability: s, difficulty: d };
  } catch {
    return null;
  }
}

/**
 * The inverse of `ankiScheduleToLocalSrs`, for `.apkg` export: a local SRS
 * state as Anki `cards` columns against a collection created at `crtSec`.
 * `null` for a card never reviewed (exported as new). FSRS states carry their
 * memory pair in `data`, which Anki 23.10+ reads; SM-2 states carry the ease
 * in `factor` (permille), which every Anki version reads.
 */
export function localSrsToAnkiSchedule(
  srs: LocalSrsState | undefined,
  options: { crtSec: number; suspended?: boolean },
): AnkiCardSchedule | null {
  if (!srs || !isLocalSrsState(srs)) return null;
  const intervalDays = Math.max(0, Math.round(srs.intervalDays));
  const dueSec = Math.floor(srs.dueAt / 1000);
  let type: number;
  let queue: number;
  let due: number;
  if (srs.phase === 'learning' || srs.phase === 'relearning') {
    type = srs.phase === 'learning' ? 1 : 3;
    queue = 1;
    due = dueSec;
  } else {
    type = 2;
    queue = 2;
    due = Math.max(0, Math.floor((dueSec - options.crtSec) / 86_400));
  }
  if (options.suspended) queue = -1;
  const fsrs = srs.algorithm === 'fsrs' && typeof srs.stability === 'number' && typeof srs.difficulty === 'number';
  return {
    type,
    queue,
    due,
    ivl: type === 1 ? 0 : Math.max(1, intervalDays),
    factor: Math.max(1300, Math.round((srs.ease || LOCAL_SRS_DEFAULT_EASE) * 1000)),
    reps: Math.max(1, Math.floor(srs.repetitions)),
    lapses: Math.max(0, Math.floor(srs.lapses)),
    data: fsrs ? JSON.stringify({ s: srs.stability, d: srs.difficulty }) : '',
  };
}

const SOUND_RE = /\[sound:([^\]]+)\]/g;
const IMG_RE = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;

/** Media a note's raw (unstripped) fields cite, deduplicated, in order. */
export function mediaRefsInFields(fields: readonly string[]): { audio: string[]; images: string[] } {
  const audio: string[] = [];
  const images: string[] = [];
  for (const field of fields) {
    for (const m of field.matchAll(SOUND_RE)) {
      const name = m[1].trim();
      if (name && !audio.includes(name)) audio.push(name);
    }
    for (const m of field.matchAll(IMG_RE)) {
      const name = (m[1] ?? m[2] ?? m[3] ?? '').trim();
      if (name && !images.includes(name)) images.push(name);
    }
  }
  return { audio, images };
}

/**
 * Index of the first field matching `re`, excluding fields already claimed.
 *
 * Returns -1 rather than falling back to a position: a wrong guess here is worse
 * than an empty field, because it silently files a Meaning as a Reading and the
 * card looks fine until the user reviews it.
 */
function findFieldOrd(
  model: AnkiModel | undefined,
  re: RegExp,
  claimed: ReadonlySet<number>,
): number {
  if (!model || model.flds.length === 0) return -1;
  const ordered = [...model.flds].sort((a, b) => a.ord - b.ord);
  for (let i = 0; i < ordered.length; i += 1) {
    if (claimed.has(i)) continue;
    if (re.test(ordered[i].name.trim())) return i;
  }
  return -1;
}

export interface FieldRoleMap {
  word: number;
  reading: number;
  meaning: number;
  sentence: number;
}

/**
 * Which field index holds which role, for one note type.
 *
 * `word` reuses `pickExpressionOrd` so the card importer and the level meter
 * never disagree about which field is the studied term. A field can fill at most
 * one role; the remaining three fall back to -1 (absent) rather than guessing.
 * The one positional fallback is meaning → the field after the word, matching
 * Anki's own Front/Back convention for a two-field note.
 */
export function resolveFieldRoles(model: AnkiModel | undefined): FieldRoleMap {
  const word = pickExpressionOrd(model);
  const claimed = new Set<number>([word]);

  const reading = findFieldOrd(model, READING_FIELD_RE, claimed);
  if (reading >= 0) claimed.add(reading);

  let meaning = findFieldOrd(model, MEANING_FIELD_RE, claimed);
  if (meaning < 0 && model && model.flds.length === 2) {
    // Front/Back: the only unclaimed field is the answer.
    const other = word === 0 ? 1 : 0;
    if (!claimed.has(other)) meaning = other;
  }
  if (meaning >= 0) claimed.add(meaning);

  const sentence = findFieldOrd(model, SENTENCE_FIELD_RE, claimed);
  if (sentence >= 0) claimed.add(sentence);

  return { word, reading, meaning, sentence };
}

function fieldAt(fields: readonly string[], ord: number): string {
  if (ord < 0) return '';
  return stripFieldHtml(fields[ord] ?? '');
}

export function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(/\s+/).map((t) => t.trim()).filter(Boolean);
}

/**
 * Map raw notes onto cards.
 *
 * Notes whose expression field is empty after stripping are dropped: an Anki
 * collection routinely carries blank or media-only notes, and importing them
 * would produce cards with no front. `noteCount` reports what was scanned, so
 * the caller can say "820 notes -> 795 cards" honestly rather than implying
 * every note became a card.
 *
 * Duplicates are collapsed on (word, reading), keeping the first occurrence —
 * a deck with separate recognition and production notes for one word otherwise
 * imports it twice.
 */
export function notesToCards(notes: readonly RawNote[], models: AnkiModels): {
  cards: ApkgCard[];
  noteCount: number;
  report: ApkgImportReport;
} {
  const report = emptyApkgImportReport();
  const cards: ApkgCard[] = [];
  const seen = new Set<string>();
  const roleCache = new Map<string, FieldRoleMap>();

  for (const note of notes) {
    let roles = roleCache.get(note.mid);
    if (!roles) {
      roles = resolveFieldRoles(models[note.mid]);
      roleCache.set(note.mid, roles);
    }

    const fields = splitFields(note.flds);
    const word = fieldAt(fields, roles.word);
    if (!word) {
      report.emptyNotes += 1;
      continue;
    }

    const reading = fieldAt(fields, roles.reading);
    const key = `${word}${reading}`;
    if (seen.has(key)) {
      report.duplicateNotes += 1;
      continue;
    }
    seen.add(key);

    const mapped = new Set([roles.word, roles.reading, roles.meaning, roles.sentence]);
    if (fields.some((f, i) => !mapped.has(i) && stripFieldHtml(f).trim())) report.extraFieldNotes += 1;
    const media = mediaRefsInFields(fields);

    const sentence = fieldAt(fields, roles.sentence);
    const tags = parseTags(note.tags);

    cards.push({
      word,
      reading,
      meaning: fieldAt(fields, roles.meaning),
      ...(sentence ? { sentence } : {}),
      ...(note.deck ? { deck: note.deck } : {}),
      ...(tags.length ? { tags } : {}),
      ...(media.audio.length ? { audioRefs: media.audio } : {}),
      ...(media.images.length ? { imageRefs: media.images } : {}),
      ...(note.schedule ? { schedule: note.schedule } : {}),
      ...(note.ankiCardId !== undefined ? { ankiCardId: note.ankiCardId } : {}),
      ...(note.history?.length ? { history: note.history } : {}),
    });
  }

  return { cards, noteCount: notes.length, report };
}

// ----- review history, both ways ---------------------------------------------

const EASE_RATING: Record<number, LocalSrsRating> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };
const RATING_EASE: Record<LocalSrsRating, number> = { again: 1, hard: 2, good: 3, easy: 4 };

/** Anki revlog kinds. */
const REVLOG_LEARN = 0;
const REVLOG_REVIEW = 1;
const REVLOG_RELEARN = 2;
const REVLOG_MANUAL = 4;

/** The stable review-log id of one imported Anki answer: re-importing the deck finds the same ids. */
export function ankiReviewEntryId(ankiCardId: number, revlogId: number): string {
  return `anki-${ankiCardId}-${revlogId}`;
}

/**
 * One card's Anki history as review-log rows for the Gum card `cardId`.
 *
 * Only answers come across: a manual row (a reschedule, a "Forget", ease 0) is
 * not a review, but a Forget (manual with interval 0) does mean the next
 * learning answer starts the card over, which is what `isNew` records for the
 * optimiser and the memory replay. The first answer is `isNew` only when it is
 * a learning answer: a history whose start Anki pruned is not a first review.
 */
export function ankiRevlogToReviewEntries(
  history: readonly AnkiRevlogRow[],
  ankiCardId: number,
  cardId: string,
  word?: string,
): ReviewLogEntry[] {
  const rows = [...history].filter((row) => Number.isFinite(row.id) && row.id > 0).sort((a, b) => a.id - b.id);
  const out: ReviewLogEntry[] = [];
  let startsOver = true;
  for (const row of rows) {
    if (row.type >= REVLOG_MANUAL) {
      if (row.type === REVLOG_MANUAL && row.ivl === 0) startsOver = true;
      continue;
    }
    const rating = EASE_RATING[row.ease];
    if (!rating) continue;
    const isNew = startsOver && row.type === REVLOG_LEARN;
    startsOver = false;
    out.push({
      id: ankiReviewEntryId(ankiCardId, row.id),
      at: row.id,
      mode: 'review',
      cardId,
      ...(word ? { word: word.slice(0, 120) } : {}),
      rating,
      correct: rating !== 'again',
      prevIntervalDays: row.lastIvl > 0 ? row.lastIvl : 0,
      intervalDays: row.ivl > 0 ? row.ivl : 0,
      ...(isNew ? { isNew: true } : {}),
      ...(row.time > 0 ? { durationMs: Math.min(REVIEW_ANSWER_CAP_MS, Math.round(row.time)) } : {}),
    });
  }
  return out;
}

/** The review-log fields an export writes into Anki's `revlog`. */
export type ExportableReview = Pick<ReviewLogEntry, 'at' | 'rating' | 'prevIntervalDays' | 'intervalDays' | 'isNew' | 'durationMs'>;

/**
 * One card's Gum review history as Anki `revlog` rows. `id` here is the
 * answer's time; the writer keeps ids unique across the package.
 *
 * The kind is read off the history: a first review is a learning answer, an
 * answer to a card with a day interval is a review (a lapse included, as Anki
 * logs it), and a same-day answer after the card has graduated is relearning.
 * A later first review means the schedule was reset, which Anki records as a
 * manual "Forget" row just before it — written here too, so the reset survives
 * a round trip. `factor` (the ease in permille) goes on review answers; Gum
 * keeps no past ease, so the card's current one stands in. Step intervals
 * (minutes) are not kept by the log and are written as 0.
 */
export function reviewEntriesToAnkiRevlog(
  rows: readonly ExportableReview[],
  factor: number,
): AnkiRevlogRow[] {
  const sorted = rows
    .filter((row) => row.rating !== undefined && RATING_EASE[row.rating] !== undefined && Number.isFinite(row.at) && row.at > 0)
    .sort((a, b) => a.at - b.at);
  const out: AnkiRevlogRow[] = [];
  let graduated = false;
  sorted.forEach((row, index) => {
    const prev = Math.max(0, Math.round(row.prevIntervalDays ?? 0));
    const next = Math.max(0, Math.round(row.intervalDays ?? 0));
    if (row.isNew && index > 0) {
      out.push({ id: row.at - 1, ease: 0, ivl: 0, lastIvl: prev, factor: 0, time: 0, type: REVLOG_MANUAL });
      graduated = false;
    }
    const type = row.isNew ? REVLOG_LEARN : prev >= 1 ? REVLOG_REVIEW : graduated ? REVLOG_RELEARN : REVLOG_LEARN;
    out.push({
      id: row.at,
      ease: RATING_EASE[row.rating as LocalSrsRating],
      ivl: next,
      lastIvl: row.isNew ? 0 : prev,
      factor: type === REVLOG_REVIEW ? Math.max(0, Math.round(factor)) : 0,
      time: Math.max(0, Math.min(REVIEW_ANSWER_CAP_MS, Math.round(row.durationMs ?? 0))),
      type,
    });
    if (next >= 1) graduated = true;
  });
  return out;
}

/** How far outside a bound a stored float32 may sit and still be that bound (rounding, not data). */
const BOUND_SLACK = 1e-5;

/**
 * The FSRS parameters a deck options preset carries, as weights this app can
 * run: FSRS-6's twenty-one when the preset has them, else FSRS-5's nineteen.
 * Anki clamps parameters with the same bounds, so a value a float32 rounding
 * outside one is projected back in; a vector of the wrong length, with a value
 * that is not finite or that is really out of range, is not a parameter set
 * this app can trust, and yields null.
 */
export function pickAnkiFsrsWeights(params6: readonly number[], params5: readonly number[]): number[] | null {
  const candidates: Array<[readonly number[], number]> = [[params6, FSRS6_WEIGHT_COUNT], [params5, FSRS5_WEIGHT_COUNT]];
  for (const [params, count] of candidates) {
    if (params.length !== count || !params.every(Number.isFinite)) continue;
    const weights = clampFsrsWeights(params);
    const drift = weights.every((w, i) => Math.abs(w - params[i]) <= BOUND_SLACK * Math.max(1, Math.abs(w)));
    if (drift && isValidFsrsWeights(weights)) return weights;
  }
  return null;
}

/**
 * Deck name to file the import under.
 *
 * Anki nests decks with `::`; the leaf is what the user calls the deck, but a
 * bare leaf like "Vocab" collides across sources, so keep the last two segments.
 */
export function deckLabel(deck: string | undefined, fallback: string): string {
  const trimmed = (deck ?? '').trim();
  if (!trimmed) return fallback;
  const parts = trimmed.split('::').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return fallback;
  return parts.slice(-2).join(' / ');
}
