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
  classifySynthesisFailure,
  cultureForLanguage,
  extractFlashcardAudioClip,
  isManagedFlashcardAudioPath,
  synthesizeFlashcardAudio,
} from '../flashcardAudio';
import { flashcardAudioErrorKey } from '../../shared/flashcardAudioMessages';

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

/**
 * A failure a user cannot act on is barely better than a fabricated success. Each of
 * these strings is what one of the three back ends really prints: the first is the
 * `throw` inside `synthesizeWindows`, the second is macOS `say`, the third is the
 * ENOENT text `run` builds when espeak is simply not installed.
 */
describe('a failed synthesis says which kind of failure it was', () => {
  it('separates "no voice for this language" from "no synthesizer at all"', () => {
    expect(classifySynthesisFailure('No offline voice is installed for ja-JP.')).toBe('no-voice');
    expect(classifySynthesisFailure('Voice Kyoko not found')).toBe('no-voice');
    expect(classifySynthesisFailure('espeak is not installed.')).toBe('no-synthesizer');
    // Anything else keeps its detail and is reported as a generic failure rather
    // than being guessed into one of the actionable buckets.
    expect(classifySynthesisFailure('Access to the path is denied.')).toBe('failed');
  });

  it('empty text is refused before a process is spawned, and says so', async () => {
    const result = await synthesizeFlashcardAudio('   ', 'ja');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('empty-text');
  });

  it('every reason resolves to a translated key, and an unset one does not fall through', () => {
    expect(flashcardAudioErrorKey('no-voice')).toBe('flash.audioError.noVoice');
    expect(flashcardAudioErrorKey('no-synthesizer')).toBe('flash.audioError.noSynthesizer');
    expect(flashcardAudioErrorKey('not-managed')).toBe('flash.audioError.notManaged');
    expect(flashcardAudioErrorKey('empty-text')).toBe('flash.audioError.emptyText');
    // The control: an absent or unknown reason must still be a KEY. Returning the
    // raw detail here is exactly the bug — English text in a Russian UI.
    expect(flashcardAudioErrorKey(undefined)).toBe('flash.audioGenerationFailed');
    expect(flashcardAudioErrorKey('Access is denied')).toBe('flash.audioGenerationFailed');
  });
});
