// @vitest-environment jsdom
/**
 * §2.5 driven on the real component.
 *
 * Nothing is mocked but the caller: the parser, the preview model, the Dialog
 * primitive and the real i18n catalog all run. The claim under test is the
 * gate's own words — "paste never writes straight to a list" — so every
 * assertion is about what `onConfirm` is handed, not about what the DOM looks
 * like.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadingListPastePreview } from '../components/reading/ReadingListPastePreview';
import type { ReadingPreviewImport } from '../../shared/readingListPreview';

const WORKED_EXAMPLE = [
  'yo these are the ones i said',
  '',
  '1. Kino no Tabi',
  '2. 君の膵臓をたべたい',
  '3. Convenience Store Woman (コンビニ人間) — Murakami? no, Sayaka Murata',
  '- ハリー・ポッター 1〜3巻',
  'also 「夜は短し歩けよ乙女」 if u can find it lol',
  'https://example.com/list/1234',
].join('\n');

let host: HTMLDivElement;
let root: Root;
let confirmed: ReadingPreviewImport[];
let cancelled: number;

function render(rawText = WORKED_EXAMPLE) {
  act(() => {
    root.render(
      <ReadingListPastePreview
        open
        rawText={rawText}
        listName="From a friend"
        onCancel={() => {
          cancelled += 1;
        }}
        onConfirm={(payload) => {
          confirmed.push(payload);
        }}
      />,
    );
  });
}

function titleInputs(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>('input[data-rl-title]')];
}

function checkboxes(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>('.rl-preview__include input')];
}

function buttonNamed(fragment: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find((button) =>
    (button.textContent ?? '').includes(fragment),
  );
  if (!found) {
    throw new Error(
      `no button containing "${fragment}"; have: ${[...document.querySelectorAll('button')]
        .map((b) => b.textContent)
        .join(' | ')}`,
    );
  }
  return found as HTMLButtonElement;
}

/** React tracks the value on the DOM node, so a plain assignment is swallowed. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  confirmed = [];
  cancelled = 0;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe('ReadingListPastePreview', () => {
  it('shows one editable row per parsed title, all ticked', () => {
    render();
    expect(titleInputs()).toHaveLength(5);
    expect(checkboxes().every((box) => box.checked)).toBe(true);
    expect(titleInputs().map((input) => input.value)).toContain('Kino no Tabi');
  });

  it('shows the source line beside every row', () => {
    render();
    const raw = [...document.querySelectorAll('.rl-preview__raw')];
    expect(raw).toHaveLength(5);
    expect(raw.map((node) => node.textContent ?? '').join('\n')).toContain('Kino no Tabi');
  });

  it('flags the triage entry without dropping it, and jumps to it', () => {
    render();
    expect(document.querySelectorAll('.rl-preview__row.is-triage')).toHaveLength(1);
    expect(checkboxes().filter((box) => !box.checked)).toHaveLength(0);
    act(() => buttonNamed('Show me').click());
    const focused = document.activeElement as HTMLInputElement | null;
    expect(focused?.dataset.rlTitle).toBeDefined();
    expect(focused?.value).toContain('コンビニ人間');
  });

  it('discloses the lines the parser ignored only when asked', () => {
    render();
    expect(document.querySelector('.rl-preview__droppedList')).toBeNull();
    const toggle = buttonNamed('ignored');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    act(() => toggle.click());
    const list = document.querySelector('.rl-preview__droppedList');
    expect(list).not.toBeNull();
    expect(list?.textContent ?? '').toContain('yo these are the ones i said');
  });

  it('writes NOTHING until Add is pressed — the gate itself', () => {
    render();
    type(titleInputs()[0], 'キノの旅');
    act(() => checkboxes()[1].click());
    act(() => buttonNamed('Show me').click());
    expect(confirmed).toHaveLength(0);
  });

  it('hands the caller the edits and the drops, with provenance intact', () => {
    render();
    const kino = titleInputs().find((input) => input.value === 'Kino no Tabi')!;
    const kinoIndex = Number(kino.dataset.rlTitle);
    type(kino, 'キノの旅');
    const droppedInput = titleInputs().find((input) => input.value === '君の膵臓をたべたい')!;
    const droppedIndex = Number(droppedInput.dataset.rlTitle);
    const droppedRow = droppedInput.closest('.rl-preview__row')!;
    act(() => droppedRow.querySelector<HTMLInputElement>('.rl-preview__include input')!.click());

    act(() => buttonNamed('Add ').click());

    expect(confirmed).toHaveLength(1);
    const payload = confirmed[0];
    expect(payload.rawText).toBe(WORKED_EXAMPLE);
    expect(payload.excludeLineIndexes).toEqual([droppedIndex]);
    const edited = payload.parsed.entries.find((entry) => entry.lineIndex === kinoIndex);
    expect(edited?.title).toBe('キノの旅');
    // Provenance is not editable and must survive the edit.
    expect(edited?.rawLine).toContain('Kino no Tabi');
  });

  it('refuses an empty selection and says why', () => {
    render();
    for (const box of checkboxes()) act(() => box.click());
    expect(buttonNamed('Add ').disabled).toBe(true);
    const alert = document.querySelector('[role="alert"]');
    expect(alert?.textContent ?? '').toContain('Nothing is selected');
    act(() => buttonNamed('Add ').click());
    expect(confirmed).toHaveLength(0);
  });

  it('refuses a title emptied by hand and says which', () => {
    render();
    type(titleInputs()[0], '   ');
    expect(buttonNamed('Add ').disabled).toBe(true);
    expect(document.querySelector('[role="alert"]')?.textContent ?? '').toContain('empty title');
  });

  it('Undo restores the previous parse one step at a time', () => {
    render();
    const first = titleInputs()[0];
    const index = first.dataset.rlTitle;
    type(first, 'one');
    type(titleInputs().find((i) => i.dataset.rlTitle === index)!, 'two');
    act(() => buttonNamed('Undo').click());
    expect(titleInputs().find((i) => i.dataset.rlTitle === index)!.value).toBe('one');
    act(() => buttonNamed('Undo').click());
    expect(titleInputs().find((i) => i.dataset.rlTitle === index)!.value).toBe('Kino no Tabi');
    expect(buttonNamed('Undo').disabled).toBe(true);
  });

  it('Ctrl+Z outside a field undoes, and inside one is left to the caret', () => {
    render();
    const index = titleInputs()[0].dataset.rlTitle!;
    type(titleInputs()[0], 'scratch');

    // Inside the field: the sheet must NOT consume it.
    const input = titleInputs().find((i) => i.dataset.rlTitle === index)!;
    const inField = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true });
    act(() => {
      input.dispatchEvent(inField);
    });
    expect(titleInputs().find((i) => i.dataset.rlTitle === index)!.value).toBe('scratch');

    // Outside it: the sheet's own undo.
    const body = document.querySelector('.rl-preview__body')!;
    act(() => {
      body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    });
    expect(titleInputs().find((i) => i.dataset.rlTitle === index)!.value).toBe('Kino no Tabi');
  });

  it('Reset throws every edit away in one step', () => {
    render();
    type(titleInputs()[0], 'wrong');
    act(() => checkboxes()[2].click());
    act(() => buttonNamed('Reset').click());
    expect(titleInputs().map((i) => i.value)).toContain('Kino no Tabi');
    expect(checkboxes().every((box) => box.checked)).toBe(true);
  });

  it('a Revert button appears only on a row the user touched', () => {
    render();
    expect([...document.querySelectorAll('button')].some((b) => b.textContent === 'Revert')).toBe(
      false,
    );
    type(titleInputs()[0], 'edited');
    expect([...document.querySelectorAll('button')].filter((b) => b.textContent === 'Revert')).toHaveLength(
      1,
    );
    act(() => buttonNamed('Revert').click());
    expect([...document.querySelectorAll('button')].some((b) => b.textContent === 'Revert')).toBe(
      false,
    );
  });

  it('says so honestly when a message holds no titles at all', () => {
    render('yo\nthanks\nlol');
    expect(titleInputs()).toHaveLength(0);
    expect(document.querySelector('.rl-preview__empty')?.textContent ?? '').toContain(
      'No titles were found',
    );
    expect(buttonNamed('Add ').disabled).toBe(true);
  });

  it('Cancel closes without confirming', () => {
    render();
    act(() => buttonNamed('Cancel').click());
    expect(cancelled).toBe(1);
    expect(confirmed).toHaveLength(0);
  });
});
