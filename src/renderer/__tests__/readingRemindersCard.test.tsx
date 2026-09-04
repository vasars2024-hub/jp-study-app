// @vitest-environment jsdom
/**
 * §11.3's settings card — the only route into the feature.
 *
 * Every kind is off by default, deliberately, so a card that renders four
 * switches which persist nothing is indistinguishable from a working one until
 * a reminder fails to arrive a day later. So these assert the CALL that reaches
 * main, and the two states that are easy to fake: a silenced kind must read as
 * off AND say why, and a missing IPC binding must say so rather than render
 * controls that do nothing.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ReadingRemindersCard from '../components/settings/pages/ReadingRemindersCard';
import { SettingsProvider } from '../components/settings/SettingsContext';
import type { SettingsController } from '../components/settings/types';
import {
  defaultReadingReminderSettings,
  type ReadingReminderSettings,
} from '../../shared/readingListReminders';

let host: HTMLDivElement;
let root: Root;
let stored: ReadingReminderSettings;
let patches: Partial<ReadingReminderSettings>[] = [];

function installBridge(available = true) {
  (window as unknown as { api?: unknown }).api = available
    ? {
        readingRemindersGet: async () => stored,
        readingRemindersSet: async (patch: Partial<ReadingReminderSettings>) => {
          patches.push(patch);
          stored = {
            ...stored,
            ...patch,
            enabled: { ...stored.enabled, ...(patch.enabled ?? {}) },
          };
          return stored;
        },
      }
    : {};
}

/** Only what the card reads. The rest of the controller is not its business. */
const controller = { focusSettingId: null } as unknown as SettingsController;

async function mount() {
  await act(async () => {
    root.render(
      <SettingsProvider value={controller}>
        <ReadingRemindersCard />
      </SettingsProvider>,
    );
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function toggles(): HTMLInputElement[] {
  return [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = window.document.createElement('div');
  window.document.body.appendChild(host);
  root = createRoot(host);
  stored = defaultReadingReminderSettings();
  patches = [];
  installBridge();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (window as unknown as { api?: unknown }).api;
});

describe('the reminder settings card', () => {
  it('shows all four kinds, all off, exactly as main stores them', async () => {
    await mount();
    expect(toggles()).toHaveLength(4);
    expect(toggles().every((input) => input.checked)).toBe(false);
    expect(host.textContent).toContain('A book from a list arrives');
    expect(host.textContent).toContain('Nothing read today');
    // The rule most likely to read as a bug is stated on the card.
    expect(host.textContent).toContain('At most one reminder a day');
  });

  it('sends the switch to main rather than only re-rendering', async () => {
    await mount();
    await act(async () => {
      toggles()[0].click();
      await Promise.resolve();
    });
    expect(patches).toHaveLength(1);
    expect(patches[0].enabled).toMatchObject({ 'new-binding': true });
    expect(toggles()[0].checked).toBe(true);
  });

  it('reads a kind silenced from a notification as off, and says why', async () => {
    stored = {
      ...defaultReadingReminderSettings(),
      enabled: { ...defaultReadingReminderSettings().enabled, 'daily-read': true },
      silenced: ['daily-read'],
    };
    await mount();
    // The enable flag is still true in main; the card must not claim it is on.
    expect(toggles()[3].checked).toBe(false);
    expect(host.textContent).toContain('dismissed this one forever');
  });

  it('switching a silenced kind back on clears the silence in the same call', async () => {
    stored = {
      ...defaultReadingReminderSettings(),
      enabled: { ...defaultReadingReminderSettings().enabled, 'daily-read': true },
      silenced: ['daily-read'],
    };
    await mount();
    await act(async () => {
      toggles()[3].click();
      await Promise.resolve();
    });
    expect(patches[0].silenced).toEqual([]);
  });

  it('says reminders are unavailable rather than rendering dead switches', async () => {
    installBridge(false);
    await mount();
    expect(toggles()).toHaveLength(0);
    expect(host.textContent).toContain('need a newer app version');
  });
});
