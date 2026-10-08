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
  cancelFlashcardSynthesis,
  classifySynthesisFailure,
  cultureForLanguage,
  extractFlashcardAudioClip,
  flashcardAudioUsage,
  isManagedFlashcardAudioPath,
  listFlashcardVoices,
  pruneMediaClips,
  releaseFlashcardAudio,
  sweepUnreferencedFlashcardAudio,
  synthesizeFlashcardAudio,
} from '../flashcardAudio';
import { flashcardAudioErrorKey } from '../../shared/flashcardAudioMessages';

afterAll(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
});

/**
 * The synthesis cases need a Japanese SAPI voice. A Windows install without the
 * Japanese speech pack (Settings > Time & language > Speech) is a missing
 * machine feature, not a product failure, so they are skipped there.
 */
let japaneseVoiceProbe: Promise<boolean> | null = null;
function japaneseVoiceInstalled(): Promise<boolean> {
  japaneseVoiceProbe ??= listFlashcardVoices(true)
    .then((inventory) => inventory.voices.some((voice) => voice.language === 'ja'))
    .catch(() => false);
  return japaneseVoiceProbe;
}
const hasJapaneseVoice = process.platform === 'win32';

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

  it.runIf(hasJapaneseVoice)('generates Japanese speech with an installed offline voice', async (ctx) => {
    if (!(await japaneseVoiceInstalled())) return ctx.skip();
    const result = await synthesizeFlashcardAudio('今日はいい天気ですね。', 'ja');
    expect(result.ok, result.error).toBe(true);
    expect(result.path && fs.statSync(result.path).size).toBeGreaterThan(1_000);
    // The run names the voice it used rather than leaving the caller to assume.
    expect(result.voice).toBeTruthy();
    expect(result.voiceResolution).toBe('preferred');
    // 60s, not 20s. These four cases drive REAL external work on this machine — SAPI voice
    // enumeration and an offline synthesis process — and 20_000 is exactly the configured
    // default (vitest.config.ts:58), so the annotation bought nothing. Alone each takes ~1.2s;
    // under a full `vitest run` with eight workers contending they exceeded 20s and were
    // reported as a product regression on 2026-09-02. The cost is external, so there is no
    // repeated work to remove the way `mediaSurfaceImportGraph` had. An assertion failure
    // still fails on the assertion, not the clock.
  }, 60_000);

  it.runIf(process.platform === 'win32')('enumerates this machine\'s real voices', async () => {
    const inventory = await listFlashcardVoices(true);
    expect(inventory.ok, inventory.error).toBe(true);
    expect(inventory.platform).toBe('win32');
    expect(inventory.voices.length).toBeGreaterThan(0);
    // Every voice must carry a usable id and a language, or the picker shows
    // rows the synthesizer cannot be asked for.
    for (const voice of inventory.voices) {
      expect(voice.id).toBeTruthy();
      expect(voice.language).toMatch(/^[a-z]{2}$/);
    }
  }, 60_000);

  it.runIf(hasJapaneseVoice)('falls back within the language and discloses it', async (ctx) => {
    if (!(await japaneseVoiceInstalled())) return ctx.skip();
    // The negative control for the whole voice preference: a saved voice that is
    // not installed must still produce Japanese audio, and must not report the
    // result as the user's own choice.
    const result = await synthesizeFlashcardAudio(
      '発音を確かめます。',
      'ja',
      'Microsoft Nobody Desktop',
    );
    expect(result.ok, result.error).toBe(true);
    expect(result.voiceResolution).toBe('language');
    const japanese = (await listFlashcardVoices()).voices.filter((voice) => voice.language === 'ja');
    expect(japanese.map((voice) => voice.name)).toContain(result.voice);
  }, 60_000);

  it.runIf(hasJapaneseVoice)('cancels an in-flight offline synthesis process', async (ctx) => {
    if (!(await japaneseVoiceInstalled())) return ctx.skip();
    const requestId = `cancel-${Date.now()}`;
    const pending = synthesizeFlashcardAudio(
      `これはキャンセルできる長い音声です。${'まだ続きます。'.repeat(180)}`,
      'ja',
      undefined,
      requestId,
    );
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(cancelFlashcardSynthesis(requestId)).toBe(true);

    const result = await pending;
    expect(result).toMatchObject({ ok: false, reason: 'cancelled' });
    // The reverse transition is complete: a settled id no longer cancels
    // anything, so it cannot kill a later request that reuses the string.
    expect(cancelFlashcardSynthesis(requestId)).toBe(false);
  }, 60_000);

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

describe('reclaiming clips a card batch no longer references', () => {
  const clipDir = path.join(testRoot, 'flashcard-audio', 'media', 'reclaim');
  const clip = (name: string): string => {
    fs.mkdirSync(clipDir, { recursive: true });
    const file = path.join(clipDir, name);
    fs.writeFileSync(file, Buffer.alloc(64, 1));
    return file;
  };

  it('deletes managed clips and REFUSES anything outside the managed root', () => {
    const managed = clip('managed.mp3');
    const outsider = path.join(testRoot, 'not-managed.mp3');
    fs.writeFileSync(outsider, Buffer.alloc(8, 2));

    // The negative control: an arbitrary path must survive the same call that
    // deletes the managed one, because `paths` arrives from renderer storage.
    expect(releaseFlashcardAudio([managed, outsider, '../escape.mp3', ''])).toEqual({
      removed: 1,
      skipped: 3,
    });
    expect(fs.existsSync(managed)).toBe(false);
    expect(fs.existsSync(outsider)).toBe(true);
    fs.rmSync(outsider, { force: true });
  });

  it('prunes one media directory down to exactly the batch that is current', () => {
    const kept = clip('kept.mp3');
    const stale = clip('stale.mp3');
    const result = pruneMediaClips('reclaim', [kept, undefined]);

    expect(result).toEqual({ removed: 1, bytes: 64 });
    expect(fs.existsSync(kept)).toBe(true);
    expect(fs.existsSync(stale)).toBe(false);
    // A media that never produced audio is not an error and deletes nothing.
    expect(pruneMediaClips('never-transcribed', [])).toEqual({ removed: 0, bytes: 0 });
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
    expect(flashcardAudioErrorKey('cancelled')).toBe('flash.audioError.cancelled');
    expect(flashcardAudioErrorKey('empty-text')).toBe('flash.audioError.emptyText');
    // The control: an absent or unknown reason must still be a KEY. Returning the
    // raw detail here is exactly the bug — English text in a Russian UI.
    expect(flashcardAudioErrorKey(undefined)).toBe('flash.audioGenerationFailed');
    expect(flashcardAudioErrorKey('Access is denied')).toBe('flash.audioGenerationFailed');
  });
});

describe('what card audio costs, and reclaiming what nothing points at', () => {
  const root = path.join(testRoot, 'flashcard-audio');
  const write = (relative: string, size: number): string => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.alloc(size, 3));
    return file;
  };

  it('splits the usage by what produced it, and survives an absent root', async () => {
    fs.rmSync(root, { recursive: true, force: true });
    // A profile that has never mined audio reports zero, not a crash.
    expect(await flashcardAudioUsage()).toEqual({
      clips: { files: 0, bytes: 0 },
      speech: { files: 0, bytes: 0 },
      total: { files: 0, bytes: 0 },
    });

    write('media/show-1/a.mp3', 100);
    write('media/show-2/b.mp3', 200);
    write('tts/spoken.wav', 50);
    expect(await flashcardAudioUsage()).toEqual({
      clips: { files: 2, bytes: 300 },
      speech: { files: 1, bytes: 50 },
      total: { files: 3, bytes: 350 },
    });
  });

  it('sweeps only what the deck stopped referencing', async () => {
    fs.rmSync(root, { recursive: true, force: true });
    const kept = write('media/show-1/kept.mp3', 10);
    const orphan = write('media/show-1/orphan.mp3', 40);
    const spoken = write('tts/spoken.wav', 25);
    // A card can point at a capture outside the managed root; naming it here
    // must not make the sweep reach outside, and must not save an orphan.
    const outside = path.join(testRoot, 'capture.wav');
    fs.writeFileSync(outside, Buffer.alloc(5, 4));

    const result = await sweepUnreferencedFlashcardAudio([kept, outside, '']);
    expect(result).toEqual({ removed: 2, bytes: 65, kept: 1 });
    expect(fs.existsSync(kept)).toBe(true);
    expect(fs.existsSync(orphan)).toBe(false);
    expect(fs.existsSync(spoken)).toBe(false);
    expect(fs.existsSync(outside)).toBe(true);
  });

  it('an empty reference set is a full sweep, not a refusal', async () => {
    fs.rmSync(root, { recursive: true, force: true });
    write('media/show-1/a.mp3', 10);
    write('tts/b.wav', 10);
    expect(await sweepUnreferencedFlashcardAudio([])).toEqual({ removed: 2, bytes: 20, kept: 0 });
    expect((await flashcardAudioUsage()).total).toEqual({ files: 0, bytes: 0 });
  });
});
