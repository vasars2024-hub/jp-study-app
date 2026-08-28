import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const VIEW = readFileSync(new URL('../views/CalendarView.tsx', import.meta.url), 'utf8');
const CONTENT = readFileSync(
  new URL('../components/calendar/CalendarContent.tsx', import.meta.url),
  'utf8',
);
const CSS = readFileSync(
  new URL('../components/calendar/calendarLiquid.css', import.meta.url),
  'utf8',
);

describe('Calendar Liquid regions', () => {
  it('treats only the header and the transport as Liquid-eligible', () => {
    expect(VIEW).toContain(
      "import { ContextualSurface } from '../components/liquid/LiquidSurface'",
    );
    expect(VIEW).toContain(
      '<ContextualSurface as="header" className="view-head calendar-context-head">',
    );
    expect(CONTENT).toContain('<ContextualSurface className="cal-toolbar cal-context-toolbar">');
  });

  it('leaves the grids, the agenda and the event form on the work surface', () => {
    // §2.3 names calendars explicitly. Universal glass here is a failure, not a maximum.
    expect(CONTENT).toContain('className="cal-month-grid"');
    expect(CONTENT).not.toContain('<ContextualSurface className="cal-month-grid"');
    expect(CONTENT).not.toContain('<LiquidSurface');
    expect(VIEW).toContain('<CalendarBody state={state} />');
    expect(VIEW).toContain('{modal && <EventModal initial={modal} onClose={() => setModal(null)} />}');
  });

  it('anchors the date-input subgroup instead of putting a dense form on glass', () => {
    expect(CONTENT).toContain(
      "import { AnchorSurface, ContextualSurface } from '../liquid/LiquidSurface'",
    );
    expect(CONTENT).toContain('<AnchorSurface bare className="cal-nav">');
    expect(CONTENT).toContain('</AnchorSurface>');
  });

  it('keeps direct date entry discoverable without adding it to the default control scan', () => {
    expect(CONTENT).toContain('<details className="cal-date-tools">');
    expect(CONTENT).toContain("<summary>{t('calendar.jumpToDate')}</summary>");
    expect(CONTENT).toContain('className="cal-jump"');
    expect(CSS).toContain('.cal-context-toolbar .cal-date-tools > summary {');
    expect(CSS).toContain('min-height: var(--lq-hit-target);');
  });

  it('raises the transport controls to the shared pointer floor', () => {
    // Measured from the existing rules: the mode chips are 5px/12px on a 12px face and the
    // date jump 3px/6px, both about 24px against a 32px bar.
    expect(CSS).toContain('.cal-context-toolbar .cal-mode-btn,');
    expect(CSS).toContain('.cal-context-toolbar .cal-jump {\n  min-height: var(--lq-hit-target);');
    expect(CSS).toContain(
      '.cal-context-toolbar .cal-nav > .wgt-btn-icon {\n  min-width: var(--lq-hit-target);',
    );
  });

  it('reflows against the floating window rather than the desktop viewport', () => {
    expect(CSS).toContain('.calendar-view {\n  container-type: inline-size;');
    expect(CSS).toContain('@container (max-width: 520px)');
    // `.cal-header-label` carries a 160px floor in the base sheet; it must be released, or
    // the date jump leaves a narrow window entirely.
    expect(CSS).toContain('.cal-context-toolbar .cal-header-label {');
    expect(CSS).toContain('min-width: 0;');
    expect(CSS).toContain('@container (max-width: 300px)');
    expect(CSS).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(CSS).toContain('grid-template-columns: repeat(7, minmax(0, 1fr));');
    expect(CSS).not.toContain('@media');
  });

  it('hardcodes no shell palette into the shared calendar', () => {
    // Liquid is a composition language, not one palette: a shared component that names a
    // shell's colours breaks Aero, Wired and Blanc at once.
    expect(CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(CSS).not.toContain('rgba(');
  });
});
