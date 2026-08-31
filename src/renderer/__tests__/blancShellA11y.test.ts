import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const CSS = readFileSync(resolve(ROOT, 'theme/blanc-shell-a11y.css'), 'utf8');
const ENTRY = readFileSync(resolve(ROOT, 'blancMain.tsx'), 'utf8');

describe('Blanc native shell accessibility', () => {
  it('boots after the token-only adapter whose hit floor it consumes', () => {
    const adapter = ENTRY.indexOf("import './theme/blanc-liquid.css'");
    const a11y = ENTRY.indexOf("import './theme/blanc-shell-a11y.css'");
    expect(adapter).toBeGreaterThan(0);
    expect(a11y).toBeGreaterThan(adapter);
  });

  it('keeps top-bar pointer targets at 32px and clock text readable', () => {
    expect(CSS).toMatch(/\.blanc-root \.blanc-top \.focus-music-btn\s*\{[^}]*min-width:\s*var\(--lq-hit-target\);[^}]*min-height:\s*var\(--lq-hit-target\);/s);
    expect(CSS).toMatch(/\.blanc-root \.blanc-check\s*\{[^}]*min-height:\s*var\(--lq-hit-target\);/s);
    expect(CSS).toMatch(/\.blanc-root \.blanc-clock\s*\{[^}]*color:\s*var\(--blanc-muted\);/s);
  });
});
