/**
 * Acceptance gate 14's own gate.
 *
 * The matrix is only worth having if it cannot quietly stop being true, so none
 * of these assertions restate `ANKI_PARITY_ROWS`. Each one re-derives its side
 * of the claim from a different file:
 *
 * - the journal's op kinds from `ankiDraftEdit.ts`;
 * - the change-set fields from `ankiApkgExport.ts`;
 * - the refusal codes from the destination that throws them;
 * - the explanations from all four catalogs;
 * - and the two `blocked` cells from `planConnectCommit` actually refusing.
 *
 * A source scan is used where a runtime form does not exist: `AnkiDraftEditOp`
 * and both error unions are TypeScript types that compile away, and this repo
 * does not gate on `tsc`, so the `Record<union, …>` guards in the matrix are
 * real but unenforced on their own. These scans are what enforces them.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANKI_PARITY_ROWS,
  CHANGE_SET_COVERAGE,
  JOURNAL_OP_COVERAGE,
  parityCell,
  parityRefusedRows,
  parityRow,
  parityRowKey,
  parityWhyKey,
  type AnkiParityDestination,
} from '../ankiParityMatrix';
import { planConnectCommit, ConnectCommitRefusal } from '../ankiConnectCommit';
import type { ApkgExportChangeSet } from '../ankiApkgExport';
import type { AnkiDraft, AnkiDraftCard, AnkiDraftNote } from '../ankiDraft';

const SHARED = join(__dirname, '..');
const read = (name: string) => readFileSync(join(SHARED, name), 'utf8');

/** Strip comments first: every member of these unions is documented. */
const bare = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** The `kind: '…'` discriminants of a union of object literals. */
function objectUnionKinds(source: string, name: string): string[] {
  const text = bare(source);
  const start = text.indexOf(`export type ${name} =`);
  expect(start, `no union named ${name}`).toBeGreaterThan(-1);
  // The members carry `;`-separated properties, so slicing to the first `;`
  // returns one member. The union ends where the next top-level export begins.
  const after = text.slice(start + 1);
  const end = after.search(/\nexport /);
  const body = end === -1 ? after : after.slice(0, end);
  return [...new Set([...body.matchAll(/\bkind:\s*'([^']+)'/g)].map((m) => m[1]))];
}

/** The `'a' | 'b'` members of a string-literal union. */
function stringUnionMembers(source: string, name: string): string[] {
  const text = bare(source);
  const start = text.indexOf(`export type ${name} =`);
  expect(start, `no union named ${name}`).toBeGreaterThan(-1);
  const body = text.slice(start, text.indexOf(';', start));
  return [...new Set([...body.matchAll(/'([^']+)'/g)].map((m) => m[1]))];
}

/** The `  'some.key':` entries of a catalog. */
function catalogKeys(lang: string): Set<string> {
  const keys = new Set<string>();
  for (const line of read(join('i18n', 'catalogs', `${lang}.ts`)).split('\n')) {
    const key = /^\s+'([^']+)':/.exec(line)?.[1];
    if (key) keys.add(key);
  }
  return keys;
}

const DESTINATIONS: AnkiParityDestination[] = ['package', 'connect'];

describe('the parity matrix covers every way a change can reach Anki', () => {
  it('classifies every journal op kind, and invents none', () => {
    const kinds = objectUnionKinds(read('ankiDraftEdit.ts'), 'AnkiDraftEditOp');
    // Threshold first: a scan that silently returned 1 member would pass a
    // subset comparison. The tray-strings test was written after exactly that.
    expect(kinds.length).toBeGreaterThanOrEqual(9);
    expect([...kinds].sort()).toEqual(Object.keys(JOURNAL_OP_COVERAGE).sort());

    // And the coverage map agrees with the rows themselves, both directions.
    for (const [kind, rowId] of Object.entries(JOURNAL_OP_COVERAGE)) {
      expect(parityRow(rowId)?.journalOp, `${kind} → ${rowId}`).toBe(kind);
    }
    const rowsWithOps = ANKI_PARITY_ROWS.filter((r) => r.journalOp).map((r) => r.journalOp);
    expect(rowsWithOps.sort()).toEqual([...kinds].sort());
  });

  it('classifies every change-set field', () => {
    const source = bare(read('ankiApkgExport.ts'));
    const start = source.indexOf('export interface ApkgExportChangeSet {');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('}', start));
    const fields = [...body.matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]);
    expect(fields.length).toBeGreaterThanOrEqual(9);
    expect([...fields].sort()).toEqual(Object.keys(CHANGE_SET_COVERAGE).sort());
    for (const [field, rowId] of Object.entries(CHANGE_SET_COVERAGE)) {
      expect(parityRow(rowId), `${field} names a row that exists`).toBeTruthy();
    }
  });

  it('gives every row a distinct id', () => {
    const ids = ANKI_PARITY_ROWS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(17);
  });

  it('acceptance gate 5 names six capabilities, and every one of them has a write path', () => {
    // The gate's own wording: "batch-edit tags, flags, deck, suspension, due
    // date, interval/ease … then reread Anki and prove the resulting state".
    // Three of the six were `journalOp: null` until gate 5 was built; this
    // asserts the SIX, so narrowing the gate to the writable thirds fails here.
    const GATE_5 = [
      'note-tags',
      'card-flag',
      'card-deck',
      'card-queue',
      'card-due',
      'card-scheduling',
    ];
    for (const id of GATE_5) {
      const row = parityRow(id);
      expect(row, `gate 5 names ${id}`).toBeTruthy();
      expect(row?.journalOp, `${id} must have a journal op`).toBeTruthy();
      expect(row?.changeSetField, `${id} must export through a change-set field`).toBeTruthy();
      // The package is the destination the gate is proved on, so `blocked`
      // there would mean the capability is still unwritable anywhere.
      expect(parityCell(row!, 'package').support, `${id} on package`).toBe('supported');
    }
  });
});

describe('a read-only row has no write path, and that is proved not asserted', () => {
  it('carries no journal op and no change-set field', () => {
    const readOnly = ANKI_PARITY_ROWS.filter(
      (row) => row.package.support === 'read-only' && row.connect.support === 'read-only',
    );
    // Eight since gate 5 moved flags, suspension and interval/ease out of this
    // set; `card-review-counters` is what stayed behind of the old scheduling row.
    expect(readOnly.length).toBe(8);
    expect(readOnly.map((row) => row.id)).toContain('card-review-counters');
    for (const row of readOnly) {
      // This is the whole argument: `buildApkgExportChanges` folds the journal
      // and nothing else, so a capability with no op cannot be exported.
      expect(row.journalOp, `${row.id} must have no journal op`).toBeNull();
      expect(row.changeSetField, `${row.id} must have no change-set field`).toBeNull();
    }
  });

  it('never names a refusal, because nothing is ever refused — nothing is offered', () => {
    for (const row of ANKI_PARITY_ROWS) {
      for (const destination of DESTINATIONS) {
        const cell = parityCell(row, destination);
        if (cell.support === 'blocked') expect(cell.refusal).toBeTruthy();
        else expect(cell.refusal, `${row.id}/${destination}`).toBeNull();
      }
    }
  });
});

describe('a blocked cell names a refusal its destination really throws', () => {
  it('is a member of that destination’s own error union', () => {
    const codes: Record<AnkiParityDestination, string[]> = {
      package: stringUnionMembers(read('ankiApkgExport.ts'), 'ApkgExportErrorCode'),
      connect: stringUnionMembers(read('ankiConnectCommit.ts'), 'ConnectCommitErrorCode'),
    };
    expect(codes.package.length).toBeGreaterThanOrEqual(20);
    expect(codes.connect.length).toBeGreaterThanOrEqual(16);
    for (const row of ANKI_PARITY_ROWS) {
      for (const destination of DESTINATIONS) {
        const cell = parityCell(row, destination);
        if (cell.refusal) expect(codes[destination]).toContain(cell.refusal);
        // A conditional is a package-file limit, so it is always a package code.
        if (cell.conditional) expect(codes.package).toContain(cell.conditional);
      }
    }
  });

  it('is thrown, not merely declared', () => {
    // A code can sit in a union forever without a single `throw`. Every blocked
    // cell's code must appear in a refusal construction in a module that writes.
    const throwSites =
      read('ankiConnectCommit.ts') + read('ankiApkgExport.ts') + readFileSync(
        join(SHARED, '..', 'main', 'anki', 'apkgExportCore.ts'),
        'utf8',
      );
    for (const row of ANKI_PARITY_ROWS) {
      for (const destination of DESTINATIONS) {
        const cell = parityCell(row, destination);
        for (const code of [cell.refusal, cell.conditional].filter(Boolean)) {
          const thrown = new RegExp(`Refusal\\(\\s*'${code}'`).test(throwSites);
          expect(thrown, `${code} is never thrown`).toBe(true);
        }
      }
    }
  });
});

describe('every row a destination will not write has an honest explanation', () => {
  const LANGS = ['en', 'ja', 'zh', 'ru'];

  it('names each row in all four languages', () => {
    const keys = Object.fromEntries(LANGS.map((l) => [l, catalogKeys(l)]));
    for (const row of ANKI_PARITY_ROWS) {
      for (const lang of LANGS) {
        expect(keys[lang].has(parityRowKey(row)), `${lang}: ${parityRowKey(row)}`).toBe(true);
      }
    }
  });

  it('explains every read-only and blocked cell, per destination, in all four', () => {
    const keys = Object.fromEntries(LANGS.map((l) => [l, catalogKeys(l)]));
    let explained = 0;
    for (const destination of DESTINATIONS) {
      for (const row of parityRefusedRows(destination)) {
        const key = parityWhyKey(row, destination);
        for (const lang of LANGS) {
          expect(keys[lang].has(key), `${lang}: ${key}`).toBe(true);
        }
        explained += 1;
      }
    }
    // Both destinations refuse the eight read-only rows; connect also blocks
    // three — the deck rename, the template removal, and gate 5's card flag.
    expect(explained).toBe(19);
  });

  it('offers no explanation it does not need — a supported cell has no why key', () => {
    // The inverse control. A stale `why` for a capability that later became
    // writable would render a sentence contradicting the button beside it.
    const en = catalogKeys('en');
    for (const destination of DESTINATIONS) {
      for (const row of ANKI_PARITY_ROWS) {
        if (parityCell(row, destination).support !== 'supported') continue;
        expect(en.has(parityWhyKey(row, destination)), `stale: ${parityWhyKey(row, destination)}`).toBe(
          false,
        );
      }
    }
  });
});

describe('the one surface whose Apply reaches neither destination says so', () => {
  const PANEL = join(
    SHARED,
    '..',
    'renderer',
    'components',
    'anki',
    'DeckWorkbenchCardDesign.tsx',
  );

  it('renders the draft-only line, and the matrix agrees that it must', () => {
    // Tied to the row rather than standing alone: if `template-add` ever gains
    // a journal op, this assertion fails and the panel's warning is revisited
    // instead of quietly contradicting a button that now works.
    const row = parityRow('template-add')!;
    expect(row.journalOp).toBeNull();
    expect(row.package.support).toBe('read-only');
    expect(row.connect.support).toBe('read-only');

    const source = readFileSync(PANEL, 'utf8');
    expect(source).toContain("t('ankiWorkbench.design.draftOnly')");
    for (const lang of ['en', 'ja', 'zh', 'ru']) {
      expect(catalogKeys(lang).has('ankiWorkbench.design.draftOnly'), lang).toBe(true);
    }
  });

  it('puts it beside the card count, not below the Apply button', () => {
    // Placement is the finding. The panel already stated its draft-space
    // consequence as a number ("adds 3,180 cards"); what made that number read
    // as a promise about the collection was that nothing beside it said
    // otherwise. A warning further down the panel than the Apply control is one
    // the user reaches after deciding.
    const source = readFileSync(PANEL, 'utf8');
    const effect = source.indexOf("t('ankiWorkbench.design.effect'");
    const draftOnly = source.indexOf("t('ankiWorkbench.design.draftOnly')");
    const apply = source.indexOf("t('ankiWorkbench.design.apply')");
    expect(effect).toBeGreaterThan(-1);
    expect(draftOnly).toBeGreaterThan(effect);
    expect(draftOnly).toBeLessThan(apply);
  });
});

// ----- the live half: the two blocked cells, from the real planner ---------------

function note(over: Partial<AnkiDraftNote> & { id: string }): AnkiDraftNote {
  return {
    guid: `g-${over.id}`,
    noteTypeId: 'nt1',
    tags: [],
    marked: false,
    fields: [
      { ord: 0, name: 'Front', raw: 'ねこ', normalized: 'ねこ' },
      { ord: 1, name: 'Back', raw: 'cat', normalized: 'cat' },
    ],
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [`c-${over.id}`],
    media: [],
    ...over,
  } as AnkiDraftNote;
}

function card(over: Partial<AnkiDraftCard> & { id: string; noteId: string }): AnkiDraftCard {
  return {
    deckId: '1',
    ord: 0,
    type: 'new',
    queue: 'new',
    due: 10,
    interval: 0,
    easeFactor: 0,
    reps: 0,
    lapses: 0,
    left: 0,
    flag: 'none',
    modifiedAtSec: 0,
    ...over,
  } as AnkiDraftCard;
}

const LIVE = {
  notes: [note({ id: '1001' })],
  cards: [card({ id: '2001', noteId: '1001' })],
  decks: [{ id: '1', name: 'Default', path: ['Default'], filtered: false }],
} as unknown as AnkiDraft;

const EMPTY: ApkgExportChangeSet = { notes: [], cardMoves: [], deckRenames: [] };

describe('the blocked cells refuse for real, before any write', () => {
  it('refuses a deck rename with the code the matrix names', () => {
    const row = parityRow('deck-name')!;
    expect(() =>
      planConnectCommit({ ...EMPTY, deckRenames: [{ deckId: '1', from: 'Default', to: 'Anime' }] }, LIVE),
    ).toThrow(ConnectCommitRefusal);
    try {
      planConnectCommit({ ...EMPTY, deckRenames: [{ deckId: '1', from: 'Default', to: 'Anime' }] }, LIVE);
      expect.unreachable('a rename must not plan');
    } catch (error) {
      expect((error as ConnectCommitRefusal).code).toBe(row.connect.refusal);
    }
  });

  it('refuses a template removal with the code the matrix names', () => {
    const row = parityRow('template-remove')!;
    try {
      planConnectCommit({ ...EMPTY, templateRemovals: [{ noteTypeId: 'nt1', removedOrds: [1] }] }, LIVE);
      expect.unreachable('a template removal must not plan');
    } catch (error) {
      expect((error as ConnectCommitRefusal).code).toBe(row.connect.refusal);
    }
  });

  it('refuses a card flag with the code the matrix names, and only live', () => {
    const row = parityRow('card-flag')!;
    expect(row.package.support).toBe('supported');
    try {
      planConnectCommit({ ...EMPTY, cardFlags: [{ cardId: '2001', noteId: '1001', flag: 'red' }] }, LIVE);
      expect.unreachable('a flag must not plan live');
    } catch (error) {
      expect((error as ConnectCommitRefusal).code).toBe(row.connect.refusal);
    }
  });

  it('NEGATIVE CONTROL: the two card-state capabilities it does support DO plan', () => {
    // Without this, the flag refusal above is also satisfied by a planner that
    // refuses every card-state change — which is what the matrix used to say.
    const plan = planConnectCommit(
      {
        ...EMPTY,
        cardQueues: [{ cardId: '2001', noteId: '1001', queue: 'suspended' }],
        cardScheduling: [{ cardId: '2002', noteId: '1001', interval: 21, easeFactor: 2500 }],
      },
      {
        ...LIVE,
        cards: [
          card({ id: '2001', noteId: '1001' }),
          card({ id: '2002', noteId: '1001', type: 'review', queue: 'review', interval: 10, easeFactor: 2300 }),
        ],
      } as unknown as AnkiDraft,
    );
    expect(plan.suspendWrites.suspend).toEqual([2001]);
    expect(plan.suspendWrites.unsuspend).toEqual([]);
    expect(plan.schedulingWrites).toEqual([
      { cardId: 2002, noteId: '1001', interval: 21, easeFactor: 2500 },
    ]);
  });

  it('throws instead of returning a partial plan, so a refusal has written nothing', () => {
    // The refusal must beat the writes that ride beside it in the same batch:
    // a plan returned with the note write and the rename dropped would commit
    // half of what the user approved and report success.
    const beside: ApkgExportChangeSet = {
      ...EMPTY,
      notes: [{ noteId: '1001', fields: ['いぬ', 'dog'] }],
      deckRenames: [{ deckId: '1', from: 'Default', to: 'Anime' }],
    };
    expect(() => planConnectCommit(beside, LIVE)).toThrow(ConnectCommitRefusal);
  });

  it('NEGATIVE CONTROL: the same batch without the blocked op plans its writes', () => {
    // Without this, the three assertions above are also satisfied by a planner
    // that refuses everything.
    const plan = planConnectCommit({ ...EMPTY, notes: [{ noteId: '1001', fields: ['いぬ', 'dog'] }] }, LIVE);
    expect(plan.noteWrites).toHaveLength(1);
    expect(plan.noteWrites[0].fields).toEqual({ Front: 'いぬ', Back: 'dog' });
  });
});

/**
 * A deliberate canary, and the only hardcoded numbers in this file.
 *
 * Gate 14 is scored by driving the real panel and recording what it renders.
 * That score went stale silently once already: gate 5 widened the matrix from
 * 16 rows to 17 and moved connect from 4 supported / 2 blocked to 6 / 3, while
 * every derived test here stayed green — because they all re-derive from
 * `ANKI_PARITY_ROWS`, which is exactly what makes them blind to it changing.
 *
 * So this one does not re-derive. Widening the matrix is supposed to break it,
 * and the fix is to re-run the live score and update both numbers together.
 */
describe('gate 14 canary: the partition the live score was recorded against', () => {
  it('is 17 rows: connect 6 / 8 / 3 and package 9 / 8 / 0', () => {
    const tally = (destination: AnkiParityDestination) =>
      ANKI_PARITY_ROWS.reduce(
        (acc, row) => {
          acc[parityCell(row, destination).support] += 1;
          return acc;
        },
        { supported: 0, 'read-only': 0, blocked: 0 } as Record<string, number>,
      );

    expect(ANKI_PARITY_ROWS).toHaveLength(17);
    expect(tally('connect')).toEqual({ supported: 6, 'read-only': 8, blocked: 3 });
    expect(tally('package')).toEqual({ supported: 9, 'read-only': 8, blocked: 0 });
  });

  it('the three connect refuses are exactly what package supports and connect does not', () => {
    // The live inverse control, mechanically: the panel's own delta between the
    // two destinations. Measured 2026-08-17 as 9 - 6 = 3 on the real component.
    const delta = ANKI_PARITY_ROWS.filter(
      (row) =>
        parityCell(row, 'package').support === 'supported' &&
        parityCell(row, 'connect').support !== 'supported',
    ).map((row) => row.id);
    expect(delta).toEqual(['card-flag', 'deck-name', 'template-remove']);
    // Every one of them is `blocked` rather than read-only: a capability the
    // package writes and live Anki merely lacks a row for would be a gap, not a
    // refusal, and would render no code beside it. `parityRefusedRows` is the
    // wider set — read-only included — so it is asserted as a superset, not as
    // this list.
    const blocked = ANKI_PARITY_ROWS.filter((row) => parityCell(row, 'connect').support === 'blocked');
    expect(blocked.map((row) => row.id)).toEqual(delta);
    expect(blocked.every((row) => parityCell(row, 'connect').refusal !== null)).toBe(true);
    expect(parityRefusedRows('connect').map((row) => row.id)).toEqual(
      expect.arrayContaining(delta),
    );
  });
});
