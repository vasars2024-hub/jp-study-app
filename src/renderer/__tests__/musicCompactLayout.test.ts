import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(resolve(__dirname, '..', 'views', 'mediaCenter.css'), 'utf8');

describe('Media Center music compact layout', () => {
  it('bounds the open secondary navigation group inside its scroll region', () => {
    const groupRule = CSS.match(/\.mc-nav-group\s*\{(?<body>[\s\S]*?)\}/)?.groups?.body ?? '';

    expect(groupRule).toMatch(/min-height:\s*40px/);
    expect(groupRule).toMatch(/overflow-y:\s*auto/);
  });

  it('wraps lyric recovery actions at the supported floating-window floor', () => {
    const compact = CSS.slice(CSS.indexOf('@container mc (max-width: 360px)'));

    expect(compact).toMatch(/\.mc-lyrics-frame \.music-hint-btns\s*\{[\s\S]*?max-width:\s*100%/);
    expect(compact).toMatch(/\.mc-lyrics-frame \.music-hint-btns\s*\{[\s\S]*?flex-wrap:\s*wrap/);
    expect(compact).toMatch(/\.mc-lyrics-frame \.music-hint-btns > button\s*\{[\s\S]*?white-space:\s*normal/);
  });
});
