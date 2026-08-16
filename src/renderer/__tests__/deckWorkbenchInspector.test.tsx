// @vitest-environment jsdom
//
// Gate 11's read-back half. `wrapEnrichProvenance` writes the dictionaries
// behind a value into the field itself, which is what lets the attribution
// survive an export and a reimport as ordinary markup — but until something
// renders it, the round trip is only true inside a test. This is that
// something, so the assertions here are about what a user can actually see.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}));

// The preview mounts a sandboxed iframe and renders templates; none of that is
// what this file is about, and jsdom's frame is slow enough to dominate the run.
vi.mock('../components/anki/DeckWorkbenchPreview', () => ({
  default: () => null,
}));

import type { AnkiDraft, AnkiDraftNote, AnkiDraftNoteType } from '../../shared/ankiDraft';
import { createEditJournal } from '../../shared/ankiDraftEdit';
import { wrapEnrichProvenance } from '../../shared/ankiEnrich';
import DeckWorkbenchInspector from '../components/anki/DeckWorkbenchInspector';

const basic: AnkiDraftNoteType = {
  id: 'basic',
  name: 'Basic',
  kind: 'standard',
  css: '',
  fields: [
    { ord: 0, name: 'Expression', sticky: false, rtl: false },
    { ord: 1, name: 'Meaning', sticky: false, rtl: false },
  ],
  templates: [
    { ord: 0, name: 'Card 1', qfmt: '{{Expression}}', afmt: '{{Meaning}}', bqfmt: '', bafmt: '' },
  ],
  sortFieldOrd: 0,
};

function note(meaningRaw: string): AnkiDraftNote {
  return {
    id: 'n1',
    guid: 'g-n1',
    noteTypeId: 'basic',
    tags: [],
    marked: false,
    fields: [
      { ord: 0, name: 'Expression', raw: '猫', normalized: '猫' },
      { ord: 1, name: 'Meaning', raw: meaningRaw, normalized: 'cat' },
    ],
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [],
    media: [],
  };
}

function draftOf(subject: AnkiDraftNote): AnkiDraft {
  return {
    version: 1,
    source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp' },
    decks: [{ id: 'd1', name: 'Core', path: ['Core'], filtered: false }],
    noteTypes: [basic],
    notes: [subject],
    cards: [],
    diagnostics: [],
    counts: { notes: 1, cards: 0, decks: 1, noteTypes: 1, reviews: 0, mediaReferences: 0 },
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

function mount(subject: AnkiDraftNote): void {
  act(() => {
    root = createRoot(host);
    root.render(
      <DeckWorkbenchInspector
        draft={draftOf(subject)}
        journal={createEditJournal()}
        note={subject}
        onEdit={vi.fn()}
      />,
    );
  });
}

function provenanceLines(): string[] {
  return [...host.querySelectorAll('.wb-inspector-provenance')].map(
    (el) => el.textContent ?? '',
  );
}

describe('DeckWorkbenchInspector provenance', () => {
  it('names the dictionaries a written field came from, on that field only', () => {
    mount(note(wrapEnrichProvenance('cat', ['JMdict (EN)'], 'inline')));

    expect(provenanceLines()).toEqual(['ankiWorkbench.inspector.provenance:JMdict (EN)']);
    // Field 0 was hand-typed, so it must stay unattributed.
    const attributed = host.querySelector('.wb-inspector-provenance');
    expect(attributed?.getAttribute('data-field-ord')).toBe('1');
  });

  it('lists every contributing source in written order', () => {
    mount(note(wrapEnrichProvenance('cat', ['JMdict (EN)', 'Jitendex'], 'inline')));

    expect(provenanceLines()).toEqual([
      'ankiWorkbench.inspector.provenance:JMdict (EN), Jitendex',
    ]);
  });

  it('renders nothing for a hand-typed field, and nothing for an unrelated span', () => {
    mount(note('cat'));
    expect(provenanceLines()).toEqual([]);

    act(() => root?.unmount());
    root = null;
    host.remove();
    host = document.createElement('div');
    document.body.appendChild(host);

    mount(note('<span class="highlight">cat</span>'));
    expect(provenanceLines()).toEqual([]);
  });

  it('drops the line when the wrapper is edited away, because it reads the raw value', () => {
    const wrapped = wrapEnrichProvenance('cat', ['JMdict (EN)'], 'inline');
    mount(note(wrapped));
    expect(provenanceLines()).toHaveLength(1);

    // The panel derives the line from `field.raw` on every render, so a note
    // whose wrapper is gone must render unattributed rather than stale.
    act(() => root?.unmount());
    root = null;
    host.remove();
    host = document.createElement('div');
    document.body.appendChild(host);

    mount(note('cat'));
    expect(provenanceLines()).toEqual([]);
  });

  it('survives the value being markup the dictionary produced', () => {
    mount(note(wrapEnrichProvenance('<i>cat</i>; feline', ['JMdict (EN)'], 'inline')));
    expect(provenanceLines()).toEqual(['ankiWorkbench.inspector.provenance:JMdict (EN)']);
  });
});
