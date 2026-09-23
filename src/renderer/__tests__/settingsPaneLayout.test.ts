// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ZOOM_DEFAULT, ZOOM_MIN, clampZoom } from '../appZoom';

/**
 * Measured in the packaged build (2026-09-23): the Settings pane is a scrolling flex column, and
 * a flex column shrinks overflowing children to their min-height. The liquid page head's is 0, so
 * it collapsed to 0px and its title and intro painted over the first card on every page. The
 * rule that stops it has to stay.
 */
describe('Settings pane layout', () => {
  it('never shrinks the pane sections to fit the window', () => {
    const css = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    expect(css).toMatch(/\.os-set-pane-v2\s*>\s*\*\s*\{\s*flex-shrink:\s*0;/);
  });
});

describe('app zoom default', () => {
  it('opens a fresh profile at 80%, with room to go smaller', () => {
    expect(ZOOM_DEFAULT).toBe(0.8);
    expect(ZOOM_MIN).toBeLessThan(ZOOM_DEFAULT);
    expect(clampZoom(ZOOM_DEFAULT)).toBe(ZOOM_DEFAULT);
  });
});
