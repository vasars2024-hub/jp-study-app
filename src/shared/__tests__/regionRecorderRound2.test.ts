/**
 * Region Recorder, round 2 — the pure rules: quality presets as encoder
 * arguments, encoder detection and choice, the level meter, the "active
 * window" pick, window fitting, and the history file.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RECORDER_SETTINGS,
  EMPTY_RECORDER_METER,
  RECORDER_HISTORY_LIMIT,
  RECORDER_QUALITY_PRESETS,
  normalizePartialMeta,
  normalizeRecorderHistory,
  normalizeRecorderSettings,
  parseFfmpegEncoderList,
  recorderHistoryFromDisk,
  pickActiveWindowSource,
  recorderEncoderFamily,
  recorderFinalizeArgs,
  recorderMeterFraction,
  recorderStudyDay,
  recorderVideoBitrate,
  recorderVideoEncodeArgs,
  resolveRecorderEncoder,
  stepRecorderMeter,
  upsertRecorderHistory,
  type RecorderHistoryEntry,
} from '../regionRecorder';

describe('quality presets → encoder arguments', () => {
  it('maps every step to a CRF, a hardware quality and a bitrate ceiling, best first', () => {
    const { high, standard, small } = RECORDER_QUALITY_PRESETS;
    expect(high.crf).toBeLessThan(standard.crf);
    expect(standard.crf).toBeLessThan(small.crf);
    expect(high.maxrateKbps).toBeGreaterThan(standard.maxrateKbps);
    expect(standard.maxrateKbps).toBeGreaterThan(small.maxrateKbps);
    expect(recorderVideoBitrate('high', 30)).toBe(high.webmBitrate);
    expect(recorderVideoBitrate('small', 60)).toBe(small.webmBitrate * 2);
  });

  it('x264 keeps its CRF and gains the ceiling', () => {
    const args = recorderVideoEncodeArgs('libx264', 'standard').join(' ');
    expect(args).toContain('-c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p');
    expect(args).toContain('-maxrate 8000k -bufsize 16000k');
  });

  it('each hardware encoder gets its own constant-quality dialect', () => {
    expect(recorderVideoEncodeArgs('h264_nvenc', 'high').join(' ')).toContain('-c:v h264_nvenc -preset p4 -rc vbr -cq 19 -b:v 0');
    expect(recorderVideoEncodeArgs('h264_qsv', 'small').join(' ')).toContain('-global_quality 31');
    expect(recorderVideoEncodeArgs('h264_amf', 'standard').join(' ')).toContain('-rc cqp -qp_i 25 -qp_p 25');
  });

  it('finalize args carry the encoder, the preset audio rate, and fit a window to its first frame', () => {
    const args = recorderFinalizeArgs({
      input: 'in.webm', output: 'out.mp4', hasAudio: true, quality: 'high', encoder: 'h264_nvenc', fit: { width: 1281, height: 721 },
    }).join(' ');
    expect(args).toContain('-c:v h264_nvenc');
    expect(args).toContain('-b:a 192k');
    expect(args).toContain('scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720');
    // A crop wins over a fit (a region recording is never a window).
    expect(recorderFinalizeArgs({ input: 'a', output: 'b', hasAudio: false, quality: 'small', crop: { x: 0, y: 0, width: 10, height: 10 }, fit: { width: 99, height: 99 } }))
      .toContain('crop=10:10:0:0');
  });
});

describe('encoder detection and choice', () => {
  it('reads encoder names from `ffmpeg -encoders`', () => {
    const names = parseFfmpegEncoderList([
      'Encoders:',
      ' V..... = Video',
      ' ------',
      ' V....D libx264              libx264 H.264 / AVC',
      ' V....D h264_nvenc           NVIDIA NVENC H.264 encoder (codec h264)',
      ' V..... h264_qsv             H.264 (Intel Quick Sync Video acceleration)',
      ' A....D aac                  AAC',
    ].join('\n'));
    expect([...names].sort()).toEqual(['aac', 'h264_nvenc', 'h264_qsv', 'libx264']);
  });

  it('auto takes the first usable hardware encoder, else x264', () => {
    expect(resolveRecorderEncoder('auto', { usable: ['qsv', 'nvenc'] })).toEqual({ encoder: 'h264_nvenc', hardware: true, fallback: false });
    expect(resolveRecorderEncoder('auto', { usable: [] })).toEqual({ encoder: 'libx264', hardware: false, fallback: false });
    expect(resolveRecorderEncoder('auto', null).encoder).toBe('libx264');
  });

  it('a named encoder that does not work here falls back to x264 and says so', () => {
    expect(resolveRecorderEncoder('amf', { usable: ['nvenc'] })).toEqual({ encoder: 'libx264', hardware: false, fallback: true });
    expect(resolveRecorderEncoder('amf', { usable: ['amf'] })).toMatchObject({ encoder: 'h264_amf', hardware: true });
    expect(resolveRecorderEncoder('software', { usable: ['nvenc'] }).encoder).toBe('libx264');
    expect(recorderEncoderFamily('h264_qsv')).toBe('qsv');
    expect(recorderEncoderFamily('libx264')).toBeNull();
  });

  it('settings keep a valid encoder choice and the study-tag switch, and refuse anything else', () => {
    expect(DEFAULT_RECORDER_SETTINGS).toMatchObject({ encoder: 'auto', studyTag: true });
    expect(normalizeRecorderSettings({ encoder: 'nvenc', studyTag: false })).toMatchObject({ encoder: 'nvenc', studyTag: false });
    expect(normalizeRecorderSettings({ encoder: 'h264_evil', studyTag: 'yes' })).toMatchObject({ encoder: 'auto', studyTag: true });
    // A settings file from before round 2 has neither field.
    const old = { ...DEFAULT_RECORDER_SETTINGS } as Record<string, unknown>;
    delete old.encoder;
    delete old.studyTag;
    expect(normalizeRecorderSettings({}, old as never)).toMatchObject({ encoder: 'auto', studyTag: true });
  });
});

describe('level meter', () => {
  it('is on a dB scale: speech-level RMS fills a real part of the bar, silence none', () => {
    expect(recorderMeterFraction(0)).toBe(0);
    expect(recorderMeterFraction(0.001)).toBe(0); // -60 dB
    expect(recorderMeterFraction(1)).toBe(1);
    // -20 dB is two thirds of the way up, where a linear bar would show a tenth.
    expect(recorderMeterFraction(0.1)).toBeCloseTo(2 / 3, 3);
  });

  it('rises at once, falls steadily, and holds its peak', () => {
    let m = stepRecorderMeter(EMPTY_RECORDER_METER, 0.5, 1000, 1000);
    const top = m.level;
    expect(top).toBeGreaterThan(0.8);
    m = stepRecorderMeter(m, 0, 1200, 1000);
    // 24 dB/s for 200 ms = 4.8 dB of a 60 dB scale.
    expect(m.level).toBeCloseTo(top - 4.8 / 60, 5);
    expect(m.peak).toBe(top);
    m = stepRecorderMeter(m, 0, 3000, 1200);
    expect(m.peak).toBeLessThan(top);
  });

  it('flags clipping and keeps the flag through the hold time', () => {
    let m = stepRecorderMeter(EMPTY_RECORDER_METER, 1, 0, 0);
    expect(m.clipping).toBe(true);
    m = stepRecorderMeter(m, 0.2, 500, 0);
    expect(m.clipping).toBe(true);
    m = stepRecorderMeter(m, 0.2, 2000, 500);
    expect(m.clipping).toBe(false);
  });
});

describe('the active window', () => {
  const sources = [
    { id: 'window:100:0', name: 'Gum' },
    { id: 'screen:0:0', name: 'Entire screen' },
    { id: 'window:200:0', name: '' },
    { id: 'window:300:0', name: 'YouTube - Browser' },
    { id: 'window:400:0', name: 'Notepad' },
  ];

  it('is the topmost window that is not one of Gum\'s own and has a title', () => {
    expect(pickActiveWindowSource(sources, new Set(['window:100:0']))?.id).toBe('window:300:0');
    expect(pickActiveWindowSource(sources, new Set(), ['Gum'])?.id).toBe('window:300:0');
    expect(pickActiveWindowSource([sources[0]], new Set(['window:100:0']))).toBeNull();
  });
});

describe('history', () => {
  const entry = (id: string, createdAt: number, extra: Partial<RecorderHistoryEntry> = {}): RecorderHistoryEntry => ({
    id, title: id, outputPath: `C:/rec/${id}.mp4`, createdAt, studyDay: recorderStudyDay(createdAt), durationMs: 1000, bytes: 10,
    source: 'region', hasAudio: true, transcript: 'done', studyTagged: false, ...extra,
  });

  it('files a recording under its local calendar day', () => {
    const at = new Date(2026, 9, 8, 23, 59).getTime();
    expect(recorderStudyDay(at)).toBe('2026-10-08');
  });

  it('keeps valid rows newest first, one per id, and drops the rest', () => {
    const rows = normalizeRecorderHistory([
      entry('rec-a', 1000),
      entry('rec-b', 3000),
      { ...entry('rec-a', 2000) },
      { id: '../evil', outputPath: 'x', createdAt: 5 },
      { id: 'rec-c', outputPath: '', createdAt: 5 },
      'junk',
    ]);
    expect(rows.map((r) => r.id)).toEqual(['rec-b', 'rec-a']);
  });

  it('a transcription that was running when the app closed reads as failed, not as running forever', () => {
    const [row] = recorderHistoryFromDisk([entry('rec-x', 1, { transcript: 'running' })]);
    expect(row.transcript).toBe('failed');
    // Only on the read at start: a live upsert keeps "queued".
    expect(normalizeRecorderHistory([entry('rec-z', 1, { transcript: 'queued' })])[0].transcript).toBe('queued');
    const [waiting] = recorderHistoryFromDisk([entry('rec-y', 1, { transcript: 'waiting-model' })]);
    expect(waiting.transcript).toBe('waiting-model');
  });

  it('upserts in place and caps the file', () => {
    let list: RecorderHistoryEntry[] = [];
    for (let i = 0; i < RECORDER_HISTORY_LIMIT + 5; i += 1) list = upsertRecorderHistory(list, entry(`rec-${i}`, i + 1));
    expect(list).toHaveLength(RECORDER_HISTORY_LIMIT);
    expect(list[0].id).toBe(`rec-${RECORDER_HISTORY_LIMIT + 4}`);
    list = upsertRecorderHistory(list, { ...list[3], studyTagged: true });
    expect(list.filter((r) => r.studyTagged)).toHaveLength(1);
  });

  it('a partial sidecar remembers what kind of recording it was', () => {
    const meta = normalizePartialMeta({ version: 1, id: 'rec-abc', startedAt: 5, source: 'window' });
    expect(meta?.source).toBe('window');
    expect(normalizePartialMeta({ version: 1, id: 'rec-abc', startedAt: 5, source: 'evil' })?.source).toBeUndefined();
  });
});
