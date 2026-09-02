import { describe, expect, it } from 'vitest';
import { describeDirectstreamAbort, describeLocalOpenFailure } from '../playbackFailure';

describe('describeLocalOpenFailure', () => {
  it('never puts a raw JSON body in front of the user', () => {
    const message = describeLocalOpenFailure(500, '{"message":"Internal Server Error"}');
    expect(message).not.toContain('{');
    expect(message).not.toContain('"message"');
    expect(message).toContain('Internal Server Error');
  });

  it('leads with a cause the viewer can act on, per status', () => {
    expect(describeLocalOpenFailure(404, '')).toMatch(/moved, renamed/);
    expect(describeLocalOpenFailure(403, '')).toMatch(/Reconnect the media workspace/);
    expect(describeLocalOpenFailure(503, '')).toMatch(/codec or container/);
  });

  it('keeps the status code so a report is still diagnosable', () => {
    expect(describeLocalOpenFailure(500, '')).toContain('(500)');
    expect(describeLocalOpenFailure(404, 'no such file')).toContain('(404: no such file)');
  });

  it('collapses whitespace and caps runaway bodies', () => {
    const message = describeLocalOpenFailure(500, `a\n\n   b${'x'.repeat(500)}`);
    expect(message).not.toContain('\n');
    expect(message.length).toBeLessThan(400);
  });

  it('passes a plain-text body through unchanged', () => {
    expect(describeLocalOpenFailure(400, 'unsupported container')).toContain('unsupported container');
  });
});

describe('describeDirectstreamAbort', () => {
  // Copied verbatim out of seanime-2026-09-02_02-58-01.log, path and all.
  const UNMATCHED = 'local file has not been matched to a media: '
    + 'C:\\Users\\Arseniy\\AppData\\Roaming\\jp-study-app\\downloads\\'
    + '5 Japanese Slang You Need to Know [Plvy2oftgH0].mp4';

  it('stays silent when the sidecar gave no reason', () => {
    // The reasonless abort is a stream being retired by a newer open. Reporting it would
    // put an error screen in front of a viewer whose file is about to play.
    expect(describeDirectstreamAbort('')).toBeNull();
    expect(describeDirectstreamAbort('   ')).toBeNull();
    expect(describeDirectstreamAbort(undefined)).toBeNull();
    expect(describeDirectstreamAbort(null)).toBeNull();
    expect(describeDirectstreamAbort({ reason: 'x' })).toBeNull();
  });

  it('names the metadata gap instead of sending the viewer after a codec', () => {
    const message = describeDirectstreamAbort(UNMATCHED);
    expect(message).toMatch(/matched to a series/);
    expect(message).toMatch(/not a codec problem/);
    // The exact wrong advice this replaces, which every unmatched file would have shown.
    expect(message).not.toMatch(/codec or container it cannot read/);
    expect(message).not.toMatch(/try another episode/);
  });

  it('keeps the sidecar words, so the report names WHICH file was refused', () => {
    expect(describeDirectstreamAbort(UNMATCHED)).toContain('5 Japanese Slang');
  });

  it('still reports a reason it has no specific sentence for', () => {
    const message = describeDirectstreamAbort('transcoder exited with code 1');
    expect(message).toMatch(/stopped preparing this file/);
    expect(message).toContain('transcoder exited with code 1');
    // The unmatched sentence must not leak onto an unrelated reason.
    expect(message).not.toMatch(/matched to a series/);
  });

  it('collapses whitespace and caps a runaway reason', () => {
    const message = describeDirectstreamAbort(`a\n\n  b${'x'.repeat(600)}`);
    expect(message).not.toContain('\n');
    expect((message ?? '').length).toBeLessThan(360);
  });
});
