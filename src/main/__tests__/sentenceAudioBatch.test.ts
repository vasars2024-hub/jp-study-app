/**
 * Drives the real bundled ffmpeg.
 *
 * The argument vector is unit-tested in `shared/__tests__/sentenceDeck.test.ts`;
 * this is the other half — that ffmpeg accepts it and the files that come out
 * are real, decodable, the right length, from the right audio track, at a
 * normalised level, and stored where the managed-media sweep will find them.
 *
 * Fixtures are generated here (tones on a silent bed), so the suite needs no
 * media on disk. When the shared test episode happens to be present it is read
 * too — read only, never written — as the end-to-end check on a real .srt.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { extractSentenceAudioBatch } from '../sentenceAudioBatch';

/** A hook after each real store write, so a cancel can land between a clip and its still. */
const writes = vi.hoisted(() => ({ after: null as null | (() => void) }));
vi.mock('../minedMediaStore', async (importOriginal) => {
  const real = await importOriginal<typeof import('../minedMediaStore')>();
  return {
    ...real,
    writeMinedMediaBytes: (...args: Parameters<typeof real.writeMinedMediaBytes>) => {
      const out = real.writeMinedMediaBytes(...args);
      writes.after?.();
      return out;
    },
  };
});
import { parseSubtitles } from '../../shared/subtitleCues';
import { SENTENCE_DECK_DEFAULTS, planSentenceDeck } from '../../shared/sentenceDeck';

const ffmpegPath = ffmpegStatic as unknown as string;

let workDir = '';
let mediaDir = '';
let episode = '';
let dualAudio = '';
let silentVideo = '';

function runFfmpeg(args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('error', () => resolve({ code: null, stderr }));
    proc.on('close', (code) => resolve({ code, stderr }));
  });
}

/** Duration and mean volume of a file, as ffmpeg decodes it. */
async function measure(file: string): Promise<{ seconds: number; meanDb: number; report: string }> {
  const { stderr } = await runFfmpeg(['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-']);
  const time = [...stderr.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].at(-1);
  const seconds = time ? Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]) : 0;
  const mean = /mean_volume: (-?[\d.]+) dB/.exec(stderr);
  return { seconds, meanDb: mean ? Number(mean[1]) : -Infinity, report: stderr };
}

beforeAll(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-sentence-deck-'));
  mediaDir = path.join(workDir, 'flashcard-audio', 'mined');
  episode = path.join(workDir, 'episode 01.mkv');
  dualAudio = path.join(workDir, 'dual audio.mkv');
  silentVideo = path.join(workDir, 'no audio.mp4');
  // Three quiet "lines" of tone on a silent bed, the way speech sits in an episode.
  const tone = "aevalsrc='0.05*sin(2*PI*440*t)*(between(t,1,3)+between(t,4,6)+between(t,7,9))':s=44100:d=10";
  const a = await runFfmpeg([
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=10:duration=10',
    '-f', 'lavfi', '-i', tone,
    '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest',
    episode,
  ]);
  if (a.code !== 0) throw new Error(`fixture build failed: ${a.stderr.slice(-400)}`);
  // A dub first and the original second, tagged, as a dual-audio release ships.
  const b = await runFfmpeg([
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=10:duration=4',
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
    '-map', '0:v', '-map', '1:a', '-map', '2:a',
    '-metadata:s:a:0', 'language=eng', '-metadata:s:a:1', 'language=jpn',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-t', '4',
    dualAudio,
  ]);
  if (b.code !== 0) throw new Error(`fixture build failed: ${b.stderr.slice(-400)}`);
  const c = await runFfmpeg([
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=10:duration=3',
    '-c:v', 'libx264', '-preset', 'ultrafast', silentVideo,
  ]);
  if (c.code !== 0) throw new Error(`fixture build failed: ${c.stderr.slice(-400)}`);
}, 180_000);

afterAll(() => {
  if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
});

describe('extractSentenceAudioBatch against real ffmpeg', () => {
  it('cuts every line as a playable, padded, normalised MP3 in the managed store', async () => {
    const progress: number[] = [];
    const result = await extractSentenceAudioBatch(
      {
        filePath: episode,
        clips: [
          { id: 'a', startMs: 1000, endMs: 3000 },
          { id: 'b', startMs: 4000, endMs: 6000 },
          { id: 'c', startMs: 7000, endMs: 9000 },
        ],
      },
      { mediaDirectory: mediaDir, onProgress: (done) => progress.push(done) },
    );

    expect(result.ok).toBe(true);
    expect(result.cancelled).toBe(false);
    expect(result.results.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(progress).toEqual([1, 2, 3]);
    for (const clip of result.results) {
      expect(clip.error).toBeUndefined();
      expect(clip.ok).toBe(true);
      expect(clip.durationSec).toBeCloseTo(2.4, 5);
      expect(path.dirname(clip.audioPath ?? '')).toBe(mediaDir);
      expect(clip.audioPath).toMatch(/[0-9a-f]{24}\.mp3$/);
      const { seconds, meanDb, report } = await measure(clip.audioPath ?? '');
      expect(report).toMatch(/Audio: mp3.*mono/);
      expect(seconds).toBeGreaterThan(2.2);
      expect(seconds).toBeLessThan(2.7);
      // The source tone sits around -32 dB; loudnorm lifts the line toward -18 LUFS.
      expect(meanDb).toBeGreaterThan(-26);
    }
  }, 120_000);

  it('cuts from the study-language track of a dual-audio release', async () => {
    const pick = await extractSentenceAudioBatch(
      { filePath: dualAudio, audioStream: 1, clips: [{ id: 'jp', startMs: 1000, endMs: 2500 }] },
      { mediaDirectory: mediaDir },
    );
    const dub = await extractSentenceAudioBatch(
      { filePath: dualAudio, audioStream: 0, clips: [{ id: 'en', startMs: 1000, endMs: 2500 }] },
      { mediaDirectory: mediaDir },
    );
    expect((await measure(pick.results[0].audioPath ?? '')).meanDb).toBeGreaterThan(-30);
    // The silent "dub" stays silent: the stream index really selects the track.
    expect((await measure(dub.results[0].audioPath ?? '')).meanDb).toBeLessThan(-60);
  }, 120_000);

  it('reports a clip it cannot cut and still cuts the rest', async () => {
    const result = await extractSentenceAudioBatch(
      {
        filePath: episode,
        clips: [
          { id: 'good', startMs: 1000, endMs: 3000 },
          { id: 'past-the-end', startMs: 60_000, endMs: 62_000 },
          { id: 'also-good', startMs: 4000, endMs: 6000 },
        ],
      },
      { mediaDirectory: mediaDir },
    );
    expect(result.ok).toBe(true);
    expect(result.results.map((r) => [r.id, r.ok])).toEqual([
      ['good', true], ['past-the-end', false], ['also-good', true],
    ]);
    expect(result.results[1].error).toBeTruthy();
  }, 120_000);

  it('refuses a file with no audio once, instead of failing every line', async () => {
    const result = await extractSentenceAudioBatch(
      { filePath: silentVideo, clips: [{ id: 'x', startMs: 0, endMs: 1000 }, { id: 'y', startMs: 1000, endMs: 2000 }] },
      { mediaDirectory: mediaDir },
    );
    expect(result.ok).toBe(false);
    expect(result.reasonKey).toBe('sentenceDeck.error.noAudioStream');
    expect(result.results).toEqual([]);
  }, 60_000);

  it('refuses a file that is not there', async () => {
    const result = await extractSentenceAudioBatch(
      { filePath: path.join(workDir, 'gone.mkv'), clips: [{ id: 'x', startMs: 0, endMs: 1000 }] },
      { mediaDirectory: mediaDir },
    );
    expect(result).toMatchObject({ ok: false, reasonKey: 'sentenceDeck.error.noFile' });
  });

  it('stops when cancelled and says so', async () => {
    const controller = new AbortController();
    const clips = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, startMs: 1000 + (i % 3) * 3000, endMs: 2000 + (i % 3) * 3000 + i }));
    const result = await extractSentenceAudioBatch(
      { filePath: episode, clips },
      {
        mediaDirectory: mediaDir,
        concurrency: 1,
        onProgress: (done) => { if (done === 2) controller.abort(); },
        signal: controller.signal,
      },
    );
    expect(result.cancelled).toBe(true);
    expect(result.results.length).toBeLessThan(clips.length);
    expect(result.results.length).toBeGreaterThanOrEqual(2);
  }, 120_000);

  it('reports every file it stored, including one finished as the cancel arrived', async () => {
    const dir = path.join(workDir, 'cancel-media');
    const controller = new AbortController();
    let stored = 0;
    // Clip 1's audio is stored, then the user cancels before its still is cut.
    writes.after = () => {
      stored += 1;
      if (stored === 3) controller.abort();
    };
    try {
      const clips = Array.from({ length: 6 }, (_, i) => ({ id: `k${i}`, startMs: 1000 + (i % 3) * 3000, endMs: 2500 + (i % 3) * 3000 + i * 7 }));
      const result = await extractSentenceAudioBatch(
        { filePath: episode, clips, withStill: true },
        { mediaDirectory: dir, concurrency: 1, signal: controller.signal },
      );
      expect(result.cancelled).toBe(true);
      const reported = new Set(
        result.results.flatMap((r) => [r.audioPath, r.imagePath]).filter((p): p is string => Boolean(p)).map((p) => path.resolve(p)),
      );
      const onDisk = fs.readdirSync(dir).map((name) => path.resolve(dir, name));
      // No encoder starts after the cancel, and nothing stored goes unreported.
      expect(onDisk).toHaveLength(3);
      expect(onDisk.filter((file) => !reported.has(file))).toEqual([]);
    } finally {
      writes.after = null;
    }
  }, 120_000);

  it('adds a still from the scene when asked', async () => {
    const result = await extractSentenceAudioBatch(
      { filePath: episode, withStill: true, clips: [{ id: 's', startMs: 4000, endMs: 6000 }] },
      { mediaDirectory: mediaDir },
    );
    expect(result.results[0].imagePath).toMatch(/\.jpg$/);
    expect(fs.statSync(result.results[0].imagePath ?? '').size).toBeGreaterThan(500);
  }, 60_000);
});

const TEST_EPISODE = 'E:/jp-test-media/video/Yuru Camp/[Test] Yuru Camp - 01.mp4';
const TEST_SUBTITLE = 'E:/jp-test-media/video/Yuru Camp/[Test] Yuru Camp - 01.ja.srt';

describe.skipIf(!fs.existsSync(TEST_EPISODE) || !fs.existsSync(TEST_SUBTITLE))('the shared test episode (read only)', () => {
  it('plans its Japanese track and cuts one audible clip per sentence', async () => {
    const cues = parseSubtitles(fs.readFileSync(TEST_SUBTITLE, 'utf-8'))
      .map((cue) => ({ startMs: Math.round(cue.start * 1000), endMs: Math.round(cue.end * 1000), text: cue.text }));
    const plan = planSentenceDeck(cues, { ...SENTENCE_DECK_DEFAULTS, studyLang: 'ja' });
    expect(plan.segments).toHaveLength(5);
    const result = await extractSentenceAudioBatch(
      { filePath: TEST_EPISODE, clips: plan.segments.map((s) => ({ id: String(s.index), startMs: s.startMs, endMs: s.endMs })) },
      { mediaDirectory: mediaDir },
    );
    expect(result.results.every((r) => r.ok)).toBe(true);
    for (const [i, clip] of result.results.entries()) {
      const { seconds } = await measure(clip.audioPath ?? '');
      const expected = (plan.segments[i].endMs - plan.segments[i].startMs) / 1000 + 0.4;
      expect(seconds).toBeGreaterThan(0.3);
      expect(Math.abs(seconds - expected)).toBeLessThan(0.3);
    }
  }, 120_000);
});
