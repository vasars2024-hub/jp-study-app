/**
 * Round 3 "no ugly boxes": the class names that were written at call sites and never in any
 * stylesheet. Each rendered as Chromium's own control (the grey default button of the
 * Flashcards > Practice report was one of them). They are gone from the renderer; this keeps
 * them from coming back, and checks the replacement shapes still have their rules.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RENDERER = join(__dirname, '..');

function walk(dir: string, ext: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === '__devharness__' || name === 'node_modules') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, ext, out);
    else if (name.endsWith(ext)) out.push(path);
  }
  return out;
}

const DEAD = [
  'os-btn',
  'os-btn-primary',
  'fa-btn',
  'fa-btn-danger',
  'scr-btn',
  'scr-link-btn',
  'os-input',
  'unified-search-controls',
  'os-set-toggle-row',
];

describe('classes with no stylesheet', () => {
  const tsx = walk(RENDERER, '.tsx').map((path) => ({ path, src: readFileSync(path, 'utf8') }));
  const css = walk(RENDERER, '.css').map((path) => readFileSync(path, 'utf8')).join('\n');

  it.each(DEAD)('%s is not used in any className', (name) => {
    const re = new RegExp(`className=(?:"|\\{\\s*['"\`])(?:[^"'\`]*\\s)?${name}(?:\\s[^"'\`]*)?["'\`]`);
    // PreviewStage writes `class="os-input"` into its own iframe document with its own <style>.
    const users = tsx.filter((f) => re.test(f.src)).map((f) => f.path);
    expect(users).toEqual([]);
  });

  it('the shapes that replaced them are styled', () => {
    for (const selector of ['.ui-group', '.ui-control-row', '.ui-switch', '.ui-switch-row', '.ui-tile', '.ui-tile-list']) {
      expect(css, selector).toContain(`${selector} {`);
    }
  });
});
