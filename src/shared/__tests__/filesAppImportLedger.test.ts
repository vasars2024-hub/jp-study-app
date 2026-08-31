/**
 * Gate 29's model — "Re-scan is idempotent. Running the same scan twice imports
 * nothing the second time and says so — a duplicate library entry is a FAIL."
 *
 * The "imports nothing" half belongs to the real importers and is measured in
 * `main/__tests__/filesAppImportReadOnly.test.ts`. This is "and says so".
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INGEST_SETTINGS,
  INGEST_KNOWN_ALREADY_IMPORTED,
  dispositionFor,
  ingestPlanBalances,
  planIngest,
} from '../filesApp/ingest';
import {
  IMPORT_LEDGER_LIMIT,
  emptyImportLedger,
  forgetImports,
  isAlreadyImported,
  normalizeImportLedger,
  recordImports,
} from '../filesApp/importLedger';
import type { FilesScanEntry } from '../filesApp/scan';

function entry(path: string, sizeBytes = 100): FilesScanEntry {
  return {
    path,
    name: path.split(/[\\/]/).pop() as string,
    sizeBytes,
    target: 'subtitle',
    confidence: 'exact',
    reasonKey: 'fileDrop.reason.subtitle',
    candidateCount: 1,
    settlement: 'placed',
  };
}

describe('the ledger', () => {
  it('recognises a path across separator and case differences', () => {
    // Windows is case-insensitive and the same file arrives spelled both ways.
    const ledger = recordImports(emptyImportLedger(), [
      { path: 'C:\\DL\\ep01.srt', sizeBytes: 100, target: 'subtitle' },
    ]);
    expect(isAlreadyImported(ledger, { path: 'c:/dl/ep01.srt', sizeBytes: 100 })).toBe(true);
  });

  it('a file replaced in place is NOT already imported', () => {
    // A re-download or a better rip under the same name deserves to be offered
    // again; identity is path AND size for exactly this case.
    const ledger = recordImports(emptyImportLedger(), [
      { path: 'C:\\dl\\ep01.mkv', sizeBytes: 100, target: 'media' },
    ]);
    expect(isAlreadyImported(ledger, { path: 'C:\\dl\\ep01.mkv', sizeBytes: 100 })).toBe(true);
    expect(isAlreadyImported(ledger, { path: 'C:\\dl\\ep01.mkv', sizeBytes: 999 })).toBe(false);
  });

  it('re-recording replaces rather than appends, and forgetting removes', () => {
    let ledger = recordImports(emptyImportLedger(), [
      { path: 'a', sizeBytes: 1, target: 'subtitle' },
    ]);
    ledger = recordImports(ledger, [{ path: 'a', sizeBytes: 1, target: 'subtitle' }], 2);
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0].importedAt).toBe(2);
    expect(forgetImports(ledger, ['A']).rows).toHaveLength(0);
  });

  it('keeps the newest rows when it overflows', () => {
    const many = Array.from({ length: IMPORT_LEDGER_LIMIT + 10 }, (_, i) => ({
      path: `f${i}`,
      sizeBytes: 1,
      target: 'subtitle' as const,
    }));
    const ledger = recordImports(emptyImportLedger(), many);
    expect(ledger.rows).toHaveLength(IMPORT_LEDGER_LIMIT);
  });

  it('normalises rubbish to an empty ledger rather than throwing', () => {
    expect(normalizeImportLedger(null).rows).toEqual([]);
    expect(normalizeImportLedger({ rows: 'nope' }).rows).toEqual([]);
    expect(
      normalizeImportLedger({ rows: [{ path: '', sizeBytes: 1 }, { path: 'a' }, { path: 'b', sizeBytes: 2 }] })
        .rows.map((r) => r.path),
    ).toEqual(['b']);
  });
});

describe('gate 29 — a second scan says so instead of re-offering', () => {
  const entries = [entry('C:\\dl\\a.srt'), entry('C:\\dl\\b.srt', 200)];

  it('the first scan offers both', () => {
    const plan = planIngest({ entries });
    expect(plan.autoCount).toBe(2);
    expect(plan.knownCount).toBe(0);
  });

  it('the second scan reports them as already held, in their own pile', () => {
    const ledger = recordImports(
      emptyImportLedger(),
      entries.map((e) => ({ path: e.path, sizeBytes: e.sizeBytes, target: e.target })),
    );
    const plan = planIngest({ entries }, DEFAULT_INGEST_SETTINGS, undefined, ledger);
    expect(plan.autoCount).toBe(0);
    expect(plan.knownCount).toBe(2);
    expect(plan.known[0].decision.reasonKey).toBe(INGEST_KNOWN_ALREADY_IMPORTED);
    // The four piles still account for every considered file.
    expect(ingestPlanBalances({ entries }, plan)).toBe(true);
  });

  it('history answers first, so a reclassified file is not re-offered', () => {
    // If the router's table changed since, re-judging a held file would offer
    // an import the importers would silently swallow — and the report would
    // then claim it landed.
    const ledger = recordImports(emptyImportLedger(), [
      { path: 'C:\\dl\\x.xyz', sizeBytes: 5, target: 'subtitle' },
    ]);
    const nowUnknown: FilesScanEntry = {
      ...entry('C:\\dl\\x.xyz', 5),
      target: 'unknown',
      confidence: 'ambiguous',
      settlement: 'unplaced',
    };
    expect(dispositionFor(nowUnknown, DEFAULT_INGEST_SETTINGS, ledger).disposition).toBe('known');
    // The control: without the ledger the same entry is refused.
    expect(dispositionFor(nowUnknown).disposition).toBe('refused');
  });

  it('only what landed is recorded — a refused row stays offerable', () => {
    const ledger = recordImports(emptyImportLedger(), [
      { path: 'C:\\dl\\a.srt', sizeBytes: 100, target: 'subtitle' },
    ]);
    const plan = planIngest({ entries }, DEFAULT_INGEST_SETTINGS, undefined, ledger);
    expect(plan.known.map((i) => i.entry.name)).toEqual(['a.srt']);
    expect(plan.auto.map((i) => i.entry.name)).toEqual(['b.srt']);
  });
});
