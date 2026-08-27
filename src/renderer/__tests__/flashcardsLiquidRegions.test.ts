/**
 * L7 — Flashcards adopts Liquid around an active task, never through it.
 *
 * This shared body also renders inside Blanc, so it cannot branch on a shell or
 * paint unconditional glass. ContextualSurface is inert in conventional/Blanc
 * hosts and is painted only by the sanctioned presentation seam.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(
  resolve(__dirname, '../components/flashcards/FlashcardsContent.tsx'),
  'utf8',
);
const REVIEW = SOURCE.slice(
  SOURCE.indexOf('export function FlashcardReviewMode'),
  SOURCE.indexOf('/** EPUB / advanced / Jiten mining sub-tool.'),
);
const CONTROL_STYLES = readFileSync(
  resolve(__dirname, '../components/flashcards/FlashcardsContent.css'),
  'utf8',
);

describe('Flashcards Liquid regions', () => {
  it('uses the shared contextual primitive for mode launchers and navigation', () => {
    expect(SOURCE).toContain("import { ContextualSurface } from '../liquid/LiquidSurface';");
    expect(SOURCE.match(/<ContextualSurface className="view-head">/g)).toHaveLength(4);
    expect(SOURCE).toContain('<ContextualSurface className="flash-tabs">');
    expect(SOURCE).toContain(
      '<ContextualSurface className="flash-tabs epub-mining-mode-tabs">',
    );
  });

  it('keeps review card and grading geometry outside contextual material', () => {
    // L7's timing invariant: opting the window into Liquid must not re-pad or
    // relocate the card or its answer controls during an active review.
    expect(REVIEW).toContain('className="flash-review-shell"');
    expect(REVIEW).toContain('className={`flash-card${cardFx');
    expect(REVIEW).toContain('className="flash-actions"');
    expect(REVIEW).not.toContain('ContextualSurface');
    expect(REVIEW).not.toContain('lq-liquid');
  });

  it('leaves dense import, editing, and virtualized deck work outside the contextual regions', () => {
    expect(SOURCE).toContain('<DeckImportPanel');
    expect(SOURCE).toContain('<CsvEditorPanel');
    expect(SOURCE).toContain('<VirtualList');
    expect(SOURCE).not.toMatch(/<ContextualSurface[^>]*>\s*<DeckImportPanel/s);
    expect(SOURCE).not.toMatch(/<ContextualSurface[^>]*>\s*<CsvEditorPanel/s);
  });

  it('gives compact deck controls a 32px pointer footprint without nested buttons', () => {
    expect(SOURCE).toContain("import './FlashcardsContent.css';");
    expect(SOURCE).toContain('className="flash-folder-chip-select"');
    expect(SOURCE).toContain('className="lib-chip-del"');
    expect(SOURCE).not.toContain('className="lib-chip-del"\n                    role="button"');
    expect(CONTROL_STYLES).toContain('.flash-view .flash-row-x');
    expect(CONTROL_STYLES).toMatch(/min-height:\s*32px/);
    expect(CONTROL_STYLES).toMatch(/min-width:\s*32px/);
    expect(CONTROL_STYLES).toMatch(/\.flash-view \.flash-strip \{[\s\S]*display:\s*grid/);
    expect(CONTROL_STYLES).toMatch(/@container \(max-width: 420px\)/);
    expect(CONTROL_STYLES).toMatch(
      /\.flash-view \.flash-group-head-toggle \{\s*flex-wrap:\s*wrap/,
    );
  });
});
