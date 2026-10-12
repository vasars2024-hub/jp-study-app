// @vitest-environment node
/**
 * risk4: the first Chinese lookup that finds no dictionary tells every window
 * once per run (the renderer turns it into a one-time "Download now" prompt);
 * an install makes the next miss news again.
 */
import { describe, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => [] as string[]);
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [
      { isDestroyed: () => false, webContents: { send: (channel: string) => sent.push(channel) } },
      { isDestroyed: () => true, webContents: { send: () => sent.push('destroyed') } },
    ],
  },
}));

import { CEDICT_MISSING_CHANNEL, reportCedictMissing, resetCedictMissingReport } from '../dictionary/cedictMissingNotice';

describe('CC-CEDICT missing notice', () => {
  it('broadcasts once per run to live windows, again after a reset', () => {
    resetCedictMissingReport();
    expect(reportCedictMissing()).toBe(true);
    expect(reportCedictMissing()).toBe(false);
    expect(sent).toEqual([CEDICT_MISSING_CHANNEL]);
    resetCedictMissingReport();
    expect(reportCedictMissing()).toBe(true);
    expect(sent).toEqual([CEDICT_MISSING_CHANNEL, CEDICT_MISSING_CHANNEL]);
  });

  it('a failing broadcast never throws into the lookup', () => {
    resetCedictMissingReport();
    expect(() => reportCedictMissing(() => {
      throw new Error('no windows');
    })).not.toThrow();
  });
});
