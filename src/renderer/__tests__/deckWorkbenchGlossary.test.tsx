// @vitest-environment jsdom
//
// Recipe 14's panel. The merge rules are covered in
// `shared/__tests__/ankiGlossaryMerge.test.ts` and the tray seam in
// `ankiGlossaryMergeTray.test.ts`; what only a mounted test can show is that
// the glossary is built at Add and not while the form is edited, that the id
// changes on a re-pick, and that the form refuses exactly what the tray would.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}));

import type { AnkiDraft, AnkiDraftNote } from '../../shared/ankiDraft';
import type { GlossarySource } from '../../shared/ankiGlossaryMerge';
import DeckWorkbenchGlossary, {
  draftFieldNames,
  type GlossaryQueueParams,
} from '../components/anki/DeckWorkbenchGlossary';

function note(id: string, values: Record<string, string>): AnkiDraftNote {
  return {
    id,
    guid: `g-${id}`,
    noteTypeId: 'nt1',
    tags: [],
    marked: false,
    fields: Object.entries(values).map(([name, raw], ord) => ({ ord, name, raw, normalized: raw })),
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [],
    media: [],
  };
}

function draftOf(label: string, fieldNames: string[], notes: AnkiDraftNote[]): AnkiDraft {
  return {
    version: 1,
    source: { kind: 'apkg', label, fingerprint: label },
    decks: [{ id: 'd1', name: 'Core', path: ['Core'], filtered: false }],
    noteTypes: [
      {
        id: 'nt1',
        name: 'Basic',
        kind: 'standard',
        css: '',
        fields: fieldNames.map((name, ord) => ({ name, ord, sticky: false, rtl: false })),
        templates: [],
        sortFieldOrd: 0,
      },
    ],
    notes,
    cards: [],
    diagnostics: [],
    counts: { notes: notes.length, cards: 0, decks: 1, noteTypes: 1, reviews: 0, mediaReferences: 0 },
  };
}

const MINE = draftOf('mine.apkg', ['Expression', 'Meaning'], [note('n1', { Expression: '猫', Meaning: '' })]);
const THEIRS = draftOf(
  'glossary.apkg',
  ['Expression', 'Meaning', 'Notes'],
  [note('s1', { Expression: '猫', Meaning: 'cat', Notes: 'common' })],
);

let root: Root | null = null;
let host: HTMLDivElement;
const onQueue = vi.fn<(source: GlossarySource, params: GlossaryQueueParams) => void>();
const readApkgDraft = vi.fn();

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  onQueue.mockReset();
  readApkgDraft.mockReset();
  readApkgDraft.mockResolvedValue({ ok: true, draft: THEIRS });
  Object.defineProperty(window, 'api', { configurable: true, value: { readApkgDraft } });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
});

function mount(): void {
  act(() => {
    root = createRoot(host);
    root.render(<DeckWorkbenchGlossary draft={MINE} onQueue={onQueue} />);
  });
}

function setValue(el: HTMLSelectElement, value: string): void {
  // React installs a value tracker per element class; writing `.value` directly
  // makes React think nothing changed and the onChange never fires.
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value);
  act(() => el.dispatchEvent(new Event('input', { bubbles: true })));
  act(() => el.dispatchEvent(new Event('change', { bubbles: true })));
}

// Exact, not `includes`: `…glossary.add` is a prefix of `…glossary.addPair`,
// and a substring match finds the wrong button in DOM order.
const button = (key: string): HTMLButtonElement =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === key) as HTMLButtonElement;

/** The picker relabels itself once a deck is loaded; both spellings are it. */
const pickButton = (): HTMLButtonElement =>
  button('ankiWorkbench.tray.glossary.repick') ?? button('ankiWorkbench.tray.glossary.pick');

const labelled = (label: string): HTMLSelectElement =>
  [...host.querySelectorAll('label')]
    .find((l) => l.textContent?.includes(label))!
    .querySelector('select') as HTMLSelectElement;

const byAriaLabel = (label: string): HTMLSelectElement[] =>
  [...host.querySelectorAll(`select[aria-label="${label}"]`)] as HTMLSelectElement[];

const click = (el: HTMLButtonElement): void => {
  act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
};

async function pickDeck(): Promise<void> {
  click(pickButton());
  await act(async () => {
    await Promise.resolve();
  });
}

/** The form filled in the order a user would: file, key, one pair. */
async function fillForm(): Promise<void> {
  await pickDeck();
  setValue(labelled('ankiWorkbench.tray.glossary.keyField'), 'Expression');
  setValue(byAriaLabel('ankiWorkbench.tray.glossary.from')[0]!, 'Meaning');
  setValue(byAriaLabel('ankiWorkbench.tray.glossary.to')[0]!, 'Meaning');
}

describe('DeckWorkbenchGlossary', () => {
  it('shows nothing to configure until a second deck is loaded', () => {
    mount();
    expect(button('ankiWorkbench.tray.glossary.add').disabled).toBe(true);
    expect(host.querySelector('select')).toBeNull();
  });

  it('reports the file it loaded by name and note count, not just "loaded"', async () => {
    mount();
    await pickDeck();
    expect(readApkgDraft).toHaveBeenCalledTimes(1);
    // No path: the OS dialog is the control the user names the file with.
    expect(readApkgDraft.mock.calls[0]![0]).toEqual({});
    expect(host.textContent).toContain('ankiWorkbench.tray.glossary.loaded:glossary.apkg,1');
  });

  it('offers only the fields both decks declare as the matching field', async () => {
    mount();
    await pickDeck();
    const options = [...labelled('ankiWorkbench.tray.glossary.keyField').options].map((o) => o.value);
    // `Notes` exists only in the other deck, so it can match nothing here.
    expect(options).toEqual(['', 'Expression', 'Meaning']);
    // The source side of a pair does offer it: it can be read from, just not matched on.
    expect([...byAriaLabel('ankiWorkbench.tray.glossary.from')[0]!.options].map((o) => o.value)).toEqual(
      ['', 'Expression', 'Meaning', 'Notes'],
    );
  });

  it('queues a source built from exactly the paired fields, at Add', async () => {
    mount();
    await fillForm();
    expect(button('ankiWorkbench.tray.glossary.add').disabled).toBe(false);
    click(button('ankiWorkbench.tray.glossary.add'));

    expect(onQueue).toHaveBeenCalledTimes(1);
    const [source, params] = onQueue.mock.calls[0]!;
    expect(params.keyField).toBe('Expression');
    expect(params.fieldPairs).toEqual([{ fromField: 'Meaning', toField: 'Meaning' }]);
    expect(params.mode).toBe('fill-empty');
    expect(params.sourceId).toBe(source.id);
    expect(source.label).toBe('glossary.apkg');
    expect(source.entries.size).toBe(1);
    // Only `Meaning` was paired, so `Notes` is not carried even though it exists.
    expect(source.entries.get('猫')?.values).toEqual({ meaning: 'cat' });
  });

  it('mints a new id on a re-pick, so an already-queued action refuses instead of merging it', async () => {
    mount();
    await fillForm();
    click(button('ankiWorkbench.tray.glossary.add'));
    const first = onQueue.mock.calls[0]![0].id;

    await pickDeck();
    click(button('ankiWorkbench.tray.glossary.add'));
    const second = onQueue.mock.calls[1]![0].id;
    expect(second).not.toBe(first);
  });

  it('refuses a pair that writes into the matching field, and says so before Add is tried', async () => {
    mount();
    await pickDeck();
    setValue(labelled('ankiWorkbench.tray.glossary.keyField'), 'Expression');
    setValue(byAriaLabel('ankiWorkbench.tray.glossary.from')[0]!, 'Meaning');
    setValue(byAriaLabel('ankiWorkbench.tray.glossary.to')[0]!, 'Expression');
    expect(button('ankiWorkbench.tray.glossary.add').disabled).toBe(true);
    expect(host.textContent).toContain('ankiWorkbench.tray.glossary.refusal.writesKey:Expression');
    expect(onQueue).not.toHaveBeenCalled();
  });

  it('adds and removes field pairs, and queues every filled one', async () => {
    mount();
    await fillForm();
    click(button('ankiWorkbench.tray.glossary.addPair'));
    setValue(byAriaLabel('ankiWorkbench.tray.glossary.from')[1]!, 'Notes');
    setValue(byAriaLabel('ankiWorkbench.tray.glossary.to')[1]!, 'Expression');
    // The second pair writes the key field, so the whole Add is refused.
    expect(button('ankiWorkbench.tray.glossary.add').disabled).toBe(true);

    // The *second* row's Remove — every row has one, and removing the first
    // would leave the offending pair in place.
    const removes = [...host.querySelectorAll('button')].filter(
      (b) => b.textContent === 'ankiWorkbench.tray.glossary.removePair',
    ) as HTMLButtonElement[];
    expect(removes).toHaveLength(2);
    click(removes[1]!);
    expect(byAriaLabel('ankiWorkbench.tray.glossary.from')).toHaveLength(1);
    click(button('ankiWorkbench.tray.glossary.add'));
    expect(onQueue.mock.calls[0]![1].fieldPairs).toEqual([
      { fromField: 'Meaning', toField: 'Meaning' },
    ]);
  });

  it('leaves the loaded deck alone when the dialog is cancelled', async () => {
    mount();
    await fillForm();
    readApkgDraft.mockResolvedValue({ ok: false, error: 'cancelled' });
    await pickDeck();
    // Still configured against the first file; cancel is a decision, not a failure.
    expect(host.textContent).toContain('ankiWorkbench.tray.glossary.loaded:glossary.apkg,1');
    expect(button('ankiWorkbench.tray.glossary.add').disabled).toBe(false);
  });
});

describe('draftFieldNames', () => {
  it('lists every note type’s fields once, in first-seen order', () => {
    expect(draftFieldNames(THEIRS)).toEqual(['Expression', 'Meaning', 'Notes']);
  });
});
