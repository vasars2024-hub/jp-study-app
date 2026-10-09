/**
 * Two-way review sync, link discovery and media dedupe against a fake
 * AnkiConnect (`fakeAnkiConnect.ts`), answered at the fetch level so the real
 * client runs. No Anki needed; nothing opens a window.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gum-anki-sync-'));

vi.mock('electron', () => ({
  app: { getPath: () => tmp },
  ipcMain: { handle: () => undefined },
}));

const profiles = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock('../profiles', () => ({
  getProfileStore: () => ({ getAllProfiles: () => profiles.list }),
}));

import { FakeAnkiConnect } from './fakeAnkiConnect';
import { findAnkiNoteLinks, pullAnkiSchedule, pushAnkiReviewAnswers } from '../anki/reviewSync';
import {
  ankiMediaContentHash,
  noteAnkiActiveProfile,
  resetAnkiMediaIndexForTests,
  storeAnkiMediaOnce,
} from '../anki/mediaUpload';
import { APP_TAG } from '../../shared/anki';

const DAY = 86_400_000;
let fake: FakeAnkiConnect;

beforeEach(() => {
  fake = new FakeAnkiConnect();
  vi.stubGlobal('fetch', fake.fetch);
  resetAnkiMediaIndexForTests(path.join(tmp, `media-index-${Math.random().toString(36).slice(2)}.json`));
  profiles.list = [];
});

afterAll(() => {
  vi.unstubAllGlobals();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function reviewCard(extra: Record<string, number> = {}) {
  return { type: 2, queue: 2, due: 510, interval: 10, factor: 2500, reps: 5, mod: Math.floor((Date.now() - 2 * DAY) / 1000), ...extra };
}

describe('push: Gum answers into Anki', () => {
  it('answers the primary card of the linked note with the Gum ease', async () => {
    const note = fake.addNote({ modelName: 'Gum', fields: { Term: '猫' }, cards: [reviewCard(), reviewCard()] });
    const now = Date.now();
    const result = await pushAnkiReviewAnswers([{ reviewId: 'r1', noteId: note.noteId, ease: 4, reviewedAt: now - 60_000 }], 'User 1', now);
    expect(result).toMatchObject({ ok: true, profile: 'User 1', outcomes: { r1: 'answered' } });
    const answer = fake.calls.find((c) => c.action === 'answerCards');
    expect(answer?.params).toEqual({ answers: [{ cardId: note.cards[0], ease: 4 }] });
  });

  it('is idempotent: the same answer replayed after it landed is skipped, not answered twice', async () => {
    const note = fake.addNote({ modelName: 'Gum', fields: { Term: '猫' }, cards: [reviewCard()] });
    const now = Date.now();
    const answer = { reviewId: 'r1', noteId: note.noteId, ease: 3 as const, reviewedAt: now - 60_000 };
    await pushAnkiReviewAnswers([answer], 'User 1', now);
    const again = await pushAnkiReviewAnswers([answer], 'User 1', now);
    expect(again.outcomes).toEqual({ r1: 'anki-newer' });
    expect(fake.count('answerCards')).toBe(1);
  });

  it('skips a card reviewed in Anki after the Gum review (another machine, via AnkiWeb)', async () => {
    const now = Date.now();
    const note = fake.addNote({ modelName: 'Gum', fields: { Term: '猫' }, cards: [reviewCard({ mod: Math.floor(now / 1000) })] });
    const result = await pushAnkiReviewAnswers([{ reviewId: 'r1', noteId: note.noteId, ease: 1, reviewedAt: now - 3_600_000 }], 'User 1', now);
    expect(result.outcomes).toEqual({ r1: 'anki-newer' });
    expect(fake.count('answerCards')).toBe(0);
  });

  it('never answers a suspended card, and reports a deleted note only after a second search agrees', async () => {
    const suspended = fake.addNote({ modelName: 'Gum', fields: { Term: '猫' }, cards: [reviewCard({ queue: -1 })] });
    const gone = fake.addNote({ modelName: 'Gum', fields: { Term: '犬' }, cards: [reviewCard()] });
    fake.deleteNote(gone.noteId);
    const now = Date.now();
    const result = await pushAnkiReviewAnswers([
      { reviewId: 's', noteId: suspended.noteId, ease: 3, reviewedAt: now - 60_000 },
      { reviewId: 'g', noteId: gone.noteId, ease: 3, reviewedAt: now - 60_000 },
    ], 'User 1', now);
    expect(result.outcomes).toEqual({ s: 'suspended', g: 'note-missing' });
    expect(fake.calls.some((c) => c.action === 'findNotes' && c.params.query === `nid:${gone.noteId}`)).toBe(true);
    expect(fake.count('answerCards')).toBe(0);
  });

  it('collapses two answers to one note in one request into the later one', async () => {
    const note = fake.addNote({ modelName: 'Gum', fields: { Term: '猫' }, cards: [reviewCard()] });
    const now = Date.now();
    const result = await pushAnkiReviewAnswers([
      { reviewId: 'late', noteId: note.noteId, ease: 3, reviewedAt: now - 30_000 },
      { reviewId: 'early', noteId: note.noteId, ease: 1, reviewedAt: now - 90_000 },
    ], 'User 1', now);
    expect(result.outcomes).toEqual({ early: 'superseded', late: 'answered' });
    expect(fake.calls.find((c) => c.action === 'answerCards')?.params).toEqual({ answers: [{ cardId: note.cards[0], ease: 3 }] });
  });

  it('pauses on an Anki profile switch before reading or writing anything', async () => {
    const note = fake.addNote({ modelName: 'Gum', fields: { Term: '猫' }, cards: [reviewCard()] });
    fake.profile = 'Someone else';
    const result = await pushAnkiReviewAnswers([{ reviewId: 'r', noteId: note.noteId, ease: 3, reviewedAt: Date.now() - 60_000 }], 'User 1');
    expect(result).toMatchObject({ ok: false, errorKind: 'profile-mismatch', profile: 'Someone else', outcomes: {} });
    expect(fake.count('notesInfo')).toBe(0);
    expect(fake.count('answerCards')).toBe(0);
  });

  it('names an AnkiConnect too old for answerCards, a required API key, and a closed Anki', async () => {
    const note = fake.addNote({ modelName: 'Gum', fields: { Term: '猫' }, cards: [reviewCard()] });
    const answer = [{ reviewId: 'r', noteId: note.noteId, ease: 3 as const, reviewedAt: Date.now() - 60_000 }];
    fake.unsupported.add('answerCards');
    expect(await pushAnkiReviewAnswers(answer, 'User 1')).toMatchObject({ ok: false, errorKind: 'unsupported', outcomes: {} });
    fake.unsupported.clear();
    fake.requireApiKey = true;
    expect(await pushAnkiReviewAnswers(answer, 'User 1')).toMatchObject({ ok: false, errorKind: 'permission' });
    fake.requireApiKey = false;
    fake.down = true;
    expect(await pushAnkiReviewAnswers(answer, 'User 1')).toMatchObject({ ok: false, errorKind: 'unreachable', outcomes: {} });
  });
});

describe('pull: Anki state for display while Anki owns scheduling', () => {
  it('anchors due dates on Anki\'s own today, reads due-now from areDue, and reports deleted notes', async () => {
    // A card Anki files under prop:due=0 pins "today" (day 500 in the fake).
    fake.addNote({ modelName: 'Other', fields: { Front: 'anchor' }, cards: [reviewCard({ due: 500 })] });
    const review = fake.addNote({ modelName: 'Gum', fields: { Term: '猫' }, cards: [reviewCard({ due: 503, interval: 9 })] });
    const overdue = fake.addNote({ modelName: 'Gum', fields: { Term: '鳥' }, cards: [reviewCard({ due: 498 })] });
    const gone = fake.addNote({ modelName: 'Gum', fields: { Term: '犬' } });
    fake.deleteNote(gone.noteId);
    const now = Date.now();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    const result = await pullAnkiSchedule([review.noteId, overdue.noteId, gone.noteId], 'User 1', now);
    expect(result.ok).toBe(true);
    const byNote = new Map(result.entries.map((entry) => [entry.noteId, entry.mirror]));
    expect(byNote.get(review.noteId)).toMatchObject({ state: 'review', intervalDays: 9, isDue: false, dueAt: dayStart.getTime() + 3 * DAY });
    expect(byNote.get(overdue.noteId)).toMatchObject({ isDue: true });
    expect(byNote.get(gone.noteId)).toBeNull();
    expect(fake.count('answerCards')).toBe(0);
  });

  it('works without areDue by reading the due date instead', async () => {
    fake.unsupported.add('areDue');
    fake.addNote({ modelName: 'Other', fields: { Front: 'anchor' }, cards: [reviewCard({ due: 500 })] });
    const overdue = fake.addNote({ modelName: 'Gum', fields: { Term: '鳥' }, cards: [reviewCard({ due: 497 })] });
    const result = await pullAnkiSchedule([overdue.noteId], 'User 1');
    expect(result.entries[0].mirror).toMatchObject({ isDue: true });
  });
});

describe('link discovery: notes created on another machine', () => {
  beforeEach(() => {
    profiles.list = [{
      id: 'ja',
      label: 'Japanese',
      anki: { deckName: 'Mining', modelName: 'Gum JA', fieldTemplates: { Term: '{expression}', Back: '{meaning}' } },
    }];
    fake.models['Gum JA'] = ['Front', 'Term', 'Back'];
  });

  it('links by the profile\'s term field, prefers Gum-made notes, and never matches other note types', async () => {
    const synced = fake.addNote({ modelName: 'Gum JA', fields: { Front: '', Term: '猫', Back: 'cat' }, tags: [APP_TAG] });
    fake.addNote({ modelName: 'Gum JA', fields: { Front: '', Term: '犬', Back: 'dog' } });
    const tagged = fake.addNote({ modelName: 'Gum JA', fields: { Front: '', Term: '犬', Back: 'dog' }, tags: [`${APP_TAG}::ja`] });
    fake.addNote({ modelName: 'Basic', fields: { Front: '鳥', Back: 'bird' } });

    const result = await findAnkiNoteLinks([
      { key: 'c1', term: '猫' },
      { key: 'c2', term: '犬', reading: 'いぬ' },
      { key: 'c3', term: '鳥' },
    ], 'User 1');
    expect(result.ok).toBe(true);
    expect(result.matches).toEqual([
      { key: 'c1', noteId: synced.noteId },
      { key: 'c2', noteId: tagged.noteId },
      { key: 'c3', noteId: null },
    ]);
    // Read-only: link discovery never writes.
    expect(fake.calls.map((c) => c.action).filter((a) => !['getActiveProfile', 'modelFieldNames', 'findNotes', 'notesInfo'].includes(a))).toEqual([]);
  });

  it('skips a profile whose note type this collection does not have', async () => {
    delete fake.models['Gum JA'];
    const result = await findAnkiNoteLinks([{ key: 'c1', term: '猫' }], 'User 1');
    expect(result).toEqual({ ok: true, matches: [{ key: 'c1', noteId: null }], profile: 'User 1' });
  });
});

describe('media: stored once, with stable names', () => {
  const data = Buffer.from('fake-png-bytes').toString('base64');
  const name = `jsa-${ankiMediaContentHash(data).slice(0, 12)}.png`;

  it('uploads a file once and skips the same bytes the next time', async () => {
    expect(await storeAnkiMediaOnce(name, data)).toBe('stored');
    expect(await storeAnkiMediaOnce(name, data)).toBe('already-there');
    expect(fake.count('storeMediaFile')).toBe(1);
  });

  it('uploads again when the file was deleted from Anki\'s media folder since (Check Media)', async () => {
    await storeAnkiMediaOnce(name, data);
    fake.media.delete(name);
    expect(await storeAnkiMediaOnce(name, data)).toBe('stored');
    expect(fake.media.get(name)).toBe(data);
  });

  it('trusts its index when this AnkiConnect cannot list media', async () => {
    await storeAnkiMediaOnce(name, data);
    fake.unsupported.add('getMediaFilesNames');
    expect(await storeAnkiMediaOnce(name, data)).toBe('already-there');
    expect(fake.count('storeMediaFile')).toBe(1);
  });

  it('records a content-named file AnkiWeb already synced in instead of uploading it again', async () => {
    fake.media.set(name, data);
    expect(await storeAnkiMediaOnce(name, data)).toBe('already-there');
    expect(fake.count('storeMediaFile')).toBe(0);
  });

  it('keeps one index per Anki profile: another profile\'s media folder gets its own copy', async () => {
    await storeAnkiMediaOnce(name, data);
    fake.profile = 'User 2';
    fake.media.clear();
    noteAnkiActiveProfile('User 2');
    expect(await storeAnkiMediaOnce(name, data)).toBe('stored');
    expect(fake.count('storeMediaFile')).toBe(2);
  });

  it('rewrites a caller-named file whose bytes changed', async () => {
    const one = Buffer.from('clip-one').toString('base64');
    const two = Buffer.from('clip-two').toString('base64');
    expect(await storeAnkiMediaOnce('jp-clip-scene.mp4', one)).toBe('stored');
    expect(await storeAnkiMediaOnce('jp-clip-scene.mp4', two)).toBe('stored');
    expect(await storeAnkiMediaOnce('jp-clip-scene.mp4', two)).toBe('already-there');
    expect(fake.media.get('jp-clip-scene.mp4')).toBe(two);
    expect(crypto.createHash('md5').update(Buffer.from(two, 'base64')).digest('hex')).toBe(ankiMediaContentHash(two));
  });
});
