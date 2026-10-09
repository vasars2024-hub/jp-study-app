// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXTENSION_DIR } from './extensionHarness';

/**
 * The popup's four Record buttons carried only `flex: 1`, so in Chrome they rendered as
 * white OS-default buttons inside the dark popup (seen live 2026-10-08). They must take
 * the popup's own button surface, like the action grid above them.
 */
describe('extension popup — record buttons', () => {
  const html = readFileSync(path.join(EXTENSION_DIR, 'popup.html'), 'utf8');
  const rule = /\.rec-row button\s*\{([^}]*)\}/.exec(html)?.[1] ?? '';

  it('styles the record row with the popup surface, not the OS default', () => {
    expect(rule).toMatch(/background:\s*var\(--panel\)/);
    expect(rule).toMatch(/color:\s*var\(--text\)/);
    expect(rule).toMatch(/border:\s*1px solid var\(--border\)/);
  });

  it('keeps Stop red over that surface', () => {
    expect(html).toMatch(/#rec-stop\s*\{[^}]*background:\s*#c62828/);
  });
});
