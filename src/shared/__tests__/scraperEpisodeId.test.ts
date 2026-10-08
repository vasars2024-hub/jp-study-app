import { describe, expect, it } from 'vitest';
import { episodeIdAliases, episodeRowId } from '../scraperEpisodeId';

describe('episodeRowId', () => {
  it('carries season and kind so different episodes never collide', () => {
    const ids = new Set([
      episodeRowId('mal-1', 1, 'episode', 1),
      episodeRowId('mal-1', 2, 'episode', 1),
      episodeRowId('mal-1', 1, 'recap', 1),
      episodeRowId('mal-1', 1, 'special', 1),
    ]);
    expect(ids.size).toBe(4);
    expect(episodeRowId('mal-1', 1, 'episode', 1)).toBe('mal-1-s1-e1');
    expect(episodeRowId('mal-1', 2, 'special', 3)).toBe('mal-1-s2-special3');
  });

  it('treats a missing or nonsense season as season 1', () => {
    expect(episodeRowId('x', 0, 'episode', 5)).toBe('x-s1-e5');
    expect(episodeRowId('x', Number.NaN, 'episode', 5)).toBe('x-s1-e5');
  });
});

describe('episodeIdAliases', () => {
  it('maps a legacy stored row onto today\'s id', () => {
    const aliases = episodeIdAliases({ id: 'x-e2', seriesId: 'x', season: 1, kind: 'episode', number: 2 });
    expect(aliases).toContain('x-e2');
    expect(aliases).toContain('x-s1-e2');
  });

  it('does not make a season 2 row look like the legacy season 1 id', () => {
    const aliases = episodeIdAliases({ id: 'x-s2-e1', seriesId: 'x', season: 2, kind: 'episode', number: 1 });
    expect(aliases).toEqual(['x-s2-e1']);
  });
});
