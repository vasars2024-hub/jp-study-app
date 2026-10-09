/**
 * Which Anki deck / note-type pairs an "already in Anki?" check should ask.
 *
 * The dictionary's marker used to ask only the active profile's deck and note
 * type. A learner with a Japanese vocabulary profile and a separate sentence or
 * kanji profile, or with mining rules that route dictionary cards elsewhere,
 * saw "not in Anki" for a word sitting in the other deck. Yomitan checks the
 * configured deck(s); this is that, built from the settings that already exist:
 *
 *  1. the profile a dictionary card for this language is actually routed to —
 *     the first enabled mining rule that matches, else the language's profile;
 *  2. the active profile, when it studies this language;
 *  3. every other profile that studies this language;
 *  4. every profile an enabled mining rule sends this language's cards to.
 *
 * Each target carries the field the profile maps the term to (`fieldMap.term`),
 * so the check looks where that profile's cards actually keep the word rather
 * than assuming the note type's first field. Duplicates collapse; the list is
 * capped so a long profile list cannot turn one lookup into a dozen requests.
 */
import type { StudyProfile } from './profiles';
import {
  profileForLanguage,
  resolveProfileMatch,
  type MineLanguage,
  type ProfileRule,
} from './profileRules';

export interface AnkiPresenceTarget {
  deckName: string;
  modelName: string;
  /** The field the profile writes the term into, when it maps one explicitly. */
  termField?: string;
  /** Profile label, for the marker's tooltip. */
  profileLabel: string;
}

export const MAX_ANKI_PRESENCE_TARGETS = 6;

type ProfileLike = Pick<StudyProfile, 'id' | 'label' | 'targetLang' | 'anki'>;

function ruleCoversLanguage(rule: ProfileRule, lang: MineLanguage): boolean {
  if (!rule.enabled) return false;
  const want = rule.match?.language;
  const source = rule.match?.source;
  return (want == null || want === 'any' || want === lang) && (source == null || source === 'any' || source === 'dictionary');
}

export function ankiPresenceTargets(
  profiles: readonly ProfileLike[],
  rules: readonly ProfileRule[] | undefined,
  activeProfileId: string,
  lang: MineLanguage,
): AnkiPresenceTarget[] {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const ordered: string[] = [];
  const add = (id: string | undefined): void => {
    if (id && byId.has(id) && !ordered.includes(id)) ordered.push(id);
  };
  const fallback = profileForLanguage(profiles, lang, activeProfileId);
  add(resolveProfileMatch([...(rules ?? [])], { source: 'dictionary', cardKind: 'word', language: lang }, fallback).profileId);
  if (byId.get(activeProfileId)?.targetLang === lang) add(activeProfileId);
  for (const profile of profiles) if (profile.targetLang === lang) add(profile.id);
  for (const rule of rules ?? []) if (ruleCoversLanguage(rule, lang)) add(rule.profileId);

  const out: AnkiPresenceTarget[] = [];
  const seen = new Set<string>();
  for (const id of ordered) {
    const profile = byId.get(id);
    const deckName = profile?.anki?.deckName?.trim() ?? '';
    const modelName = profile?.anki?.modelName?.trim() ?? '';
    if (!profile || !deckName || !modelName) continue;
    const termField = profile.anki.fieldMap?.term?.trim() || undefined;
    const key = `${deckName}\u0000${modelName}\u0000${termField ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ deckName, modelName, ...(termField ? { termField } : {}), profileLabel: profile.label });
    if (out.length >= MAX_ANKI_PRESENCE_TARGETS) break;
  }
  return out;
}
