// @vitest-environment node
/**
 * The frequency-dictionary LISTING must not load a rank table.
 *
 * `mining:listFrequencyDicts` answers with summaries — id, label, entry count, enabled,
 * language — and nothing in that answer needs a rank. It used to read and `JSON.parse` every
 * file in full anyway, three times per call: the bundled-provisioning sync, the large-list
 * preference, and the listing itself, whose cache was invalidated unconditionally immediately
 * before it ran. On this installation the JPDB list is 20.10 MB holding 550,408 ranks and
 * costs 68 ms to read plus 269 ms to parse, so the call blocked Electron's main loop for a
 * measured **1,270 ms** (debug bridge `/health`, answered on main's own loop, idle p50 1 ms).
 * The Media Center's `Readiness` and `Study Mode` destinations both reach that IPC on mount
 * through `currentStudyReadinessFingerprints()`.
 *
 * So the assertion here is about BYTES, not about the shape of the answer: a listing that
 * returns the right summaries while still reading 20 MB has not fixed anything. The negative
 * control is the rank path — `resolveCustomFrequencyRanks` genuinely needs the table and MUST
 * still read the whole file, or this test would pass just as well against a build that had
 * lost the ranks entirely.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dirs = vi.hoisted(() => ({
  userData: `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/jp-freq-summary-${process.pid}`,
}));

vi.mock('electron', () => ({
  app: { getPath: (): string => dirs.userData, on: (): undefined => undefined, whenReady: () => Promise.resolve() },
  dialog: { showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }) },
  ipcMain: { handle: (): undefined => undefined, on: (): undefined => undefined },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}));

vi.mock('../dictionary/yomitan', () => ({
  getFrequencyRank: (): number | undefined => undefined,
  initYomitan: () => Promise.resolve(),
  lookupGlossary: () => [],
}));

const freqRoot = path.join(dirs.userData, 'mining', 'frequency-dicts');

/** A list big enough that reading it in full is unmistakable in a byte count. */
function bigRanks(count: number): Record<string, number> {
  const ranks: Record<string, number> = {};
  for (let i = 0; i < count; i += 1) ranks[`word-${i}-${'あ'.repeat(4)}`] = i + 1;
  return ranks;
}

function writeList(id: string, body: unknown, indent: number | undefined = 2): number {
  fs.mkdirSync(freqRoot, { recursive: true });
  const file = path.join(freqRoot, `${id}.json`);
  fs.writeFileSync(file, JSON.stringify(body, null, indent), 'utf-8');
  return fs.statSync(file).size;
}

function summary(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    label: `Label for ${id}`,
    source: 'test',
    entryCount: 3,
    enabled: true,
    importedAt: 0,
    language: 'ja',
    ...extra,
  };
}

/**
 * Every byte this module pulls off disk, whichever syscall it uses. `readFileSync` is the
 * whole-file path; `readSync` is the bounded head read. Counting both is the point — a "fix"
 * that swapped one for the other without bounding it would still fail here.
 */
function countBytes(): { total: () => number; restore: () => void } {
  let total = 0;
  const readFileSync = fs.readFileSync;
  const readSync = fs.readSync;
  const rf = vi.spyOn(fs, 'readFileSync').mockImplementation(((...args: Parameters<typeof fs.readFileSync>) => {
    const out = (readFileSync as (...a: unknown[]) => unknown)(...args) as string | Buffer;
    total += typeof out === 'string' ? Buffer.byteLength(out) : out.length;
    return out;
  }) as typeof fs.readFileSync);
  const rs = vi.spyOn(fs, 'readSync').mockImplementation(((...args: Parameters<typeof fs.readSync>) => {
    const n = (readSync as (...a: unknown[]) => unknown)(...args) as number;
    total += n;
    return n;
  }) as typeof fs.readSync);
  return { total: () => total, restore: () => { rf.mockRestore(); rs.mockRestore(); } };
}

async function load(): Promise<typeof import('../mining')> {
  vi.resetModules();
  return import('../mining');
}

beforeEach(() => {
  fs.rmSync(freqRoot, { force: true, recursive: true });
  fs.mkdirSync(freqRoot, { recursive: true });
});

afterAll(() => {
  fs.rmSync(dirs.userData, { force: true, recursive: true });
});

describe('listFrequencyDictionaries', () => {
  it('answers without reading the rank table', async () => {
    const size = writeList('huge', { summary: summary('huge', { entryCount: 40_000 }), ranks: bigRanks(40_000) });
    expect(size).toBeGreaterThan(1_000_000);

    const { listFrequencyDictionaries } = await load();
    const meter = countBytes();
    const listed = listFrequencyDictionaries();
    const read = meter.total();
    meter.restore();

    expect(listed.find((s) => s.id === 'huge')).toMatchObject({
      id: 'huge', label: 'Label for huge', entryCount: 40_000, enabled: true, language: 'ja',
    });
    // The bound, not a ratio dressed up as one: the head read is 64 KB, and the three tiny
    // bundled lists this module provisions on demand are a few hundred bytes each.
    // Measured 88,772 bytes with the fix and 1,521,218 without it, on this 1.52 MB fixture —
    // the head read plus the tiny bundled lists. The bound is stated absolutely rather than as
    // a ratio so it does not quietly track a regression upward with the fixture's size.
    expect(read).toBeLessThan(400_000);
    expect(read).toBeLessThan(size / 2);
  });

  it('NEGATIVE CONTROL — the rank path still reads the whole file', async () => {
    const size = writeList('huge', { summary: summary('huge'), ranks: bigRanks(40_000) });

    const { resolveCustomFrequencyRanks } = await load();
    const meter = countBytes();
    const ranks = resolveCustomFrequencyRanks('word-7-ああああ', undefined, 'ja');
    const read = meter.total();
    meter.restore();

    expect(ranks.primary).toBe(8);
    expect(read).toBeGreaterThan(size * 0.9);
  });

  it('reads a summary from a file written without indentation', async () => {
    writeList('compact', { summary: summary('compact', { label: 'Compact {braced} label' }), ranks: bigRanks(20_000) }, undefined);
    const { listFrequencyDictionaries } = await load();
    expect(listFrequencyDictionaries().find((s) => s.id === 'compact')?.label)
      .toBe('Compact {braced} label');
  });

  it('falls back to a full parse when the summary is not in the head window', async () => {
    // `ranks` first, so the summary sits ~1 MB into the file — past the 64 KB head read. A
    // file this module did not write is still a real file, and reporting it as absent would
    // silently drop a user's imported list from the picker.
    writeList('tail', { ranks: bigRanks(40_000), summary: summary('tail', { label: 'Tail summary' }) });
    const { listFrequencyDictionaries } = await load();
    expect(listFrequencyDictionaries().find((s) => s.id === 'tail')?.label).toBe('Tail summary');
  });

  it('skips a file with no usable summary rather than throwing', async () => {
    fs.writeFileSync(path.join(freqRoot, 'broken.json'), '{"summary": {"label": "no id"}, "ranks"', 'utf-8');
    writeList('good', { summary: summary('good'), ranks: { a: 1 } });
    const { listFrequencyDictionaries } = await load();
    const listed = listFrequencyDictionaries();
    expect(listed.some((s) => s.id === 'good')).toBe(true);
    expect(listed.some((s) => (s.label ?? '') === 'no id')).toBe(false);
  });
});
