import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DeckFlashcard } from '../flashcardDeck';
import { summarizeLatestTranscriptBatch } from '../components/media/TranscriptionCardOptions';

const SRC = resolve(__dirname, '..');
const read = (path: string): string => readFileSync(resolve(SRC, path), 'utf8').replace(/\r\n/g, '\n');

function card(overrides: Partial<DeckFlashcard>): DeckFlashcard {
  return {
    id: 'card',
    word: '今日は晴れです。',
    reading: '',
    meaning: 'It is sunny today.',
    source: 'media',
    addedAt: 1,
    ...overrides,
  };
}

describe('transcript card status across hosts', () => {
  it('summarizes only the newest matching reversible batch', () => {
    const summary = summarizeLatestTranscriptBatch([
      card({ id: 'old', bookId: 'm1', studyActionId: 'transcription:m1:old', textProvenance: 'transcript' }),
      card({ id: 'new-a', bookId: 'm1', bookTitle: 'Audio drama', studyActionId: 'transcription:m1:ja', textProvenance: 'transcript', timingFidelity: 'chunk-estimated', audioPath: 'clip.wav', addedAt: 5 }),
      card({ id: 'new-b', bookId: 'm1', bookTitle: 'Audio drama', studyActionId: 'transcription:m1:ja', textProvenance: 'transcript', meaning: '', addedAt: 4 }),
      card({ id: 'other', bookId: 'm2', studyActionId: 'transcription:m2:ja', textProvenance: 'transcript', addedAt: 9 }),
    ], 'm1');

    expect(summary).toMatchObject({ title: 'Audio drama', audio: 1, translated: 1, estimated: true });
    expect(summary?.cards.map((entry) => entry.id)).toEqual(['new-a', 'new-b']);
  });

  it('wires the same options/status contract into Media, Study OS Cards, and Blanc', () => {
    const media = read('components/media/library/MediaDetailPanel.tsx');
    const cards = read('components/flashcards/FlashcardsContent.tsx');
    const blanc = read('components/blanc/BlancMediaPanels.tsx');

    expect(media).toContain('<TranscriptionCardOptionsControl');
    expect(media).toContain('<TranscriptionCardDeckStatus mediaId={entry.primary.id} />');
    expect(media).toMatch(/enqueueTranscription\(\{[\s\S]*?cardOptions,/);
    expect(cards).toContain('<TranscriptionCardDeckStatus />');
    expect(blanc).toContain('<TranscriptionCardOptionsControl');
    expect(blanc).toContain('<TranscriptionCardDeckStatus mediaId={current?.id} />');
    expect(blanc).toMatch(/enqueueTranscription\(\{[\s\S]*?cardOptions,/);
  });
});
