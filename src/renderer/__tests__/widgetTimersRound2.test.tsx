// @vitest-environment jsdom
/**
 * Widgets, round 2:
 * - a running Pomodoro / Countdown / Stopwatch survives the widget being collapsed (the
 *   frame unmounts the body; the clocks lived in useState and came back at 25:00);
 * - a finished countdown chimes, even while collapsed;
 * - the calculator's invalid-expression state is translated, not the literal "Error".
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getTimer,
  idleTimer,
  resetTimerStoreForTests,
  setTimer,
  setTimerFinishedHandler,
  settleTimer,
  startTimer,
  tickTimers,
  timerRemainingMs,
} from '../widgets/timerStore';
import { Countdown } from '../widgets/productivity';
import { Calculator } from '../widgets/utility';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => resetTimerStoreForTests());

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
  resetTimerStoreForTests();
});

async function mount(node: React.ReactNode): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
  return host;
}

describe('widget timers', () => {
  it('are wall-clock based and settle once when time is up', () => {
    const running = startTimer(idleTimer('countdown', 60_000), 1_000);
    expect(timerRemainingMs(running, 31_000)).toBe(30_000);
    expect(settleTimer(running, 30_000).finished).toBe(false);
    const done = settleTimer(running, 61_000);
    expect(done.finished).toBe(true);
    expect(done.state.running).toBe(false);
    expect(done.state.finishedAt).toBe(61_000);
  });

  it('a pomodoro phase ends by flipping to the break length', () => {
    const work = startTimer({ ...idleTimer('pomodoro', 25 * 60_000) }, 0);
    const { state } = settleTimer(work, 25 * 60_000, 5 * 60_000);
    expect(state.phase).toBe('break');
    expect(state.durationMs).toBe(5 * 60_000);
  });

  it('a running countdown survives its body unmounting, and chimes while nothing shows it', async () => {
    const chime = vi.fn();
    setTimerFinishedHandler(chime);
    const host = await mount(<Countdown settings={{ minutes: 1 }} setSettings={() => undefined} size={{ w: 200, h: 120 }} instanceId="w1" />);
    const start = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Start');
    await act(async () => {
      start?.click();
    });
    expect(getTimer('w1')?.running).toBe(true);
    // Collapse: the frame unmounts the body.
    root?.unmount();
    root = null;
    expect(getTimer('w1')?.running).toBe(true);
    // Time passes with nothing mounted.
    const started = getTimer('w1');
    tickTimers((started?.startedAt ?? 0) + 61_000);
    expect(chime).toHaveBeenCalledWith('countdown');
    expect(getTimer('w1')?.finishedAt).not.toBeNull();
  });

  it('keeps separate state per widget instance', () => {
    setTimer('a', startTimer(idleTimer('stopwatch'), 0));
    setTimer('b', idleTimer('stopwatch'));
    expect(getTimer('a')?.running).toBe(true);
    expect(getTimer('b')?.running).toBe(false);
  });
});

describe('the calculator', () => {
  it('shows a translated message for an invalid expression, never the literal "Error" as input', async () => {
    const host = await mount(<Calculator />);
    const press = async (label: string) => {
      const button = [...host.querySelectorAll('button')].find((b) => b.textContent === label);
      await act(async () => {
        button?.click();
      });
    };
    await press('5');
    // "5/" does not parse.
    await press('/');
    await press('=');
    expect(host.querySelector('.wgt-calc-display')?.textContent).toBe('Invalid expression');
    await press('7');
    expect(host.querySelector('.wgt-calc-display')?.textContent).toBe('7');
  });
});
