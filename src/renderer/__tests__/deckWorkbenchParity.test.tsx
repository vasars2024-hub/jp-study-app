// @vitest-environment jsdom
//
// The matrix itself is gated in `shared/__tests__/ankiParityMatrix.test.ts`.
// What only a mounted test can prove is that the surface is a READER of it: that
// it shows the destination's own answer rather than a merged one, that a
// `supported` row is not given an explanation it does not need, and that the
// refusal codes reach the screen as the words the error banner will use.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}));

import DeckWorkbenchParity from '../components/anki/DeckWorkbenchParity';
import { ANKI_PARITY_ROWS } from '../../shared/ankiParityMatrix';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = (destination: 'package' | 'connect') => {
  act(() => root.render(<DeckWorkbenchParity destination={destination} />));
};

const texts = (selector: string) =>
  [...host.querySelectorAll(selector)].map((el) => el.textContent ?? '');

describe('the parity panel reads the matrix rather than restating it', () => {
  it('renders every row once, on both destinations', () => {
    for (const destination of ['package', 'connect'] as const) {
      render(destination);
      expect(host.querySelectorAll('.wb-parity-row')).toHaveLength(ANKI_PARITY_ROWS.length);
      // Not a fixed 16: the assertion follows the matrix, so adding a row to
      // the matrix without the panel picking it up is what fails here.
      expect(ANKI_PARITY_ROWS.length).toBeGreaterThanOrEqual(16);
    }
  });

  it('answers for the destination it was given, and the two answers differ', () => {
    render('package');
    const asPackage = texts('.wb-parity-support');
    render('connect');
    const asConnect = texts('.wb-parity-support');
    expect(asPackage).not.toEqual(asConnect);

    // The difference is exactly the two capabilities a package writes and the
    // live commit refuses — not a general "live does less" vibe.
    const differing = asPackage
      .map((support, i) => (support === asConnect[i] ? null : ANKI_PARITY_ROWS[i].id))
      .filter(Boolean);
    expect(differing).toEqual(['deck-name', 'template-remove']);
  });

  it('explains a cell only when it will not write', () => {
    render('connect');
    const rows = [...host.querySelectorAll('.wb-parity-row')];
    rows.forEach((el, i) => {
      const row = ANKI_PARITY_ROWS[i];
      const supported = row.connect.support === 'supported';
      expect(!!el.querySelector('.wb-parity-why'), `${row.id} why`).toBe(!supported);
    });
    // The inverse control: at least one row must be on each side of that test,
    // or it passes trivially on a matrix that is all one thing.
    expect(texts('.wb-parity-why').length).toBeGreaterThan(0);
    expect(rows.length - texts('.wb-parity-why').length).toBeGreaterThan(0);
  });

  it('prints the refusal code the error banner would use, verbatim', () => {
    render('connect');
    const codes = texts('.wb-parity-code');
    expect(codes).toHaveLength(2);
    expect(codes.join(' ')).toContain('deck-rename-unsupported');
    expect(codes.join(' ')).toContain('template-remove-unsupported');
  });

  it('carries the package-only conditionals without downgrading their rows', () => {
    render('package');
    const conditionals = texts('.wb-parity-conditional');
    expect(conditionals).toHaveLength(2);
    expect(conditionals.join(' ')).toContain('deck-collation-unsupported');
    expect(conditionals.join(' ')).toContain('template-storage-unsupported');
    // Still supported: a conditional is a property of the source file, so the
    // row must not read as blocked because some older packages cannot store it.
    const deckName = [...host.querySelectorAll('.wb-parity-row')][
      ANKI_PARITY_ROWS.findIndex((r) => r.id === 'deck-name')
    ];
    expect(deckName.className).toContain('wb-parity-supported');
    expect(deckName.querySelector('.wb-parity-why')).toBeNull();
  });

  it('sums its own rows in the summary', () => {
    render('connect');
    const summary = host.querySelector('.wb-parity-counts')?.textContent ?? '';
    // The stub renders `key:v1,v2,v3`, so the counts are readable as numbers.
    const [supported, readOnly, blocked] = summary.split(':')[1].split(',').map(Number);
    expect(supported + readOnly + blocked).toBe(ANKI_PARITY_ROWS.length);
    expect(blocked).toBe(2);
  });
});
