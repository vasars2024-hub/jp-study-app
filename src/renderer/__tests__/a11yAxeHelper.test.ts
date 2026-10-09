// @vitest-environment jsdom
/**
 * a11y3 — the axe helper itself: it must catch the defects the suites rely on
 * it to catch in jsdom, and must not report the layout-only rules it disables.
 * Without this, a green suite could mean "axe did not run".
 */
import { afterEach, describe, expect, it } from 'vitest';
import { AXE_JSDOM_DISABLED_RULES, runAxe } from './helpers/axeAudit';

function fixture(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('axe helper', () => {
  it('reports the serious/critical defects the suites depend on', async () => {
    const host = fixture(`
      <button></button>
      <input type="text">
      <select><option>a</option></select>
      <div role="button" tabindex="0"><a href="#x">inner</a></div>
      <div aria-hidden="true"><button>hidden but focusable</button></div>
      <ul><div>not a list item</div></ul>
      <div role="slider" tabindex="0" aria-label="v"></div>
      <span aria-checked="maybe" role="checkbox" tabindex="0">c</span>
      <img src="x.png">
      <div role="tab" aria-selected="true">orphan tab</div>
      <p aria-labelledby="nowhere" id="dup">a</p><p id="dup">b</p>
    `);
    const rules = new Set((await runAxe(host)).map((f) => f.rule));
    // Not in this list: `aria-hidden-focus`. axe decides "focusable" partly from
    // geometry, and every jsdom rect is 0x0, so it does not fire here. That is
    // why the suites keep running `auditAria` (helpers/ariaAudit.ts), whose
    // markup-only aria-hidden-focus rule does.
    for (const rule of [
      'button-name', 'label', 'select-name', 'nested-interactive',
      'list', 'aria-required-attr', 'aria-valid-attr-value', 'image-alt', 'aria-required-parent',
    ]) {
      expect(rules, `expected ${rule}`).toContain(rule);
    }
  });

  it('is quiet on clean markup and never reports a disabled rule', async () => {
    const host = fixture(`
      <nav aria-label="Main"><ul><li><a href="#a">A</a></li></ul></nav>
      <label>Name <input type="text"></label>
      <button type="button" aria-label="Close">x</button>
      <p style="color:#777;background:#888">low contrast, but jsdom cannot judge it</p>
    `);
    const found = await runAxe(host, { minImpact: 'minor' });
    expect(found.filter((f) => AXE_JSDOM_DISABLED_RULES.includes(f.rule))).toEqual([]);
    expect(found.filter((f) => f.impact === 'serious' || f.impact === 'critical')).toEqual([]);
  });
});
