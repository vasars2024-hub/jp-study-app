/**
 * An axe-style ARIA contract audit for jsdom (a11y2).
 *
 * The repo has no axe-core, and adding a dependency is out of scope, so this
 * covers the rules axe reports most for a React app and that jsdom can decide
 * from markup alone. Like `a11yWalk.ts` it is a harness: a surface's own test
 * mounts the surface, runs `auditAria(root)` and asserts the findings it must
 * not have. Paint-dependent rules (contrast, target size, visible focus) stay
 * with the CSS tests and the live harness.
 *
 * Rules (axe ids in brackets where one exists):
 *   - controls with no accessible name                        [button-name, input/select names]
 *   - role-required ARIA states: slider value, switch/checkbox/radio
 *     aria-checked, tab aria-selected, combobox aria-expanded  [aria-required-attr]
 *   - roles outside their required parent: tab, option, menuitem*, treeitem,
 *     row, gridcell/cell                                      [aria-required-parent]
 *   - id references (labelledby/describedby/controls/activedescendant) that
 *     point at nothing                                        [aria-valid-attr-value]
 *   - duplicate ids among referenced ids                       [duplicate-id-aria]
 *   - focusable content inside aria-hidden                    [aria-hidden-focus]
 *   - positive tabindex (breaks the visual focus order)        [tabindex]
 *   - an interactive control nested in another                [nested-interactive]
 *   - images without a text alternative                       [image-alt, svg-img-alt]
 *   - slider / progressbar values outside their range         [aria-valid-attr-value]
 */
import { accessibleName, interactiveControls, roleOf } from './a11yWalk';

export interface AriaFinding {
  rule: string;
  where: string;
  detail?: string;
}

function describe(el: Element): string {
  const classes = el.getAttribute('class');
  const first = classes ? `.${classes.trim().split(/\s+/)[0]}` : '';
  const role = el.getAttribute('role');
  const id = el.id ? `#${el.id}` : '';
  return `${el.tagName.toLowerCase()}${id}${first}${role ? `[role=${role}]` : ''}`;
}

const REQUIRED_PARENT: Record<string, string[]> = {
  tab: ['tablist'],
  option: ['listbox', 'group', 'combobox'],
  menuitem: ['menu', 'menubar', 'group'],
  menuitemcheckbox: ['menu', 'menubar', 'group'],
  menuitemradio: ['menu', 'menubar', 'group'],
  treeitem: ['tree', 'group'],
  row: ['grid', 'treegrid', 'table', 'rowgroup'],
  gridcell: ['row'],
  cell: ['row'],
  columnheader: ['row'],
  rowheader: ['row'],
};

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'textbox',
  'combobox', 'listbox', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'tab',
  'treeitem', 'searchbox',
]);

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function nativeChecked(el: Element): boolean {
  return el.tagName === 'INPUT' && ['checkbox', 'radio'].includes((el as HTMLInputElement).type);
}

function closestRole(el: Element, roles: string[]): boolean {
  let parent = el.parentElement;
  while (parent) {
    const role = roleOf(parent);
    if (role && roles.includes(role)) return true;
    // `presentation`/`none` and generic wrappers are transparent for ownership.
    parent = parent.parentElement;
  }
  // aria-owns can adopt a node from elsewhere.
  if (el.id) {
    for (const owner of el.ownerDocument.querySelectorAll('[aria-owns]')) {
      if ((owner.getAttribute('aria-owns') ?? '').split(/\s+/).includes(el.id)) {
        const role = roleOf(owner);
        if (role && roles.includes(role)) return true;
      }
    }
  }
  return false;
}

function isHidden(el: Element): boolean {
  return !!el.closest('[aria-hidden="true"], [hidden], [inert]');
}

export function auditAria(root: ParentNode & Node): AriaFinding[] {
  const out: AriaFinding[] = [];
  const doc = root.ownerDocument ?? (root as Document);
  const all = [...root.querySelectorAll('*')];

  // Names.
  for (const el of interactiveControls(root)) {
    if (isHidden(el)) continue;
    if (!accessibleName(el)) out.push({ rule: 'control-name', where: describe(el) });
  }

  for (const el of all) {
    if (isHidden(el)) continue;
    const role = roleOf(el);

    // Required states.
    if (role === 'slider' && el.tagName !== 'INPUT') {
      if (!el.hasAttribute('aria-valuenow')) out.push({ rule: 'aria-required-attr', where: describe(el), detail: 'slider without aria-valuenow' });
    }
    if ((role === 'switch' || role === 'checkbox' || role === 'radio' || role === 'menuitemcheckbox' || role === 'menuitemradio')
      && !nativeChecked(el) && !el.hasAttribute('aria-checked')) {
      out.push({ rule: 'aria-required-attr', where: describe(el), detail: `${role} without aria-checked` });
    }
    if (role === 'combobox' && el.tagName !== 'SELECT' && !el.hasAttribute('aria-expanded')) {
      out.push({ rule: 'aria-required-attr', where: describe(el), detail: 'combobox without aria-expanded' });
    }

    // Ranges.
    if (role === 'slider' || role === 'progressbar' || role === 'meter' || role === 'spinbutton') {
      const now = el.getAttribute('aria-valuenow');
      if (now != null) {
        const v = Number(now);
        const min = Number(el.getAttribute('aria-valuemin') ?? (role === 'spinbutton' ? -Infinity : 0));
        const max = Number(el.getAttribute('aria-valuemax') ?? (role === 'spinbutton' ? Infinity : 100));
        if (!Number.isFinite(v) || v < min || v > max) {
          out.push({ rule: 'aria-valid-attr-value', where: describe(el), detail: `${role} value ${now} outside ${min}..${max}` });
        }
      }
    }

    // Required parents.
    if (role && REQUIRED_PARENT[role] && !closestRole(el, REQUIRED_PARENT[role])) {
      out.push({ rule: 'aria-required-parent', where: describe(el), detail: `${role} outside ${REQUIRED_PARENT[role].join('/')}` });
    }

    // Id references.
    for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-activedescendant', 'aria-owns']) {
      const value = el.getAttribute(attr);
      if (!value) continue;
      for (const id of value.split(/\s+/).filter(Boolean)) {
        if (!doc.getElementById(id)) out.push({ rule: 'aria-valid-attr-value', where: describe(el), detail: `${attr} -> #${id} missing` });
      }
    }

    // Positive tabindex.
    const tabindex = el.getAttribute('tabindex');
    if (tabindex && Number(tabindex) > 0) out.push({ rule: 'tabindex', where: describe(el), detail: `tabindex=${tabindex}` });

    // Nested interactive.
    if (role && INTERACTIVE_ROLES.has(role) && role !== 'listbox' && role !== 'combobox') {
      const inner = el.querySelector(FOCUSABLE);
      // A native input inside its own <label role=…> is the label pattern, not nesting.
      if (inner && !isHidden(inner) && el.tagName !== 'LABEL') {
        out.push({ rule: 'nested-interactive', where: describe(el), detail: `contains ${describe(inner)}` });
      }
    }

    // Images.
    if (el.tagName === 'IMG' && !el.hasAttribute('alt') && !el.getAttribute('aria-label') && role !== 'presentation' && role !== 'none') {
      out.push({ rule: 'image-alt', where: describe(el) });
    }
    if (el.tagName.toLowerCase() === 'svg' && el.getAttribute('role') === 'img' && !accessibleNameOfSvg(el)) {
      out.push({ rule: 'svg-img-alt', where: describe(el) });
    }
  }

  // Focusable content inside aria-hidden.
  for (const hidden of root.querySelectorAll('[aria-hidden="true"]')) {
    for (const el of hidden.querySelectorAll(FOCUSABLE)) {
      if (el.closest('[inert]')) continue;
      out.push({ rule: 'aria-hidden-focus', where: describe(el), detail: `inside ${describe(hidden)}` });
    }
  }

  // Duplicate ids that ARIA references depend on.
  const seen = new Map<string, number>();
  for (const el of root.querySelectorAll('[id]')) seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
  for (const [id, count] of seen) {
    if (count < 2) continue;
    const referenced = root.querySelector(
      `[aria-labelledby~="${id}"], [aria-describedby~="${id}"], [aria-controls~="${id}"], [for="${id}"]`,
    );
    if (referenced) out.push({ rule: 'duplicate-id-aria', where: `#${id}`, detail: `${count} elements` });
  }

  return out;
}

function accessibleNameOfSvg(el: Element): string {
  const label = el.getAttribute('aria-label');
  if (label?.trim()) return label.trim();
  const title = el.querySelector('title');
  return title?.textContent?.trim() ?? '';
}

/** Tab order as a user would walk it: DOM order of focusable, visible elements. */
export function tabOrder(root: ParentNode): Element[] {
  return [...root.querySelectorAll(FOCUSABLE)].filter((el) => !isHidden(el));
}
