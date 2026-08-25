import { describe, expect, it, vi } from 'vitest';
import { createRenderIdentityCache } from '../renderIdentityCache';

/**
 * These guard the property `React.memo` actually depends on: not "the value is
 * correct" but "the value is the SAME OBJECT as last render". A cache that
 * rebuilds an equal-but-fresh object passes every equality assertion and still
 * leaves the memo dead, which is the defect this module exists to fix.
 */
describe('createRenderIdentityCache', () => {
  it('returns the identical object for a repeated key, and builds once', () => {
    const build = vi.fn((id: string) => ({ id }));
    const cache = createRenderIdentityCache<string, null, { id: string }>(build);

    const first = cache.get('w1', null);
    const second = cache.get('w1', null);

    expect(second).toBe(first);
    expect(build).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(1);
  });

  it('keeps one entry per key without cross-talk', () => {
    const cache = createRenderIdentityCache<string, null, { id: string }>((id) => ({ id }));

    const a = cache.get('w1', null);
    const b = cache.get('w2', null);

    expect(b).not.toBe(a);
    expect(cache.get('w1', null)).toBe(a);
    expect(cache.get('w2', null)).toBe(b);
    expect(cache.size).toBe(2);
  });

  it('rebuilds when the stamp changes and holds the new value afterwards', () => {
    const cache = createRenderIdentityCache<string, string, { id: string; section: string }>(
      (id, section) => ({ id, section }),
    );

    const dictionary = cache.get('w1', 'dictionary');
    const video = cache.get('w1', 'video');

    expect(video).not.toBe(dictionary);
    expect(video.section).toBe('video');
    expect(cache.get('w1', 'video')).toBe(video);
    // Stamping replaces rather than accumulates — one live value per key.
    expect(cache.size).toBe(1);
  });

  it('treats an unchanged stamp as unchanged even when it is undefined or NaN', () => {
    const cache = createRenderIdentityCache<string, number | undefined, object>(() => ({}));

    const undef = cache.get('w1', undefined);
    expect(cache.get('w1', undefined)).toBe(undef);

    // Object.is, not ===, so a NaN stamp does not rebuild forever.
    const nan = cache.get('w2', Number.NaN);
    expect(cache.get('w2', Number.NaN)).toBe(nan);
  });

  it('prunes keys that are no longer live and reports how many it dropped', () => {
    const cache = createRenderIdentityCache<string, null, { id: string }>((id) => ({ id }));
    const kept = cache.get('w1', null);
    cache.get('w2', null);
    cache.get('w3', null);

    expect(cache.prune(['w1'])).toBe(2);
    expect(cache.size).toBe(1);
    // The survivor keeps its identity: pruning is eviction, not a reset.
    expect(cache.get('w1', null)).toBe(kept);
  });

  it('prune accepts a Set and drops nothing when everything is live', () => {
    const cache = createRenderIdentityCache<string, null, object>(() => ({}));
    cache.get('w1', null);
    cache.get('w2', null);

    expect(cache.prune(new Set(['w1', 'w2']))).toBe(0);
    expect(cache.size).toBe(2);
  });

  it('a closed key that reopens builds a fresh value rather than a stale closure', () => {
    const cache = createRenderIdentityCache<string, null, { id: string }>((id) => ({ id }));
    const before = cache.get('w1', null);
    cache.prune([]);

    expect(cache.size).toBe(0);
    expect(cache.get('w1', null)).not.toBe(before);
  });
});

/**
 * The DesktopShell wiring in miniature: handlers must survive a re-render with
 * their identity intact AND still call the latest version of a function that is
 * re-declared every render. Capturing the function directly instead of reading
 * it through a ref satisfies the first and breaks the second.
 */
describe('the handler-bundle shape DesktopShell builds', () => {
  it('keeps handler identity across renders while dispatching to the latest action', () => {
    const first = vi.fn();
    const actionsRef = { current: { focus: first } };
    const cache = createRenderIdentityCache<string, string, { onFocus: () => void }>((id) => ({
      onFocus: () => actionsRef.current.focus(id),
    }));

    const render1 = cache.get('w1', 'dictionary');
    // A second render re-declares `focus`, exactly as DesktopShell does.
    const second = vi.fn();
    actionsRef.current = { focus: second };
    const render2 = cache.get('w1', 'dictionary');

    expect(render2).toBe(render1);
    render2.onFocus();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('w1');
  });
});
