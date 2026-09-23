/**
 * The pinned sidecar's convert-subs endpoint cannot detect SRT (500 "failed to detect subtitle
 * format from content", measured 2026-09-23 for ASCII/Japanese, LF/CRLF), so VideoCore now hands
 * it SRT re-expressed as WebVTT. These pin the conversion: exact cue timings, text untouched,
 * and every non-SRT input passed through as-is.
 */
import { describe, expect, it } from 'vitest';
import {
  looksLikeSrt,
  srtToWebVtt,
} from '../../../vendor/seanime-web/app/(main)/_features/video-core/video-core-srt';

const BOM = String.fromCharCode(0xfeff);
const JA_SRT_CRLF =
  BOM + '1\r\n00:00:01,000 --> 00:00:04,000\r\n昨日は雨が降っていたので、家で本を読みました。\r\n\r\n'
  + '2\r\n00:00:04,500 --> 00:00:08,000\r\nどんな本を読んだんですか？\r\n';

describe('SRT handed to the sidecar as WebVTT', () => {
  it('rewrites the header and the millisecond separator, and nothing else', () => {
    const vtt = srtToWebVtt(JA_SRT_CRLF)!;
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('00:00:01.000 --> 00:00:04.000');
    expect(vtt).toContain('00:00:04.500 --> 00:00:08.000');
    expect(vtt).toContain('昨日は雨が降っていたので、家で本を読みました。');
    expect(vtt).not.toContain('\r');
    expect(vtt).not.toContain(BOM);
    expect(vtt).not.toMatch(/\d{2}:\d{2}:\d{2},\d{3}/);
  });

  it('does not touch a comma inside the cue text', () => {
    const vtt = srtToWebVtt('1\n00:00:01,000 --> 00:00:02,000\nWell, 12:30:45,5 is not a timing line\n')!;
    expect(vtt).toContain('Well, 12:30:45,5 is not a timing line');
    expect(vtt).toContain('00:00:01.000 --> 00:00:02.000');
  });

  it('passes WebVTT, ASS and empty content through unchanged', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhi\n';
    const ass = '[Script Info]\nScriptType: v4.00+\n\n[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,Default,hi\n';
    expect(srtToWebVtt(vtt)).toBe(vtt);
    expect(srtToWebVtt(ass)).toBe(ass);
    expect(srtToWebVtt('')).toBe('');
    expect(srtToWebVtt(undefined)).toBeUndefined();
    expect(looksLikeSrt(vtt)).toBe(false);
    expect(looksLikeSrt(ass)).toBe(false);
    expect(looksLikeSrt(JA_SRT_CRLF)).toBe(true);
  });
});
