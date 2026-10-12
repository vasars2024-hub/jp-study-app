// @vitest-environment jsdom
/**
 * lock3 — the lock screen as a study surface.
 *
 *  - the challenge's pure parts: Anki HTML is shown as text, the card of the day
 *    is stable for a day, the right answer is always among the choices, a small
 *    deck falls back to a self-check;
 *  - "answer a card to unlock" comes before the PIN and only OPENS the PIN step
 *    when a PIN is set; with no PIN it unlocks only if main holds no lock
 *    (a stale mirror never unlocks);
 *  - the study panel shows a count only, unless the owner chose to show a card;
 *  - toasts raised while locked are held off the lock screen (the lock's own
 *    notices excepted) and shown once a host is unlocked;
 *  - the recovery form, keyboard reachable, reports a wrong code.
 */
import { act, createElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, installJsdomShims, mount, settle, stubBridge } from './helpers/axeHarness';
import {
  buildChallenge,
  localDayNumber,
  pickCardOfTheDay,
  plainCardText,
  toLockStudyCard,
  type LockStudySnapshot,
} from '../lockscreenStudy';

const h = vi.hoisted(() => ({
  cfg: { enabled: true, pinHash: 'scrypt1:a:b', tint: 'auto', study: 'count', answerToUnlock: true } as Record<string, unknown>,
  snap: null as LockStudySnapshot | null,
  verify: vi.fn(async (pin: string) => ({ ok: pin === '' })),
  recover: vi.fn(async (code: string) => ({ ok: code === '', error: 'wrong-pin', settings: {} })),
}));

vi.mock('../lockscreenSettings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lockscreenSettings')>()),
  loadLockscreen: () => ({ ...h.cfg }),
  verifyLockscreenPinDetailed: (pin: string) => h.verify(pin),
  recoverLockscreen: (code: string) => h.recover(code),
}));
vi.mock('../lockscreenStudy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lockscreenStudy')>()),
  loadLockStudy: async () => h.snap,
}));

const CARDS = [
  { id: 'a', front: '猫', reading: 'ねこ', back: 'cat' },
  { id: 'b', front: '犬', reading: 'いぬ', back: 'dog' },
  { id: 'c', front: '鳥', reading: 'とり', back: 'bird' },
  { id: 'd', front: '魚', reading: 'さかな', back: 'fish' },
];

beforeAll(() => installJsdomShims());
beforeEach(() => {
  h.cfg = { enabled: true, pinHash: 'scrypt1:a:b', tint: 'auto', study: 'count', answerToUnlock: true };
  h.snap = { due: 3, card: CARDS[0]!, pool: CARDS };
  h.verify.mockClear();
  h.recover.mockClear();
  stubBridge({ lockscreenSetSize: undefined, lockscreenIsLocked: false, lockscreenStatus: { hasRecovery: true } });
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

describe('pure parts', () => {
  it('shows card text, not markup, bounded to one line', () => {
    expect(plainCardText('<b>猫</b><br>&amp; <i>cat</i>')).toBe('猫 & cat');
    expect(plainCardText('x'.repeat(200)).length).toBe(90);
    expect(toLockStudyCard({ id: '1', word: '', front: '<div>食べる</div>', meaning: 'to eat; to dine' })).toEqual({
      id: '1',
      front: '食べる',
      reading: '',
      back: 'to eat',
    });
    expect(toLockStudyCard({ id: '2', word: '空', meaning: '' })).toBeNull();
  });

  it('the card of the day prefers a due card and stays put for the day', () => {
    const morning = new Date(2026, 9, 11, 8).getTime();
    const night = new Date(2026, 9, 11, 23, 30).getTime();
    expect(localDayNumber(morning)).toBe(localDayNumber(night));
    expect(pickCardOfTheDay([CARDS[2]!], CARDS, morning)).toEqual(CARDS[2]);
    expect(pickCardOfTheDay([], CARDS, morning)).toEqual(pickCardOfTheDay([], CARDS, night));
    expect(pickCardOfTheDay([], [], morning)).toBeNull();
  });

  it('the right answer is always one of the choices; a tiny deck is a self-check', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      let s = seed;
      const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
      const c = buildChallenge(CARDS[1]!, CARDS, rnd);
      expect(c.options.length).toBe(4);
      expect(c.options[c.answer]).toBe('dog');
      expect(new Set(c.options).size).toBe(4);
    }
    expect(buildChallenge(CARDS[0]!, CARDS.slice(0, 2)).options).toEqual([]);
  });
});

async function renderLock() {
  const { default: Lockscreen } = await import('../components/Lockscreen');
  const onUnlocked = vi.fn();
  const mounted = await mount(createElement(Lockscreen, { onUnlocked }), 40);
  return { ...mounted, onUnlocked };
}

const pressKey = async (key: string) => {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
};

describe('answer a card to unlock', () => {
  it('comes before the PIN pad, and a right answer opens the PIN step (never unlocks by itself)', async () => {
    const { host, onUnlocked } = await renderLock();
    expect(host.querySelector('.lockscreen-challenge')).not.toBeNull();
    expect(host.querySelector('.lockscreen-win11-pad')).toBeNull();
    const options = [...host.querySelectorAll('.lockscreen-challenge-option')];
    expect(options).toHaveLength(4);
    // Digits pick a choice now, they do not reach the PIN.
    const right = options.findIndex((b) => b.textContent?.includes('cat'));
    await pressKey(String(right + 1));
    await settle(500);
    expect(host.querySelector('.lockscreen-challenge')).toBeNull();
    expect(host.querySelector('.lockscreen-win11-pad')).not.toBeNull();
    expect(onUnlocked).not.toHaveBeenCalled();
    expect(h.verify).not.toHaveBeenCalled();
    // ...and the PIN is still checked by main.
    for (const k of '1234') await pressKey(k);
    await settle(150);
    expect(h.verify).toHaveBeenCalledWith('1234');
  });

  it('a wrong answer says the right one and offers another card', async () => {
    const { host } = await renderLock();
    const options = [...host.querySelectorAll('.lockscreen-challenge-option')] as HTMLButtonElement[];
    const wrong = options.find((b) => !b.textContent?.includes('cat'))!;
    await act(async () => wrong.click());
    expect(host.querySelector('.lockscreen-challenge-status')?.textContent).toContain('cat');
    expect(host.querySelector('.lockscreen-win11-pad')).toBeNull();
    const next = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Another card')!;
    await act(async () => next.click());
    expect(host.querySelector('.lockscreen-challenge-front')?.textContent).not.toBe('');
  });

  it('with no PIN it is the whole gate — but only when main holds no lock', async () => {
    h.cfg = { enabled: false, pinHash: '', tint: 'auto', study: 'off', answerToUnlock: true };
    const first = await renderLock();
    const right = [...first.host.querySelectorAll('.lockscreen-challenge-option')].findIndex((b) => b.textContent?.includes('cat'));
    await pressKey(String(right + 1));
    await settle(600);
    expect(first.onUnlocked).toHaveBeenCalledTimes(1);
    await cleanup();

    // A stale mirror (main IS locked): the PIN step follows instead.
    stubBridge({ lockscreenSetSize: undefined, lockscreenIsLocked: true, lockscreenStatus: { hasRecovery: false } });
    const second = await renderLock();
    const right2 = [...second.host.querySelectorAll('.lockscreen-challenge-option')].findIndex((b) => b.textContent?.includes('cat'));
    await pressKey(String(right2 + 1));
    await settle(600);
    expect(second.onUnlocked).not.toHaveBeenCalled();
    expect(second.host.querySelector('.lockscreen-win11-pad')).not.toBeNull();
  });

  it('an empty deck has nothing to ask: one button continues', async () => {
    h.snap = { due: 0, card: null, pool: [] };
    const { host } = await renderLock();
    expect(host.querySelector('.lockscreen-challenge-note')?.textContent).toMatch(/no cards/i);
    const go = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Continue')!;
    await act(async () => go.click());
    expect(host.querySelector('.lockscreen-win11-pad')).not.toBeNull();
  });
});

describe('the study panel', () => {
  it('count mode shows a number and nothing from the cards', async () => {
    h.cfg = { ...h.cfg, answerToUnlock: false, study: 'count' };
    const { host } = await renderLock();
    const panel = host.querySelector('.lockscreen-study');
    expect(panel?.textContent).toContain('3 cards due today');
    expect(panel?.textContent).not.toContain('猫');
  });

  it('card mode shows the card of the day, its answer behind a button', async () => {
    h.cfg = { ...h.cfg, answerToUnlock: false, study: 'card' };
    const { host } = await renderLock();
    expect(host.querySelector('.lockscreen-study-front')?.textContent).toBe('猫');
    expect(host.textContent).not.toContain('cat');
    const reveal = host.querySelector('.lockscreen-study-reveal') as HTMLButtonElement;
    expect(reveal.getAttribute('aria-expanded')).toBe('false');
    await act(async () => reveal.click());
    expect(host.textContent).toContain('cat');
  });

  it('a screen reader hears the time and date even though the big clock is decorative', async () => {
    h.cfg = { ...h.cfg, answerToUnlock: false };
    const { host } = await renderLock();
    expect(host.querySelector('.lockscreen-win11-clock')?.getAttribute('aria-hidden')).toBe('true');
    expect([...host.querySelectorAll('.sr-only')].some((n) => /^It is .+, .+\.$/.test(n.textContent ?? ''))).toBe(true);
  });
});

describe('recovery on the lock screen', () => {
  it('opens a labelled form, keeps the PIN digits out of it, and says a wrong code is wrong', async () => {
    h.cfg = { ...h.cfg, answerToUnlock: false, study: 'off' };
    const { host, onUnlocked } = await renderLock();
    const link = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Forgot your PIN?')!;
    expect(link).toBeTruthy();
    await act(async () => link.click());
    expect(host.querySelector('.lockscreen-win11-pad')).toBeNull(); // the PIN pad steps aside
    const input = host.querySelector('.lockscreen-recovery-input') as HTMLInputElement;
    expect(host.querySelector(`label[for="${input.id}"]`)?.textContent).toBe('Recovery code');
    // Digits typed now are not PIN entry.
    for (const k of '1234') await pressKey(k);
    expect(h.verify).not.toHaveBeenCalled();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'AAAA-BBBB-CCCC-DDDD');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      (host.querySelector('.lockscreen-recovery') as HTMLFormElement).requestSubmit();
    });
    await settle(20);
    expect(h.recover).toHaveBeenCalledWith('AAAA-BBBB-CCCC-DDDD');
    expect(host.querySelector('.lockscreen-recovery-status')?.textContent).toBe('That recovery code is not right.');
    expect(onUnlocked).not.toHaveBeenCalled();
  });
});

describe('toasts while locked', () => {
  it('hold study toasts off the lock screen, show the lock\'s own notices, and deliver the rest after the unlock', async () => {
    const { default: ToastHost, showLockSurfaceToast, showOsToast } = await import('../components/ToastHost');
    const locked = await mount(createElement(ToastHost, { locked: true }), 10);
    await act(async () => {
      showOsToast('Mined 猫 into your deck');
      showLockSurfaceToast('Gum is locked. Unlock to use that shortcut.');
    });
    const text = () => locked.host.querySelector('.os-toast-host')?.textContent ?? '';
    expect(text()).toContain('Gum is locked');
    expect(text()).not.toContain('Mined');
    expect((locked.host.querySelector('.os-toast-locked-hold') as HTMLElement).hidden).toBe(true);
    await locked.unmount();
    const unlocked = await mount(createElement(ToastHost), 10);
    expect(unlocked.host.querySelector('.os-toast-host')?.textContent).toContain('Mined 猫 into your deck');
    expect((unlocked.host.querySelector('.os-toast-locked-hold') as HTMLElement).hidden).toBe(false);
  });
});
