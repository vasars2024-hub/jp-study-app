// @vitest-environment jsdom
/**
 * Widgets, round 2:
 * - a running Pomodoro / Countdown / Stopwatch survives the widget being collapsed (the
 *   frame unmounts the body; the clocks lived in useState and came back at 25:00);
 * - a finished countdown chimes, even while collapsed;
 * - the calculator's invalid-expression state is translated, not the literal "Error".
 */
import { act, useState } from 'react';
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
  withDuration,
} from '../widgets/timerStore';
import { Countdown, Pomodoro } from '../widgets/productivity';
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
  vi.useRealTimers();
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
  it.each([
    ['workMin', 0, 90],
    ['breakMin', 1, 60],
    ['minutes', 0, 999],
  ] as const)('caps typed %s at the displayed maximum', async (setting, inputIndex, maximum) => {
    const Widget = setting === 'minutes' ? Countdown : Pomodoro;
    function TimerWithSettings() {
      const [settings, setSettings] = useState<Record<string, unknown>>({});
      return <Widget settings={settings} setSettings={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
        size={{ w: 200, h: 240 }} instanceId="bounded" />;
    }
    const host = await mount(<TimerWithSettings />);
    const input = host.querySelectorAll('input')[inputIndex];
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '10000');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(input.value).toBe(String(maximum));
    if (setting === 'breakMin') {
      // Complete focus to verify the capped setting reaches the next phase.
      await act(async () => {
        const focus = getTimer('bounded')!;
        setTimer('bounded', startTimer(focus, 0));
        tickTimers(focus.durationMs);
      });
    }
    expect(getTimer('bounded')?.durationMs).toBe(maximum * 60_000);
  });

  it.each(['countdown', 'pomodoro'] as const)('finishes an expired %s when Pause beats the next ticker callback', async (kind) => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const chime = vi.fn();
    setTimerFinishedHandler(chime);
    const Widget = kind === 'countdown' ? Countdown : Pomodoro;
    const host = await mount(<Widget settings={{ minutes: 1, workMin: 1, breakMin: 5 }} setSettings={() => undefined} size={{ w: 200, h: 120 }} instanceId="expired" />);
    const click = async (label: string) => {
      const button = [...host.querySelectorAll('button')].find((b) => b.textContent === label);
      expect(button).toBeDefined();
      await act(async () => { button!.click(); });
    };
    await click('Start');
    const running = getTimer('expired')!;
    // Move the wall clock without firing the 250 ms completion ticker.
    vi.setSystemTime(running.startedAt! + running.durationMs + 1);
    await click('Pause');
    expect(chime).toHaveBeenCalledExactlyOnceWith(kind);
    expect(getTimer('expired')?.running).toBe(false);
    if (kind === 'pomodoro') {
      expect(getTimer('expired')?.phase).toBe('break');
      expect(host.querySelector('.wgt-pomo-time')?.textContent).toBe('05:00');
    } else {
      expect(getTimer('expired')?.finishedAt).not.toBeNull();
      await click('Start');
      expect(host.querySelector('.wgt-pomo-time')?.textContent).toBe('01:00');
    }
    await act(async () => { vi.advanceTimersByTime(250); });
    expect(chime).toHaveBeenCalledTimes(1);
  });

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

  it('uses updated minutes when restarting a completed countdown', async () => {
    const done = settleTimer(startTimer(idleTimer('countdown', 60_000), 0), 60_000).state;
    setTimer('completed', done);
    const host = await mount(<Countdown settings={{ minutes: 2 }} setSettings={() => undefined} size={{ w: 200, h: 120 }} instanceId="completed" />);
    expect(host.querySelector('.wgt-pomo-time')?.textContent).toBe('02:00');
    expect(host.querySelector('.wgt-flash')).toBeNull();
    const start = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Start');
    await act(async () => { start?.click(); });
    const running = getTimer('completed');
    expect(running?.running).toBe(true);
    expect(running?.durationMs).toBe(120_000);
    expect(timerRemainingMs(running!, running!.startedAt! + 60_000)).toBe(60_000);
  });

  it('preserves running and paused countdown progress when minutes change', () => {
    const running = startTimer(idleTimer('countdown', 60_000), 0);
    expect(withDuration(running, 120_000)).toBe(running);
    const paused = { ...idleTimer('countdown', 60_000), baseMs: 30_000 };
    expect(withDuration(paused, 120_000)).toBe(paused);
    const done = settleTimer(running, 60_000).state;
    expect(withDuration(done, 60_000)).toBe(done);
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
