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

  it('reserves the reset tray in flow rather than floating it over the Anki sync button', () => {
    // Comments are stripped first, on purpose. This stylesheet's own prose describes the
    // overlay geometry that was removed, and a raw-text guard would match the prose rather
    // than a declaration — a CSS comment failing a CSS test has produced a false finding in
    // this repo before.
    const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const trayStart = rules.indexOf('.stats-data-tools-panel {');
    expect(trayStart).toBeGreaterThan(-1);
    const tray = rules.slice(trayStart, rules.indexOf('}', trayStart));

    // Light dismiss cannot save a control the tray is sitting on: at Sync's own centre the
    // topmost node WAS the tray's `.btn.danger`, which is an inside press, so nothing
    // dismissed and the destructive button took the hit. Taking the tray out of the overlay
    // layer removes both symptoms at once.
    expect(tray).not.toMatch(/position\s*:\s*(absolute|fixed)/);
    expect(tray).not.toMatch(/z-index/);
    expect(tray).toContain('margin-top: var(--lq-space-2);');

    // One shared width for the summary and the tray, so the closed summary already reserves
    // what the open tray needs and the neighbouring "Last 14 days" button never moves.
    // Measured live: actions 628.7 x 256.3 and tray left 753 x 132 in BOTH states.
    expect(rules).toContain('--stats-tools-w: 132px;');
    expect(tray).toContain('min-width: var(--stats-tools-w);');
    const summaryStart = rules.indexOf('.stats-data-tools > summary {');
    expect(summaryStart).toBeGreaterThan(-1);
    expect(rules.slice(summaryStart, rules.indexOf('}', summaryStart))).toContain(
      'min-width: var(--stats-tools-w);',
    );
  });
});
