import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(resolve(__dirname, '../views/MediaCenterView.tsx'), 'utf8');
const CSS = readFileSync(resolve(__dirname, '../views/mediaCenter.css'), 'utf8');

describe('Media Center global search focus', () => {
  it('navigates on a query edit, never on focus alone', () => {
    const search = SOURCE.match(/<label className="mc-global-search">([\s\S]*?)<\/label>/)?.[1] ?? '';
    expect(search).not.toContain('onFocus=');
    expect(search).toMatch(/media\.setQuery\(event\.target\.value\);[\s\S]*tab !== 'library'[\s\S]*setTab\('library'\)/);
    expect(search).toContain("if (tab === 'music') music.setQuery(event.target.value)");
    expect(search).toContain("else if (tab === 'discover') discovery.setQuery(event.target.value)");
  });

  it('keeps shared Media actions at the 32px Liquid hit floor', () => {
    const rule = CSS.match(/\.mc-button \{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/min-height:\s*32px/);
  });
});
