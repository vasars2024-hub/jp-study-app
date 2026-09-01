import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(resolve(__dirname, '../views/MediaCenterView.tsx'), 'utf8');

describe('Media Center video progressive disclosure', () => {
  it('does not repeat the empty stage file action in the topbar', () => {
    const topbar = SOURCE.match(/<div className="mc-video-actions">([\s\S]*?)<\/div>/)?.[1] ?? '';
    expect(topbar).toMatch(/\{state\.src && \([\s\S]*mediaCenter\.action\.openVideo/);
    expect(topbar.match(/mediaCenter\.action\.openVideo/g)).toHaveLength(1);

    const empty = SOURCE.match(/!state\.src && \(([\s\S]*?)\n\s*\)\}/)?.[1] ?? '';
    expect(empty).toContain("t('mediaCenter.video.selectFile')");
    expect(empty).toContain("t('mediaCenter.video.browseFolder')");
  });
});
