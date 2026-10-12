// @vitest-environment node
/**
 * A Gum deck card's saved extras reach Anki through the real `mineNote`, against
 * the fake AnkiConnect behind a real loopback socket (`e2eFixtures/fakeAnkiServer`,
 * ephemeral port, never 8765). No Anki, no window, no AI provider.
 *
 * What is pinned: the extras land in the note type's Notes field when it has
 * one, else are appended to the meaning (back) field; model-written text is
 * sanitized and marked as generated; the learner's own text is escaped; a
 * malformed payload over IPC is dropped, not written.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudyProfile } from '../../shared/profiles';

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'gum-extras-mine-'));

vi.mock('electron', () => ({
  app: { getPath: () => userData, once: () => undefined, on: () => undefined, isPackaged: false },
  ipcMain: { handle: () => undefined, on: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
  clipboard: { readImage: () => ({ isEmpty: () => true }) },
  nativeImage: { createEmpty: () => ({ isEmpty: () => true }) },
}));

const profiles = vi.hoisted(() => ({ byId: new Map<string, unknown>(), active: '' }));
vi.mock('../profiles', () => ({
  getProfileStore: () => ({
    getActiveProfile: () => profiles.byId.get(profiles.active),
    getProfile: (id: string) => profiles.byId.get(id),
  }),
}));
vi.mock('../profileRules', () => ({ loadProfileRules: () => ({ rules: [] }) }));
vi.mock('../dictionary', () => ({ fetchJapaneseAudio: async () => '' }));
vi.mock('../dictionary/yomitan', () => ({ getFrequency: () => '', getPitch: () => '' }));
vi.mock('../mining', () => ({ resolveCustomFrequencyRanks: () => ({ byDictionary: {} }) }));
vi.mock('../studyLanguage', () => ({ getMainStudyLang: () => 'ja' }));

import { startFakeAnkiServer, type FakeAnkiServer } from './e2eFixtures/fakeAnkiServer';
import { setAnkiUrlProvider } from '../anki/client';
import { invalidateAnkiCaches } from '../anki/noteTypes';
import { mineNote } from '../anki';
import { makeCustomProfile } from '../../shared/profiles';

let anki: FakeAnkiServer;

const EXTRAS = {
  mnemonic: 'Tabe-ru <img src=x onerror=alert(1)>: you eat at a <b>table</b>.',
  distinction: 'Not 食う, which is rough.',
  exampleSentences: [
    { text: '毎朝パンを食べる。', translation: 'I eat bread every morning.', origin: 'ai' as const },
    { text: '<script>x</script>寿司を食べる', origin: 'corpus' as const },
  ],
  acceptedAnswers: { meaning: ['to eat <food>'] },
};

function notesProfile(): StudyProfile {
  const profile = makeCustomProfile('gum-notes', 'Gum Notes');
  profile.anki.noteFields = ['Term', 'Reading', 'Meaning', 'Sentence', 'Notes'];
  return profile;
}

function basicProfile(): StudyProfile {
  const profile = makeCustomProfile('gum-basic', 'Gum Basic');
  profile.anki.modelName = 'Basic';
  profile.anki.noteFields = ['Front', 'Back'];
  profile.anki.fieldTemplates = {};
  profile.card = { ...profile.card, front: ['term'], back: ['meaning'] };
  return profile;
}

function lastNote(): Record<string, string> {
  const notes = [...anki.fake.notes.values()];
  return notes[notes.length - 1].fields;
}

beforeAll(async () => {
  anki = await startFakeAnkiServer();
  setAnkiUrlProvider(() => anki.url);
});

afterAll(async () => {
  await anki.close();
  fs.rmSync(userData, { recursive: true, force: true });
});

beforeEach(() => {
  invalidateAnkiCaches();
  profiles.byId.clear();
  for (const profile of [notesProfile(), basicProfile()]) profiles.byId.set(profile.id, profile);
  anki.fake.models.Basic = ['Front', 'Back'];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('mineNote carries a deck card\'s saved extras', () => {
  it('writes them to the Notes field, sanitized and marked as generated', async () => {
    profiles.active = 'gum-notes';
    const result = await mineNote({ profileId: 'gum-notes', term: '食べる', reading: 'たべる', meaning: 'to eat', cardExtras: EXTRAS });
    expect(result).toMatchObject({ ok: true });
    const fields = lastNote();
    expect(fields.Meaning).toBe('to eat');
    const notes = fields.Notes;
    // Generated text: marked, and the injected markup is inert text.
    expect(notes).toContain('class="jp-ai-gen"');
    expect(notes).not.toMatch(/<img|<script/i);
    expect(notes).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(notes).toContain('<b>table</b>'); // the allowlisted bare tag survives
    expect(notes).toContain('毎朝パンを食べる。');
    // Corpus sentence and the learner's own answer: escaped, never marked as AI.
    expect(notes).toContain('&lt;script&gt;x&lt;/script&gt;寿司を食べる');
    expect(notes).toContain('to eat &lt;food&gt;');
    expect(notes.match(/jp-ai-gen/g)).toHaveLength(4); // mnemonic, distinction, AI sentence + its translation
    // Section headings in the main process's language (English here).
    expect(notes).toContain('<b>Memory aid</b>');
    expect(notes).toContain('<b>Also accepted</b>');
  });

  it('appends them to the back field when the note type has no Notes field', async () => {
    profiles.active = 'gum-basic';
    const result = await mineNote({ profileId: 'gum-basic', term: '飲む', meaning: 'to drink', cardExtras: { mnemonic: 'Nomu: no more thirst.' } });
    expect(result).toMatchObject({ ok: true });
    const fields = lastNote();
    expect(fields.Front).toBe('飲む');
    expect(fields.Back.startsWith('to drink<br><div class="jp-card-extras">')).toBe(true);
    expect(fields.Back).toContain('Nomu: no more thirst.');
  });

  it('a card without extras, or a malformed payload, writes the note exactly as before', async () => {
    profiles.active = 'gum-notes';
    await mineNote({ profileId: 'gum-notes', term: '見る', meaning: 'to see' });
    expect(lastNote().Notes).toBe('');
    await mineNote({
      profileId: 'gum-notes',
      term: '聞く',
      meaning: 'to hear',
      cardExtras: { mnemonic: 42, exampleSentences: 'nope', acceptedAnswers: { meaning: [null] } } as never,
    });
    expect(lastNote().Notes).toBe('');
  });
});
