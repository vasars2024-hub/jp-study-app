// Renderer mirror of the main-process ProfileStore (SERVICES_PATCH.md 4.8).
// House pattern of knownWords.ts: module-level cache + CustomEvent. The main
// process is the only writer of profiles.json (invariant P-6); this module
// only ever reads snapshots and relays mutation requests over IPC.

import type { ProfileId, ProfileSnapshot, StudyProfile } from '../shared/profiles';
import { PROFILE_IDS, SEED_PROFILES } from '../shared/profiles';

export const PROFILE_EVENT = 'profile-changed';

const LEGACY_DECK_KEY = 'jp-anki-deck';
const LEGACY_MODEL_KEY = 'jp-anki-model';

function seedSnapshot(): ProfileSnapshot {
  return {
    activeProfileId: 'p1-ja-focus',
    profiles: PROFILE_IDS.map((id) => SEED_PROFILES[id]),
    ankiUrl: 'http://127.0.0.1:8765',
  };
}

// Until initProfileState() resolves, reads answer from the seeds — identical
// to today's implicit behavior, so nothing downstream can observe a
// regression (P-3).
let snapshot: ProfileSnapshot = seedSnapshot();
let initPromise: Promise<void> | null = null;

function applySnapshot(next: ProfileSnapshot): void {
  snapshot = next;
  window.dispatchEvent(new CustomEvent<ProfileSnapshot>(PROFILE_EVENT, { detail: next }));
}

/** Synchronous cached read — safe on hot paths (highlighting, tokenization). */
export function getActiveProfile(): StudyProfile {
  return (
    snapshot.profiles.find((p) => p.id === snapshot.activeProfileId) ?? SEED_PROFILES['p1-ja-focus']
  );
}

export function getProfiles(): StudyProfile[] {
  return snapshot.profiles;
}

export function onProfileChanged(cb: (snap: ProfileSnapshot) => void): () => void {
  const handler = (e: Event): void => cb((e as CustomEvent<ProfileSnapshot>).detail);
  window.addEventListener(PROFILE_EVENT, handler);
  return () => window.removeEventListener(PROFILE_EVENT, handler);
}

export async function switchProfile(id: ProfileId): Promise<{ ok: boolean; error?: string }> {
  const res = await window.api.profileSwitch(id);
  return { ok: res.ok, error: res.error };
}

export async function updateProfile(
  id: ProfileId,
  patch: Partial<StudyProfile>,
): Promise<{ ok: boolean; error?: string }> {
  const res = await window.api.profileUpdate(id, patch);
  return { ok: res.ok, error: res.error };
}

/** Seed default — cannot be deleted from the UI. */
export const DEFAULT_PROFILE_ID: ProfileId = 'p1-ja-focus';

export function getActiveProfileId(): ProfileId {
  return snapshot.activeProfileId;
}

export async function createProfile(label: string): Promise<{ ok: boolean; error?: string }> {
  const trimmed = label.trim();
  if (!trimmed) return { ok: false, error: 'Profile name is required.' };
  const res = await window.api.profileCreate(trimmed);
  return { ok: res.ok, error: res.error };
}

/** True for the three built-in profiles, which are reset (not deleted). */
export function isSeedProfile(id: ProfileId): boolean {
  return (PROFILE_IDS as readonly string[]).indexOf(id) !== -1;
}

/**
 * Remove a profile. Built-in seeds are permanent, so "delete" resets them to
 * their shipped defaults; user-created profiles are actually deleted.
 */
export async function deleteProfile(id: ProfileId): Promise<{ ok: boolean; error?: string }> {
  if (id === DEFAULT_PROFILE_ID) {
    return { ok: false, error: 'The default profile cannot be deleted.' };
  }
  const seed = (SEED_PROFILES as Record<string, StudyProfile>)[id];
  if (seed) {
    const res = await window.api.profileUpdate(id, {
      label: seed.label,
      description: seed.description,
      card: seed.card,
      anki: seed.anki,
      deckParams: seed.deckParams,
      lookup: seed.lookup,
      requiredDictionaries: seed.requiredDictionaries,
      noteCss: seed.noteCss,
    });
    return { ok: res.ok, error: res.error };
  }
  const res = await window.api.profileDelete(id);
  return { ok: res.ok, error: res.error };
}

/** Boot: fetch snapshot, run the 4.7 legacy handshake, subscribe to pushes. */
export function initProfileState(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      // Subscribed before any await so a push racing the handshake is never missed.
      window.api.onProfileChanged((snap) => applySnapshot(snap));

      const got = await window.api.profileGet();
      applySnapshot(got);

      if (!got.legacyMigrated) {
        const deck = localStorage.getItem(LEGACY_DECK_KEY) ?? undefined;
        const model = localStorage.getItem(LEGACY_MODEL_KEY) ?? undefined;
        const migrated = await window.api.profileMigrateLegacy({ deck, model });
        applySnapshot(migrated);
      }
    })();
  }
  return initPromise;
}
