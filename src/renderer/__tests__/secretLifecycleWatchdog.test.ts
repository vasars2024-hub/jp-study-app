// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The boot watchdog in `secretLifecycle.ts` used to check only the sequence id, so a boot that
 * ran to completion still flashed the "Safe fallback" splash ~5 s later. It must only fire when
 * the sequence is genuinely stuck. The status line is also carried as an i18n KEY now — the raw
 * English string was the boot overlay's accessible name in every language.
 */
describe('secret lifecycle watchdog', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
    document.documentElement.removeAttribute('data-materials');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not show the safe-fallback phase after a completed boot', async () => {
    const lifecycle = await import('../secretLifecycle');
    const phases: string[] = [];
    lifecycle.subscribeSecretLifecycle((s) => phases.push(s.phase));
    window.dispatchEvent(new CustomEvent('shell:softReboot'));
    vi.advanceTimersByTime(20000);
    expect(phases).toContain('active');
    expect(phases).not.toContain('safe-fallback');
    expect(lifecycle.getSecretLifecycleState().phase).toBe('active');
  });

  it('publishes an i18n key for every status line', async () => {
    const lifecycle = await import('../secretLifecycle');
    const keys = new Set<string>();
    lifecycle.subscribeSecretLifecycle((s) => keys.add(s.messageKey));
    window.dispatchEvent(new CustomEvent('shell:softReboot'));
    vi.advanceTimersByTime(20000);
    expect([...keys].length).toBeGreaterThan(2);
    for (const key of keys) expect(key).toMatch(/^aero\.lifecycle\./);
  });
});
