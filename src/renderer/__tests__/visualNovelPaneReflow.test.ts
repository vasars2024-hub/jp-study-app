/**
 * Rubric category 2 — the VN workspace has to reflow to the PANE, not to the window.
 *
 * Measured live 2026-08-26 through the category-2 harness, which refused rather than scored:
 * `click:.visual-novel-summary-actions > button:last-of-type: occluded ... centre resolves to
 * div.mc-page`. At the Immersion window's shipped 820x580 with the library docked, the workspace
 * is a 392px content box; `.visual-novel-summary` is a nowrap flex row whose min-content is 602px,
 * and the implicit `auto` grid track floors at exactly that, so the row painted from x=1036 to
 * x=1163 against a window whose right edge is 1016. `document.elementFromPoint` at the Remove
 * button's own centre returned the window BEHIND Immersion — the button was not cramped, it was
 * outside the frame. Launch, Stop timer and Remove were all in that group, and Save progress
 * (`.visual-novel-progress`, min-content 602px for the same reason) was at x=1163 too.
 *
 * The five narrow-layout rules that would have prevented it existed the whole time, in a
 * `@media (max-width: 760px)`. `VisualNovelPanel.tsx`'s own layout note had already recorded why
 * that instrument is wrong here — the query reads the WINDOW while this panel renders inside the
 * Immersion floating window, so in a 392px pane inside a 1264px viewport it never fires. That note
 * fixed the outer grid track and left the inner rules on the broken instrument.
 *
 * jsdom does not lay out, so the numbers that scored this are the live ones in `L1_CLUNKINESS.md`.
 * What is guarded here is the INSTRUMENT: nothing inside the visual-novel panel may depend on a
 * viewport width to reflow, because the panel's width is not the viewport's. That is the general
 * form of the defect, not the five selectors that happened to carry it this time.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
const PANEL = readFileSync(resolve(__dirname, '../components/immersion/VisualNovelPanel.tsx'), 'utf8');

/** Body of the first at-rule whose prelude matches, brace-matched rather than regex-spanned. */
function atRuleBody(css: string, prelude: RegExp): string | null {
  const head = prelude.exec(css);
  if (!head) return null;
  let depth = 0;
  for (let i = head.index + head[0].length - 1; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(head.index, i + 1);
    }
  }
  return null;
}

/** Every viewport `@media` body in the sheet, with comments stripped so prose cannot match. */
function mediaBodies(css: string): string[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const bodies: string[] = [];
  const re = /@media[^{]*\{/g;
  let m = re.exec(bare);
  while (m) {
    const body = atRuleBody(bare.slice(m.index), /@media[^{]*\{/);
    if (body) bodies.push(body);
    m = re.exec(bare);
  }
  return bodies;
}

describe('the visual-novel workspace reflows to its own pane', () => {
  it('establishes nested inline-size containers for the layout and each column', () => {
    // The container has to be the ANCESTOR of what it sizes: an element cannot answer a
    // `@container` condition it establishes itself (agent.css §23 records that trap).
    expect(CSS).toMatch(/\.visual-novel-workspace \{[^}]*container-type: inline-size;[^}]*container-name: vnlayout;[^}]*\}/);
    expect(CSS).toMatch(/\.visual-novel-column \{[^}]*container-type: inline-size;[^}]*container-name: vnwork;[^}]*\}/);
    // The wrapper itself must shrink too; an implicit `auto` track floors at the widest child's
    // min-content (150px live) even when the compact document only gives the column 114px.
    expect(CSS).toMatch(/\.visual-novel-column \{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
  });

  it('lets both workspace tracks shrink and stacks them from the workspace container', () => {
    expect(CSS).toMatch(/\.visual-novel-workspace \{[^}]*grid-template-columns: minmax\(0, 3fr\) minmax\(0, 2fr\);/);
    const stack = atRuleBody(CSS, /@container vnlayout \(max-width: 900px\) \{/);
    expect(stack).toContain('.visual-novel-column { grid-column: 1 / -1; }');
  });

  it('leaves scrolling to the ReadingCanvas document and includes padding in its width', () => {
    // A second scroll container retained an obsolete scrollTop when the columns reflowed, painting
    // primary content behind the panel header. Content-box width also added the 24px padding to a
    // 100%-wide child at the compact floor. ReadingCanvas already owns the bounded scroll region.
    expect(CSS).toMatch(/\.visual-novel-workspace \{[^}]*box-sizing: border-box;[^}]*overflow: visible;/);
  });

  it('keeps capture and reading content before the setup column in DOM order', () => {
    const positions = [
      'visual-novel-column--primary',
      'visual-novel-summary',
      'visual-novel-capture',
      'visual-novel-reading-overlay',
      'visual-novel-column--setup',
      '<VisualNovelMetadataEditor',
      'visual-novel-progress',
      '<VisualNovelScriptImportPanel',
    ].map((marker) => PANEL.indexOf(marker));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('wraps the summary row instead of clipping its actions off the frame', () => {
    expect(CSS).toMatch(/\.visual-novel-summary \{[^}]*flex-wrap: wrap;/);
    expect(CSS).toMatch(/\.visual-novel-summary-actions \{[^}]*flex-wrap: wrap;/);
    // Without this the title grid keeps its own min-content and re-creates the overflow.
    expect(CSS).toMatch(/\.visual-novel-summary-title \{[^}]*min-width: 0;/);
  });

  it('keeps every narrow-layout rule on the pane container', () => {
    const body = atRuleBody(CSS, /@container vnwork \(max-width: 560px\) \{/);
    expect(body).not.toBeNull();
    for (const sel of [
      '.visual-novel-metadata-grid',
      '.visual-novel-community-form',
      '.visual-novel-sentence-fields',
      '.visual-novel-route-add',
      '.visual-novel-progress',
    ]) {
      expect(body).toContain(sel);
    }
  });

  it('leaves no visual-novel rule depending on the viewport width', () => {
    // The general form of the defect. A `.visual-novel-*` selector inside a viewport `@media`
    // is unreachable by construction, because this panel's width is the floating window's pane.
    const offenders = mediaBodies(CSS)
      .filter((b) => b.includes('.visual-novel-'))
      .map((b) => b.slice(0, 120));
    expect(offenders).toEqual([]);
  });
});
