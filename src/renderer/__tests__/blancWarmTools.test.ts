// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { touchWarm, trimWarm, unloadWarm } from '../components/blanc/blancWarmTools';

describe('touchWarm (LRU with pins)', () => {
  it('keeps the active tool plus the N most recent, unloading the rest', () => {
    let loaded: string[] = [];
    for (const id of ['a', 'b', 'c', 'd', 'e']) loaded = touchWarm(loaded, id, 2).loaded;
    expect(loaded).toEqual(['e', 'd', 'c']);
    const change = touchWarm(loaded, 'f', 2);
    expect(change.loaded).toEqual(['f', 'e', 'd']);
    expect(change.evicted).toEqual(['c']);
  });

  it('moves a re-opened tool to the front without evicting anything', () => {
    const change = touchWarm(['c', 'b', 'a'], 'a', 2);
    expect(change.loaded).toEqual(['a', 'c', 'b']);
    expect(change.evicted).toEqual([]);
  });

  it('never unloads a pinned tool, and pins do not use up the window', () => {
    let loaded: string[] = [];
    for (const id of ['pinned', 'b', 'c', 'd']) loaded = touchWarm(loaded, id, 1, ['pinned']).loaded;
    expect(loaded).toEqual(['d', 'c', 'pinned']);
  });

  it('with a budget of 0 holds only the active tool (and pins)', () => {
    expect(touchWarm(['a', 'b'], 'c', 0).loaded).toEqual(['c']);
    expect(touchWarm(['a', 'b'], 'c', 0, ['b']).loaded).toEqual(['c', 'b']);
  });

  it('treats a nonsense limit as 0', () => {
    expect(touchWarm(['a'], 'b', Number.NaN).loaded).toEqual(['b']);
    expect(touchWarm(['a'], 'b', -3).loaded).toEqual(['b']);
  });
});

describe('trimWarm / unloadWarm', () => {
  it('trims to the tool on screen and the pinned ones', () => {
    expect(trimWarm(['a', 'b', 'c', 'p'], 'a', ['p'])).toEqual({ loaded: ['a', 'p'], evicted: ['b', 'c'] });
  });

  it('with the toolbox off screen, trims everything unpinned', () => {
    expect(trimWarm(['a', 'b'], null)).toEqual({ loaded: [], evicted: ['a', 'b'] });
  });

  it('unloads one warm tool but never the one on screen', () => {
    expect(unloadWarm(['a', 'b'], 'b', 'a')).toEqual({ loaded: ['a'], evicted: ['b'] });
    expect(unloadWarm(['a', 'b'], 'a', 'a')).toEqual({ loaded: ['a', 'b'], evicted: [] });
    expect(unloadWarm(['a'], 'zzz', 'a').evicted).toEqual([]);
  });
});

describe('warm tools store', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    const settings = await import('../components/blanc/blancMechSettings');
    settings.resetBlancMechSettingsCacheForTests();
    const store = await import('../components/blanc/blancWarmTools');
    store.resetWarmToolsForTests();
  });

  it('follows the settings budget and Trim, and releases the toolbox when nothing is pinned', async () => {
    const { saveBlancMechSettings } = await import('../components/blanc/blancMechSettings');
    const store = await import('../components/blanc/blancWarmTools');
    saveBlancMechSettings({ warmToolLimit: 1, keepWarm: [] });
    for (const id of ['a', 'b', 'c']) store.touchWarmTool(id);
    expect(store.getWarmTools()).toMatchObject({ loaded: ['c', 'b'], active: 'c', toolboxRetained: true });
    store.leaveToolbox();
    expect(store.trimWarmTools()).toBe(2);
    expect(store.getWarmTools()).toMatchObject({ loaded: [], toolboxRetained: false, trimCount: 1 });
  });

  it('re-applies the budget when the setting drops', async () => {
    const { saveBlancMechSettings } = await import('../components/blanc/blancMechSettings');
    const store = await import('../components/blanc/blancWarmTools');
    saveBlancMechSettings({ warmToolLimit: 3, keepWarm: [] });
    for (const id of ['a', 'b', 'c', 'd']) store.touchWarmTool(id);
    expect(store.getWarmTools().loaded).toEqual(['d', 'c', 'b', 'a']);
    saveBlancMechSettings({ warmToolLimit: 0 });
    expect(store.getWarmTools().loaded).toEqual(['d']);
    expect(store.getWarmTools().toolboxRetained).toBe(false);
  });
});
