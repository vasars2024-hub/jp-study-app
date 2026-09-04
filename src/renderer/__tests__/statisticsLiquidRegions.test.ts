import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const VIEW = readFileSync(new URL('../views/StatisticsView.tsx', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../components/stats/statsLiquid.css', import.meta.url), 'utf8');
const CONTENT = readFileSync(new URL('../components/stats/StatsContent.tsx', import.meta.url), 'utf8');

describe('Statistics Liquid regions', () => {
  it('treats only the contextual command header as Liquid-eligible', () => {
    expect(VIEW).toContain("import { ContextualSurface } from '../components/liquid/LiquidSurface'");
    expect(VIEW).toContain('<ContextualSurface as="header" className="view-head stats-context-head">');
    expect(VIEW).toContain('</ContextualSurface>');

    // Dense data remains on the existing stable surfaces rather than becoming universal glass.
    expect(VIEW).toContain('<WordKnowledge />');
    expect(VIEW).toContain('<StatsCards state={state} />');
    expect(VIEW).toContain('<section className="stats-section stats-by-book">');
    expect(VIEW).toContain('<section className="stats-section stats-by-show">');
    expect(VIEW).not.toContain('<ContextualSurface as="section"');
  });

  it('spends a wide window on a second column instead of an empty right margin', () => {
    // The parent carries the container because an element cannot query itself, and `:has`
    // keeps that off every other window body. A floating Statistics window has no AppChrome.
    expect(CSS).toContain(':where(.fwin-body, .ui-app-chrome__body):has(> .stats-view) {');
    expect(CSS).toContain('container: statsShell / inline-size;');
    expect(CSS).toContain('@container statsShell (min-width: 1040px)');
    expect(CSS).toContain('grid-auto-flow: row dense;');

    // Placement is by name, not by nth-child: books and shows are both conditional.
    expect(CONTENT).toContain('className="stats-section stats-knowledge"');
    expect(CSS).toContain('.stats-view > .stats-knowledge,\n  .stats-view > .stats-by-book {\n    grid-column: 1;');
    expect(CSS).toContain('.stats-view > .stats-recent-activity,\n  .stats-view > .stats-by-show {\n    grid-column: 2;');
  });

  it('reflows against the floating window rather than the desktop viewport', () => {
    expect(CSS).toContain('.stats-view {\n  container-type: inline-size;');
    expect(CSS).toContain('max-width: none;');
    expect(CSS).toContain('@container (max-width: 440px)');
    expect(CSS).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(CSS).toContain('.stats-view .stats-level-estimate');
    expect(CSS).not.toContain('@media');
  });

  it('keeps the compact Anki sync label on the shared pointer floor', () => {
    expect(CSS).toContain('.stats-view .wk-head > .btn.small {\n  min-height: var(--lq-hit-target);');
  });

  it('names Anki sync outcomes and gives every message a reversible close action', () => {
    // Four tones, not three: `anki:getIntervals` serves the cached snapshot on a failed
    // refresh, so "the counts are real but nothing was re-read" is a state of its own and
    // must not be painted as either a failure or a sync.
    expect(CONTENT).toContain("tone: 'busy' | 'error' | 'success' | 'stale';");
    expect(CONTENT).toContain("text: t('stats.wk.syncStale', { scanned: r.scanned ?? 0 }),");
    expect(CSS).toContain('.stats-view .wk-message.stale {');
    expect(CONTENT).toContain("role={message.tone === 'error' ? 'alert' : 'status'}");
    expect(CONTENT).toContain('aria-live="polite"');
    expect(CONTENT).toContain('className="btn small wk-message-close"');
    expect(CONTENT).toContain('onClick={() => setMessage(null)}');
    expect(CONTENT).toContain("{t('common.close')}");
  });

  it('keeps the safe recent-activity task visible and the destructive reset disclosed', () => {
    expect(VIEW).toContain('const recentActivityRef = useRef<HTMLElement>(null);');
    expect(VIEW).toContain('className="btn primary stats-recent-jump"');
    expect(VIEW).toContain("recentActivityRef.current?.scrollIntoView({ block: 'start' })");
    // Not `'<details className="stats-data-tools">'`: the disclosure grew a `ref` and an
    // `onToggle` when `2427124e` gave it light dismiss, JSX wrapped its props onto their own
    // lines, and this assertion failed on the FORMATTING while the contract it names was
    // intact. What it is actually for is that the destructive Reset stays disclosed, so match
    // the element and its class without pinning them to one line.
    expect(VIEW).toMatch(/<details\s+className="stats-data-tools"/);
    expect(VIEW).toContain('<summary className="btn">{t(\'stats.reset\')}</summary>');
    // The other half of the popover contract, and the reason the repair exists: a native
    // `<details>` closes only when its own summary is pressed again, so without light dismiss
    // the obvious way out — click elsewhere — activated whatever the panel had covered.
    // Measured live: the Reset panel overlapped "Sync from Anki" and `elementFromPoint` at that
    // button's centre returned `BUTTON.btn.danger`.
    expect(VIEW).toContain('useDismissableDisclosure(dataToolsRef, dataToolsOpen)');
    expect(VIEW).toContain('ref={recentActivityRef} className="stats-section stats-recent-activity"');
    expect(CSS).toContain('.stats-data-tools-panel {');
    expect(CSS).toContain('background: var(--panel);');
  });
});
