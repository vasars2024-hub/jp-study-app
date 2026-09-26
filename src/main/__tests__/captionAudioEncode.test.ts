/**
 * A captured system-audio clip through the real bundled ffmpeg: the WAV the
 * capture window cuts goes in on stdin and a decodable MP3 of the same length
 * comes out on stdout — no temporary file on either side. Plus the two small
 * helpers around it (foreground window title, global accelerators).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  globalShortcut: { register: vi.fn(() => true), unregister: vi.fn() },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

import { encodeWavToMp3 } from '../captionAudioEncode';
import { parseForegroundOutput } from '../foregroundWindow';
import { encodeWav } from '../../shared/systemAudioRing';
import { allowDisplayCapture, displayCaptureAllowed } from '../securityHardening';

const ffmpegPath = ffmpegStatic as unknown as string;
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-captions-encode-'));
afterAll(() => fs.rmSync(workDir, { recursive: true, force: true }));

function measure(file: string): Promise<{ seconds: number; meanDb: number }> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (c: Buffer) => { stderr += c.toString(); });
    proc.on('close', () => {
      const time = [...stderr.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].at(-1);
      const mean = /mean_volume: (-?[\d.]+) dB/.exec(stderr);
      resolve({
        seconds: time ? Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]) : 0,
        meanDb: mean ? Number(mean[1]) : -Infinity,
      });
    });
  });
}

describe('encodeWavToMp3', () => {
  it('turns an 8 s capture into a decodable, audible 8 s MP3 through pipes', async () => {
    const rate = 24_000;
    const samples = Int16Array.from({ length: rate * 8 }, (_, i) => Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 6000));
    const result = await encodeWavToMp3(encodeWav(samples, rate), 8);
    expect(result.ok).toBe(true);
    const out = path.join(workDir, 'clip.mp3');
    fs.writeFileSync(out, result.bytes!);
    const m = await measure(out);
    expect(m.seconds).toBeGreaterThan(7.5);
    expect(m.seconds).toBeLessThan(8.6);
    expect(m.meanDb).toBeGreaterThan(-40);
  }, 30_000);

  it('reports a failure instead of throwing when ffmpeg is missing', async () => {
    const result = await encodeWavToMp3(encodeWav(new Int16Array(100), 24_000), 0.1, path.join(workDir, 'no-ffmpeg.exe'));
    expect(result.ok).toBe(false);
  });
});

describe('parseForegroundOutput', () => {
  it('returns the title of another app\'s window', () => {
    expect(parseForegroundOutput('4242|ゆるキャン△ 1話 - YouTube — Mozilla Firefox\r\n', 1)).toBe('ゆるキャン△ 1話 - YouTube — Mozilla Firefox');
  });
  it('ignores Gum\'s own window and empty titles', () => {
    expect(parseForegroundOutput('77|Gum', 77)).toBe('');
    expect(parseForegroundOutput('12|', 77)).toBe('');
    expect(parseForegroundOutput('garbage', 77)).toBe('');
  });
});

describe('display-capture permission', () => {
  it('is granted to the registered capture window only, and only while registered', () => {
    expect(displayCaptureAllowed(41, 'media', ['audio', 'video'])).toBe(false);
    const release = allowDisplayCapture(41);
    expect(displayCaptureAllowed(41, 'media', ['audio', 'video'])).toBe(true);
    expect(displayCaptureAllowed(41, 'display-capture')).toBe(true);
    expect(displayCaptureAllowed(42, 'media', ['audio', 'video'])).toBe(false);
    expect(displayCaptureAllowed(41, 'geolocation')).toBe(false);
    expect(displayCaptureAllowed(41, 'media')).toBe(false);
    release();
    expect(displayCaptureAllowed(41, 'media', ['audio', 'video'])).toBe(false);
  });
});
