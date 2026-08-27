/**
 * L7 — Notebook adopts Liquid for navigation and summaries, never for records.
 *
 * The view tabs, stream-count summary, review/refresh actions and folder navigation
 * are contextual. Capture scripts and the 400-row history are dense records, so
 * they stay on the existing opaque anchors in both Study OS and Blanc.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const VIEW = readFileSync(resolve(__dirname, '../views/NotebookView.tsx'), 'utf8');
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
    expect(VIEW).toContain(
      "import { ContextualSurface } from '../components/liquid/LiquidSurface';",
    );
    expect(VIEW).toContain('<ContextualSurface as="details" className="gx-notebook-filters">');
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

  it('progressively discloses filters and keeps captured records outside them', () => {
    expect(VIEW).toMatch(
      /<ContextualSurface as="details" className="gx-notebook-filters">[\s\S]*<NotebookStreamCounts state=\{state\} \/>[\s\S]*<ContextualSurface as="div" className="gx-notebook-folders">[\s\S]*<NotebookFolders state=\{state\} \/>[\s\S]*<div className="gx-notebook-body gx-notebook-body-timeline">[\s\S]*<section className="gx-notebook-timeline">/,
    );
    expect(VIEW.indexOf('className="gx-notebook-actions"')).toBeLessThan(
      VIEW.indexOf('<NotebookViewTabs state={state} />'),
    );
    expect(VIEW).toContain('<LiveCaptionsPanel />');
    expect(VIEW).toContain('<NotebookTimeline state={state} onOpen={studyOsOpenHref} />');
    expect(VIEW.match(/<ContextualSurface/g)).toHaveLength(2);
    expect(CSS).toMatch(
      /\.gx-notebook-filters\[open\] \{[\s\S]*max-height: 220px;[\s\S]*overflow: auto;/,
    );
    expect(VIEW.indexOf('<section className="gx-notebook-timeline">')).toBeGreaterThan(
      VIEW.lastIndexOf('</ContextualSurface>'),
    );
    expect(VIEW).not.toContain('lq-liquid');
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
    expect(CSS).toMatch(
      /@container \(max-width: 320px\) \{[\s\S]*\.gx-lc-actions,[\s\S]*flex-wrap: wrap;[\s\S]*\.gx-notebook-lineage-btn,[\s\S]*max-width: 100%;/,
    );
    const globalCss = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    expect(globalCss).toContain(
      '.gx-notebook-body { display: grid; grid-template-columns: 200px 1fr;',
    );
  });
});
