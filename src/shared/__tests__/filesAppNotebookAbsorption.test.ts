/**
 * Gate 7's own gate — every Notebook stream landed somewhere real.
 *
 * Nothing here restates the table. Each assertion re-derives its side from a
 * file the table does not own: the stream vocabulary from
 * `renderer/notebookTimeline.ts`, the enumerator ids from both registries, the
 * section from `AppSection.tsx`'s switch, and every named symbol from the file
 * the row points at.
 *
 * The live numbers the table was written against are in `FILES_APP_PLAN.md`'s
 * gate-7b entry, measured through the running app's bridge: 3,349 aggregated
 * entries across 13 populated streams. They are not asserted here — they are
 * one profile's data and would make this suite a fixture of the author's disk.
 * What IS asserted is the structure those numbers were mapped through.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DESKTOP_WIN_SECTIONS } from '../desktop';
import {
  NOTEBOOK_STREAM_ABSORPTION,
  unindexedNotebookStreams,
  type NotebookStreamAbsorption,
} from '../filesApp/notebookAbsorption';

const ROOT = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const APP_SECTION = read('src/renderer/components/AppSection.tsx');

function enumeratorSources(): Set<string> {
  const out = new Set<string>();
  for (const rel of [
    'src/main/filesApp/enumerators.ts',
    'src/renderer/components/filesapp/rendererEnumerators.ts',
  ]) {
    for (const m of read(rel).matchAll(/\bsource:\s*'([a-z0-9-]+)'/g)) out.add(m[1]);
  }
  return out;
}

function checkRow(row: NotebookStreamAbsorption, sources: Set<string>): string[] {
  const problems: string[] = [];
  if (row.source !== null && !sources.has(row.source)) {
    problems.push(`source '${row.source}' is not an enumerator id`);
  }
  if (!(DESKTOP_WIN_SECTIONS as readonly string[]).includes(row.route)) {
    problems.push(`route '${row.route}' is not a DesktopWinSection`);
  } else if (!APP_SECTION.includes(`case '${row.route}':`)) {
    problems.push(`route '${row.route}' has no case in AppSection.tsx`);
  }
  if (!existsSync(join(ROOT, row.module))) problems.push(`module missing: ${row.module}`);
  else if (!read(row.module).includes(row.symbol)) {
    problems.push(`symbol '${row.symbol}' absent from ${row.module}`);
  }
  if (row.note.trim().length < 20) problems.push('row needs a real note');
  return problems;
}

describe('gate 7 — the Notebook streams were absorbed, not dropped', () => {
  it('covers the stream vocabulary exactly, re-derived from notebookTimeline.ts', () => {
    const declared = read('src/renderer/notebookTimeline.ts');
    const union = declared.slice(
      declared.indexOf('export type NotebookStream'),
      declared.indexOf(';', declared.indexOf('export type NotebookStream')),
    );
    const vocabulary = [...union.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]).sort();
    expect(vocabulary.length).toBe(15);
    expect(NOTEBOOK_STREAM_ABSORPTION.map((r) => r.stream).sort()).toEqual(vocabulary);

    // The union is WIDER than what the Notebook actually rendered: `media` is
    // declared but absent from NotebookContent's STREAM_KEYS, so no view ever
    // asked for it. Auditing against STREAM_KEYS alone would have missed it,
    // which is why the vocabulary above comes from the type.
    const rendered = read('src/renderer/components/notebook/NotebookContent.tsx');
    const keys = rendered.slice(
      rendered.indexOf('STREAM_KEYS'),
      rendered.indexOf('];', rendered.indexOf('STREAM_KEYS')),
    );
    const streamKeys = [...keys.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]).sort();
    expect(streamKeys).toHaveLength(14);
    expect(vocabulary.filter((s) => !streamKeys.includes(s))).toEqual(['media']);
    // Control: the equality above must be able to fail. Dropping one row breaks it.
    expect(NOTEBOOK_STREAM_ABSORPTION.slice(1).map((r) => r.stream).sort()).not.toEqual(
      vocabulary,
    );
  });

  it('gives every stream a route that still exists, symbol by symbol', () => {
    const sources = enumeratorSources();
    const failures = NOTEBOOK_STREAM_ABSORPTION.map(
      (row) => [row.stream, checkRow(row, sources)] as const,
    ).filter(([, problems]) => problems.length > 0);
    expect(failures).toEqual([]);
  });

  it('no stream routes back to the deleted section, or to the Files app', () => {
    for (const row of NOTEBOOK_STREAM_ABSORPTION) {
      expect(row.route as string).not.toBe('notebook');
      // A route of `files` would mean the capability became Files-app-only,
      // which is the gate-6 regression gate 7 must not introduce. The Files
      // index is the `source` column; it is never the answer to "where can the
      // user still reach this".
      expect(row.route as string).not.toBe('files');
    }
  });

  it('reports the index gaps by name rather than rounding them away', () => {
    const gaps = unindexedNotebookStreams();
    // Exactly two, and both named: `plan` has no enumerator at all, `transcript`
    // is main-process state whose panel deliberately went to Reading. A third
    // appearing without a decision must fail here, not pass quietly.
    expect(gaps.map((r) => r.stream).sort()).toEqual(['plan', 'transcript']);
    for (const gap of gaps) expect(gap.note).toMatch(/NOT INDEXED/);
    // ...and an unindexed stream still has to keep its route, which is what
    // makes the gap an index gap rather than a lost feature.
    expect(gaps.map((r) => r.route).sort()).toEqual(['novels', 'reading']);
  });

  describe('negative control — the checker can fail', () => {
    const base = NOTEBOOK_STREAM_ABSORPTION.find((r) => r.stream === 'translations')!;
    const sources = enumeratorSources();

    it('passes on the honest row', () => {
      expect(checkRow(base, sources)).toEqual([]);
    });

    it('fails on an enumerator id that does not exist', () => {
      expect(checkRow({ ...base, source: 'no-such-enumerator' }, sources)).toHaveLength(1);
    });

    it('fails on a route AppSection does not render', () => {
      expect(checkRow({ ...base, route: 'nope' as never }, sources)).toHaveLength(1);
    });

    it('fails on a symbol the named module does not contain', () => {
      expect(checkRow({ ...base, symbol: 'zzNotARealExportName' }, sources)).toHaveLength(1);
    });
  });
});
