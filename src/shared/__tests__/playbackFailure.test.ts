import { describe, expect, it } from 'vitest';
import { describeLocalOpenFailure } from '../playbackFailure';

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
