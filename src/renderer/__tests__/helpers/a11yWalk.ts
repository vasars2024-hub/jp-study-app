/**
 * A parameterised accessibility walk over a mounted surface.
 *
 * Written for reading-lists §11.4's *"Real `<button>`s, list semantics,
 * labelled controls, visible focus"* row, but it takes any container — this is
 * a harness, not a probe. Point it at a rendered root and it reports findings;
 * a surface's own test decides which findings that surface must have none of.
 *
 * What it can and cannot do, stated so a green result is not over-read:
 *
 * - It computes a SIMPLIFIED accessible name (HTML-AAM's common cases:
 *   `aria-label`, `aria-labelledby`, a native `<label>`, own text for elements
 *   whose content is their name, `alt`, `title`, `placeholder`). It is not the
 *   full algorithm. It finds controls with NO name at all, which is the defect
 *   that actually ships; it does not judge whether a name is a good one.
 * - It runs in jsdom, so it sees markup, not paint. "Visible focus" is checked
 *   structurally — a focusable element either is a native control or carries
 *   the app's own `ui-focusable` class — and a CSS test is what proves the
 *   class paints anything.
 */

/** ARIA roles whose descendants are removed from the accessibility tree. */
const PRESENTATIONAL_CHILDREN = new Set([
  'button',
  'checkbox',
  'img',
  'math',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'progressbar',
  'radio',
  'scrollbar',
  'separator',
  'slider',
  'switch',
  'tab',
]);

/** The implicit role of the handful of elements this walk needs to know about. */
function implicitRole(el: Element): string | null {
  switch (el.tagName) {
    case 'BUTTON':
      return 'button';
    case 'A':
      return el.hasAttribute('href') ? 'link' : null;
    case 'SELECT':
      return el.hasAttribute('multiple') ? 'listbox' : 'combobox';
    case 'TEXTAREA':
      return 'textbox';
    case 'UL':
    case 'OL':
      return 'list';
    case 'LI':
      return 'listitem';
    case 'IMG':
      return 'img';
    case 'INPUT': {
      const type = (el as HTMLInputElement).type;
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'range') return 'slider';
      if (type === 'button' || type === 'submit' || type === 'reset') return 'button';
      return 'textbox';
    }
    default:
      return null;
  }
}

export function roleOf(el: Element): string | null {
  const explicit = el.getAttribute('role');
  return explicit ? explicit.trim().split(/\s+/)[0] : implicitRole(el);
}

/** Text content with `aria-hidden` subtrees removed, the way a reader sees it. */
function visibleText(el: Element): string {
  let out = '';
  for (const node of el.childNodes) {
    if (node.nodeType === 3) {
      out += node.textContent ?? '';
      continue;
    }
    if (node.nodeType !== 1) continue;
    const child = node as Element;
    if (child.getAttribute('aria-hidden') === 'true') continue;
    out += visibleText(child);
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Roles whose accessible name may come from their own content. */
const NAME_FROM_CONTENT = new Set([
  'button',
  'link',
  'heading',
  'listitem',
  'option',
  'tab',
  'menuitem',
  // a11y3: ARIA 1.2 names these from content too. Without them a
  // `<button role="radio">Cloud</button>` read as unnamed.
  'radio',
  'checkbox',
  'switch',
  'menuitemcheckbox',
  'menuitemradio',
  'treeitem',
  'gridcell',
  'row',
  'tooltip',
  'cell',
  'columnheader',
  'rowheader',
]);

export function accessibleName(el: Element): string {
  const label = el.getAttribute('aria-label');
  if (label && label.trim()) return label.trim();

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const doc = el.ownerDocument;
    const text = labelledBy
      .split(/\s+/)
      .map((id) => doc.getElementById(id))
      .filter((node): node is HTMLElement => Boolean(node))
      .map((node) => visibleText(node))
      .join(' ')
      .trim();
    if (text) return text;
  }

  if (el.id) {
    // Scanned rather than selected. `CSS.escape` is UNDEFINED in this jsdom, so
    // the obvious `label[for="${CSS.escape(id)}"]` throws — and it throws only
    // for elements that HAVE an id, which on this surface means only the two
    // panels that a click mounts. A walk of the resting surface passes.
    const native = [...el.ownerDocument.querySelectorAll('label[for]')].find(
      (label) => label.getAttribute('for') === el.id,
    );
    if (native) {
      const text = visibleText(native);
      if (text) return text;
    }
  }
  const wrapping = el.closest('label');
  if (wrapping) {
    const text = visibleText(wrapping);
    if (text) return text;
  }

  if (el.tagName === 'IMG') {
    const alt = el.getAttribute('alt');
    if (alt && alt.trim()) return alt.trim();
  }

  const role = roleOf(el);
  if (role && NAME_FROM_CONTENT.has(role)) {
    const text = visibleText(el);
    if (text) return text;
  }

  const title = el.getAttribute('title');
  if (title && title.trim()) return title.trim();

  // HTML-AAM's last resort for a text input, and deliberately last: a
  // placeholder disappears when you type, which is why it is a poor name and
  // not a missing one.
  const placeholder = el.getAttribute('placeholder');
  if (placeholder && placeholder.trim()) return placeholder.trim();

  return '';
}

export interface A11yFinding {
  /** A short, stable description of the offending node. */
  where: string;
  reason: string;
}

function describe(el: Element): string {
  const classes = el.getAttribute('class');
  const first = classes ? `.${classes.trim().split(/\s+/)[0]}` : '';
  const role = el.getAttribute('role');
  return `${el.tagName.toLowerCase()}${first}${role ? `[role=${role}]` : ''}`;
}

const INTERACTIVE = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Every control the name walk considers. Exported so a caller can assert the
 * walk found something — an empty findings list means nothing at all if the
 * selector matched nothing, and that is how a walk quietly stops working.
 */
export function interactiveControls(root: ParentNode): Element[] {
  return [...root.querySelectorAll(INTERACTIVE)].filter(
    (el) => !el.closest('[aria-hidden="true"]') && el.getAttribute('type') !== 'hidden',
  );
}

/** Every interactive control in `root` that has no accessible name at all. */
export function namelessControls(root: ParentNode): A11yFinding[] {
  const out: A11yFinding[] = [];
  for (const el of interactiveControls(root)) {
    if (accessibleName(el)) continue;
    out.push({ where: describe(el), reason: 'no accessible name' });
  }
  return out;
}

/**
 * ARIA roles placed inside an ancestor whose children are presentational.
 *
 * These are removed from the accessibility tree entirely, so they are worse
 * than useless: the markup asserts a semantic that no assistive technology will
 * ever report, and a reviewer reading the source concludes the surface is
 * covered. A `role="progressbar"` inside a `<button>` is the canonical case.
 */
export function rolesInsidePresentationalChildren(root: ParentNode): A11yFinding[] {
  const out: A11yFinding[] = [];
  for (const el of root.querySelectorAll('[role]')) {
    if (el.getAttribute('aria-hidden') === 'true') continue;
    let parent = el.parentElement;
    while (parent) {
      const role = roleOf(parent);
      if (role && PRESENTATIONAL_CHILDREN.has(role)) {
        out.push({
          where: describe(el),
          reason: `inside ${describe(parent)}, whose children are presentational`,
        });
        break;
      }
      parent = parent.parentElement;
    }
  }
  return out;
}

/**
 * Lists with no accessible name.
 *
 * A surface with several lists on it ("2 lists", "12 items", "4 items") gives a
 * screen-reader user no way to tell which is which. A list nested in a labelled
 * region is exempt only if the caller says so; this walk reports them all and
 * lets the surface's test decide.
 */
export function namelessLists(root: ParentNode): A11yFinding[] {
  const out: A11yFinding[] = [];
  for (const el of root.querySelectorAll('ul, ol, [role="list"]')) {
    if (el.getAttribute('aria-hidden') === 'true') continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    if (accessibleName(el)) continue;
    out.push({ where: describe(el), reason: 'list with no accessible name' });
  }
  return out;
}

/**
 * Focusable elements that neither are a native control nor carry the app's own
 * focus-ring class. `ui.css` sets `outline: none` on `.ui-focusable` and paints
 * the ring on `:focus-visible`, so the class is the app's contract.
 */
export function focusableWithoutRing(root: ParentNode): A11yFinding[] {
  const native = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A']);
  const out: A11yFinding[] = [];
  for (const el of root.querySelectorAll('[tabindex]:not([tabindex="-1"])')) {
    if (native.has(el.tagName)) continue;
    if (el.classList.contains('ui-focusable')) continue;
    out.push({ where: describe(el), reason: 'focusable with no focus-ring class' });
  }
  return out;
}
