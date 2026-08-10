// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  agentSettingsRenderedTarget,
  createAgentSettingsAckScheduler,
  focusAgentSettingsRenderedTarget,
  normalizeAgentSettingsNavigationLink,
} from '../components/settings/agentSettingsNavigation';

afterEach(() => {
  document.body.replaceChildren();
});

/**
 * A host whose two clocks are inspected rather than run, so a test can prove
 * *which* one an attempt was scheduled on — the distinction the fix turns on.
 */
function fakeAckHost(initial: DocumentVisibilityState) {
  const frames: Array<() => void> = [];
  const timers: Array<{ ms: number }> = [];
  const timerCallbacks: Array<() => void> = [];
  const cancelledFrames: number[] = [];
  const clearedTimers: number[] = [];
  let visibility = initial;
  return {
    frames,
    timers,
    cancelledFrames,
    clearedTimers,
    setVisibility: (next: DocumentVisibilityState) => { visibility = next; },
    runFrame: (index: number) => frames[index](),
    runTimer: (index: number) => timerCallbacks[index](),
    host: {
      visibility: () => visibility,
      requestFrame: (callback: () => void) => frames.push(callback),
      cancelFrame: (handle: number) => { cancelledFrames.push(handle); },
      setTimer: (callback: () => void, ms: number) => {
        timerCallbacks.push(callback);
        return timers.push({ ms });
      },
      clearTimer: (handle: number) => { clearedTimers.push(handle); },
    },
  };
}

describe('Agent Settings navigation delivery', () => {
  it('accepts only a registered Settings page and exact highlighted control', () => {
    expect(normalizeAgentSettingsNavigationLink({
      section: 'settings',
      page: 'appearance',
      controlId: 'theme',
      highlight: true,
    })).toEqual({
      section: 'settings',
      page: 'appearance',
      controlId: 'theme',
      highlight: true,
    });
    expect(normalizeAgentSettingsNavigationLink({
      section: 'settings', page: 'appearance', controlId: 'unknown', highlight: true,
    })).toBeNull();
    expect(normalizeAgentSettingsNavigationLink({
      section: 'dictionary', page: 'entry/猫',
    })).toBeNull();
  });

  it('waits for the exact page, unique target, and visible highlight', () => {
    const pane = document.createElement('main');
    pane.dataset.settingsPage = 'appearance';
    const card = document.createElement('section');
    card.dataset.settingId = 'theme';
    pane.append(card);
    document.body.append(pane);
    const destination = normalizeAgentSettingsNavigationLink({
      section: 'settings', page: 'appearance', controlId: 'theme', highlight: true,
    });
    if (!destination) throw new Error('fixture destination did not normalize');

    expect(agentSettingsRenderedTarget(pane, destination)).toBeNull();
    card.classList.add('is-highlight');
    expect(agentSettingsRenderedTarget(pane, destination)?.scroll).toBe(card);
    pane.dataset.settingsPage = 'study';
    expect(agentSettingsRenderedTarget(pane, destination)).toBeNull();
    pane.dataset.settingsPage = 'appearance';
    pane.append(card.cloneNode(true));
    expect(agentSettingsRenderedTarget(pane, destination)).toBeNull();
  });

  it('scrolls the card and focuses its first interactive control', () => {
    const pane = document.createElement('main');
    pane.dataset.settingsPage = 'appearance';
    const card = document.createElement('section');
    card.dataset.settingId = 'theme';
    card.className = 'os-set-card is-highlight';
    const button = document.createElement('button');
    card.append(button);
    pane.append(card);
    document.body.append(pane);
    const scrollIntoView = vi.fn();
    Object.defineProperty(card, 'scrollIntoView', { value: scrollIntoView });
    const destination = normalizeAgentSettingsNavigationLink({
      section: 'settings', page: 'appearance', controlId: 'theme', highlight: true,
    });
    if (!destination) throw new Error('fixture destination did not normalize');
    const target = agentSettingsRenderedTarget(pane, destination);
    if (!target) throw new Error('fixture target did not resolve');

    focusAgentSettingsRenderedTarget(target);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' });
    expect(document.activeElement).toBe(button);
  });

  it('schedules on a clock the document actually runs', () => {
    // The cold-open regression. Chromium runs no requestAnimationFrame callbacks
    // for a hidden document, and a pop-out main has just opened on the user's
    // approval is routinely occluded — so scheduling the acknowledgement on rAF
    // meant it never ran at all, and main read that silence as a refusal.
    const host = fakeAckHost('hidden');
    const scheduler = createAgentSettingsAckScheduler(host.host, 100);
    const ran: string[] = [];

    scheduler.schedule(() => ran.push('hidden'));
    expect(host.frames).toHaveLength(0);
    expect(host.timers).toEqual([{ ms: 100 }]);
    host.runTimer(0);
    expect(ran).toEqual(['hidden']);

    // Visible again: frames are cheaper and land on the next paint, so the
    // choice is re-made per attempt rather than fixed when the window opened.
    host.setVisibility('visible');
    scheduler.schedule(() => ran.push('visible'));
    expect(host.timers).toHaveLength(1);
    expect(host.frames).toHaveLength(1);
    host.runFrame(0);
    expect(ran).toEqual(['hidden', 'visible']);
  });

  it('cancels outstanding work on both clocks when the window unmounts', () => {
    const host = fakeAckHost('visible');
    const scheduler = createAgentSettingsAckScheduler(host.host, 100);
    scheduler.schedule(() => undefined);
    host.setVisibility('hidden');
    scheduler.schedule(() => undefined);

    scheduler.cancelAll();
    expect(host.cancelledFrames).toEqual([1]);
    expect(host.clearedTimers).toEqual([1]);
  });

  it('forgets a handle once it has run, so cancelling does not reach a stale one', () => {
    const host = fakeAckHost('visible');
    const scheduler = createAgentSettingsAckScheduler(host.host, 100);
    scheduler.schedule(() => undefined);
    host.runFrame(0);

    scheduler.cancelAll();
    expect(host.cancelledFrames).toEqual([]);
  });

  it('focuses a page-only destination without inventing a control', () => {
    const pane = document.createElement('main');
    pane.dataset.settingsPage = 'appearance';
    pane.tabIndex = -1;
    document.body.append(pane);
    const destination = normalizeAgentSettingsNavigationLink({
      section: 'settings', page: 'appearance',
    });
    if (!destination) throw new Error('fixture destination did not normalize');
    const target = agentSettingsRenderedTarget(pane, destination);
    if (!target) throw new Error('fixture target did not resolve');

    focusAgentSettingsRenderedTarget(target);
    expect(document.activeElement).toBe(pane);
    expect(target.scroll).toBeNull();
  });
});
