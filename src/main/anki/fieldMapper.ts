// Dynamic field-role resolution (SERVICES_PATCH.md 5.4). Pure functions —
// caching of resolved maps lives in noteTypes.ts, keyed per profile, because
// the expensive part to skip is the modelNames/modelFieldNames round-trip.

import { KINOMOTO_MODEL_NAME } from '../../shared/anki';
import type { FieldRole, StudyProfile } from '../../shared/profiles';

/** Canonical role order — governs synonym-contention priority in step 3. */
export const FIELD_ROLES: readonly FieldRole[] = [
  'term',
  'reading',
  'meaning',
  'translation',
  'sentence',
  'notes',
  'image',
  'termAudio',
  'sentenceAudio',
  'frequency',
];

/**
 * Role/field pairs of the app-created Kinomoto model, in field order. Single
 * source of truth: noteTypes.ts derives KINOMOTO_FALLBACK_FIELDS from it and
 * the resolver uses it as the exact-name identity preset (step 2).
 */
export const KINOMOTO_PRESET: ReadonlyArray<{ role: FieldRole; field: string }> = [
  { role: 'term', field: 'Term' },
  { role: 'reading', field: 'Reading' },
  { role: 'meaning', field: 'Meaning' },
  { role: 'translation', field: 'Translation' },
  { role: 'sentence', field: 'Sentence' },
  { role: 'notes', field: 'Notes' },
  { role: 'image', field: 'Image' },
  { role: 'termAudio', field: 'Term Audio' },
  { role: 'sentenceAudio', field: 'Sentence Audio' },
  { role: 'frequency', field: 'Frequency' },
];

export const ROLE_SYNONYMS: Record<FieldRole, RegExp> = {
  term: /^(term|expression|word|front|単語|表現)$/i,
  reading: /^(reading|furigana|kana|yomi|よみ|読み|ルビ)$/i,
  meaning: /^(meaning|definition|glossary|gloss|back|意味|定義)$/i,
  translation: /(translation|訳|翻訳)/i,
  sentence: /(sentence|context|例文|用例|^文$)/i, // superset of the legacy dictionary.ts regex
  notes: /^(notes?|備考|メモ)$/i,
  image: /^(image|picture|screenshot|画像)$/i,
  termAudio: /^((term|word)[ _-]?audio|audio|音声)$/i,
  sentenceAudio: /(sentence[ _-]?audio)/i,
  frequency: /(freq|頻度)/i,
};

// ----- Hashing ---------------------------------------------------------------

/** 32-bit FNV-1a, hex-encoded. Used for field-list and snapshot fingerprints. */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function hashFieldList(fields: string[]): string {
  return fnv1a(fields.join('\x1f'));
}

// ----- Resolution algorithm (first match wins per role) ------------------------

/**
 * Priority order:
 *   1. profile.anki.fieldMap overrides (verbatim names; dropped with a log
 *      line when absent from the discovered fields)
 *   2. exact-name preset identity (iff modelName === KINOMOTO_MODEL_NAME)
 *   3. synonym scan (ROLE_SYNONYMS, first unclaimed discovered field wins;
 *      a field can satisfy at most one role)
 *   4. positional fallback for term/meaning only: field[0] -> term,
 *      field[1] -> meaning — byte-compatible with the legacy buildFields(),
 *      so it reclaims those slots even from a synonym match (the displaced
 *      role then degrades through the sentence-overflow rule).
 */
export function resolveFieldMap(
  profile: StudyProfile,
  modelName: string,
  discoveredFields: string[],
): Partial<Record<FieldRole, string>> {
  const map: Partial<Record<FieldRole, string>> = {};
  const claimed = new Set<string>();
  const available = new Set(discoveredFields);

  const claim = (role: FieldRole, field: string): void => {
    map[role] = field;
    claimed.add(field);
  };

  // 1. explicit overrides
  const overrides = profile.anki.fieldMap ?? {};
  for (const role of FIELD_ROLES) {
    const wanted = overrides[role];
    if (!wanted) continue;
    if (available.has(wanted) && !claimed.has(wanted)) {
      claim(role, wanted);
    } else {
      console.log(
        `[anki] fieldMap override dropped: role "${role}" -> "${wanted}" not on model "${modelName}"`,
      );
    }
  }

  // 2. Kinomoto exact-name preset identity
  if (modelName === KINOMOTO_MODEL_NAME) {
    for (const preset of KINOMOTO_PRESET) {
      if (map[preset.role]) continue;
      if (available.has(preset.field) && !claimed.has(preset.field)) {
        claim(preset.role, preset.field);
      }
    }
  }

  // 3. synonym scan
  for (const role of FIELD_ROLES) {
    if (map[role]) continue;
    const hit = discoveredFields.find((f) => !claimed.has(f) && ROLE_SYNONYMS[role].test(f));
    if (hit) claim(role, hit);
  }

  // 4. positional fallback (authoritative for its two slots)
  const positional = (role: FieldRole, field: string | undefined): void => {
    if (map[role] || !field) return;
    for (const other of FIELD_ROLES) {
      if (other !== role && map[other] === field) delete map[other];
    }
    claim(role, field);
  };
  positional('term', discoveredFields[0]);
  positional('meaning', discoveredFields[1]);

  return map;
}

/**
 * Lightweight term-only resolution for the interval poller (5.5 step 4),
 * where notes come from arbitrary models with no owning profile. Falls back
 * to the first field — today's rule.
 */
export function resolveTermFieldName(
  modelName: string,
  orderedFields: string[],
  override?: string,
): string | undefined {
  if (override && orderedFields.indexOf(override) !== -1) return override;
  if (modelName === KINOMOTO_MODEL_NAME && orderedFields.indexOf('Term') !== -1) return 'Term';
  const hit = orderedFields.find((f) => ROLE_SYNONYMS.term.test(f));
  return hit ?? orderedFields[0];
}

// ----- Field-value composition helpers ------------------------------------------

/** Escape user text for an Anki HTML field. */
export function escapeForAnki(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
