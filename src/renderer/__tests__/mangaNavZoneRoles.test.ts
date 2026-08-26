// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { navZoneRoles } from '../mangaReaderSettings';

const READER_SRC = readFileSync(
  path.join(__dirname, '..', 'views', 'MangaReader.tsx'),
  'utf8',
);

describe('navZoneRoles', () => {
  it('advances on the RIGHT in ltr and names each side by where it goes', () => {
    const z = navZoneRoles('ltr');
    expect(z.right.delta).toBe(1);
    expect(z.right.label).toBe('manga.nextPage');
    expect(z.left.delta).toBe(-1);
    expect(z.left.label).toBe('manga.prevPage');
  });

  // The defect this guards: the reader flipped the DELTA for rtl and left both aria-labels
  // pinned to the side, so the left edge advanced while announcing "Previous page".
  it('advances on the LEFT in rtl and moves the labels with the deltas', () => {
    const z = navZoneRoles('rtl');
    expect(z.left.delta).toBe(1);
    expect(z.left.label).toBe('manga.nextPage');
    expect(z.right.delta).toBe(-1);
    expect(z.right.label).toBe('manga.prevPage');
  });

  it.each(['ltr', 'rtl', 'ttb'] as const)(
    'keeps label and direction in agreement for %s',
    (layout) => {
      const z = navZoneRoles(layout);
      for (const zone of [z.left, z.right]) {
        expect(zone.label).toBe(zone.delta > 0 ? 'manga.nextPage' : 'manga.prevPage');
      }
      // Exactly one side advances, whatever the layout.
      expect(z.left.delta).toBe(-z.right.delta);
    },
  );
});

describe('MangaReader wiring', () => {
  it('names both nav zones from the helper rather than from the side', () => {
    // A literal side-named label is the shape of the original defect, so it is what is banned.
    const navZoneBlocks = READER_SRC.match(/className=\{`nav-zone[\s\S]{0,320}?\/>/g) ?? [];
    expect(navZoneBlocks).toHaveLength(2);
    for (const block of navZoneBlocks) {
      expect(block).toMatch(/aria-label=\{t\(navZones\.(left|right)\.label\)\}/);
      expect(block).toMatch(/onClick=\{\(\) => go\(navZones\.(left|right)\.delta\)\}/);
      expect(block).not.toMatch(/readerLayout === 'rtl'/);
    }
  });

  it('unmounts the nav zones when click-to-turn is off instead of leaving them inert', () => {
    // They are `position: absolute` over 28% of each edge of the stage, so a mounted-but-inert
    // zone swallowed every click on 56% of the page while still announcing a page turn.
    const gates = READER_SRC.match(/\{!isTtb && clickToTurnPages && \(/g) ?? [];
    expect(gates).toHaveLength(2);
    expect(READER_SRC).not.toMatch(/clickToTurnPages && go\(/);
  });
});
