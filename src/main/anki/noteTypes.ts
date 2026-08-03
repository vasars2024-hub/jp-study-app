// Note-type integration: EnsureDeck / EnsureModel (SERVICES_PATCH.md 5.3).
//
// Authority rule (load-bearing): runtime discovery is authoritative. When a
// model with the bound name already exists in the user's collection — e.g.
// created by jidoujisho itself — its actual modelFieldNames result defines
// the fields, and roles are resolved against it (fieldMapper.ts). The static
// field list below is an app-defined, role-complete superset used ONLY when
// this app must create the model fresh; it is not a claim about jidoujisho's
// internal field order.

import type { EnsureModelResult } from '../../shared/anki';
import type {
  CardContent,
  FieldRole,
  LangCode,
  ProfileId,
  StudyProfile,
} from '../../shared/profiles';
import { invoke } from './client';
import { hashFieldList, KINOMOTO_PRESET, resolveFieldMap } from './fieldMapper';
import { DEFAULT_CARD_CSS } from '../../shared/kinomotoCard';

/**
 * Creation-fallback field list. Order and names come from KINOMOTO_PRESET
 * (fieldMapper.ts), whose roles are, in order: term, reading, meaning,
 * translation, sentence, notes, image, termAudio, sentenceAudio, frequency.
 */
export const KINOMOTO_FALLBACK_FIELDS: readonly string[] = KINOMOTO_PRESET.map((p) => p.field);

// ----- Shared card stylesheet (kinomotoCard.ts) ------------------------------

const CARD_CSS = DEFAULT_CARD_CSS;

// ----- Blueprint-directed template generation ------------------------------------

function presetFieldFor(content: CardContent): string {
  if (content === 'frequency') return 'Frequency';
  if (content === 'image') return 'Image';
  if (content === 'audio') return 'Term Audio';
  const hit = KINOMOTO_PRESET.find((p) => p.role === (content as FieldRole));
  return hit ? hit.field : content;
}

function langFor(content: CardContent, profile: StudyProfile, face: 'front' | 'back'): LangCode {
  if (content === 'meaning' || content === 'translation') {
    return face === 'front' ? profile.card.frontLang : profile.card.backLang;
  }
  if (content === 'term' || content === 'reading' || content === 'sentence') {
    const lang = face === 'front' ? profile.card.frontLang : profile.card.backLang;
    if (lang === 'zh') return 'zh';
    return profile.targetLang;
  }
  return profile.targetLang;
}

/**
 * Card templates generated on createModel are direction-correct per profile,
 * derived mechanically from the CardBlueprint: front slots emit unconditional
 * divs, back slots follow {{FrontSide}}<hr id="answer"> inside standard Anki
 * {{#Field}}...{{/Field}} empty-field conditionals.
 */
export function buildAnkiCardTemplates(
  profile: StudyProfile,
): { Name: string; Front: string; Back: string }[] {
  const front = profile.card.front
    .map((c) => `<div class="jsa-face" lang="${langFor(c, profile, 'front')}">{{${presetFieldFor(c)}}}</div>`)
    .join('\n');
  const backLines = profile.card.back.map((c) => {
    const field = presetFieldFor(c);
    const lang = langFor(c, profile, 'back');
    return `{{#${field}}}<div class="jsa-${c}" lang="${lang}">{{${field}}}</div>{{/${field}}}`;
  });
  const back = ['{{FrontSide}}', '<hr id="answer">'].concat(backLines).join('\n');
  return [{ Name: 'Recognition', Front: front, Back: back }];
}

// ----- Caches (invariant A-1: all calls here are lazy, never at boot) --------------

const verifiedDecks = new Set<string>();

interface ModelCacheEntry {
  modelName: string;
  fieldsHash: string;
  result: EnsureModelResult;
}

// Keyed per profile: overrides and blueprints shape the resolved map, so two
// profiles bound to the same model may legitimately cache different results.
const modelCache = new Map<ProfileId, ModelCacheEntry>();

/**
 * Invalidation triggers (5.4): profile:update touching anki.* (that profile),
 * heartbeat reconnect (everything — the model may have been edited while Anki
 * was closed), and api-kind errors mentioning fields.
 */
export function invalidateAnkiCaches(profileId?: ProfileId): void {
  if (profileId) {
    modelCache.delete(profileId);
  } else {
    modelCache.clear();
    verifiedDecks.clear();
  }
}

// ----- EnsureDeck ------------------------------------------------------------------

/** Create a deck if missing. Lazy — runs on first mine only. */
export async function ensureDeckName(deck: string): Promise<void> {
  const name = deck.trim();
  if (!name) return;
  if (verifiedDecks.has(name)) return;
  const decks = (await invoke('deckNames', undefined)) ?? [];
  if (decks.indexOf(name) === -1) await invoke('createDeck', { deck: name });
  verifiedDecks.add(name);
}

/** Create the profile's bound deck if missing. Lazy — runs on first mine only. */
export async function ensureDeck(profile: StudyProfile): Promise<void> {
  await ensureDeckName(profile.anki.deckName);
}

// ----- EnsureModel -----------------------------------------------------------------

function dedupeRoles(profile: StudyProfile): CardContent[] {
  const out: CardContent[] = [];
  for (const role of profile.card.front.concat(profile.card.back)) {
    if (out.indexOf(role) === -1) out.push(role);
  }
  return out;
}

/**
 * Discovery-first model resolution. Existing model: read its real fields and
 * resolve roles against them. Missing model: create it from the Kinomoto
 * fallback superset with blueprint-directed templates, then use the identity
 * preset as the field map.
 */
export async function ensureModel(profile: StudyProfile): Promise<EnsureModelResult> {
  const modelName = profile.anki.modelName;
  const cached = modelCache.get(profile.id);
  if (cached && cached.modelName === modelName) return cached.result;

  const blueprintRoles = dedupeRoles(profile);
  const models = (await invoke('modelNames', undefined)) ?? [];

  let result: EnsureModelResult;
  let fieldsHash: string;

  if (models.indexOf(modelName) !== -1) {
    // Runtime discovery is authoritative.
    const fields = (await invoke('modelFieldNames', { modelName })) ?? [];
    const fieldMap = resolveFieldMap(profile, modelName, fields);
    const unmappedRoles = blueprintRoles.filter((r) => !fieldMap[r as FieldRole]) as FieldRole[];
    const minimumMet = Boolean(fieldMap.term && (fieldMap.meaning || fieldMap.translation));
    result = {
      ok: minimumMet,
      modelName,
      created: false,
      fieldMap,
      unmappedRoles,
    };
    if (!minimumMet) {
      result.error = `Model "${modelName}" has no usable term and meaning/translation fields.`;
    }
    fieldsHash = hashFieldList(fields);
  } else {
    const createFields =
      profile.anki.noteFields?.length ? profile.anki.noteFields.slice() : KINOMOTO_FALLBACK_FIELDS.slice();
    const profileCss = profile.noteCss?.trim() ? profile.noteCss : CARD_CSS;
    await invoke('createModel', {
      modelName,
      inOrderFields: createFields,
      css: profileCss,
      cardTemplates: buildAnkiCardTemplates(profile),
    });
    const fieldMap: Partial<Record<FieldRole, string>> = {};
    for (const preset of KINOMOTO_PRESET) {
      if (createFields.includes(preset.field)) fieldMap[preset.role] = preset.field;
    }
    result = {
      ok: true,
      modelName,
      created: true,
      fieldMap,
      unmappedRoles: [],
    };
    fieldsHash = hashFieldList(createFields);
  }

  modelCache.set(profile.id, { modelName, fieldsHash, result });
  return result;
}
