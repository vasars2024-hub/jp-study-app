// @vitest-environment jsdom
/**
 * set8 — Settings search that picks on the first Enter after Escape and keeps a
 * real active row, typo-tolerant ranking, section resets that can be undone
 * (Desktop layout and Monitors now on the shared ResetSectionButton), a desktop
 * reset that keeps sticky notes, and custom-shortcut errors in the UI language.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const confirmDialog = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../components/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/ui')>()),
  confirmDialog,
}));

const assignments = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
}));
vi.mock('../desktopState', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../desktopState')>()),
  getAssignments: () => assignments.rows,
  onDesktopChanged: () => () => undefined,
}));

import SettingsSearch from '../components/settings/SettingsSearch';
import ResetSectionButton from '../components/settings/ResetSectionButton';
import { typoDistance, searchSettings, typoBudget } from '../components/settings/settingsRegistry';
import { customCommandErrorText } from '../components/ShortcutSettings';
import { CATALOGS } from '../../shared/i18n/catalogs/all';

let host: HTMLDivElement;
let root: Root | null = null;

type Toast = { message: string; kind: string; action?: { label: string; run: () => void } };
let toasts: Toast[] = [];
const onToast = (ev: Event): void => {
  toasts.push((ev as CustomEvent<Toast>).detail);
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  toasts = [];
  window.addEventListener('os:toast', onToast);
  confirmDialog.mockClear();
  confirmDialog.mockResolvedValue(true);
  localStorage.clear();
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  host.remove();
  window.removeEventListener('os:toast', onToast);
  vi.useRealTimers();
});

const en = (key: string): string => String(CATALOGS.en[key] ?? key);

describe('Settings search keys', () => {
  const input = () => document.querySelector<HTMLInputElement>('.os-set-search-input') as HTMLInputElement;
  const panel = () => document.querySelector('.os-set-search-panel');
  const key = async (k: string) =>
    act(async () => {
      (document.activeElement ?? input()).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    });
  const type = async (text: string) =>
    act(async () => {
      const el = input();
      el.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

  async function mount(): Promise<Array<{ page: string; settingId?: string }>> {
    const navigated: Array<{ page: string; settingId?: string }> = [];
    await act(async () => {
      root?.render(<SettingsSearch onNavigate={(page, settingId) => navigated.push({ page, settingId })} />);
    });
    return navigated;
  }

  it('after Escape, one Enter reopens and picks the active result', async () => {
    const navigated = await mount();
    await type('wallpaper');
    expect(panel()).not.toBeNull();
    await key('Escape');
    expect(panel()).toBeNull();
    await key('Enter');
    expect(navigated).toHaveLength(1);
    expect(panel()).toBeNull();
  });

  it('ArrowDown on a shut panel only opens it, on the same row', async () => {
    const navigated = await mount();
    await type('wallpaper');
    await key('Escape');
    await key('ArrowDown');
    expect(panel()).not.toBeNull();
    const selected = document.querySelector('[role="option"][aria-selected="true"]');
    expect(selected).toBe(document.querySelector('[role="option"]'));
    expect(navigated).toHaveLength(0);
  });

  it('arrow keys with no results leave a real row active for the next results', async () => {
    const navigated = await mount();
    await type('zzqxj');
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(0);
    await key('ArrowDown');
    await key('ArrowUp');
    await key('Enter');
    expect(navigated).toEqual([]);
    await type('wallpaper');
    expect(document.querySelectorAll('[role="option"][aria-selected="true"]')).toHaveLength(1);
    await key('Enter');
    expect(navigated).toHaveLength(1);
  });
});

describe('typo-tolerant ranking', () => {
  const ids = (q: string): string[] => searchSettings(q, en, { advanced: true }).map((e) => e.id);

  it('measures edits, counting a swap of neighbours as one', () => {
    expect(typoDistance('langauge', 'language', 2)).toBe(1);
    expect(typoDistance('wallpapr', 'wallpaper', 2)).toBe(1);
    expect(typoDistance('abc', 'xyz', 1)).toBe(2);
    expect(typoBudget(4)).toBe(1);
    expect(typoBudget(9)).toBe(2);
  });

  it.each([
    ['wallpapr', 'wallpaper'],
    ['langauge', 'ui-language'],
    ['shortcts', 'shortcuts'],
    ['furigna', 'study-language'],
  ])('"%s" still finds %s', (query, id) => {
    expect(ids(query)).toContain(id);
  });

  it('ranks every exact hit above every typo-only hit', () => {
    const query = 'font';
    const results = searchSettings(query, en, { advanced: true });
    const exact = (id: string): boolean => {
      const e = results.find((r) => r.id === id);
      if (!e) return false;
      const hay = [e.titleKey ? en(e.titleKey) : '', e.descKey ? en(e.descKey) : '', e.group, e.pageId, ...e.keywords]
        .join(' ')
        .toLowerCase();
      return hay.includes(query);
    };
    const flags = results.map((r) => exact(r.id));
    expect(flags[0]).toBe(true);
    const firstTypo = flags.indexOf(false);
    if (firstTypo >= 0) expect(flags.slice(firstTypo).every((f) => !f)).toBe(true);
  });

  it('does not invent matches for nonsense, short words or CJK', () => {
    expect(ids('kumquat harmonica')).toEqual([]);
    expect(ids('zzqxj')).toEqual([]);
    // A three-letter word is never fuzzed: "fnt" is not "font".
    expect(ids('fnt')).toEqual([]);
  });
});

describe('section resets can be undone', () => {
  async function click(onReset: () => unknown, props: Record<string, unknown> = {}) {
    await act(async () => {
      root?.render(
        createElement(ResetSectionButton, {
          settingId: 'motion-reset',
          section: 'Motion',
          label: 'Reset',
          onReset: onReset as () => void,
          ...props,
        }),
      );
    });
    await act(async () => host.querySelector('button')?.click());
  }

  it('raises a toast whose Undo runs what the reset returned', async () => {
    const undo = vi.fn();
    await click(() => undo);
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe('Motion is back to its defaults.');
    expect(toasts[0].action?.label).toBe('Undo');
    await act(async () => toasts[0].action?.run());
    expect(undo).toHaveBeenCalledTimes(1);
    expect(toasts.at(-1)?.message).toBe('Motion is restored.');
    // A second click on the same toast does not restore twice.
    await act(async () => toasts[0].action?.run());
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('says so when the undo could not restore', async () => {
    await click(() => () => false);
    await act(async () => toasts[0].action?.run());
    expect(toasts.at(-1)).toMatchObject({ message: 'Motion could not be restored.', kind: 'err' });
  });

  it('a refused confirm resets nothing and offers nothing', async () => {
    confirmDialog.mockResolvedValueOnce(false);
    const onReset = vi.fn(() => vi.fn());
    await click(onReset);
    expect(onReset).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
  });

  it('the default dialog no longer says the reset cannot be undone', async () => {
    await click(() => vi.fn());
    const [opts] = confirmDialog.mock.calls[0] as unknown as [{ message: string; danger: boolean }];
    expect(opts.danger).toBe(true);
    expect(opts.message).toBe(en('set8.reset.dialogMessage'));
  });

  it('Monitors resets through the shared button and puts every assignment back on Undo', async () => {
    assignments.rows = [
      { displayKey: 'a|1920x1080|1', desktopIndex: 0, enabled: true, taskbar: 'full' },
      { displayKey: 'b|1280x720|2', desktopIndex: 1, enabled: true, aero: false, showAllWindows: true },
    ];
    const setOptions = vi.fn(async () => ({ ok: true }));
    const reset = vi.fn(async () => ({}));
    const sync = vi.fn(async () => []);
    Object.defineProperty(window, 'api', {
      configurable: true,
      writable: true,
      value: new Proxy(
        { deskwinSetOptions: setOptions, desktopResetAssignments: reset, deskwinSync: sync },
        {
          get: (target, prop) =>
            prop in target
              ? (target as Record<string | symbol, unknown>)[prop]
              : typeof prop === 'string' && prop.startsWith('on')
                ? () => () => undefined
                : () => Promise.resolve(prop === 'displayList' ? [] : 0),
        },
      ),
    });
    const { default: MonitorsPage } = await import('../components/settings/pages/MonitorsPage');
    const { SettingsProvider } = await import('../components/settings/SettingsContext');
    await act(async () => {
      root?.render(
        createElement(
          SettingsProvider,
          { value: { seg: () => ({}), focusSettingId: null } as never },
          createElement(MonitorsPage),
        ),
      );
    });
    const button = host.querySelector<HTMLButtonElement>('[data-reset-section="monitors-reset"]');
    expect(button).not.toBeNull();
    await act(async () => button?.click());
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(toasts[0].action).toBeDefined();
    await act(async () => toasts[0].action?.run());
    expect(setOptions.mock.calls.map((c) => (c as unknown[])[0])).toEqual(assignments.rows);
    expect(toasts.at(-1)?.kind).toBe('ok');
  });

  /*
   * The pop-out Settings window has no desktop: AppSection used to pass a no-op `onReset`,
   * so "Reset desktop" confirmed and then did nothing. It now passes none, and the page
   * shows the button disabled with a hint instead of a confirm that resets nothing.
   */
  async function renderDesktopLayout(onReset?: () => unknown): Promise<void> {
    const { default: DesktopLayoutPage } = await import('../components/settings/pages/DesktopLayoutPage');
    const { SettingsProvider } = await import('../components/settings/SettingsContext');
    const { loadDesktopPrefs } = await import('../desktopPrefs');
    await act(async () => {
      root?.render(
        createElement(
          SettingsProvider,
          {
            value: {
              deskPrefs: loadDesktopPrefs(),
              patchDesk: () => undefined,
              seg: () => ({}),
              focusSettingId: null,
              ...(onReset ? { onReset } : {}),
            } as never,
          },
          createElement(DesktopLayoutPage),
        ),
      );
    });
  }

  it('Desktop layout in the pop-out (no onReset) disables Reset desktop and says where it lives', async () => {
    await renderDesktopLayout();
    const button = host.querySelector<HTMLButtonElement>('[data-reset-section="desktop-reset"]');
    expect(button?.disabled).toBe(true);
    const hint = host.querySelector('[data-desktop-reset-unavailable]');
    expect(hint?.textContent).toBe(en('set8.desktopReset.popoutHint'));
    expect(button?.getAttribute('aria-describedby')).toBe(hint?.id);
    await act(async () => button?.click());
    expect(confirmDialog).not.toHaveBeenCalled();
  });

  it('Desktop layout on the desktop (onReset given) confirms and resets', async () => {
    const onReset = vi.fn(() => vi.fn());
    await renderDesktopLayout(onReset);
    expect(host.querySelector('[data-desktop-reset-unavailable]')).toBeNull();
    const button = host.querySelector<HTMLButtonElement>('[data-reset-section="desktop-reset"]');
    expect(button?.disabled).toBe(false);
    await act(async () => button?.click());
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('the pop-out Settings host passes no onReset', () => {
    const section = readFileSync(join(__dirname, '..', 'components', 'AppSection.tsx'), 'utf8');
    const settings = /case 'settings':[\s\S]*?break;/.exec(section)?.[0] ?? '';
    expect(settings).toContain('<SettingsApp');
    expect(settings).not.toMatch(/onReset=/);
  });

  it('Desktop layout\'s reset is the shared button, and the desktop reset keeps sticky notes', () => {
    const page = readFileSync(join(__dirname, '..', 'components', 'settings', 'pages', 'DesktopLayoutPage.tsx'), 'utf8');
    expect(page).toMatch(/<ResetSectionButton[\s\S]*settingId="desktop-reset"[\s\S]*onReset=\{onReset\}/);
    const shell = readFileSync(join(__dirname, '..', 'components', 'DesktopShell.tsx'), 'utf8');
    const body = /const resetDesktop = [\s\S]*?\n {2}\};\n/.exec(shell)?.[0] ?? '';
    expect(body).toContain('setWidgets([])');
    // Notes are the user's writing, not layout.
    expect(body).not.toContain('setNotes(');
    // It no longer asks on its own (the button does) and it returns the Undo.
    expect(body).not.toContain('confirmDialog(');
    expect(body).toMatch(/return \(\) => \{[\s\S]*setWins\(before\.wins\)/);
  });
});

describe('custom shortcut errors are translated', () => {
  const tFor = (lang: 'en' | 'ja' | 'zh' | 'ru') => (k: string): string => String(CATALOGS[lang][k] ?? k);

  it.each(['Name is required.', 'Pick an action.', 'Custom shortcut not found.', 'Something new.', undefined])(
    'shows %s from the catalog in every language',
    (error) => {
      const english = customCommandErrorText(error, tFor('en'));
      expect(english).not.toMatch(/^set8\./);
      for (const lang of ['ja', 'zh', 'ru'] as const) {
        const text = customCommandErrorText(error, tFor(lang));
        expect(text).not.toMatch(/^set8\./);
        expect(text).not.toBe(english);
      }
    },
  );

  it('maps "Pick an action." to its own message', () => {
    expect(customCommandErrorText('Pick an action.', tFor('en'))).toBe('Pick an action.');
    expect(customCommandErrorText('Pick an action.', tFor('ja'))).toBe('動作を選んでください。');
  });
});
