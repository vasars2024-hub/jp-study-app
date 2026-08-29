import { afterAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';

const testRoot = path.join(os.tmpdir(), `jp-flashcard-audio-test-${process.pid}`);

vi.mock('electron', () => ({
  app: { getPath: () => testRoot },
  ipcMain: { handle: vi.fn() },
}));

import {
  cultureForLanguage,
  extractFlashcardAudioClip,
  isManagedFlashcardAudioPath,
  synthesizeFlashcardAudio,
} from '../flashcardAudio';

afterAll(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
});

describe('flashcard audio safety', () => {
  it('maps every application language to an offline voice culture', () => {
    expect(cultureForLanguage('ja')).toBe('ja-JP');
    expect(cultureForLanguage('zh-Hans')).toBe('zh-CN');
    expect(cultureForLanguage('ru')).toBe('ru-RU');
    expect(cultureForLanguage('en')).toBe('en-US');
  });

  it('only reads files below the managed flashcard audio root', () => {
    const root = 'C:/profile/flashcard-audio';
    expect(isManagedFlashcardAudioPath('C:/profile/flashcard-audio/tts/a.wav', root)).toBe(true);
    expect(isManagedFlashcardAudioPath('C:/profile/secrets.txt', root)).toBe(false);
    expect(isManagedFlashcardAudioPath('C:/profile/flashcard-audio/../secrets.txt', root)).toBe(false);
  });

  it.runIf(process.platform === 'win32')('generates Japanese speech with an installed offline voice', async () => {
    const result = await synthesizeFlashcardAudio('今日はいい天気ですね。', 'ja');
    expect(result.ok, result.error).toBe(true);
    expect(result.path && fs.statSync(result.path).size).toBeGreaterThan(1_000);
  }, 20_000);

  it('extracts a bounded sentence clip with bundled ffmpeg', async () => {
    fs.mkdirSync(testRoot, { recursive: true });
    const source = path.join(testRoot, 'source.wav');
    const generated = spawnSync(ffmpegStatic as unknown as string, [
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-y', '-hide_banner', '-loglevel', 'error', source,
    ]);
    expect(generated.status, generated.stderr.toString()).toBe(0);
    const clip = await extractFlashcardAudioClip(source, 'fixture', 0.4, 1.2, 'テストです。');
    expect(fs.statSync(clip).size).toBeGreaterThan(1_000);
  });
});
