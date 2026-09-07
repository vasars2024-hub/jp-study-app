import { describe, expect, it } from 'vitest';
import { planNetworkEmulation } from '../debugBridge';

/**
 * `/network`'s decision, tested where the mistake actually is.
 *
 * The route needs a live window, a CDP session and an Electron `Session`, so it is not testable
 * here. What IS pure — and what silently returns a plausible wrong answer — is deciding whether a
 * restore has anything to do. The natural reading is "did the caller ask for anything? no? then
 * skip", and under that reading `{clear:true}` on an offline window does nothing at all: the
 * emulation outlives the probe and the next worker measures a healthy app as one that cannot
 * reach the network. Every case below is written so that reading fails.
 */
describe('planNetworkEmulation', () => {
  it('turns both levers on when asked, and records them', () => {
    const plan = planNetworkEmulation({ offline: true, blackhole: true }, undefined);
    expect(plan).toMatchObject({ offline: true, blackhole: true, touchCdp: true, touchProxy: true });
    expect(plan.next).toEqual({ offline: true, blackhole: true });
  });

  it('drives CDP on a clear ONLY because the window is currently offline', () => {
    const plan = planNetworkEmulation({ clear: true }, { offline: true, blackhole: false });
    expect(plan.touchCdp).toBe(true);
    expect(plan.offline).toBe(false);
    expect(plan.next).toBeNull();
    // The control: the same clear on a window that was never offline has no CDP work to do,
    // so `touchCdp` is not simply hardcoded true for every clear.
    expect(planNetworkEmulation({ clear: true }, undefined).touchCdp).toBe(false);
  });

  it('always restores the proxy on a clear, even with no recorded blackhole', () => {
    // Asymmetric with CDP on purpose. An attach we never made cannot have changed anything, but
    // a proxy is process-wide state that a crashed probe can leave behind with no entry in the
    // map, and re-asserting the default costs nothing.
    expect(planNetworkEmulation({ clear: true }, undefined).touchProxy).toBe(true);
    expect(planNetworkEmulation({ clear: true }, { offline: false, blackhole: true }).touchProxy).toBe(true);
  });

  it('lets one lever be lifted while the other stays on', () => {
    const plan = planNetworkEmulation({ blackhole: true }, { offline: true, blackhole: true });
    // `offline` was not re-requested, so it comes down — and it reaches CDP to do that.
    expect(plan.offline).toBe(false);
    expect(plan.touchCdp).toBe(true);
    expect(plan.blackhole).toBe(true);
    expect(plan.next).toEqual({ offline: false, blackhole: true });
  });

  it('treats `clear` as beating any lever sent alongside it', () => {
    const plan = planNetworkEmulation({ clear: true, offline: true, blackhole: true }, undefined);
    expect(plan.offline).toBe(false);
    expect(plan.blackhole).toBe(false);
    expect(plan.next).toBeNull();
  });

  it('does nothing at all for an empty request against a clean window', () => {
    const plan = planNetworkEmulation({}, undefined);
    expect(plan).toEqual({
      offline: false,
      blackhole: false,
      touchCdp: false,
      touchProxy: false,
      next: null,
    });
  });

  it('only accepts a literal true, so a truthy string cannot take the app offline by accident', () => {
    const plan = planNetworkEmulation({ offline: 'false' as unknown as boolean }, undefined);
    expect(plan.offline).toBe(false);
    expect(plan.touchCdp).toBe(false);
  });
});
