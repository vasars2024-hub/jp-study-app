// @vitest-environment jsdom
/**
 * Round 3 "no ugly boxes": the shared shapes that replace a box inside a box.
 *
 * - `Group` is a real fieldset (the legend still names its controls) whose
 *   description sits directly under the title, never somewhere else.
 * - `Tile` is the launcher shape — icon, title, one-line description attached by
 *   `aria-describedby` — and can carry an action as its accessible name.
 * - The stylesheet gives class-less controls the design-system look in the
 *   default theme only, at zero specificity, and resets fieldset frames.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ControlRow, Group, Tile, TileList } from '../components/ui';

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
});

async function render(node: ReactNode): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
}

describe('Group', () => {
  it('is a frameless fieldset: legend first, description right under it, then the controls', async () => {
    await render(
      <Group title="Account" description="Who you are signed in as.">
        <ControlRow>
          <input aria-label="Name" />
          <button type="button">Save</button>
        </ControlRow>
      </Group>,
    );
    const group = host.querySelector('fieldset.ui-group');
    expect(group).toBeTruthy();
    const [legend, desc, row] = [...(group?.children ?? [])];
    expect(legend.tagName).toBe('LEGEND');
    expect(legend.textContent).toBe('Account');
    expect(desc.className).toBe('ui-group__desc');
    expect(row.className).toBe('ui-control-row');
  });

  it('omits the title and description when not given', async () => {
    await render(<Group>body</Group>);
    expect(host.querySelector('legend')).toBeNull();
    expect(host.querySelector('.ui-group__desc')).toBeNull();
  });
});

describe('Tile', () => {
  it('names the action, shows the noun and attaches its description', async () => {
    const onClick = vi.fn();
    await render(
      <TileList>
        <li>
          <Tile aria-label="Start learning" icon={<svg />} title="Learn" description="Meet new cards." onClick={onClick} />
        </li>
      </TileList>,
    );
    const list = host.querySelector('ul.ui-tile-list.ui-tile-list--grid');
    expect(list).toBeTruthy();
    const tile = host.querySelector<HTMLButtonElement>('button.ui-tile');
    expect(tile?.getAttribute('aria-label')).toBe('Start learning');
    expect(tile?.getAttribute('type')).toBe('button');
    expect(tile?.querySelector('.ui-tile__title')?.textContent).toBe('Learn');
    const desc = document.getElementById(tile?.getAttribute('aria-describedby') ?? '');
    expect(desc?.textContent).toBe('Meet new cards.');
    expect(tile?.contains(desc ?? null)).toBe(true);
    await act(async () => tile?.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('reports selection only when it is a selectable tile', async () => {
    await render(
      <>
        <Tile title="Plain" />
        <Tile title="On" selected />
      </>,
    );
    const [plain, on] = [...host.querySelectorAll('button.ui-tile')];
    expect(plain.hasAttribute('aria-pressed')).toBe(false);
    expect(on.getAttribute('aria-pressed')).toBe('true');
    expect(on.classList.contains('is-selected')).toBe(true);
  });
});

describe('ui.css control floor', () => {
  const css = readFileSync(join(__dirname, '..', 'components', 'ui', 'ui.css'), 'utf8');
  const floor = css.slice(css.indexOf('Round 3'));

  it('styles class-less buttons, fields and selects, guarded off Aero, Wired and Blanc', () => {
    expect(floor).toMatch(/button:where\(:not\(\[class\]\)\):where\(:not\(\.blanc-root \*\)\)/);
    expect(floor).toMatch(/select:not\(\[class\]\)/);
    expect(floor).toMatch(/textarea:not\(\[class\]\)/);
    // every bare-element rule sits behind the default-theme guard
    const bareRules = floor.split('}').filter((r) => /(^|\s)(button|fieldset|legend):where|select:not\(\[class\]\)/.test(r));
    expect(bareRules.length).toBeGreaterThan(4);
    for (const rule of bareRules) {
      expect(rule).toContain(":where(html:not([data-materials='aero']):not([data-materials='wired']))");
    }
  });

  it('paints native checkboxes and radios as the Fluent box, never un-hiding a hidden one', () => {
    const rule = floor.slice(floor.indexOf("input[type='checkbox']:not([role='switch']), input[type='radio']"));
    const first = rule.slice(0, rule.indexOf('}'));
    expect(first).toContain(':where(:not([hidden]))');
    expect(first).toContain('appearance: none');
    expect(floor).toMatch(/:checked::before \{[^}]*border-left: 2px solid #fff/);
    // a styled switch is never repainted as a box
    expect(first).toContain(":not([role='switch'])");
  });

  it('never un-hides a hidden bare button', () => {
    expect(floor).toContain('button:where(:not([class]):not([hidden]))');
  });

  it('removes the fieldset frame and gives native checkboxes the accent', () => {
    expect(floor).toMatch(/fieldset:where\(:not\(\.blanc-root \*\)\) \{[^}]*border: 0;/);
    expect(floor).toMatch(/:root \{\s*accent-color: var\(--accent\);/);
  });
});
