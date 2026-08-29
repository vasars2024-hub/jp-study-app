import { afterAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const testRoot = path.join(os.tmpdir(), `jp-deck-export-test-${process.pid}`);

vi.mock('electron', () => ({
  app: { getPath: () => testRoot },
  ipcMain: { handle: vi.fn() },
  shell: { openPath: vi.fn() },
}));

import { exportDeckWithAudio } from '../flashcardAudio';

/** A real file inside the managed root, which is the only kind that may be copied. */
function managed(name: string, bytes: string): string {
  const dir = path.join(testRoot, 'flashcard-audio', 'tts');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, bytes);
  return file;
}

afterAll(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
});

describe('writing a deck export to disk', () => {
  it('writes the text file and copies the managed audio beside it', async () => {
    const clip = managed('one.mp3', 'first-clip');
    const result = await exportDeckWithAudio(
      'Expression,Audio\n猫,[sound:jpstudy-a.mp3]',
      'deck.csv',
      [{ fileName: 'jpstudy-a.mp3', sourcePath: clip }],
    );

    expect(result.ok).toBe(true);
    expect(result.written).toBe(1);
    expect(result.failed).toBe(0);
    const directory = result.directory as string;
    expect(fs.readFileSync(path.join(directory, 'deck.csv'), 'utf8')).toContain('[sound:jpstudy-a.mp3]');
    expect(fs.readFileSync(path.join(directory, 'media', 'jpstudy-a.mp3'), 'utf8')).toBe('first-clip');
  });

  it('decodes an inline clip into a real file', async () => {
    const result = await exportDeckWithAudio('Expression\n猫', 'deck.csv', [
      { fileName: 'inline.wav', dataUrl: `data:audio/wav;base64,${Buffer.from('inline-bytes').toString('base64')}` },
    ]);

    expect(result.written).toBe(1);
    expect(fs.readFileSync(path.join(result.directory as string, 'media', 'inline.wav'), 'utf8'))
      .toBe('inline-bytes');
  });

  it('refuses a source outside the managed root — the negative control', async () => {
    // A card's audioPath is only ever a managed asset. Copying an arbitrary one
    // because a card claimed it would make an export button read any file.
    const outside = path.join(testRoot, 'secrets.txt');
    fs.writeFileSync(outside, 'not audio');

    const result = await exportDeckWithAudio('Expression\n猫', 'deck.csv', [
      { fileName: 'stolen.txt', sourcePath: outside },
    ]);

    expect(result.ok).toBe(true);
    expect(result.written).toBe(0);
    expect(result.failed).toBe(1);
    expect(fs.existsSync(path.join(result.directory as string, 'media', 'stolen.txt'))).toBe(false);
  });

  it('counts a clip whose file is gone instead of failing the whole export', async () => {
    const result = await exportDeckWithAudio('Expression\n猫', 'deck.csv', [
      { fileName: 'missing.mp3', sourcePath: path.join(testRoot, 'flashcard-audio', 'tts', 'gone.mp3') },
    ]);

    expect(result.ok).toBe(true);
    expect(result.written).toBe(0);
    expect(result.failed).toBe(1);
    expect(fs.existsSync(path.join(result.directory as string, 'deck.csv'))).toBe(true);
  });

  it('writes into a new folder every time, so nothing overwrites an earlier export', async () => {
    const first = await exportDeckWithAudio('a', 'deck.csv', []);
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    const second = await exportDeckWithAudio('b', 'deck.csv', []);

    expect(first.directory).not.toBe(second.directory);
    expect(fs.readFileSync(path.join(first.directory as string, 'deck.csv'), 'utf8')).toBe('a');
  });

  it('will not be talked into writing outside its own folder', async () => {
    const result = await exportDeckWithAudio('a', '../../escaped.csv', [
      { fileName: '../../escaped.mp3', dataUrl: 'data:audio/wav;base64,AAA=' },
    ]);

    const directory = result.directory as string;
    expect(path.dirname(directory)).toBe(path.join(testRoot, 'exports'));
    expect(fs.existsSync(path.join(testRoot, 'escaped.csv'))).toBe(false);
    expect(fs.readdirSync(path.join(directory, 'media'))).toEqual(['escaped.mp3']);
  });
});
