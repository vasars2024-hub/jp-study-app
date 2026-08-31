/**
 * L7 — Notebook adopts Liquid for navigation and summaries, never for records.
 *
 * The view tabs, stream-count summary and folder navigation are contextual. The
 * 400-row history is a dense record, so it stays on the existing opaque anchor.
 *
 * **Scope narrowed at gate 7b** (`FILES_APP_PLAN.md`): Study OS's Notebook section
 * and its `NotebookView.tsx` are deleted, so every assertion that read that file
 * is gone with it. `NotebookContent.tsx` and `notebookLiquid.css` are NOT — Blanc's
 * own `notebook` tool renders them and is a separate surface. This file is now the
 * guard on the shared half only.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CONTENT = readFileSync(
  resolve(__dirname, '../components/notebook/NotebookContent.tsx'),
  'utf8',
);
const CSS = readFileSync(
  resolve(__dirname, '../components/notebook/notebookLiquid.css'),
  'utf8',
);

describe('Notebook Liquid regions', () => {
  it('uses the contextual primitive for navigation and the stream summary', () => {
    expect(CONTENT).toContain("import { ContextualSurface } from '../liquid/LiquidSurface';");
    expect(CONTENT).toContain('<ContextualSurface\n      as="nav"');
    expect(CONTENT).toContain('className="gx-notebook-views"');
  });

  it('preserves the tab-list landmark and interaction contract', () => {
    expect(CONTENT).toContain('role="tablist"');
    expect(CONTENT).toContain('role="tab"');
    expect(CONTENT).toContain('aria-selected={state.view === v}');
    expect(CONTENT).toContain('onClick={() => state.selectView(v)}');
    expect(CONTENT).toContain('startTransition(() => {');
    expect(CONTENT).toMatch(
      /startTransition\(\(\) => \{\s*setView\(next\);\s*setStream\('all'\);\s*setFolder\('all'\);/,
    );
  });

  it('keeps the timeline itself off the contextual primitive', () => {
    expect(CSS).toMatch(
      /\.gx-notebook-filters\[open\] \{[\s\S]*max-height: 220px;[\s\S]*overflow: auto;/,
    );
    expect(CONTENT).not.toContain('lq-liquid');
    expect(CONTENT.match(/<ContextualSurface/g)).toHaveLength(1);
    expect(CONTENT.indexOf('className="gx-notebook-list"')).toBeGreaterThan(
      CONTENT.indexOf('</ContextualSurface>'),
    );
  });

  it('keeps dense record actions on the shared 32px pointer floor', () => {
    expect(CONTENT).toContain("import './notebookLiquid.css';");
    expect(CSS).toMatch(
      /\.gx-notebook-folder,\n\.gx-notebook-lineage-btn \{\n {2}min-height: 32px;\n\}/,
    );
    // NEGATIVE HALF: the local rule does not inflate every button or pill in the app.
    expect(CSS).not.toMatch(/\.btn|button\s*\{/);
  });

  it('reflows from the app window width and preserves the wide two-column default', () => {
    expect(CSS).toContain('.gx-notebook {\n  container-type: inline-size;\n}');
    expect(CSS).toMatch(
      /@container \(max-width: 700px\) \{[\s\S]*\.gx-notebook-body:not\(\.gx-notebook-body-timeline\) \{\s*grid-template-columns: minmax\(0, 1fr\);/,
    );
    expect(CSS).toContain(
      '.gx-notebook-body-timeline {\n  grid-template-columns: minmax(0, 1fr);\n}',
    );
    expect(CSS).toContain('.gx-notebook-timeline {\n  min-width: 0;\n}');
    expect(CSS).toMatch(/\.gx-notebook-item\s*\{[^}]*content-visibility:\s*auto/s);
    expect(CSS).toMatch(
      /\.gx-notebook-item\s*\{[^}]*contain-intrinsic-block-size:\s*auto\s+88px/s,
    );
    expect(CSS).toMatch(
      /@container \(max-width: 320px\) \{[\s\S]*\.gx-lc-actions,[\s\S]*flex-wrap: wrap;[\s\S]*\.gx-notebook-lineage-btn,[\s\S]*max-width: 100%;/,
    );
    const globalCss = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    expect(globalCss).toContain(
      '.gx-notebook-body { display: grid; grid-template-columns: 200px 1fr;',
    );
  });
});
