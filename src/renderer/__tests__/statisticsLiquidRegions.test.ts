import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const VIEW = readFileSync(new URL('../views/StatisticsView.tsx', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../components/stats/statsLiquid.css', import.meta.url), 'utf8');

describe('Statistics Liquid regions', () => {
  it('treats only the contextual command header as Liquid-eligible', () => {
    expect(VIEW).toContain("import { ContextualSurface } from '../components/liquid/LiquidSurface'");
    expect(VIEW).toContain('<ContextualSurface as="header" className="view-head stats-context-head">');
    expect(VIEW).toContain('</ContextualSurface>');

    // Dense data remains on the existing stable surfaces rather than becoming universal glass.
    expect(VIEW).toContain('<WordKnowledge />');
    expect(VIEW).toContain('<StatsCards state={state} />');
    expect(VIEW).toContain('<section className="stats-section">');
    expect(VIEW).not.toContain('<ContextualSurface as="section"');
  });

  it('reflows against the floating window rather than the desktop viewport', () => {
    expect(CSS).toContain('.stats-view {\n  container-type: inline-size;');
    expect(CSS).toContain('@container (max-width: 440px)');
    expect(CSS).not.toContain('@media');
  });

  it('keeps the compact Anki sync label on the shared pointer floor', () => {
    expect(CSS).toContain('.stats-view .wk-head > .btn.small {\n  min-height: var(--lq-hit-target);');
  });
});
