// @vitest-environment node
/**
 * An embedded ASS stream is kept as ASS by subtitle discovery (audit 4).
 *
 * Discovery converted every container stream to SRT, so the library's record
 * lost the ASS styles — the only evidence a line is a sign ("山田商店" on a shop
 * front) — and the player and sentence deck could not skip signs from it. An
 * untitled stream was also labelled "Stream 3" in English in every UI language.
 *
 * Real ffmpeg: a Matroska file with one untitled ASS stream is built, and the
 * discovery step that extracts it is run against it.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';

const h = vi.hoisted(() => ({ root: '' }));

vi.mock('electron', () => ({
  app: { getPath: () => h.root },
  ipcMain: { handle: () => undefined, on: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
  net: { request: () => undefined },
  safeStorage: { isEncryptionAvailable: () => false },
}));

import { __subtitleDiscoveryTestables } from '../subtitleDiscovery';
import { listEmbeddedSubtitleStreams } from '../subtitleLocalSources';
import { parseSubtitles } from '../../shared/subtitleCues';
import { subtitleRecordLabel, untitledStreamNumber } from '../../shared/subtitleRecord';

const { extractEmbeddedRecord } = __subtitleDiscoveryTestables;

const ASS = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1
Style: Sign,Arial,36,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,8,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,おはようございます。
Dialogue: 0,0:00:02.00,0:00:04.00,Sign,,0,0,0,,{\\an8}山田商店
`;

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegStatic as unknown as string, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
  });
}

let video = '';

beforeAll(async () => {
  h.root = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-embedded-ass-'));
  const assFile = path.join(h.root, 'in.ass');
  fs.writeFileSync(assFile, ASS);
  video = path.join(h.root, 'Show - 01.mkv');
  // An untitled Japanese ASS stream beside a short tone.
  await ffmpeg([
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=5',
    '-i', assFile,
    '-map', '0:a', '-map', '1:s', '-c:a', 'aac', '-c:s', 'ass',
    '-metadata:s:s:0', 'language=jpn',
    video,
  ]);
}, 60_000);

afterAll(() => {
  fs.rmSync(h.root, { recursive: true, force: true });
});

describe('an embedded ASS stream in the library', () => {
  it('is extracted as ASS, styles and all, so a sign can still be told from dialogue', async () => {
    const [stream] = await listEmbeddedSubtitleStreams(video);
    expect(stream?.codec).toBe('ass');
    const out = await extractEmbeddedRecord({ id: 'm1', path: video }, stream, 'ja');
    expect(out && 'record' in out).toBe(true);
    const record = (out as { record: import('../../shared/subtitleRecord').SubtitleRecord }).record;
    expect(record.format).toBe('ass');
    expect(record.path.endsWith('.ass')).toBe(true);
    const text = fs.readFileSync(path.join(h.root, record.path), 'utf-8');
    const cues = parseSubtitles(text);
    expect(cues.map((cue) => cue.style)).toEqual(['Default', 'Sign']);
  }, 60_000);

  it('an untitled stream carries no English label, only its position, named in the UI language', async () => {
    const [stream] = await listEmbeddedSubtitleStreams(video);
    const out = await extractEmbeddedRecord({ id: 'm2', path: video }, stream, 'ja');
    const record = (out as { record: import('../../shared/subtitleRecord').SubtitleRecord }).record;
    expect(record.label).toBeUndefined();
    expect(record.subtitleNumber).toBe(1);
    const ru = (key: string, vars: { n: number }) => `${key}|Поток субтитров ${vars.n}`;
    expect(subtitleRecordLabel(record, ru)).toBe('sentenceDeck.track.stream|Поток субтитров 1');
  }, 60_000);
});

describe('record labels', () => {
  const tr = (key: string, vars: { n: number }) => `${key}:${vars.n}`;

  it('a record written before the fix ("Stream 3") is named in the UI language, keeping its number', () => {
    const legacy = { source: 'embedded' as const, label: 'Stream 3', streamIndex: 3 };
    expect(untitledStreamNumber(legacy)).toBe(3);
    expect(subtitleRecordLabel(legacy, tr)).toBe('sentenceDeck.track.stream:3');
  });

  it('a titled stream, a download and a sidecar keep their own label', () => {
    expect(subtitleRecordLabel({ source: 'embedded', label: 'Signs & Songs', subtitleNumber: 2 }, tr)).toBe('Signs & Songs');
    expect(subtitleRecordLabel({ source: 'provider', label: 'Stream 3' }, tr)).toBe('Stream 3');
    expect(subtitleRecordLabel({ source: 'sidecar', label: undefined }, tr)).toBeUndefined();
  });
});
