// @vitest-environment jsdom
/**
 * The two renderer halves of system-audio mining.
 *
 * - `CaptureHostCore` (the hidden capture window): what a cut, a manual
 *   recording and a transcription request answer main with — WAV bytes whose
 *   length and times match the ring, a silence flag, and "no model" instead of
 *   a Whisper call when none is installed.
 * - `captionsMining` (the main window): the card a caption mine becomes —
 *   sentence or word front, the clip as a managed file, the Anki half routed as
 *   audio in the study language — and the reply that goes back to main.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A plain function rather than vi.fn: vitest 4.1 reports a rejection from a
// vi.fn implementation as a test failure even when the caller catches it, and
// the failure path is exactly what one of these tests exercises.
const mineCalls: unknown[] = [];
let mineImpl: (input: unknown) => Promise<unknown> = async () => ({ created: true, card: { id: 'c' } });
vi.mock('../studyMining', () => ({
  mineToStudy: (input: unknown) => {
    mineCalls.push(input);
    return mineImpl(input);
  },
}));
vi.mock('../i18n', () => ({ t: (key: string) => key }));

import { CaptureHostCore } from '../captions/systemAudioCaptureHost';
import { captionMineInput, handleCaptionMine, installCaptionsMining } from '../captions/captionsMining';
import { base64ToBytes, decodeWav } from '../../shared/systemAudioRing';
import type { CaptionMinePayload } from '../../shared/captionsOverlay';

const RATE = 24_000;
const toneBlock = (ms: number): Float32Array =>
  Float32Array.from({ length: (RATE * ms) / 1000 }, (_, i) => Math.sin(i / 4) * 0.3);

function hostWithAudio(seconds: number, endWallMs: number, opts: Partial<ConstructorParameters<typeof CaptureHostCore>[0]> = {}): CaptureHostCore {
  const core = new CaptureHostCore({
    modelInstalled: () => true,
    transcribe: async () => ({ ok: true, text: 'テスト' }),
    now: () => endWallMs,
    ...opts,
  }, RATE, 60);
  const blockMs = 100;
  const blocks = (seconds * 1000) / blockMs;
  for (let i = 0; i < blocks; i += 1) {
    core.write(toneBlock(blockMs), endWallMs - (blocks - 1 - i) * blockMs);
  }
  return core;
}

describe('CaptureHostCore', () => {
  it('cuts the last 8 s as a WAV main can encode', async () => {
    const core = hostWithAudio(20, 1_000_000);
    const reply = await core.handle({ id: '1', type: 'cut', mode: 'last', seconds: 8 });
    expect(reply).toMatchObject({ ok: true, silent: false, endMs: 1_000_000, startMs: 992_000, durationMs: 8000 });
    const wav = decodeWav(base64ToBytes(String(reply.wavBase64)))!;
    expect(wav.sampleRate).toBe(RATE);
    expect(wav.samples.length).toBe(8 * RATE);
  });

  it('cuts a caption line by wall-clock range', async () => {
    const core = hostWithAudio(20, 2_000_000);
    const reply = await core.handle({ id: '2', type: 'cut', mode: 'range', startMs: 1_990_000, endMs: 1_993_500 });
    expect(reply).toMatchObject({ ok: true, startMs: 1_990_000, endMs: 1_993_500, durationMs: 3500 });
  });

  it('flags silence so no silent card is offered', async () => {
    const core = new CaptureHostCore({ modelInstalled: () => true, transcribe: vi.fn() }, RATE, 60);
    core.write(new Float32Array(RATE * 10), 50_000);
    expect(await core.handle({ id: '3', type: 'cut', mode: 'last', seconds: 8 })).toMatchObject({ ok: true, silent: true });
  });

  it('records a manual clip from start to stop', async () => {
    let now = 5_000;
    const core = new CaptureHostCore({ modelInstalled: () => true, transcribe: vi.fn(), now: () => now }, RATE, 60);
    core.write(toneBlock(1000), now);
    expect(await core.handle({ id: 'a', type: 'record-start' })).toEqual({ ok: true });
    for (let i = 0; i < 25; i += 1) {
      now += 100;
      core.write(toneBlock(100), now);
    }
    const reply = await core.handle({ id: 'b', type: 'record-stop' });
    expect(reply).toMatchObject({ ok: true, durationMs: 2500, endMs: 7_500 });
    expect(core.recording).toBe(false);
    expect(await core.handle({ id: 'c', type: 'record-stop' })).toMatchObject({ ok: false });
  });

  it('transcribes a cut once, at 16 kHz, in the study language', async () => {
    const transcribe = vi.fn(async (audio: Float32Array, lang: string) => ({ ok: true, text: `${lang}:${audio.length}` }));
    const core = hostWithAudio(10, 3_000_000, { transcribe });
    const cut = await core.handle({ id: '1', type: 'cut', mode: 'last', seconds: 2 });
    const t = await core.handle({ id: '2', type: 'transcribe', sliceId: cut.sliceId, lang: 'ru' });
    expect(t).toMatchObject({ ok: true, text: 'ru:32000' });
    expect(await core.handle({ id: '3', type: 'transcribe', sliceId: cut.sliceId, lang: 'ru' })).toMatchObject({ ok: false, error: 'slice-gone' });
  });

  it('answers "no model" instead of running Whisper when none is installed', async () => {
    const transcribe = vi.fn();
    const core = hostWithAudio(10, 4_000_000, { transcribe, modelInstalled: () => false });
    const cut = await core.handle({ id: '1', type: 'cut', mode: 'last', seconds: 2 });
    expect(await core.handle({ id: '2', type: 'transcribe', sliceId: cut.sliceId, lang: 'ja' })).toEqual({ ok: false, modelMissing: true });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('configure resizes the ring; clear forgets everything', async () => {
    const core = hostWithAudio(50, 5_000_000);
    await core.handle({ id: '1', type: 'configure', seconds: 30 });
    expect(core.ring.capacity).toBe(30 * RATE);
    core.clear();
    expect(await core.handle({ id: '2', type: 'cut', mode: 'last', seconds: 8 })).toMatchObject({ ok: false });
  });
});

const payload = (over: Partial<CaptionMinePayload> = {}): CaptionMinePayload => ({
  requestId: 'r1',
  sentence: 'Он сказал, что придёт завтра.',
  studyLang: 'ru',
  textProvenance: 'transcript',
  sourceTitle: 'Кино — VLC',
  audioBase64: 'AAAA',
  audioFilename: 'gum-captions-20260926-070509.mp3',
  ...over,
});

describe('captionMineInput', () => {
  it('a sentence mine: sentence front, clip as a managed file, Anki as an audio sentence note', () => {
    const input = captionMineInput(payload(), 'LISTEN');
    expect(input).toMatchObject({
      word: 'Он сказал, что придёт завтра.',
      sentence: 'Он сказал, что придёт завтра.',
      source: 'media',
      studyKind: 'sentence',
      studyLang: 'ru',
      textProvenance: 'transcript',
      sourceTitle: 'Кино — VLC',
      sourceId: 'captions:Кино — VLC',
      folder: 'Captions',
      audio: { base64: 'AAAA', filename: 'gum-captions-20260926-070509.mp3' },
    });
    expect(input.anki).toMatchObject({
      route: { source: 'audio', cardKind: 'sentence', language: 'ru' },
      audioBase64: 'AAAA',
      audioFilename: 'gum-captions-20260926-070509.mp3',
      extraTags: ['gum-captions'],
    });
  });

  it('a word from the pop-up: the word is the front, the line its sentence', () => {
    const input = captionMineInput(payload({ word: 'придёт', sentence: 'Он придёт.', studyLang: 'ru' }), 'LISTEN');
    expect(input).toMatchObject({ word: 'придёт', sentence: 'Он придёт.', studyKind: 'vocabulary' });
    expect(input.anki?.route?.cardKind).toBe('word');
  });

  it('no transcript and nothing typed: a listening card named by its clip', () => {
    const input = captionMineInput(payload({ sentence: '', studyLang: 'ja' }), 'LISTEN');
    expect(input.word).toBe('LISTEN');
    expect(input.sentence).toBeUndefined();
    expect(input.sourceUrl).toBe('gum-captions:gum-captions-20260926-070509.mp3');
  });
});

describe('the main window side', () => {
  beforeEach(() => {
    mineCalls.length = 0;
  });

  it('mines through mineToStudy and replies with the card', async () => {
    mineImpl = async () => ({ created: true, card: { id: 'card-9' } });
    const reply = await handleCaptionMine(payload({ requestId: 'q1', studyLang: 'zh', sentence: '我们走吧' }));
    expect(reply).toEqual({ requestId: 'q1', ok: true, created: true, cardId: 'card-9' });
    expect(mineCalls[0]).toMatchObject({ sentence: '我们走吧', studyLang: 'zh', audio: { base64: 'AAAA' } });
  });

  it('refuses an empty mine and reports a failure instead of throwing', async () => {
    expect(await handleCaptionMine(payload({ sentence: '', audioBase64: undefined }))).toMatchObject({ ok: false, error: 'empty' });
    mineImpl = async () => {
      throw new Error('deck full');
    };
    expect(await handleCaptionMine(payload())).toMatchObject({ ok: false, error: 'deck full' });
  });

  it('answers every forwarded request on the reply channel', async () => {
    mineImpl = async () => ({ created: false, card: { id: 'c2' } });
    let request: ((p: CaptionMinePayload) => void) | null = null;
    const replies: unknown[] = [];
    (window as unknown as { api: unknown }).api = {
      onCaptionsMineRequest: (cb: (p: CaptionMinePayload) => void) => {
        request = cb;
        return () => { request = null; };
      },
      captionsMineReply: (r: unknown) => replies.push(r),
      onCaptionsOpenSettings: () => () => undefined,
    };
    const off = installCaptionsMining();
    request!(payload({ requestId: 'x' }));
    await vi.waitFor(() => expect(replies).toEqual([{ requestId: 'x', ok: true, created: false, cardId: 'c2' }]));
    off();
    expect(request).toBeNull();
  });
});
