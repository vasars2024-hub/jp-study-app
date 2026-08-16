// @vitest-environment jsdom
//
// The verdicts themselves are covered in `shared/__tests__/ankiMediaHealth.ts`.
// What only a mounted test can prove is the thing the real data forced: the
// panel states BOTH axes. One absent file cited by 11,084 of 11,086 notes is
// one download and eleven thousand broken cards, and a surface that shows
// either number alone tells the user the wrong story about the same deck.
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

import type {
  AnkiDraft,
  AnkiDraftMediaRef,
  AnkiDraftNote,
  AnkiDraftNoteType,
} from '../../shared/ankiDraft';
import DeckWorkbenchMedia from '../components/anki/DeckWorkbenchMedia';

const basic: AnkiDraftNoteType = {
  id: 'basic',
  name: 'Basic',
  kind: 'standard',
  css: '',
  fields: [{ ord: 0, name: 'Front', sticky: false, rtl: false }],
  templates: [
    { ord: 0, name: 'Card 1', qfmt: '{{Front}}', afmt: '{{Front}}', bqfmt: '', bafmt: '' },
  ],
  sortFieldOrd: 0,
};

function ref(over: Partial<AnkiDraftMediaRef> = {}): AnkiDraftMediaRef {
  return {
    reference: 'a.mp3',
    fileName: 'a.mp3',
    kind: 'audio',
    fieldOrd: 0,
    present: true,
    bytes: 4096,
    ...over,
  };
}

function note(id: string, media: AnkiDraftMediaRef[]): AnkiDraftNote {
  return {
    id,
    guid: `g-${id}`,
    noteTypeId: 'basic',
    tags: [],
    marked: false,
    fields: [{ ord: 0, name: 'Front', raw: id, normalized: id }],
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [],
    media,
  };
}

function draftOf(notes: AnkiDraftNote[], media: AnkiDraft['media']): AnkiDraft {
  return {
    version: 1,
    source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp' },
    decks: [{ id: 'd1', name: 'Core', path: ['Core'], filtered: false }],
    noteTypes: [basic],
    notes,
    cards: [],
    media,
    diagnostics: [],
    counts: {
      notes: notes.length,
      cards: 0,
      decks: 1,
      noteTypes: 1,
      reviews: 0,
      mediaReferences: 0,
    },
  };
}

let root: Root | null = null;
let host: HTMLDivElement;
const onQuery = vi.fn();

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  onQuery.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
});

function mount(draft: AnkiDraft): void {
  act(() => {
    root = createRoot(host);
    root.render(<DeckWorkbenchMedia draft={draft} onQuery={onQuery} />);
  });
}

/** The real shape, scaled down: one absent file, every note citing it. */
const silenceDeck = () =>
  draftOf(
    ['n1', 'n2', 'n3'].map((id) =>
      note(id, [ref({ fileName: '1sec_silence.mp3', present: false })]),
    ),
    { files: 1, bytes: 4096, unreferenced: 0, sized: true },
  );

describe('DeckWorkbenchMedia', () => {
  it('reports one file and the three notes it breaks, not one number or the other', () => {
    mount(silenceDeck());
    const summary = host.querySelector('.wb-media p')?.textContent ?? '';
    // files, size, defect FILES, affected NOTES — 1 file, 3 notes.
    expect(summary).toContain('ankiWorkbench.media.summary:1,');
    expect(summary).toContain(',1,3');
    expect(host.querySelectorAll('.wb-media-row').length).toBe(1);
    expect(host.querySelector('.wb-media-row code')?.textContent).toBe('1sec_silence.mp3');
    expect(host.querySelector('.wb-media-row .muted')?.textContent).toContain(
      'ankiWorkbench.media.affects:3',
    );
  });

  it('hands the Browser a query instead of offering to delete anything', () => {
    mount(silenceDeck());
    const buttons = [...host.querySelectorAll('.wb-media-filters button')];
    expect(buttons).toHaveLength(1);
    act(() => (buttons[0] as HTMLButtonElement).click());
    expect(onQuery).toHaveBeenCalledWith('media:missing');
    // Proposes, never deletes — recipe 9's rule, and removing media from a
    // package is not something the tray could undo.
    expect(host.textContent?.toLowerCase()).not.toContain('delete');
  });

  it('offers no filter for a verdict the deck does not have', () => {
    mount(
      draftOf([note('n1', [ref()])], { files: 1, bytes: 4096, unreferenced: 0, sized: true }),
    );
    expect(host.querySelectorAll('.wb-media-filters button')).toHaveLength(0);
    expect(host.querySelector('.wb-media p')?.textContent).toContain(
      'ankiWorkbench.media.clean',
    );
    expect(host.querySelectorAll('.wb-media-row')).toHaveLength(0);
  });

  it('says a source carries no media rather than reporting it as clean', () => {
    mount(draftOf([note('n1', [ref({ present: false })])], undefined));
    expect(host.textContent).toContain('ankiWorkbench.media.absent');
    expect(host.textContent).not.toContain('ankiWorkbench.media.clean');
  });

  it('reports reclaimable bytes and what a duplicate copies', () => {
    mount(
      draftOf(
        [
          note('n1', [ref()]),
          note('n2', [ref({ fileName: 'copy.mp3', duplicateOf: 'a.mp3', bytes: 4096 })]),
        ],
        { files: 2, bytes: 8192, unreferenced: 0, sized: true },
      ),
    );
    expect(host.textContent).toContain('ankiWorkbench.media.reclaimable:4 KB');
    expect(host.querySelector('.wb-media-row .muted')?.textContent).toContain(
      'ankiWorkbench.media.duplicateOf:a.mp3',
    );
  });

  it('names the files it does not list rather than silently truncating', () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      note(`n${i}`, [ref({ fileName: `gone${i}.mp3`, present: false })]),
    );
    mount(draftOf(many, { files: 0, bytes: 0, unreferenced: 0, sized: true }));
    expect(host.querySelectorAll('.wb-media-row')).toHaveLength(12);
    expect(host.textContent).toContain('ankiWorkbench.media.more:3');
  });
});
