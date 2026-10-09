/**
 * axe-core over a jsdom-mounted surface (a11y3).
 *
 * The companion to `ariaAudit.ts`: that file is the repo's own markup-only
 * contract (and stays, because it encodes a few house rules axe does not, such
 * as "a slider must carry aria-valuenow"); this one runs the real axe-core rule
 * engine so a surface is judged by the same rules a browser audit would use.
 *
 * Usage in a test file that declares `// @vitest-environment jsdom`:
 *
 *   const found = await axeViolations(host);
 *   expect(found).toEqual([]);
 *
 * Only `serious` and `critical` violations are returned by default. `minor` and
 * `moderate` findings are real but mostly page-level advice (heading order,
 * landmark coverage of a fragment) that does not hold for a component mounted
 * on its own.
 *
 * Rules switched off, and why. jsdom implements the DOM but not CSS layout or
 * paint: `getComputedStyle` sees only inline styles, every `getBoundingClientRect`
 * is 0x0, and nothing scrolls. A rule that needs any of those either reports
 * nothing useful or reports noise:
 *
 *   - color-contrast, color-contrast-enhanced, link-in-text-block
 *       need painted colours and backgrounds; jsdom resolves no stylesheet.
 *       Contrast is covered by the theme token tests and the forced-colors CSS.
 *   - target-size
 *       needs element geometry; covered by hitTargetFloor24.test.ts on the CSS.
 *   - scrollable-region-focusable
 *       needs scrollHeight > clientHeight; both are 0 in jsdom.
 *   - css-orientation-lock
 *       reads @media rules from loaded stylesheets; none are loaded.
 *   - meta-viewport, meta-viewport-large, document-title, html-has-lang,
 *     html-lang-valid, landmark-one-main, page-has-heading-one, region,
 *     bypass, frame-tested
 *       are page-level rules. A test mounts one surface into a bare <div>, so
 *       "the page has no <main>" or "content outside a landmark" is a fact about
 *       the test fixture, not the app. Landmarks are asserted directly by the
 *       shell tests instead.
 *
 * Everything else (names, roles, required attributes and parents, id
 * references, duplicate ids, nested interactive controls, focusable content
 * inside aria-hidden, form labels, list structure, table headers, aria-* value
 * validity, image alternatives) runs as axe ships it.
 */
import axe from 'axe-core';
import { auditAria } from './ariaAudit';

export type AxeImpact = 'minor' | 'moderate' | 'serious' | 'critical';

/** Rules that need layout, paint or a whole page; see the file header. */
export const AXE_JSDOM_DISABLED_RULES: readonly string[] = [
  'color-contrast',
  'color-contrast-enhanced',
  'link-in-text-block',
  'target-size',
  'scrollable-region-focusable',
  'css-orientation-lock',
  'meta-viewport',
  'meta-viewport-large',
  'document-title',
  'html-has-lang',
  'html-lang-valid',
  'landmark-one-main',
  'page-has-heading-one',
  'region',
  'bypass',
  'frame-tested',
];

const RANK: Record<AxeImpact, number> = { minor: 0, moderate: 1, serious: 2, critical: 3 };

export interface AxeOptions {
  /** Lowest impact to report. Default `serious`. */
  minImpact?: AxeImpact;
  /** Extra rule ids to disable for this call (justify each at the call site). */
  disable?: readonly string[];
}

export interface AxeFinding {
  rule: string;
  impact: AxeImpact;
  target: string;
  summary: string;
}

/** Raw findings, for tests that want to inspect them. */
export async function runAxe(root: Element, options: AxeOptions = {}): Promise<AxeFinding[]> {
  const rules: Record<string, { enabled: boolean }> = {};
  for (const id of [...AXE_JSDOM_DISABLED_RULES, ...(options.disable ?? [])]) rules[id] = { enabled: false };
  const result = await axe.run(root, {
    rules,
    resultTypes: ['violations'],
    // jsdom has no frames worth descending into, and iframes would only time out.
    iframes: false,
    elementRef: false,
  });
  const floor = RANK[options.minImpact ?? 'serious'];
  const out: AxeFinding[] = [];
  for (const violation of result.violations) {
    for (const node of violation.nodes) {
      const impact = (node.impact ?? violation.impact ?? 'minor') as AxeImpact;
      if (RANK[impact] < floor) continue;
      const summary = (node.failureSummary ?? '').split('\n').map((l) => l.trim()).filter(Boolean).slice(1, 2).join(' ');
      out.push({ rule: violation.id, impact, target: node.target.join(' '), summary });
    }
  }
  return out;
}

/** One line per finding, so `expect(...).toEqual([])` prints a readable diff. */
export async function axeViolations(root: Element, options: AxeOptions = {}): Promise<string[]> {
  const found = await runAxe(root, options);
  return found.map((f) => `${f.rule} [${f.impact}] ${f.target}${f.summary ? ` -- ${f.summary}` : ''}`);
}

/**
 * axe plus the repo's own markup audit, in one list. axe cannot see focusability
 * in jsdom (it reads geometry, and every rect is 0x0), so `aria-hidden-focus`
 * and friends would pass silently; `auditAria` decides them from markup alone.
 */
export async function a11yViolations(root: Element, options: AxeOptions = {}): Promise<string[]> {
  const axeLines = await axeViolations(root, options);
  const own = auditAria(root).map((f) => `aria:${f.rule} ${f.where}${f.detail ? ` (${f.detail})` : ''}`);
  return [...axeLines, ...own];
}
