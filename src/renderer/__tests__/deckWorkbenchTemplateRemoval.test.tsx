// @vitest-environment jsdom
//
// Recipe 17 is reachable (round-2 audit F, Anki item 14). The planner, writer
// and undo for `remove-template` existed, but no control queued the action and
// nothing gave the planner its audit, so the tray could never remove a
// duplicate template. Here: check the templates, queue the offered removal,
// and the plan Apply hands over drops the copy and its cards.
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

import type { AnkiDraft, AnkiDraftCard, AnkiDraftNote, AnkiDraftNoteType } from '../../shared/ankiDraft';
import { createEditJournal } from '../../shared/ankiDraftEdit';
import type { TrayPlan } from '../../shared/ankiChangeTray';
import DeckWorkbenchTray from '../components/anki/DeckWorkbenchTray';

const tpl = (ord: number, name: string, qfmt: string, afmt: string) => ({
  ord,
  name,
  qfmt,
  afmt,
  bqfmt: '',
  bafmt: '',
});

const twinned: AnkiDraftNoteType = {
  id: 'twinned',
  name: 'Twinned',
  kind: 'standard',
  css: '',
  fields: [
    { ord: 0, name: 'Front', sticky: false, rtl: false },
    { ord: 1, name: 'Back', sticky: false, rtl: false },
  ],
  templates: [
    tpl(0, 'Card 1', '{{Front}}', '{{FrontSide}}<hr id=answer>{{Back}}'),
    tpl(1, 'Card 1 copy', '{{ Front }}', '{{FrontSide}}<hr id=answer>{{ Back }}'),
  ],
  sortFieldOrd: 0,
};

function note(id: string): AnkiDraftNote {
  return {
    id,
    guid: `g-${id}`,
    noteTypeId: 'twinned',
    tags: [],
    marked: false,
    fields: [
      { ord: 0, name: 'Front', raw: id, normalized: id },
      { ord: 1, name: 'Back', raw: `${id}-back`, normalized: `${id}-back` },
    ],
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [`${id}:0`, `${id}:1`],
    media: [],
  };
}

function card(noteId: string, ord: number): AnkiDraftCard {
  return {
    id: `${noteId}:${ord}`,
    noteId,
    deckId: 'd1',
    ord,
    type: 'new',
    queue: 'new',
    due: 0,
    interval: 0,
    easeFactor: 0,
    reps: 0,
    lapses: 0,
    left: 0,
    flag: 'none',
    modifiedAtSec: 0,
  };
}

function twinDeck(): AnkiDraft {
  const notes = ['n1', 'n2', 'n3'].map(note);
  const cards = notes.flatMap((n) => [card(n.id, 0), card(n.id, 1)]);
  return {
    version: 1,
    source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp' },
    decks: [{ id: 'd1', name: 'Core', path: ['Core'], filtered: false }],
    noteTypes: [twinned],
    notes,
    cards,
    diagnostics: [],
    counts: { notes: 3, cards: 6, decks: 1, noteTypes: 1, reviews: 0, mediaReferences: 0 },
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

const byText = (selector: string, text: string): HTMLElement | undefined =>
  [...host.querySelectorAll<HTMLElement>(selector)].find((e) => e.textContent?.includes(text));

function click(el: HTMLElement | undefined): void {
  if (!el) throw new Error('missing element');
  act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

describe('recipe 17 in the tray', () => {
  it('checks the templates, queues the removal of the copy, and applies it', async () => {
    const draft = twinDeck();
    act(() => {
      root = createRoot(host);
      root.render(
        <DeckWorkbenchTray
          draft={draft}
          journal={createEditJournal()}
          selectedIds={[]}
          selectedCount={0}
          onApply={onApply}
        />,
      );
    });

    click(byText('button', 'ankiWorkbench.templates.check'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });

    const remove = byText('button', 'ankiWorkbench.templates.remove');
    expect(remove?.textContent).toContain('Card 1 copy');
    click(remove);

    expect(host.textContent).toContain('ankiWorkbench.tray.describe.remove-template:1,Twinned');
    expect(host.textContent).not.toContain('ankiWorkbench.tray.problem.template-no-audit');
    const apply = byText('button', 'ankiWorkbench.tray.apply') as HTMLButtonElement;
    expect(apply.disabled).toBe(false);
    click(apply);

    expect(onApply).toHaveBeenCalledTimes(1);
    const plan = onApply.mock.calls[0]![0];
    expect(plan.draft.noteTypes[0]!.templates.map((t) => t.name)).toEqual(['Card 1']);
    expect(plan.draft.cards).toHaveLength(3);
  });
});
