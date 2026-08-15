// @vitest-environment jsdom
//
// The renderer itself is covered in `shared/__tests__/ankiTemplateRender.test.ts`.
// What only a mounted test can prove is that the panel puts the untrusted HTML
// somewhere it cannot run, and that every axis the plan asks for — sibling card,
// side, viewport, theme — actually changes what is on screen.
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
import DeckWorkbenchPreview from '../components/anki/DeckWorkbenchPreview';

const basic: AnkiDraftNoteType = {
  id: 'basic',
  name: 'Basic',
  kind: 'standard',
  css: '.card { font-size: 20px; }',
  fields: [
    { ord: 0, name: 'Front', sticky: false, rtl: false },
    { ord: 1, name: 'Back', sticky: false, rtl: false },
  ],
  templates: [
    {
      ord: 0,
      name: 'Card 1',
      qfmt: '{{Front}}',
      afmt: '{{FrontSide}}<hr>{{Back}}',
      bqfmt: '',
      bafmt: '',
    },
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

function draftOf(notes: AnkiDraftNote[]): AnkiDraft {
  return {
    version: 1,
    source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp' },
    decks: [{ id: 'd1', name: 'Core', path: ['Core'], filtered: false }],
    noteTypes: [basic, clozeType],
    notes,
    cards: [],
    diagnostics: [],
    counts: {
      notes: notes.length,
      cards: 0,
      decks: 1,
      noteTypes: 2,
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

function mount(draft: AnkiDraft, subject: AnkiDraftNote): void {
  act(() => {
    root = createRoot(host);
    root.render(<DeckWorkbenchPreview draft={draft} note={subject} />);
  });
}

function frame(): HTMLIFrameElement {
  const el = host.querySelector('iframe');
  if (!el) throw new Error('no preview frame');
  return el as HTMLIFrameElement;
}

function click(text: string): void {
  const button = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
  if (!button) throw new Error(`no button matching ${text}`);
  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

describe('DeckWorkbenchPreview', () => {
  it('puts the untrusted render in a fully sandboxed frame, never in the document', () => {
    const n = note({
      id: 'n1',
      fields: [
        { ord: 0, name: 'Front', raw: '<script>alert(1)</script>ねこ', normalized: 'ねこ' },
        { ord: 1, name: 'Back', raw: 'cat', normalized: 'cat' },
      ],
    });
    mount(draftOf([n]), n);

    // `sandbox=""` is the empty allow-list: no scripts, no same-origin, no forms.
    expect(frame().getAttribute('sandbox')).toBe('');
    expect(frame().srcdoc).toContain('<script>alert(1)</script>');
    // And the deck's script never became a node in the app's own document.
    expect(host.querySelector('script')).toBeNull();
  });

  it('carries the note type CSS into the frame', () => {
    const n = note({ id: 'n1' });
    mount(draftOf([n]), n);
    expect(frame().srcdoc).toContain('.card { font-size: 20px; }');
  });

  it('flips between front and back in place', () => {
    const n = note({ id: 'n1' });
    mount(draftOf([n]), n);
    expect(frame().srcdoc).toContain('ねこ');
    expect(frame().srcdoc).not.toContain('<hr>cat');

    click('ankiWorkbench.preview.side.answer');
    expect(frame().srcdoc).toContain('<hr>cat');
  });

  it('changes the frame background when the theme switches', () => {
    const n = note({ id: 'n1' });
    mount(draftOf([n]), n);
    expect(frame().srcdoc).toContain('background:#ffffff');

    click('ankiWorkbench.preview.theme.dark');
    expect(frame().srcdoc).toContain('background:#2f2f31');
    expect(frame().srcdoc).not.toContain('background:#ffffff');
  });

  it('narrows the stage for the compact viewport', () => {
    const n = note({ id: 'n1' });
    mount(draftOf([n]), n);
    expect(host.querySelector('.wb-preview-stage')?.className).toContain('desktop');

    click('ankiWorkbench.preview.viewport.compact');
    expect(host.querySelector('.wb-preview-stage')?.className).toContain('compact');
  });

  it('offers one tab per sibling card and previews the one that is chosen', () => {
    const n = note({
      id: 'n1',
      noteTypeId: 'cloze',
      fields: [
        { ord: 0, name: 'Text', raw: '{{c1::猫}} と {{c2::犬}}', normalized: '猫 と 犬' },
      ],
    });
    mount(draftOf([n]), n);

    const tabs = [...host.querySelectorAll('.wb-preview-tab')].map((b) => b.textContent);
    expect(tabs).toHaveLength(2);
    expect(frame().srcdoc).toContain('[...]</span> と 犬');

    click('Cloze 2');
    expect(frame().srcdoc).toContain('猫 と <span class="cloze">[...]');
  });

  it('names each problem instead of counting them', () => {
    const n = note({
      id: 'n1',
      fields: [
        { ord: 0, name: 'Front', raw: '<img src="gone.png">x', normalized: 'x' },
        { ord: 1, name: 'Back', raw: 'cat', normalized: 'cat' },
      ],
      media: [
        { reference: 'gone.png', fileName: 'gone.png', kind: 'image', fieldOrd: 0, present: false },
      ],
    });
    mount(draftOf([n]), n);

    const problems = [...host.querySelectorAll('.wb-preview-problem')].map((li) => li.textContent);
    expect(problems.some((p) => p?.includes('problem.missing-media:gone.png'))).toBe(true);
  });

  it('says the card renders cleanly rather than showing an empty problem list', () => {
    const n = note({ id: 'n1' });
    mount(draftOf([n]), n);
    expect(host.querySelectorAll('.wb-preview-problem')).toHaveLength(0);
    expect(host.textContent).toContain('ankiWorkbench.preview.clean');
  });
});
