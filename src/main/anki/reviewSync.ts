/**
 * Two-way review sync, link discovery and the sync probe — the AnkiConnect half.
 *
 * The rules (who owns a card, what is skipped and why) are decided in
 * `shared/ankiReviewSync.ts` and documented there; this module only reads what
 * those rules need from Anki and performs the one write they allow
 * (`answerCards`). Every entry point returns a result instead of throwing, with
 * an `errorKind` the renderer translates, because a sync that fails must say
 * why in the user's language rather than as an AnkiConnect string.
 *
 * Reads are chunked like `intervals.ts` and issued one at a time, so a sync
 * cannot saturate the add-on's single worker while the user mines.
 */

import { ipcMain } from 'electron';
import { APP_TAG } from '../../shared/anki';
import {
  ANKI_SYNC_LINK_BATCH,
  ANKI_SYNC_MIN_API_VERSION,
  ANKI_SYNC_PULL_BATCH,
  ANKI_SYNC_PUSH_BATCH,
  ankiMirrorFromCard,
  classifyAnkiSyncError,
  decideAnkiReviewPush,
  pickAnkiLinkCandidate,
  pickAnkiPrimaryCard,
  type AnkiEase,
  type AnkiLinkCandidate,
  type AnkiLinkMatch,
  type AnkiLinkRequest,
  type AnkiLinkResult,
  type AnkiReviewPushItem,
  type AnkiReviewPushOutcome,
  type AnkiReviewPushResult,
  type AnkiSchedulePullEntry,
  type AnkiSchedulePullResult,
  type AnkiSyncCardRow,
  type AnkiSyncErrorKind,
  type AnkiSyncProbeResult,
} from '../../shared/ankiReviewSync';
import type { StudyProfile } from '../../shared/profiles';
import { getProfileStore } from '../profiles';
import { invoke, toUiError, type AnkiCardInfo, type AnkiNoteInfo } from './client';
import { ankiSearchLiteral } from './extensionDuplicates';
import { escapeForAnki, resolveTermFieldName } from './fieldMapper';
import { noteAnkiActiveProfile } from './mediaUpload';

const CHUNK = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Terms per OR-query when looking for notes to link. */
const LINK_QUERY_TERMS = 25;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function failure(err: unknown): { errorKind: AnkiSyncErrorKind; error: string } {
  const error = toUiError(err);
  return { errorKind: classifyAnkiSyncError(error), error };
}

function positiveIds(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
}

// ----- Probe ---------------------------------------------------------------------

/** Can sync run at all, and against which Anki profile? */
export async function probeAnkiSync(): Promise<AnkiSyncProbeResult> {
  let apiVersion: number;
  try {
    apiVersion = Number(await invoke('version', undefined));
  } catch (err) {
    return { ok: false, ...failure(err) };
  }
  if (!Number.isFinite(apiVersion) || apiVersion < ANKI_SYNC_MIN_API_VERSION) {
    return { ok: false, apiVersion, errorKind: 'version', error: `AnkiConnect API version ${apiVersion}` };
  }
  try {
    const profile = await invoke('getActiveProfile', undefined);
    noteAnkiActiveProfile(profile);
    return { ok: true, apiVersion, profile };
  } catch (err) {
    const kind = classifyAnkiSyncError(toUiError(err));
    // An add-on without the action still syncs; the profile guard simply cannot run.
    if (kind === 'unsupported') return { ok: true, apiVersion };
    return { ok: false, apiVersion, ...failure(err) };
  }
}

/** Rule 7: refuse to touch a collection other than the bound one. */
async function profileGuard(expected: string | undefined): Promise<{ profile?: string; mismatch: boolean }> {
  if (!expected) return { mismatch: false };
  let profile: string | undefined;
  try {
    profile = await invoke('getActiveProfile', undefined);
  } catch (err) {
    if (classifyAnkiSyncError(toUiError(err)) === 'unsupported') return { mismatch: false };
    throw err;
  }
  noteAnkiActiveProfile(profile);
  return { profile, mismatch: typeof profile === 'string' && profile !== expected };
}

// ----- Shared reads -----------------------------------------------------------------

interface NoteCards {
  /** note id -> its cards' scheduler rows */
  cards: Map<number, AnkiSyncCardRow[]>;
  /** Note ids AnkiConnect no longer knows, confirmed by a second, independent search. */
  missing: Set<number>;
}

async function readNoteCards(noteIds: readonly number[]): Promise<NoteCards> {
  const found = new Map<number, number[]>();
  for (const chunk of chunks(noteIds, CHUNK)) {
    const infos = ((await invoke('notesInfo', { notes: chunk })) ?? []) as Partial<AnkiNoteInfo>[];
    // A deleted note comes back as an empty object in its position.
    for (const info of infos) {
      if (info && typeof info.noteId === 'number') found.set(info.noteId, Array.isArray(info.cards) ? info.cards : []);
    }
  }
  let absent = noteIds.filter((id) => !found.has(id));
  if (absent.length) {
    // Rule 6 unlinks a card on `note-missing`, so "missing" must be certain:
    // ask a second way before believing the empty notesInfo row.
    const still = new Set<number>();
    for (const chunk of chunks(absent, CHUNK)) {
      for (const id of (await invoke('findNotes', { query: `nid:${chunk.join(',')}` })) ?? []) still.add(id);
    }
    absent = absent.filter((id) => !still.has(id));
  }
  const cardIds = [...new Set([...found.values()].flat())];
  const rows = new Map<number, AnkiCardInfo>();
  for (const chunk of chunks(cardIds, CHUNK)) {
    for (const row of ((await invoke('cardsInfo', { cards: chunk })) ?? []) as Partial<AnkiCardInfo>[]) {
      if (row && typeof row.cardId === 'number') rows.set(row.cardId, row as AnkiCardInfo);
    }
  }
  const cards = new Map<number, AnkiSyncCardRow[]>();
  for (const [noteId, ids] of found) {
    cards.set(noteId, ids.map((id) => rows.get(id)).filter((row): row is AnkiCardInfo => Boolean(row))
      .map((row) => ({ ...row, note: row.note ?? noteId })));
  }
  return { cards, missing: new Set(absent) };
}

// ----- Push (Gum → Anki) ------------------------------------------------------------

function sanitizePushItems(value: unknown): AnkiReviewPushItem[] {
  if (!Array.isArray(value)) return [];
  const out: AnkiReviewPushItem[] = [];
  for (const raw of value.slice(0, ANKI_SYNC_PUSH_BATCH)) {
    const item = raw as Partial<AnkiReviewPushItem> | null;
    const noteId = Number(item?.noteId);
    const ease = Number(item?.ease);
    const reviewedAt = Number(item?.reviewedAt);
    if (typeof item?.reviewId !== 'string' || !item.reviewId) continue;
    if (!Number.isSafeInteger(noteId) || noteId <= 0) continue;
    if (![1, 2, 3, 4].includes(ease) || !Number.isFinite(reviewedAt)) continue;
    out.push({ reviewId: item.reviewId.slice(0, 80), noteId, ease: ease as AnkiEase, reviewedAt });
  }
  return out;
}

/**
 * Replay Gum answers into Anki. Every input id gets an outcome unless the whole
 * call failed (then `ok: false`, no outcomes, and the queue keeps everything).
 */
export async function pushAnkiReviewAnswers(
  items: readonly AnkiReviewPushItem[],
  expectedProfile?: string,
  now = Date.now(),
): Promise<AnkiReviewPushResult> {
  const outcomes: Record<string, AnkiReviewPushOutcome> = {};
  if (!items.length) return { ok: true, outcomes };
  try {
    const guard = await profileGuard(expectedProfile);
    if (guard.mismatch) {
      return { ok: false, outcomes, profile: guard.profile, errorKind: 'profile-mismatch', error: guard.profile ?? '' };
    }
    // Rule 3, defensively: the renderer collapses already, but one note answered
    // twice in a single request would still be two answers in Anki.
    const latest = new Map<number, AnkiReviewPushItem>();
    for (const item of [...items].sort((a, b) => a.reviewedAt - b.reviewedAt)) {
      const prior = latest.get(item.noteId);
      if (prior) outcomes[prior.reviewId] = 'superseded';
      latest.set(item.noteId, item);
    }
    const { cards, missing } = await readNoteCards([...latest.keys()]);
    const answers: { cardId: number; ease: number; reviewId: string }[] = [];
    for (const item of latest.values()) {
      const card = missing.has(item.noteId) ? null : pickAnkiPrimaryCard(cards.get(item.noteId) ?? []);
      if (!card && !missing.has(item.noteId)) {
        // The note exists but none of its cards could be read: try again later.
        outcomes[item.reviewId] = 'failed';
        continue;
      }
      const decision = decideAnkiReviewPush(item, card, now);
      if (decision === 'push' && card) answers.push({ cardId: card.cardId, ease: item.ease, reviewId: item.reviewId });
      else if (decision !== 'push') outcomes[item.reviewId] = decision;
    }
    if (answers.length) {
      const verdicts = await invoke('answerCards', {
        answers: answers.map(({ cardId, ease }) => ({ cardId, ease })),
      });
      answers.forEach((answer, i) => {
        const verdict = Array.isArray(verdicts) ? verdicts[i] : undefined;
        // `false` is AnkiConnect's "no such card": the card went between the read and the answer.
        outcomes[answer.reviewId] = verdict === true ? 'answered' : verdict === false ? 'note-missing' : 'failed';
      });
    }
    return { ok: true, outcomes, ...(guard.profile !== undefined ? { profile: guard.profile } : {}) };
  } catch (err) {
    return { ok: false, outcomes: {}, ...failure(err) };
  }
}

// ----- Pull (Anki → Gum, display only) ------------------------------------------------

/**
 * Anki's day number for today. `cardsInfo.due` of a review card is a day number
 * relative to the collection's creation, which AnkiConnect does not expose; a
 * review card Anki itself files under `prop:due=N` pins the offset. Returns null
 * when no such card exists, and the mirror then carries no due date.
 */
async function resolveAnkiToday(): Promise<number | null> {
  for (const offset of [0, 1, -1, 2, -2, 3, 7]) {
    const ids = (await invoke('findCards', { query: `prop:due=${offset} is:review -is:learn` })) ?? [];
    if (!ids.length) continue;
    const rows = ((await invoke('cardsInfo', { cards: ids.slice(0, 5) })) ?? []) as Partial<AnkiCardInfo>[];
    const review = rows.find((row) => row && row.queue === 2 && typeof row.due === 'number');
    if (review && typeof review.due === 'number') return review.due - offset;
  }
  return null;
}

export async function pullAnkiSchedule(
  noteIds: readonly number[],
  expectedProfile?: string,
  now = Date.now(),
): Promise<AnkiSchedulePullResult> {
  const wanted = noteIds.slice(0, ANKI_SYNC_PULL_BATCH);
  if (!wanted.length) return { ok: true, entries: [] };
  try {
    const guard = await profileGuard(expectedProfile);
    if (guard.mismatch) {
      return { ok: false, entries: [], profile: guard.profile, errorKind: 'profile-mismatch', error: guard.profile ?? '' };
    }
    const { cards, missing } = await readNoteCards(wanted);
    const primary = new Map<number, AnkiSyncCardRow>();
    for (const [noteId, rows] of cards) {
      const card = pickAnkiPrimaryCard(rows);
      if (card) primary.set(noteId, card);
    }
    const primaryIds = [...primary.values()].map((card) => card.cardId);
    const due = new Map<number, boolean>();
    try {
      for (const chunk of chunks(primaryIds, CHUNK)) {
        const verdicts = (await invoke('areDue', { cards: chunk })) ?? [];
        chunk.forEach((id, i) => due.set(id, verdicts[i] === true));
      }
    } catch (err) {
      if (classifyAnkiSyncError(toUiError(err)) !== 'unsupported') throw err;
      // An add-on without `areDue`: fall back to the due date below.
    }
    const todayDay = await resolveAnkiToday();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const entries: AnkiSchedulePullEntry[] = [];
    for (const noteId of wanted) {
      if (missing.has(noteId)) {
        entries.push({ noteId, mirror: null });
        continue;
      }
      const card = primary.get(noteId);
      if (!card) continue;
      const mirror = ankiMirrorFromCard(card, {
        todayDay,
        dayStartMs: dayStart.getTime(),
        isDue: due.get(card.cardId) ?? false,
        now,
      });
      if (!due.has(card.cardId) && mirror.dueAt !== undefined && mirror.state !== 'suspended') {
        mirror.isDue = mirror.dueAt <= now + (mirror.state === 'learning' || mirror.state === 'relearning' ? 0 : DAY_MS - 1);
      }
      entries.push({ noteId, mirror });
    }
    return { ok: true, entries, ...(guard.profile !== undefined ? { profile: guard.profile } : {}) };
  } catch (err) {
    return { ok: false, entries: [], ...failure(err) };
  }
}

// ----- Link discovery -----------------------------------------------------------------

function cleanField(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .normalize('NFKC')
    .trim();
}

function normalizeTerm(term: string): string {
  return term.normalize('NFKC').trim();
}

/** The field a profile writes the term into: its explicit mapping, its `{expression}` template, else the model's term field. */
export function ankiTermFieldForProfile(profile: StudyProfile, fieldNames: string[]): string | undefined {
  const mapped = profile.anki.fieldMap?.term;
  const templated = Object.entries(profile.anki.fieldTemplates ?? {})
    .find(([, template]) => template.trim() === '{expression}')?.[0];
  return resolveTermFieldName(profile.anki.modelName, fieldNames, mapped ?? templated);
}

interface LinkTarget {
  modelName: string;
  termField: string;
}

async function linkTargets(): Promise<LinkTarget[]> {
  const seen = new Set<string>();
  const out: LinkTarget[] = [];
  const fieldCache = new Map<string, string[]>();
  for (const profile of getProfileStore().getAllProfiles()) {
    const modelName = profile.anki.modelName?.trim();
    if (!modelName) continue;
    let fields = fieldCache.get(modelName);
    if (!fields) {
      try {
        fields = (await invoke('modelFieldNames', { modelName })) ?? [];
      } catch (err) {
        // A profile whose note type does not exist in this collection has nothing to link to.
        if (classifyAnkiSyncError(toUiError(err)) === 'api') fields = [];
        else throw err;
      }
      fieldCache.set(modelName, fields);
    }
    if (!fields.length) continue;
    const termField = ankiTermFieldForProfile(profile, fields);
    if (!termField) continue;
    const key = `${modelName}\u0000${termField}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ modelName, termField });
  }
  return out;
}

/**
 * Find the Anki notes that already are these Gum cards (created on another
 * machine and synced in through AnkiWeb, or added by hand): same note type as
 * a profile, term field equal to the card's word. Read-only.
 */
export async function findAnkiNoteLinks(requests: readonly AnkiLinkRequest[], expectedProfile?: string): Promise<AnkiLinkResult> {
  const list = requests.slice(0, ANKI_SYNC_LINK_BATCH).filter((r) => normalizeTerm(r.term));
  if (!list.length) return { ok: true, matches: [] };
  try {
    const guard = await profileGuard(expectedProfile);
    if (guard.mismatch) {
      return { ok: false, matches: [], profile: guard.profile, errorKind: 'profile-mismatch', error: guard.profile ?? '' };
    }
    const terms = [...new Set(list.map((r) => normalizeTerm(r.term)))];
    const candidates = new Map<string, Map<number, AnkiLinkCandidate>>();
    const noteIds = new Set<number>();
    const hitsByTarget: { target: LinkTarget; ids: number[] }[] = [];
    for (const target of await linkTargets()) {
      const ids: number[] = [];
      for (const batch of chunks(terms, LINK_QUERY_TERMS)) {
        const any = batch.map((term) => ankiSearchLiteral(target.termField, escapeForAnki(term))).join(' or ');
        const query = `${ankiSearchLiteral('note', target.modelName)} (${any})`;
        ids.push(...((await invoke('findNotes', { query })) ?? []));
      }
      ids.forEach((id) => noteIds.add(id));
      hitsByTarget.push({ target, ids });
    }
    const infos = new Map<number, AnkiNoteInfo>();
    for (const chunk of chunks([...noteIds], CHUNK)) {
      for (const info of ((await invoke('notesInfo', { notes: chunk })) ?? []) as Partial<AnkiNoteInfo>[]) {
        if (info && typeof info.noteId === 'number') infos.set(info.noteId, info as AnkiNoteInfo);
      }
    }
    const noteText = new Map<number, string>();
    for (const { target, ids } of hitsByTarget) {
      for (const id of ids) {
        const info = infos.get(id);
        const value = info?.fields?.[target.termField]?.value;
        if (!info || typeof value !== 'string') continue;
        const term = cleanField(value);
        const tags = info.tags ?? [];
        const appTagged = tags.some((tag) => tag === APP_TAG || tag.startsWith(`${APP_TAG}::`));
        noteText.set(id, Object.values(info.fields ?? {}).map((field) => cleanField(field.value ?? '')).join('\n'));
        const byNote = candidates.get(term) ?? new Map<number, AnkiLinkCandidate>();
        byNote.set(id, { noteId: id, appTagged });
        candidates.set(term, byNote);
      }
    }
    const matches: AnkiLinkMatch[] = list.map((request) => {
      const term = normalizeTerm(request.term);
      const reading = request.reading ? normalizeTerm(request.reading) : '';
      const pool = [...(candidates.get(term)?.values() ?? [])].map((candidate) => ({
        ...candidate,
        readingMatches: Boolean(reading && reading !== term && (noteText.get(candidate.noteId) ?? '').includes(reading)),
      }));
      const picked = pickAnkiLinkCandidate(pool);
      return { key: request.key, noteId: picked.noteId, ...(picked.ambiguous ? { ambiguous: true } : {}) };
    });
    return { ok: true, matches, ...(guard.profile !== undefined ? { profile: guard.profile } : {}) };
  } catch (err) {
    return { ok: false, matches: [], ...failure(err) };
  }
}

// ----- IPC -------------------------------------------------------------------------------

function optionalProfile(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value.slice(0, 200) : undefined;
}

function sanitizeLinkRequests(value: unknown): AnkiLinkRequest[] {
  if (!Array.isArray(value)) return [];
  const out: AnkiLinkRequest[] = [];
  for (const raw of value.slice(0, ANKI_SYNC_LINK_BATCH)) {
    const item = raw as Partial<AnkiLinkRequest> | null;
    if (typeof item?.key !== 'string' || typeof item.term !== 'string') continue;
    out.push({
      key: item.key.slice(0, 120),
      term: item.term.slice(0, 200),
      ...(typeof item.reading === 'string' && item.reading ? { reading: item.reading.slice(0, 200) } : {}),
    });
  }
  return out;
}

export function registerAnkiReviewSyncIpc(): void {
  ipcMain.handle('anki:syncProbe', () => probeAnkiSync());
  ipcMain.handle('anki:pushReviews', (_e, payload: unknown) => {
    const p = (payload && typeof payload === 'object' ? payload : {}) as { items?: unknown; expectedProfile?: unknown };
    return pushAnkiReviewAnswers(sanitizePushItems(p.items), optionalProfile(p.expectedProfile));
  });
  ipcMain.handle('anki:pullSchedule', (_e, payload: unknown) => {
    const p = (payload && typeof payload === 'object' ? payload : {}) as { noteIds?: unknown; expectedProfile?: unknown };
    return pullAnkiSchedule(positiveIds(p.noteIds).slice(0, ANKI_SYNC_PULL_BATCH), optionalProfile(p.expectedProfile));
  });
  ipcMain.handle('anki:findNoteLinks', (_e, payload: unknown) => {
    const p = (payload && typeof payload === 'object' ? payload : {}) as { requests?: unknown; expectedProfile?: unknown };
    return findAnkiNoteLinks(sanitizeLinkRequests(p.requests), optionalProfile(p.expectedProfile));
  });
}
