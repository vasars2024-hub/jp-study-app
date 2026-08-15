// @vitest-environment jsdom
//
// The sampler itself is covered in `shared/__tests__/ankiTemplateRender.test.ts`.
// What only a mounted test can prove is that the gallery states its own limits —
// how far it scanned, and which cases the deck has no example of — instead of
// presenting whatever it found as full coverage.
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

import type { AnkiDraft, AnkiDraftNote, AnkiDraftNoteType } from '../../shared/ankiDraft';
import DeckWorkbenchSamples from '../components/anki/DeckWorkbenchSamples';

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
    { ord: 0, name: 'Card 1', qfmt: '{{Front}}', afmt: '{{Back}}', bqfmt: '', bafmt: '' },
  ],
  sortFieldOrd: 0,
};

function note(id: string, front: string, back = 'b'): AnkiDraftNote {
  return {
    id,
    guid: `g-${id}`,
    noteTypeId: 'basic',
    tags: [],
    marked: false,
    fields: [
      { ord: 0, name: 'Front', raw: front, normalized: front },
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
    noteTypes: [basic],
    notes,
    cards: [],
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
const onOpenNote = vi.fn();

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  onOpenNote.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
});

function mount(draft: AnkiDraft, totalNotes = draft.counts.notes): void {
  act(() => {
    root = createRoot(host);
    root.render(
      <DeckWorkbenchSamples draft={draft} totalNotes={totalNotes} onOpenNote={onOpenNote} />,
    );
  });
}

const deck = () => draftOf([note('n1', 'a'), note('n2', ''), note('n3', 'x'.repeat(120))]);

describe('DeckWorkbenchSamples', () => {
  it('renders every sample in its own sandboxed frame', () => {
    mount(deck());
    const frames = [...host.querySelectorAll('iframe')];
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((f) => f.getAttribute('sandbox') === '')).toBe(true);
    expect(host.querySelectorAll('.wb-sample').length).toBe(frames.length);
  });

  it('labels each card with why it was chosen', () => {
    mount(deck());
    const reasons = [...host.querySelectorAll('.wb-sample-reason')].map((e) => e.textContent);
    expect(reasons.some((r) => r?.includes('reason.empty-render'))).toBe(true);
    expect(reasons.some((r) => r?.includes('reason.longest'))).toBe(true);
  });

  it('says the deck has no example of a case it could not find', () => {
    mount(deck());
    // This fixture has no cloze note type and no media at all.
    expect(host.textContent).toContain('ankiWorkbench.samples.absent');
    expect(host.textContent).toContain('reason.cloze');
  });

  it('distinguishes a full scan from a paged source', () => {
    mount(deck());
    expect(host.textContent).toContain('ankiWorkbench.samples.scannedAll:3');

    act(() => root?.unmount());
    root = null;
    host.remove();
    host = document.createElement('div');
    document.body.appendChild(host);

    // The draft holds three notes but the source has 900 — the sample is a claim
    // about the page, and saying "all 3" there would be the lie.
    mount(deck(), 900);
    expect(host.textContent).toContain('ankiWorkbench.samples.scannedPartial:3,900');
  });

  it('hands the note back to the Browser rather than editing in place', () => {
    mount(deck());
    const open = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('ankiWorkbench.samples.open'),
    );
    act(() => open?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onOpenNote).toHaveBeenCalledTimes(1);
    expect(typeof onOpenNote.mock.calls[0][0]).toBe('string');
  });

  it('flips every sample to the answer side at once', () => {
    mount(deck());
    const docs = () =>
      [...host.querySelectorAll('iframe')].map((f) => (f as HTMLIFrameElement).srcdoc);
    // Not "the first frame": the failing cards rank first, so the ordinary
    // note's front is somewhere in the set rather than at the head of it.
    expect(docs().some((d) => d.includes('>a<'))).toBe(true);
    expect(docs().every((d) => d.includes('>b<'))).toBe(false);

    const back = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('ankiWorkbench.preview.side.answer'),
    );
    act(() => back?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(
      [...host.querySelectorAll('iframe')].every((f) =>
        (f as HTMLIFrameElement).srcdoc.includes('>b<'),
      ),
    ).toBe(true);
  });
});
