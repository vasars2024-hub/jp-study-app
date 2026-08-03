import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { type CaptionLine, mergeCaptionSnapshot, segmentScripts } from '../liveCaptions';

/**
 * End-to-end replay of a **real** capture session.
 *
 * `fixtures/liveCaptionsStream.ndjson` is verbatim stdout from the PowerShell
 * poller in `main/liveCaptions.ts`, recorded against a live Windows Live
 * Captions window during a Chinese conversation. It is the only test here that
 * proves the merge against genuine recognizer behaviour rather than against
 * hand-written examples — in particular it contains a tail line revised by an
 * inserted 。and several front-evictions from the 12-line window.
 *
 * If this ever fails, re-record rather than editing the fixture: the value is
 * that nobody chose this data.
 */

interface PollerMessage {
  type: string;
  t?: number;
  lines?: string[] | string;
}

function loadStream(): PollerMessage[] {
  const file = path.join(__dirname, 'fixtures', 'liveCaptionsStream.ndjson');
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as PollerMessage);
}

function replay(): CaptionLine[] {
  let state: CaptionLine[] = [];
  for (const msg of loadStream()) {
    if (msg.type !== 'snapshot') continue;
    const lines = Array.isArray(msg.lines) ? msg.lines : msg.lines ? [msg.lines] : [];
    state = mergeCaptionSnapshot(state, lines, Number(msg.t) || 0).lines;
  }
  return state;
}

describe('replaying a recorded Live Captions session', () => {
  it('reads a stream that actually exercises the hard cases', () => {
    const msgs = loadStream();
    const snapshots = msgs.filter((m) => m.type === 'snapshot');
    expect(msgs[0]!.type).toBe('ready');
    expect(msgs.some((m) => m.type === 'attached')).toBe(true);
    expect(snapshots.length).toBeGreaterThan(5);
    // The window really is capped at 12 lines.
    for (const s of snapshots) {
      expect(Array.isArray(s.lines) ? s.lines.length : 1).toBeLessThanOrEqual(12);
    }
    // And it really does evict: the first snapshot's opening line is gone by the end.
    const first = (snapshots[0]!.lines as string[])[0]!;
    const last = snapshots[snapshots.length - 1]!.lines as string[];
    expect(last).not.toContain(first);
  });

  it('reconstructs more lines than any single window held', () => {
    const merged = replay();
    expect(merged.length).toBeGreaterThan(12);
  });

  it('never emits a duplicated line', () => {
    const merged = replay();
    const texts = merged.map((l) => l.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('never emits a line that is merely a prefix of a later one', () => {
    // The failure mode this whole design exists to prevent: a provisional tail
    // committed at several stages of its growth, leaving "嗯" then "嗯哦，在"
    // then the full sentence as three separate lines.
    const texts = replay().map((l) => l.text);
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        expect(texts[j]!.startsWith(texts[i]!)).toBe(false);
      }
    }
  });

  it('keeps every finalized line from the recorded windows', () => {
    // Any line that was not the provisional tail of its snapshot had settled,
    // so it must survive into the transcript verbatim.
    const merged = replay().map((l) => l.text);
    for (const msg of loadStream()) {
      if (msg.type !== 'snapshot') continue;
      const lines = (Array.isArray(msg.lines) ? msg.lines : [msg.lines!]) as string[];
      for (const settled of lines.slice(0, -1)) {
        expect(merged).toContain(settled);
      }
    }
  });

  it('preserves recognizer order', () => {
    const merged = replay();
    for (let i = 1; i < merged.length; i++) {
      expect(merged[i]!.ts).toBeGreaterThanOrEqual(merged[i - 1]!.ts);
    }
  });

  it('folds a single continuous session into one script', () => {
    const scripts = segmentScripts(replay());
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.lines.length).toBe(replay().length);
  });
});
