// Multi-language study-profile data model (SERVICES_PATCH.md section 4).
// Types shared verbatim by main and renderer. No Electron imports allowed here.

/** Built-in profile ids — see seedProfiles.ts for the full catalog. */
export type SeedProfileId = import('./seedProfiles').SeedProfileId;

/**
 * A profile identifier. The seeds use the SeedProfileId literals; user-created
 * profiles get generated ids ('custom-<timestamp>'), so the general type is a
 * plain string. Widening from the old 3-value union is backward-compatible.
 */
export type ProfileId = string;

export type LangCode = 'ja' | 'en' | 'ru' | 'zh';

/** Semantic content slots a card face can render. */
export type CardContent =
  | 'term'
  | 'reading'
  | 'meaning'
  | 'translation'
  | 'sentence'
  | 'frequency'
  | 'image'
  | 'audio';

/**
 * Which content goes on which face, and in which language each face is
 * written. Direction (JP front vs EN front vs RU front) is data, not code.
 */
export interface CardBlueprint {
  front: CardContent[];
  back: CardContent[];
  frontLang: LangCode;
  backLang: LangCode;
}

/** Semantic roles a note-type field can play (SERVICES_PATCH.md section 5.4). */
export type FieldRole =
  | 'term'
  | 'reading'
  | 'meaning'
  | 'translation'
  | 'sentence'
  | 'notes'
  | 'image'
  | 'termAudio'
  | 'sentenceAudio'
  | 'frequency';

export interface AnkiBinding {
  deckName: string;
  /** Defaults to KINOMOTO_MODEL_NAME (src/shared/anki.ts). */
  modelName: string;
  /**
   * Explicit role-to-fieldName overrides. Highest priority in field
   * resolution; wins over runtime discovery and synonym matching.
   */
  fieldMap?: Partial<Record<FieldRole, string>>;
  /**
   * Jidoujisho-style field templates: Anki field name -> a template string
   * that may embed {placeholders} (see MINING_VARS in src/shared/anki.ts).
   * When any field here carries a non-blank template, mining fills fields
   * from these templates instead of the automatic role mapper (5.6). Keyed by
   * the field names of THIS binding's modelName; cleared when the note type
   * changes so a stale mapping can never target a missing field.
   */
  fieldTemplates?: Record<string, string>;
  /** Extra tags appended after the mandatory APP_TAG + profile tag. */
  extraTags?: string[];
  /**
   * When mining without hand-picked examples, how many Tatoeba hits to take
   * per language for `{example-sentence:lang}` (joined with blank lines).
   * Ignored when you select examples in the dictionary — then all selected
   * examples are used. Default 1 per language.
   */
  exampleCounts?: Partial<Record<'ja' | 'zh' | 'en' | 'ru', number>>;
  /**
   * When Tatoeba examples are unavailable, mine with `exampleFallbackTemplates`
   * instead of failing (e.g. `{expression:ru}` front / `{expression:ja}` back).
   */
  exampleFallback?: boolean;
  /** Field templates used only when examples could not be loaded. */
  exampleFallbackTemplates?: Record<string, string>;
  /**
   * Ordered Anki note-type fields for this profile. Each profile gets its own
   * note type — only these fields are created (not the full Kinomoto superset).
   */
  noteFields?: readonly string[];
}

export interface DeckParams {
  /**
   * AnkiConnect search query whose card intervals feed the knowledge store.
   * The interval poller unions this across ALL profiles.
   */
  syncQuery: string;
  /** Stats/labelling target. P1 tracks N2 vocabulary. */
  jlptTarget?: 'N5' | 'N4' | 'N3' | 'N2' | 'N1';
  /** Informational scheduling parameter surfaced in stats. */
  newPerDay?: number;
  /**
   * Interval thresholds in days for level classification.
   * Defaults replicate src/renderer/ankiSync.ts levelForInterval():
   * ivl >= known    -> level 3 (Known)
   * ivl >= familiar -> level 2 (Familiar)
   * else            -> level 1 (Learning)
   */
  thresholds: { familiar: number; known: number };
}

export interface LookupBinding {
  /**
   * 'jmdict-jisho'  — existing main-process Jisho pipeline (JMdict data),
   *                   src/main/dictionary.ts lookupWord().
   * 'cedict-local'  — existing renderer CC-CEDICT module (chineseDict.ts).
   * 'none'          — profile performs no dictionary lookups.
   */
  pipeline: 'jmdict-jisho' | 'cedict-local' | 'none';
}

export interface StudyProfile {
  id: ProfileId;
  label: string;
  /** Shown in Settings — explains what this profile is for. */
  description?: string;
  /** Lemma space tracked by the knowledge store. */
  targetLang: 'ja' | 'zh';
  card: CardBlueprint;
  anki: AnkiBinding;
  deckParams: DeckParams;
  lookup: LookupBinding;
  /** Dictionaries / data sources this profile expects (shown in Anki settings). */
  requiredDictionaries?: readonly string[];
  /** Per-profile Anki note CSS used in the card preview panel. */
  noteCss?: string;
}

/** Durable store shape — userData/profiles.json. */
export interface ProfileStoreSchema {
  schemaVersion: 1;
  activeProfileId: ProfileId;
  profiles: Record<ProfileId, StudyProfile>;
  /**
   * Stable display + switch order of profile ids (seeds first, then user-
   * created in creation order). Object key order isn't guaranteed after
   * add/delete, so order is tracked explicitly.
   */
  order: ProfileId[];
  /** One AnkiConnect endpoint shared by every profile. */
  ankiUrl: string;
  /** True once legacy localStorage keys were folded into p1 (section 4.7). */
  legacyMigrated: boolean;
}

/** Read-only wire snapshot pushed to the renderer. */
export interface ProfileSnapshot {
  activeProfileId: ProfileId;
  profiles: StudyProfile[];
  ankiUrl: string;
}

// ----- Constants -----------------------------------------------------------

export const DEFAULT_ANKI_URL = 'http://127.0.0.1:8765';

export const CARD_CONTENTS: readonly CardContent[] = [
  'term',
  'reading',
  'meaning',
  'translation',
  'sentence',
  'frequency',
  'image',
  'audio',
];

export const LOOKUP_PIPELINES: readonly LookupBinding['pipeline'][] = [
  'jmdict-jisho',
  'cedict-local',
  'none',
];

export const JLPT_TARGETS: readonly NonNullable<DeckParams['jlptTarget']>[] = [
  'N5',
  'N4',
  'N3',
  'N2',
  'N1',
];

// ----- Seed profiles (section 4.3) ------------------------------------------
// Full catalog lives in seedProfiles.ts. Re-exported here for backward compat.

export {
  DEFAULT_PROFILE_ID,
  PROFILE_GROUPS,
  PROFILE_IDS,
  SEED_PROFILES,
  type SeedProfileId,
} from './seedProfiles';

/**
 * Build a fresh user-created profile. Defaults mirror the Japanese-focus seed
 * (JP front, English back) but with its own deck named after the label and an
 * empty field mapping, so it works immediately and can be tuned afterwards.
 */
export function makeCustomProfile(id: ProfileId, label: string): StudyProfile {
  // Lazy import avoided — inline the jaEnClassic pack defaults.
  return {
    id,
    label,
    targetLang: 'ja',
    card: {
      front: ['term'],
      back: ['reading', 'meaning', 'sentence'],
      frontLang: 'ja',
      backLang: 'en',
    },
    anki: {
      deckName: label,
      modelName: `JP Study App::Custom::${label}`,
      noteFields: ['Term', 'Reading', 'Meaning', 'Sentence'],
      fieldTemplates: {
        Term: '{expression}',
        Reading: '{reading}',
        Meaning: '{meaning}',
        Sentence: '{sentence}',
      },
      exampleFallback: true,
      exampleFallbackTemplates: {
        Term: '{expression}',
        Reading: '{reading}',
        Meaning: '{meaning}',
        Sentence: '',
      },
    },
    deckParams: {
      syncQuery: 'deck:*',
      thresholds: { familiar: 1, known: 21 },
    },
    lookup: { pipeline: 'jmdict-jisho' },
    requiredDictionaries: ['JMdict / Jisho (online or Yomitan import)'],
  };
}
