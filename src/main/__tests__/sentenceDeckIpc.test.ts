/**
 * Which tracks a video offers for a sentence deck, reading one, and the audio
 * job's progress and Cancel — through the functions the IPC handlers call.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '../../shared/types';

let tmpRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot },
  ipcMain: { handle: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
}));
vi.mock('../subtitleDiscovery', () => ({
  loadDiscoverySettings: () => ({ helperLanguage: 'en' }),
  readSubtitleRecord: (record: { path: string }) => {
    try { return fs.readFileSync(record.path, 'utf-8'); } catch { return null; }
  },
  readableSubtitleRecords: (records: unknown[] | undefined) => records ?? [],
}));
vi.mock('../studyLanguage', () => ({
  getMainStudyLang: () => 'ja',
  getMainStudyLangTag: () => 'ja',
}));

const {
  cancelSentenceDeckAudio,
  listSentenceDeckSources,
  readSentenceDeckTrack,
  runSentenceDeckAudio,
  videoForSubtitle,
} = await import('../sentenceDeckIpc');

const SRT_JA = '1\n00:00:01,000 --> 00:00:03,000\nおはようございます。\n\n2\n00:00:04,000 --> 00:00:06,000\n散歩に行こう。\n';
const SRT_EN = '1\n00:00:01,000 --> 00:00:03,000\nGood morning.\n';

let videoDir = '';
let video = '';
let otherVideo = '';

function makeTone(file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegStatic as unknown as string, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8',
      '-c:a', 'aac', file,
    ], { windowsHide: true });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
  });
}

beforeAll(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-sentence-ipc-'));
  videoDir = path.join(tmpRoot, 'videos');
  fs.mkdirSync(videoDir, { recursive: true });
  video = path.join(videoDir, 'Show - 01.mkv');
  otherVideo = path.join(videoDir, 'Show - 010.mkv');
  await makeTone(video);
  fs.copyFileSync(video, otherVideo);
  fs.writeFileSync(path.join(videoDir, 'Show - 01.ja.srt'), SRT_JA);
  fs.writeFileSync(path.join(videoDir, 'Show - 01.en.srt'), SRT_EN);
  fs.writeFileSync(path.join(videoDir, 'notes.txt'), 'not a subtitle');
}, 60_000);

afterAll(() => {
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const noLibrary = { listItems: (): MediaItem[] => [] };

describe('listSentenceDeckSources', () => {
  it('offers the sidecars of a video the library has never seen, study track first', async () => {
    const sources = await listSentenceDeckSources(noLibrary, { videoPath: video });
    expect(sources.ok).toBe(true);
    expect(sources.mediaId).toBeUndefined();
    expect(sources.title).toBe('Show - 01');
    const ids = sources.tracks.map((t) => t.id);
    expect(ids).toContain(`sidecar:${path.join(videoDir, 'Show - 01.ja.srt')}`);
    expect(sources.primaryId).toBe(`sidecar:${path.join(videoDir, 'Show - 01.ja.srt')}`);
    expect(sources.secondaryId).toBe(`sidecar:${path.join(videoDir, 'Show - 01.en.srt')}`);
  }, 30_000);

  it('offers a Whisper transcript on the library row, labelled as one', async () => {
    const transcript = path.join(tmpRoot, 'whisper.srt');
    fs.writeFileSync(transcript, SRT_JA);
    const host = {
      listItems: (): MediaItem[] => [{
        id: 'm1',
        path: video.replace(/\\/g, '/').toUpperCase(),
        subtitles: [{ id: 'w1', lang: 'ja', source: 'generated', format: 'srt', path: transcript, external: true }],
      } as unknown as MediaItem],
    };
    const sources = await listSentenceDeckSources(host, { videoPath: video });
    expect(sources.mediaId).toBe('m1');
    expect(sources.tracks.find((t) => t.id === 'record:w1')?.kind).toBe('transcript');
  }, 30_000);

  it('opened on a subtitle file, finds its episode and starts from that file', async () => {
    const subtitle = path.join(videoDir, 'Show - 01.ja.srt');
    expect(videoForSubtitle(subtitle)).toBe(video);
    const sources = await listSentenceDeckSources(noLibrary, { subtitlePath: subtitle });
    expect(sources.videoPath).toBe(video);
    expect(sources.primaryId).toBe(`file:${subtitle}`);
    // The same file is not listed twice.
    expect(sources.tracks.filter((t) => t.id.endsWith('Show - 01.ja.srt'))).toHaveLength(1);
  }, 30_000);

  it('says why when a subtitle has no episode beside it', async () => {
    const lonely = path.join(tmpRoot, 'Lonely.ja.srt');
    fs.writeFileSync(lonely, SRT_JA);
    expect(await listSentenceDeckSources(noLibrary, { subtitlePath: lonely })).toMatchObject({
      ok: false, reasonKey: 'sentenceDeck.error.noVideoForSubtitle',
    });
  });
});

describe('readSentenceDeckTrack', () => {
  it('reads a sidecar into millisecond cues', async () => {
    const read = await readSentenceDeckTrack(noLibrary, video, `sidecar:${path.join(videoDir, 'Show - 01.ja.srt')}`);
    expect(read.ok).toBe(true);
    expect(read.cues).toEqual([
      { startMs: 1000, endMs: 3000, text: 'おはようございます。' },
      { startMs: 4000, endMs: 6000, text: '散歩に行こう。' },
    ]);
  });

  it('reads a transcript saved as JSON cues', async () => {
    const file = path.join(tmpRoot, 'transcript.json');
    fs.writeFileSync(file, JSON.stringify([{ start: 1.5, end: 2.25, text: 'はい' }]));
    const read = await readSentenceDeckTrack(noLibrary, video, `file:${file}`);
    expect(read.cues).toEqual([{ startMs: 1500, endMs: 2250, text: 'はい' }]);
  });

  it('refuses to read anything that is not a subtitle', async () => {
    const read = await readSentenceDeckTrack(noLibrary, video, `file:${path.join(videoDir, 'notes.txt')}`);
    expect(read).toMatchObject({ ok: false, reasonKey: 'sentenceDeck.error.trackUnreadable', cues: [] });
  });
});

describe('a container with several text streams (ASS with a sign, zh, ru)', () => {
  let mkv = '';
  let extracted = '';
  const ASS = [
    '[Script Info]', 'ScriptType: v4.00+', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1',
    'Style: Sign,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,8,10,10,10,1',
    '', '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    'Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,おはようございます。',
    'Dialogue: 0,0:00:02.00,0:00:05.00,Sign,,0,0,0,,山田商店',
    'Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,散歩に行こう。',
    '',
  ].join('\n');

  beforeAll(async () => {
    const dir = path.join(tmpRoot, 'container');
    fs.mkdirSync(dir, { recursive: true });
    const ass = path.join(dir, 'ja.ass');
    const zh = path.join(dir, 'zh.srt');
    const ru = path.join(dir, 'ru.srt');
    fs.writeFileSync(ass, ASS);
    fs.writeFileSync(zh, '1\n00:00:01,000 --> 00:00:03,000\n早上好。\n');
    fs.writeFileSync(ru, '1\n00:00:01,000 --> 00:00:03,000\nДоброе утро.\n');
    mkv = path.join(dir, 'Signs - 01.mkv');
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegStatic as unknown as string, [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8',
        '-i', ass, '-i', zh, '-i', ru,
        '-map', '0:a', '-map', '1', '-map', '2', '-map', '3',
        '-c:a', 'aac', '-c:s:0', 'ass', '-c:s:1', 'srt', '-c:s:2', 'srt',
        '-metadata:s:s:0', 'language=jpn', '-metadata:s:s:1', 'language=chi', '-metadata:s:s:2', 'language=rus',
        mkv,
      ], { windowsHide: true });
      proc.on('error', reject);
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
    });
    // What discovery keeps for the Japanese stream (#0:1): an SRT copy, styles gone.
    extracted = path.join(dir, 'embedded-0-ja.srt');
    fs.writeFileSync(extracted, '1\n00:00:01,000 --> 00:00:03,000\nおはようございます。\n\n2\n00:00:02,000 --> 00:00:05,000\n山田商店\n\n3\n00:00:04,000 --> 00:00:06,000\n散歩に行こう。\n');
  }, 60_000);

  const library = (): { listItems: () => MediaItem[] } => ({
    listItems: () => [{
      id: 'm2',
      path: mkv,
      subtitles: [{ id: 'e1', lang: 'ja', source: 'embedded', format: 'srt', path: extracted, streamIndex: 1, label: 'Stream 1' }],
    } as unknown as MediaItem],
  });

  it('offers the streams discovery did not extract beside the one it did', async () => {
    const sources = await listSentenceDeckSources(library(), { videoPath: mkv });
    const ids = sources.tracks.map((t) => `${t.id}=${t.lang}`);
    expect(ids).toEqual(expect.arrayContaining(['record:e1=ja', 'embedded:1=zh', 'embedded:2=ru']));
    // The Japanese stream is not listed a second time.
    expect(ids).not.toContain('embedded:0=ja');
    expect(sources.primaryId).toBe('record:e1');
  }, 30_000);

  it('reads an ASS stream with its styles, so a sign is not taken for dialogue', async () => {
    for (const id of ['embedded:0', 'record:e1']) {
      const read = await readSentenceDeckTrack(library(), mkv, id);
      expect(read.ok).toBe(true);
      expect(read.cues.find((cue) => cue.text === '山田商店')?.style).toBe('Sign');
      expect(read.cues.find((cue) => cue.text === 'おはようございます。')?.style).toBe('Default');
    }
    // A plain SRT stream still reads as before.
    const zh = await readSentenceDeckTrack(library(), mkv, 'embedded:1');
    expect(zh.cues.map((cue) => cue.text)).toEqual(['早上好。']);
  }, 30_000);
});

describe('runSentenceDeckAudio', () => {
  it('reports progress per clip to the window that asked', async () => {
    const sent: Array<{ done: number; total: number; failed: number }> = [];
    const sender = { send: (_channel: string, payload: { done: number; total: number; failed: number }) => sent.push(payload), isDestroyed: () => false };
    const result = await runSentenceDeckAudio(
      {
        jobId: 'job-1',
        filePath: video,
        clips: [{ id: '1', startMs: 1000, endMs: 3000 }, { id: '2', startMs: 4000, endMs: 6000 }],
      },
      sender,
      path.join(tmpRoot, 'mined'),
    );
    expect(result.ok).toBe(true);
    expect(result.results.every((r) => r.ok)).toBe(true);
    expect(sent.map((p) => p.done)).toEqual([1, 2]);
    expect(sent.at(-1)).toMatchObject({ total: 2, failed: 0 });
  }, 60_000);

  it('cancels a running job by id, and refuses an unknown one', async () => {
    const clips = Array.from({ length: 10 }, (_, i) => ({ id: String(i), startMs: 500 + i * 100, endMs: 2500 + i * 100 }));
    const sender = {
      send: (_channel: string, payload: { done: number }) => { if (payload.done === 1) cancelSentenceDeckAudio('job-2'); },
      isDestroyed: () => false,
    };
    const result = await runSentenceDeckAudio({ jobId: 'job-2', filePath: video, clips }, sender, path.join(tmpRoot, 'mined'));
    expect(result.cancelled).toBe(true);
    expect(result.results.length).toBeLessThan(clips.length);
    expect(cancelSentenceDeckAudio('job-2')).toBe(false);
  }, 60_000);
});
