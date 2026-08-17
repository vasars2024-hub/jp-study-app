// @vitest-environment jsdom
//
// The model is covered in `shared/__tests__/ankiCardDesign.test.ts`. What only a
// mounted test can prove is that the panel states the consequence as a *number*
// before Apply, that a design which cannot work disables Apply instead of
// failing after it, and that the reverse transition is reachable from the UI.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}));

import type { AnkiDraft, AnkiDraftNote, AnkiDraftNoteType } from '../../shared/ankiDraft';
import type { AnkiDraftEditOp } from '../../shared/ankiDraftEdit';
import { DEFAULT_REVERSE_FLAG_FIELD } from '../../shared/ankiCardDesign';
import DeckWorkbenchCardDesign from '../components/anki/DeckWorkbenchCardDesign';

const basic: AnkiDraftNoteType = {
  id: 'basic',
  name: 'Basic',
  kind: 'standard',
  css: '',
  fields: [
    { ord: 0, name: 'Front', sticky: false, rtl: false },
    { ord: 1, name: 'Back', sticky: false, rtl: false },
  ],
  templates: [
    { ord: 0, name: 'Card 1', qfmt: '{{Front}}', afmt: '{{FrontSide}}{{Back}}', bqfmt: '', bafmt: '' },
  ],
  sortFieldOrd: 0,
};

const clozeType: AnkiDraftNoteType = {
  ...basic,
  id: 'cloze',
  name: 'Cloze',
  kind: 'cloze',
  fields: [{ ord: 0, name: 'Text', sticky: false, rtl: false }],
  templates: [
    { ord: 0, name: 'Cloze', qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}', bqfmt: '', bafmt: '' },
  ],
};

function note(over: Partial<AnkiDraftNote> & { id: string }): AnkiDraftNote {
  return {
    guid: `g-${over.id}`,
    noteTypeId: 'basic',
    tags: [],
    marked: false,
    fields: [
      { ord: 0, name: 'Front', raw: 'ねこ', normalized: 'ねこ' },
      { ord: 1, name: 'Back', raw: 'cat', normalized: 'cat' },
    ],
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [],
    media: [],
    ...over,
  };
}

function draftOf(notes: AnkiDraftNote[], noteTypes = [basic, clozeType]): AnkiDraft {
  return {
    version: 1,
    source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp' },
    decks: [{ id: 'd1', name: 'Core', path: ['Core'], filtered: false }],
    noteTypes,
    notes,
    cards: [],
    diagnostics: [],
    counts: {
      notes: notes.length,
      cards: 0,
      decks: 1,
      noteTypes: noteTypes.length,
      reviews: 0,
      mediaReferences: 0,
    },
  };
}

let root: Root | null = null;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
});

/** Mount with a live draft the panel can actually replace, as the workbench does.
 *  The journal is kept the same way `DeckWorkbench` keeps it — appended on
 *  Apply, filtered on Remove — because the op is what reaches a destination:
 *  gate 14 found a design that changed the draft and journalled nothing, so the
 *  panel's card count was a promise no export could keep. */
function mount(initial: AnkiDraft): {
  current: () => AnkiDraft;
  journal: () => AnkiDraftEditOp[];
} {
  let draft = initial;
  let journal: AnkiDraftEditOp[] = [];
  const render = () => {
    root?.render(
      <DeckWorkbenchCardDesign
        draft={draft}
        onDraft={(next) => {
          draft = next;
          act(() => render());
        }}
        onDesignApplied={(op) => {
          journal = [...journal, op];
        }}
        onDesignRemoved={(noteTypeId, templateOrd) => {
          journal = journal.filter(
            (op) =>
              op.kind !== 'template-add'
              || op.noteTypeId !== noteTypeId
              || op.template.ord !== templateOrd,
          );
        }}
      />,
    );
  };
  act(() => {
    root = createRoot(host);
    render();
  });
  return { current: () => draft, journal: () => journal };
}

function select(label: string): HTMLSelectElement {
  const el = [...host.querySelectorAll('label')].find((l) => l.textContent?.startsWith(label));
  const found = el?.querySelector('select');
  if (!found) throw new Error(`no select under ${label}`);
  return found;
}

function button(text: string): HTMLButtonElement {
  const el = [...host.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!el) throw new Error(`no button "${text}" — have ${[...host.querySelectorAll('button')].map((b) => b.textContent).join(' | ')}`);
  return el as HTMLButtonElement;
}

function setSelect(el: HTMLSelectElement, value: string): void {
  act(() => {
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('DeckWorkbenchCardDesign', () => {
  it('states the card count before Apply, not after', () => {
    mount(draftOf([note({ id: 'n1' }), note({ id: 'n2' }), note({ id: 'n3' })]));
    const effect = host.querySelector('.wb-design-effect');
    // `t` is stubbed to key:values, so the numbers are the assertion.
    expect(effect?.textContent).toContain('ankiWorkbench.design.effect:3,3');
  });

  it('offers only standard note types, because cloze cannot take a template', () => {
    mount(draftOf([note({ id: 'n1' })]));
    const options = [...select('ankiWorkbench.design.noteType').options].map((o) => o.textContent);
    expect(options).toEqual(['Basic']);
  });

  it('adds the cards to the draft it hands back, and lists the design', () => {
    const live = mount(draftOf([note({ id: 'n1' }), note({ id: 'n2' })]));
    expect(live.current().cards).toHaveLength(0);

    act(() => button('ankiWorkbench.design.apply').click());

    expect(live.current().cards).toHaveLength(2);
    expect(live.current().noteTypes[0].templates).toHaveLength(2);
    expect(host.querySelector('.wb-design-applied-row')?.textContent).toContain(
      'ankiWorkbench.design.appliedRow:Card 2,2',
    );
  });

  it('removes the design and its cards again — the reverse transition', () => {
    const live = mount(draftOf([note({ id: 'n1' }), note({ id: 'n2' })]));
    act(() => button('ankiWorkbench.design.apply').click());
    expect(live.current().cards).toHaveLength(2);
    // The op, not just the draft: `buildApkgExportChanges` folds the journal and
    // nothing else, so a design missing from here is one no export can carry.
    // It holds the cards verbatim because the inverse must take back what THIS
    // design made and not what a later edit added at the same ord.
    expect(live.journal()).toHaveLength(1);
    const op = live.journal()[0]!;
    expect(op.kind).toBe('template-add');
    if (op.kind === 'template-add') {
      expect(op.template.ord).toBe(1);
      expect(op.cards.map((c) => c.noteId)).toEqual(['n1', 'n2']);
    }

    act(() => button('ankiWorkbench.design.remove').click());

    expect(live.current().cards).toHaveLength(0);
    expect(live.current().noteTypes[0].templates).toHaveLength(1);
    expect(host.querySelector('.wb-design-applied-row')).toBeNull();
    // Taken back out rather than inverted: there is no removal op for a template
    // the source package never had, and a journal still carrying the add would
    // claim an edit the user can see is gone.
    expect(live.journal()).toHaveLength(0);
  });

  it('disables Apply and marks the reason when the card would ask its own answer', () => {
    mount(draftOf([note({ id: 'n1' })]));
    // Front on both sides: the design is nonsense and must not be applicable.
    setSelect(select('ankiWorkbench.design.asks'), '0');

    expect(button('ankiWorkbench.design.apply').disabled).toBe(true);
    const blocking = host.querySelector('.wb-design-problem-blocking');
    expect(blocking?.textContent).toContain('same-field-both-sides');
  });

  it('says how many notes an optional design skips instead of reporting a clean run', () => {
    const flagged: AnkiDraftNoteType = {
      ...basic,
      fields: [...basic.fields, { ord: 2, name: DEFAULT_REVERSE_FLAG_FIELD, sticky: false, rtl: false }],
    };
    const withFlag = (id: string, flag: string) =>
      note({
        id,
        fields: [
          { ord: 0, name: 'Front', raw: 'ねこ', normalized: 'ねこ' },
          { ord: 1, name: 'Back', raw: 'cat', normalized: 'cat' },
          { ord: 2, name: DEFAULT_REVERSE_FLAG_FIELD, raw: flag, normalized: flag },
        ],
      });
    const live = mount(draftOf([withFlag('n1', 'y'), withFlag('n2', ''), withFlag('n3', '')], [flagged]));
    setSelect(select('ankiWorkbench.design.kind'), 'optional-reverse');

    const effect = host.querySelector('.wb-design-effect')?.textContent ?? '';
    expect(effect).toContain('ankiWorkbench.design.effect:1,3');
    expect(effect).toContain('ankiWorkbench.design.skippedUnflagged:2');

    act(() => button('ankiWorkbench.design.apply').click());
    // The negative control: only the flagged note gained a card.
    expect(live.current().cards).toHaveLength(1);
    expect(live.current().cards[0].noteId).toBe('n1');
  });

  it('shows the card the design would generate, as text and never as HTML', () => {
    mount(draftOf([note({ id: 'n1' })]));
    const sample = host.querySelector('.wb-design-sample-q');
    expect(sample?.textContent).toBe('cat');
    expect(host.querySelector('.wb-design-sample-q script')).toBeNull();
  });

  it('strips markup out of the sample rather than mounting a stranger\'s HTML', () => {
    const hostile = note({
      id: 'n1',
      fields: [
        { ord: 0, name: 'Front', raw: 'ねこ', normalized: 'ねこ' },
        { ord: 1, name: 'Back', raw: '<img src=x onerror=alert(1)>cat', normalized: 'cat' },
      ],
    });
    mount(draftOf([hostile]));
    expect(host.querySelector('.wb-design-sample-q')?.textContent).toBe('cat');
    expect(host.querySelectorAll('img')).toHaveLength(0);
  });
});
