// @vitest-environment jsdom
//
// The tray's model is covered exhaustively in `shared/__tests__/ankiChangeTray.test.ts`.
// What only a mounted test can prove is that the surface does not overstate: that
// the preview it shows is the plan it applies, that a blocked tray offers no
// Apply, and that a selection larger than the loaded page says so rather than
// printing the bigger number next to the verb.
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
import { createEditJournal, type AnkiDraftEditJournal } from '../../shared/ankiDraftEdit';
import type { TrayPlan } from '../../shared/ankiChangeTray';
import type { EnrichEntry } from '../../shared/ankiEnrich';
import DeckWorkbenchTray from '../components/anki/DeckWorkbenchTray';

function note(id: string, back = 'cat'): AnkiDraftNote {
  return {
    id,
    guid: `g-${id}`,
    noteTypeId: 'basic',
    tags: ['core'],
    marked: false,
    fields: [
      { ord: 0, name: 'Front', raw: 'ねこ', normalized: 'ねこ' },
      { ord: 1, name: 'Back', raw: back, normalized: back },
    ],
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [],
    media: [],
  };
}

function draftOf(notes: AnkiDraftNote[]): AnkiDraft {
  return {
    version: 1,
    source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp' },
    decks: [{ id: 'd1', name: 'Core', path: ['Core'], filtered: false }],
    noteTypes: [
      {
        id: 'basic',
        name: 'Basic',
        kind: 'standard',
        css: '',
        fields: [
          { ord: 0, name: 'Front', sticky: false, rtl: false },
          { ord: 1, name: 'Back', sticky: false, rtl: false },
        ],
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

let root: Root | null = null;
let host: HTMLDivElement;
const onApply = vi.fn<(plan: TrayPlan) => void>();

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  onApply.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
});

function mount(
  draft: AnkiDraft,
  ids: string[],
  count = ids.length,
  journal: AnkiDraftEditJournal = createEditJournal(),
): void {
  act(() => {
    root = createRoot(host);
    root.render(
      <DeckWorkbenchTray
        draft={draft}
        journal={journal}
        selectedIds={ids}
        selectedCount={count}
        onApply={onApply}
      />,
    );
  });
}

const byText = (selector: string, text: string): HTMLElement | undefined =>
  [...host.querySelectorAll<HTMLElement>(selector)].find((e) => e.textContent?.includes(text));

const applyButton = (): HTMLButtonElement =>
  byText('button', 'ankiWorkbench.tray.apply') as HTMLButtonElement;

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  // React installs a value tracker per element class; writing `.value` directly
  // makes React think nothing changed and the onChange never fires.
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  act(() => el.dispatchEvent(new Event('input', { bubbles: true })));
  act(() => el.dispatchEvent(new Event('change', { bubbles: true })));
}

/** Fill the find/replace form and press "Add to tray". */
function addReplace(find: string, replaceWith: string): void {
  const labels = [...host.querySelectorAll('label')];
  const findInput = labels
    .find((l) => l.textContent?.includes('ankiWorkbench.tray.find'))!
    .querySelector('input')!;
  const replaceInput = labels
    .find((l) => l.textContent?.includes('ankiWorkbench.tray.replace'))!
    .querySelector('input')!;
  setValue(findInput, find);
  setValue(replaceInput, replaceWith);
  act(() => {
    byText('button', 'ankiWorkbench.tray.add')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
  });
}

function addToTray(): void {
  act(() => {
    byText('button', 'ankiWorkbench.tray.add')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
  });
}

/** Pick a value in whichever `<select>` sits under the label with this key. */
function selectField(labelKey: string, value: string): void {
  const select = [...host.querySelectorAll('label')]
    .find((l) => l.textContent?.includes(labelKey))!
    .querySelector('select')!;
  setValue(select, value);
}

const selectKind = (kind: string): void => selectField('ankiWorkbench.tray.kind', kind);

describe('DeckWorkbenchTray', () => {
  it('offers no Apply until an action would actually change something', () => {
    mount(draftOf([note('n1')]), ['n1']);
    // An empty tray is a blocking problem, stated, with Apply disabled.
    expect(host.textContent).toContain('ankiWorkbench.tray.problem.no-actions');
    expect(applyButton().disabled).toBe(true);

    addReplace('nothing-here', 'x');
    expect(host.textContent).toContain('ankiWorkbench.tray.summaryNone');
    expect(applyButton().disabled).toBe(true);
  });

  it('previews the diff and hands that same plan to Apply', () => {
    mount(draftOf([note('n1'), note('n2')]), ['n1', 'n2']);
    addReplace('cat', 'ねこ');

    expect(host.textContent).toContain('ankiWorkbench.tray.summary:2');
    const diff = host.querySelector('.wb-tray-diff')!;
    expect(diff.querySelector('del')!.textContent).toBe('cat');
    expect(diff.querySelector('ins')!.textContent).toBe('ねこ');
    expect(host.textContent).toContain('ankiWorkbench.tray.outcome:2,2');

    expect(applyButton().disabled).toBe(false);
    act(() => applyButton().dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(onApply).toHaveBeenCalledTimes(1);
    const plan = onApply.mock.calls[0]![0];
    // The applied plan is the previewed one: same draft object, and its journal
    // carries both notes under one group.
    expect(plan.changedNotes).toBe(2);
    expect(plan.draft.notes.map((n) => n.fields[1]!.raw)).toEqual(['ねこ', 'ねこ']);
    expect(new Set(plan.journal.done.map((op) => op.group)).size).toBe(1);
    expect(host.textContent).toContain('ankiWorkbench.tray.applied:2');
  });

  it('refuses the whole tray on a bad regex, and says which rule', () => {
    mount(draftOf([note('n1')]), ['n1']);
    addReplace('cat', 'dog');
    const regexToggle = [...host.querySelectorAll('label')]
      .find((l) => l.textContent?.includes('ankiWorkbench.tray.regex'))!
      .querySelector('input')!;
    act(() => regexToggle.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    addReplace('([', 'x');

    expect(host.textContent).toContain('ankiWorkbench.tray.problem.invalid-regex');
    expect(host.querySelector('.wb-tray-blocking')).not.toBeNull();
    // No preview at all: a blocked tray has no result to describe.
    expect(host.querySelector('.wb-tray-preview')).toBeNull();
    expect(applyButton().disabled).toBe(true);
  });

  it('separates what is selected from what it can change on a paged source', () => {
    mount(draftOf([note('n1')]), ['n1'], 3221);
    expect(host.textContent).toContain('ankiWorkbench.tray.scope:1');
    expect(host.textContent).toContain('ankiWorkbench.tray.beyondPage:3220');
  });

  it('keeps a disabled action in the order and stops counting it', () => {
    mount(draftOf([note('n1')]), ['n1']);
    addReplace('cat', 'dog');
    const enable = host.querySelector<HTMLInputElement>('.wb-tray-enable input')!;
    act(() => enable.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(host.querySelectorAll('.wb-tray-action')).toHaveLength(1);
    expect(host.querySelector('.wb-tray-action')!.className).toContain('disabled');
    expect(host.textContent).toContain('ankiWorkbench.tray.outcomeNone');
    expect(host.textContent).toContain('ankiWorkbench.tray.problem.no-actions');
  });

  it('reorders actions, and the preview follows the new order', () => {
    mount(draftOf([note('n1')]), ['n1']);
    addReplace('cat', 'dog');
    addReplace('dog', 'いぬ');
    expect(host.querySelector('.wb-tray-diff ins')!.textContent).toBe('いぬ');

    // Move the second rule to the front: it then has nothing to find, and the
    // first leaves 'dog' behind.
    const up = host.querySelectorAll<HTMLButtonElement>('.wb-tray-action')[1]!.querySelectorAll('button')[0]!;
    act(() => up.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(host.querySelector('.wb-tray-diff ins')!.textContent).toBe('dog');
  });

  it('swaps two fields from the form and shows both halves of the diff', () => {
    mount(draftOf([note('n1')]), ['n1']);
    selectKind('swap-fields');
    selectField('ankiWorkbench.tray.swapA', 'Front');
    selectField('ankiWorkbench.tray.swapB', 'Back');
    addToTray();

    expect(host.textContent).toContain('ankiWorkbench.tray.describe.swap-fields:Front,Back');
    const rows = [...host.querySelectorAll('.wb-tray-diff-row')];
    expect(rows.map((r) => r.querySelector('del')!.textContent)).toEqual(['ねこ', 'cat']);
    expect(rows.map((r) => r.querySelector('ins')!.textContent)).toEqual(['cat', 'ねこ']);
    expect(applyButton().disabled).toBe(false);
  });

  it('defaults a copy to the rule that cannot lose text, and warns when it can', () => {
    mount(draftOf([note('n1')]), ['n1']);
    selectKind('copy-field');
    selectField('ankiWorkbench.tray.copyFrom', 'Front');
    selectField('ankiWorkbench.tray.copyTo', 'Back');
    // The pre-selected conflict rule is `keep`, so the occupied Back is untouched
    // and there is nothing to apply.
    addToTray();
    expect(host.textContent).toContain('ankiWorkbench.tray.summaryNone');
    expect(applyButton().disabled).toBe(true);

    // Choosing `overwrite` is what makes it destructive — and it says so, per note.
    act(() =>
      host.querySelectorAll<HTMLButtonElement>('.wb-tray-action button')[2]!.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      ),
    );
    selectField('ankiWorkbench.tray.onConflict', 'overwrite');
    addToTray();
    expect(host.textContent).toContain('ankiWorkbench.tray.problem.overwrite-nonempty:1,Back');
    expect(host.querySelector('.wb-tray-warn')).not.toBeNull();
    expect(applyButton().disabled).toBe(false);
  });

  it('offers the clean-up ops in the order they run, and refuses none chosen', () => {
    mount(draftOf([note('n1', ' <b>cat</b>  ')]), ['n1']);
    selectKind('normalize-text');
    const ops = [...host.querySelectorAll('.wb-tray-form .wb-tray-flag')].map((l) => l.textContent);
    expect(ops).toEqual([
      'ankiWorkbench.tray.normalize.strip-html',
      'ankiWorkbench.tray.normalize.strip-furigana',
      'ankiWorkbench.tray.normalize.ascii-width',
      'ankiWorkbench.tray.normalize.collapse-space',
      'ankiWorkbench.tray.normalize.trim',
    ]);

    // Nothing ticked is a refusal, not "normalise with sensible defaults".
    addToTray();
    expect(host.textContent).toContain('ankiWorkbench.tray.problem.empty-parameter');
    expect(applyButton().disabled).toBe(true);

    act(() =>
      host.querySelectorAll<HTMLButtonElement>('.wb-tray-action button')[2]!.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      ),
    );
    // Tick them out of order; the description still lists them in running order.
    for (const key of ['trim', 'strip-html', 'collapse-space']) {
      const box = [...host.querySelectorAll('.wb-tray-form .wb-tray-flag')]
        .find((l) => l.textContent?.endsWith(key))!
        .querySelector('input')!;
      act(() => box.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    }
    selectField('ankiWorkbench.tray.field', 'Back');
    addToTray();

    expect(host.textContent).toContain(
      'ankiWorkbench.tray.describe.normalize-text:Back,ankiWorkbench.tray.normalize.strip-html, ankiWorkbench.tray.normalize.collapse-space, ankiWorkbench.tray.normalize.trim',
    );
    const diff = host.querySelector('.wb-tray-diff')!;
    expect(diff.querySelector('del')!.textContent).toBe(' <b>cat</b>  ');
    expect(diff.querySelector('ins')!.textContent).toBe('cat');
  });

  it('refuses a swap of one field with itself before anything can run', () => {
    mount(draftOf([note('n1')]), ['n1']);
    selectKind('swap-fields');
    selectField('ankiWorkbench.tray.swapA', 'Back');
    selectField('ankiWorkbench.tray.swapB', 'Back');
    addToTray();

    expect(host.textContent).toContain('ankiWorkbench.tray.problem.same-field');
    expect(host.querySelector('.wb-tray-blocking')).not.toBeNull();
    expect(host.querySelector('.wb-tray-preview')).toBeNull();
    expect(applyButton().disabled).toBe(true);
  });
});

// ----- dictionary enrichment, gate 11's surface half ---------------------------

/** One dictionary's answer for ねこ. */
function entry(source: string, definition: string): EnrichEntry {
  return {
    source,
    reading: 'ねこ',
    senses: [{ partsOfSpeech: ['noun'], definitions: [definition] }],
  };
}

/** Queue an `enrich-dictionary` action writing the meaning into `Back`. */
function addEnrich(rule = 'refuse'): void {
  selectKind('enrich-dictionary');
  selectField('ankiWorkbench.tray.enrichTo', 'Back');
  selectField('ankiWorkbench.tray.senseRule', rule);
  addToTray();
}

/** Let the enrichment lookup's promise settle inside React's `act`. */
const flushLookup = (): Promise<void> =>
  act(async () => {
    await Promise.resolve();
  });

describe('DeckWorkbenchTray enrichment', () => {
  afterEach(() => {
    delete (window as { api?: unknown }).api;
  });

  it('blocks rather than reporting a whole deck as unknown when no lookup can run', () => {
    // The negative control for the whole feature: with no `dictEnrichTerms` on
    // the host, an empty result would read as "no installed dictionary knows any
    // of your words". The tray must refuse the plan instead.
    mount(draftOf([note('n1', '')]), ['n1']);
    addEnrich();

    expect(host.textContent).toContain('ankiWorkbench.tray.problem.no-enrich-data');
    expect(host.textContent).not.toContain('ankiWorkbench.tray.problem.enrich-no-entry');
    expect(host.querySelector('.wb-tray-blocking')).not.toBeNull();
    expect(applyButton().disabled).toBe(true);
  });

  it('writes the dictionary value with its provenance once the lookup answers', async () => {
    const dictEnrichTerms = vi.fn().mockResolvedValue({ ねこ: [entry('JMdict (EN)', 'cat')] });
    (window as { api?: unknown }).api = { dictEnrichTerms };
    mount(draftOf([note('n1', '')]), ['n1']);
    addEnrich();
    // Blocked while the lookup is in flight, for the same reason as above.
    expect(applyButton().disabled).toBe(true);
    await flushLookup();

    // Asked for the word the note declares, not for the note's other field.
    expect(dictEnrichTerms).toHaveBeenCalledWith(['ねこ']);
    expect(host.textContent).toContain('ankiWorkbench.tray.enrichReady:1,1');
    expect(host.textContent).toContain('ankiWorkbench.tray.summary:1');

    act(() => applyButton().dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const written = onApply.mock.calls[0]![0].draft.notes[0]!.fields[1]!.raw;
    expect(written).toContain('cat');
    expect(written).toContain('data-jp-dict="JMdict (EN)"');
  });

  it('leaves a note alone when installed dictionaries disagree and the rule says so', async () => {
    (window as { api?: unknown }).api = {
      dictEnrichTerms: vi
        .fn()
        .mockResolvedValue({ ねこ: [entry('JMdict (EN)', 'cat'), entry('Wiktionary', 'feline')] }),
    };
    mount(draftOf([note('n1', '')]), ['n1']);
    addEnrich();
    await flushLookup();

    // A disagreement under `refuse` is named and changes nothing — not silently
    // resolved in favour of whichever dictionary happened to be first.
    // The word itself reaches the warning, so a user can go and resolve it.
    expect(host.textContent).toContain('ankiWorkbench.tray.problem.enrich-sense-conflict:1,ねこ');
    expect(host.textContent).toContain('ankiWorkbench.tray.summaryNone');
    expect(applyButton().disabled).toBe(true);
  });

  it('merges both dictionaries under all-sources and says that it did', async () => {
    (window as { api?: unknown }).api = {
      dictEnrichTerms: vi
        .fn()
        .mockResolvedValue({ ねこ: [entry('JMdict (EN)', 'cat'), entry('Wiktionary', 'feline')] }),
    };
    mount(draftOf([note('n1', '')]), ['n1']);
    addEnrich('all-sources');
    await flushLookup();

    expect(host.textContent).toContain('ankiWorkbench.tray.problem.enrich-sources-merged:1,ねこ');
    act(() => applyButton().dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const written = onApply.mock.calls[0]![0].draft.notes[0]!.fields[1]!.raw;
    expect(written).toContain('cat / feline');
    // Both dictionaries are credited in the attribute, which is `|`-separated so
    // a source name containing the value separator stays readable.
    expect(written).toContain('data-jp-dict="JMdict (EN)|Wiktionary"');
  });

  it('does not look anything up for a tray with no enrichment in it', () => {
    const dictEnrichTerms = vi.fn().mockResolvedValue({});
    (window as { api?: unknown }).api = { dictEnrichTerms };
    mount(draftOf([note('n1')]), ['n1']);
    addReplace('cat', 'ねこ');

    expect(dictEnrichTerms).not.toHaveBeenCalled();
    expect(host.querySelector('.wb-tray-enrich')).toBeNull();
  });
});
