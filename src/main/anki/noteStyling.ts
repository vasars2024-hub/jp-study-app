// Card styling (CSS) → the Anki note type (round-2 audit F, Anki item 10).
//
// The CSS editor used to save to the profile only. `ensureModel` applies the
// profile CSS when it CREATES the model and returns early for an existing one,
// so an edit never reached a note type that already existed — which is every
// note type after the first mined card. This pushes the saved CSS with
// AnkiConnect's `updateModelStyling`, and when Anki is not reachable keeps the
// profile id in a small persisted queue that is flushed on the next connect.
// The result says which of those happened, so the UI can say it honestly.

import type { NoteStylingPushResult } from '../../shared/anki';
import type { ProfileId, StudyProfile } from '../../shared/profiles';
import { DEFAULT_CARD_CSS } from '../../shared/kinomotoCard';
import { invoke, isUnreachable } from './client';

export type { NoteStylingPushResult };

export interface NoteStylingQueueStore {
  load(): ProfileId[];
  save(ids: ProfileId[]): void;
}

let store: NoteStylingQueueStore = { load: () => [], save: () => undefined };
let pending: Set<ProfileId> | null = null;

export function configureNoteStylingQueue(next: NoteStylingQueueStore): void {
  store = next;
  pending = null;
}

function queue(): Set<ProfileId> {
  if (!pending) {
    let ids: ProfileId[] = [];
    try {
      ids = store.load().filter((id): id is ProfileId => typeof id === 'string' && id.length > 0);
    } catch {
      ids = [];
    }
    pending = new Set(ids);
  }
  return pending;
}

function persist(): void {
  try {
    store.save([...queue()]);
  } catch {
    /* the in-memory queue still flushes this session */
  }
}

export function pendingNoteStyling(): ProfileId[] {
  return [...queue()];
}

function cssFor(profile: StudyProfile): string {
  return profile.noteCss?.trim() ? profile.noteCss : DEFAULT_CARD_CSS;
}

/** Push `profile`'s saved CSS to its note type now, or queue it. */
export async function pushNoteStyling(profile: StudyProfile): Promise<NoteStylingPushResult> {
  const modelName = profile.anki.modelName?.trim() ?? '';
  if (!modelName) return { ok: false, error: 'no-model' };
  try {
    const models = (await invoke('modelNames', undefined)) ?? [];
    if (!models.includes(modelName)) {
      // ensureModel creates it with the profile CSS, so nothing is owed.
      if (queue().delete(profile.id)) persist();
      return { ok: true, status: 'not-created', modelName };
    }
    await invoke('updateModelStyling', { model: { name: modelName, css: cssFor(profile) } });
    if (queue().delete(profile.id)) persist();
    return { ok: true, status: 'updated', modelName };
  } catch (err) {
    if (isUnreachable(err)) {
      queue().add(profile.id);
      persist();
      return { ok: true, status: 'queued', modelName };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Push every queued profile's CSS. Called when AnkiConnect comes back. A
 * profile that has since been deleted drops out; one that fails for another
 * reason than reachability drops out too (retrying would fail the same way,
 * and the editor reports that error when it is saved again).
 */
export async function flushPendingNoteStyling(
  getProfile: (id: ProfileId) => StudyProfile | null | undefined,
): Promise<number> {
  let pushed = 0;
  for (const id of [...queue()]) {
    const profile = getProfile(id);
    if (!profile) {
      queue().delete(id);
      persist();
      continue;
    }
    const res = await pushNoteStyling(profile);
    if (res.ok && res.status === 'queued') break;
    if (!res.ok) {
      queue().delete(id);
      persist();
      continue;
    }
    if (res.status === 'updated') pushed += 1;
  }
  return pushed;
}
