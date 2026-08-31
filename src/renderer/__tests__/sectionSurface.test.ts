// @vitest-environment jsdom
/**
 * `openSectionSurface` — the claimed/unclaimed split, which is the whole
 * mechanism. A shell that listens but does NOT act must leave the fallback
 * available, or a widget's recovery button is dead in exactly the host that
 * needed it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openSectionSurface, markSectionOpenHandled, SECTION_OPEN_EVENT } from '../sectionSurface';

describe('openSectionSurface', () => {
  const popOut = vi.fn(async () => undefined);
  const listeners: EventListener[] = [];

  beforeEach(() => {
    popOut.mockClear();
    (window as unknown as { api: unknown }).api = { popOut };
  });

  afterEach(() => {
    for (const l of listeners.splice(0)) window.removeEventListener(SECTION_OPEN_EVENT, l);
    delete (window as unknown as { api?: unknown }).api;
  });

  const listen = (fn: EventListener): void => {
    listeners.push(fn);
    window.addEventListener(SECTION_OPEN_EVENT, fn);
  };

  it('falls back to the pop-out route when no shell owns the bus', () => {
    expect(openSectionSurface('music')).toBe(false);
    expect(popOut).toHaveBeenCalledWith('music');
  });

  it('a shell that marks the event handled suppresses the fallback', () => {
    const seen: unknown[] = [];
    listen((ev) => {
      seen.push((ev as CustomEvent<unknown>).detail);
      markSectionOpenHandled(ev);
    });
    expect(openSectionSurface('music')).toBe(true);
    expect(seen).toEqual(['music']);
    expect(popOut).not.toHaveBeenCalled();
  });

  it('a listener that does NOT act leaves the fallback in place', () => {
    listen(() => undefined);
    expect(openSectionSurface('music')).toBe(false);
    expect(popOut).toHaveBeenCalledWith('music');
  });

  it('refuses an empty section rather than popping out nothing', () => {
    expect(openSectionSurface('')).toBe(false);
    expect(popOut).not.toHaveBeenCalled();
  });

  it('does not throw when the host exposes no pop-out bridge', () => {
    delete (window as unknown as { api?: unknown }).api;
    expect(() => openSectionSurface('music')).not.toThrow();
  });
});
