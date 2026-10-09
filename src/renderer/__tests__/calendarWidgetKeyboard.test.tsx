// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CalendarWidget } from '../widgets/productivity';
import { auditAria } from './helpers/ariaAudit';

let root: Root | undefined;
const opened = vi.fn();

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  window.removeEventListener('os:open', opened);
  opened.mockClear();
  document.body.replaceChildren();
});

async function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<CalendarWidget />));
  window.addEventListener('os:open', opened);
  return host.querySelector<HTMLElement>('.wgt-cal')!;
}

/**
 * wid2: the widget used to be one `role="button"` holding the month buttons,
 * which made those buttons presentational — invisible to a screen reader. The
 * keyboard route to Calendar is now the month title, a real button between the
 * two month arrows; the rest of the widget stays clickable for the pointer.
 */
describe('calendar widget keyboard activation', () => {
  it('opens Calendar from the month title, a real button between the arrows', async () => {
    const widget = await mount();
    const buttons = [...widget.querySelectorAll('button')];
    expect(buttons.map((b) => b.className)).toEqual(['wgt-btn-icon', 'wgt-cal-open', 'wgt-btn-icon']);
    await act(async () => buttons[1].click());
    expect(opened).toHaveBeenCalledOnce();
    expect((opened.mock.calls[0][0] as CustomEvent).detail).toBe('calendar');
  });

  it('leaves month buttons alone, and a pointer click elsewhere still opens Calendar', async () => {
    const widget = await mount();
    const next = widget.querySelectorAll('button')[2];
    const label = widget.querySelector('.wgt-cal-head span')!;
    const initialMonth = label.textContent;
    await act(async () => { next.click(); });
    expect(label.textContent).not.toBe(initialMonth);
    expect(opened).not.toHaveBeenCalled();
    await act(async () => { (widget.querySelector('.wgt-cal-grid') as HTMLElement).click(); });
    expect(opened).toHaveBeenCalledOnce();
  });

  it('nests no control inside another (the month arrows are real to assistive tech)', async () => {
    const widget = await mount();
    expect(widget.getAttribute('role')).toBeNull();
    expect(auditAria(widget)).toEqual([]);
  });
});
