/**
 * Which sprite pack each companion wears.
 *
 * Kept apart from the environment settings on purpose: entering and leaving the
 * Aero theme swaps the whole environment, and a character the user picked must
 * survive that. Resolution order: the user's pick (when that pack still
 * exists) → the owner's private default (private-assets/shimeji/defaults.json)
 * → the companion's built-in character.
 */
import { useSyncExternalStore } from 'react';
import { writeLocalStorageJson } from '../localStorageWrite';
import type { CompanionTypeId } from './companionCatalog';
import { migrateLegacyCompanionStorage } from './companionLegacyIds';
import { findCompanionPack, privateDefaultPacks, type ShimejiPackId } from './shimejiPacks';

const KEY = 'jp-companion-pack-choice-v1';
export const PACK_CHOICE_EVENT = 'jp-companion-pack-choice-changed';

export type PackChoices = Partial<Record<CompanionTypeId, ShimejiPackId>>;

let cache: PackChoices | null = null;
const PRIVATE_DEFAULTS = privateDefaultPacks();

export function loadPackChoices(): PackChoices {
  if (cache) return cache;
  migrateLegacyCompanionStorage();
  let out: PackChoices = {};
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [type, id] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof id === 'string' && id.length <= 80) out[type as CompanionTypeId] = id;
      }
    }
  } catch {
    out = {};
  }
  cache = out;
  return out;
}

/** Choose a pack for a companion; null returns it to its default character. */
export function setPackChoice(typeId: CompanionTypeId, packId: ShimejiPackId | null): void {
  const next: PackChoices = { ...loadPackChoices() };
  if (packId) next[typeId] = packId;
  else delete next[typeId];
  cache = next;
  writeLocalStorageJson(KEY, next);
  window.dispatchEvent(new CustomEvent(PACK_CHOICE_EVENT));
}

/** Forget a deleted pack wherever it was chosen. */
export function clearPackFromChoices(packId: ShimejiPackId): void {
  const cur = loadPackChoices();
  const next: PackChoices = {};
  for (const [type, id] of Object.entries(cur)) if (id !== packId) next[type as CompanionTypeId] = id;
  if (Object.keys(next).length === Object.keys(cur).length) return;
  cache = next;
  writeLocalStorageJson(KEY, next);
  window.dispatchEvent(new CustomEvent(PACK_CHOICE_EVENT));
}

export function onPackChoicesChanged(cb: () => void): () => void {
  const onEvent = () => cb();
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cache = null;
    cb();
  };
  window.addEventListener(PACK_CHOICE_EVENT, onEvent);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(PACK_CHOICE_EVENT, onEvent);
    window.removeEventListener('storage', onStorage);
  };
}

export function usePackChoices(): PackChoices {
  return useSyncExternalStore(onPackChoicesChanged, loadPackChoices, loadPackChoices);
}

/** The pack a companion of `typeId` shows, given its built-in default. */
export function resolveCompanionPack(
  typeId: CompanionTypeId | undefined,
  builtinDefault: ShimejiPackId | undefined,
  choices: PackChoices = loadPackChoices(),
  privateDefaults: Record<string, ShimejiPackId> = PRIVATE_DEFAULTS,
): ShimejiPackId | undefined {
  if (!typeId) return builtinDefault;
  const chosen = choices[typeId];
  if (chosen && findCompanionPack(chosen)) return chosen;
  const owner = privateDefaults[typeId];
  if (owner && findCompanionPack(owner)) return owner;
  return builtinDefault;
}
