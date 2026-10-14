// @vitest-environment jsdom
/**
 * The shared first-use download notice (components/common/DownloadNotice.tsx):
 * shown once per kind, acknowledged through the guarded storage writer, never
 * shown again, and "Not now" leaves the action undone. Its strings are a lazy
 * pack of their own, complete in all four languages.
 */
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DOWNLOAD_NOTICE_KINDS,
  DOWNLOAD_NOTICE_STORAGE_KEY,
  acknowledgeDownloadNotice,
  downloadNoticeText,
  isDownloadNoticeAcknowledged,
  loadDownloadNoticeStrings,
  useDownloadNoticeGate,
  type DownloadNoticeKind,
} from '../components/common/DownloadNotice';
import { DOWNLOAD_NOTICE_EN } from '../../shared/i18n/downloadNotice/en';
import { DOWNLOAD_NOTICE_JA } from '../../shared/i18n/downloadNotice/ja';
import { DOWNLOAD_NOTICE_RU } from '../../shared/i18n/downloadNotice/ru';
import { DOWNLOAD_NOTICE_ZH } from '../../shared/i18n/downloadNotice/zh';
import { runAxe } from './helpers/axeAudit';

let host: HTMLDivElement;
let root: Root;
let ran = 0;

function Harness({ kind }: { kind: DownloadNoticeKind }) {
  const notice = useDownloadNoticeGate(kind);
  const [, setTick] = useState(0);
  return createElement(
    'div',
    null,
    createElement('button', {
      type: 'button',
      id: 'go',
      onClick: () => notice.gate(() => {
        ran += 1;
        setTick((n) => n + 1);
      }),
    }, 'Go'),
    notice.element,
  );
}

function render(kind: DownloadNoticeKind = 'torrent'): void {
  act(() => {
    root.render(createElement(Harness, { kind }));
  });
}

function click(selector: string): void {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`no ${selector}`);
  act(() => {
    el.click();
  });
}

function buttonByText(text: string): HTMLButtonElement {
  const button = [...document.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!button) throw new Error(`no button "${text}"`);
  return button;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  ran = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('DownloadNotice — first use', () => {
  it('shows the torrent notice before the first action, runs it after "I understand", and never again', () => {
    render('torrent');
    click('#go');
    expect(ran).toBe(0);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('trackers and other peers can see your IP address');
    expect(dialog?.textContent).toContain('legal where you live');

    act(() => buttonByText('I understand').click());
    expect(ran).toBe(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(isDownloadNoticeAcknowledged('torrent')).toBe(true);
    expect(JSON.parse(localStorage.getItem(DOWNLOAD_NOTICE_STORAGE_KEY) ?? '{}').torrent).toMatch(/^\d{4}-/);

    click('#go');
    expect(ran).toBe(2);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('"Not now" closes the notice without running the action or remembering anything', () => {
    render('torrent');
    click('#go');
    act(() => buttonByText('Not now').click());
    expect(ran).toBe(0);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(isDownloadNoticeAcknowledged('torrent')).toBe(false);
    // Asked again next time.
    click('#go');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('Escape is "Not now"', () => {
    render('torrent');
    click('#go');
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(ran).toBe(0);
  });

  it('remembers each kind on its own', () => {
    acknowledgeDownloadNotice('torrent');
    expect(isDownloadNoticeAcknowledged('torrent')).toBe(true);
    expect(isDownloadNoticeAcknowledged('youtube')).toBe(false);
    render('youtube');
    click('#go');
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('YouTube');
    expect(dialog?.textContent).toContain('copyright');
  });

  it('treats a corrupt stored record as "not yet acknowledged" rather than throwing', () => {
    localStorage.setItem(DOWNLOAD_NOTICE_STORAGE_KEY, '{not json');
    expect(isDownloadNoticeAcknowledged('torrent')).toBe(false);
    localStorage.setItem(DOWNLOAD_NOTICE_STORAGE_KEY, JSON.stringify({ torrent: 7 }));
    expect(isDownloadNoticeAcknowledged('torrent')).toBe(false);
  });

  it('is a labelled modal dialog with no axe violations', async () => {
    render('torrent');
    click('#go');
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    const labelId = dialog?.getAttribute('aria-labelledby') ?? '';
    expect(document.getElementById(labelId)?.textContent).toBe('Before you use torrents');
    expect(await runAxe(document.body)).toEqual([]);
  });
});

describe('DownloadNotice — strings', () => {
  const packs = { ja: DOWNLOAD_NOTICE_JA, zh: DOWNLOAD_NOTICE_ZH, ru: DOWNLOAD_NOTICE_RU };

  it('every language has exactly the English keys, translated', () => {
    const keys = Object.keys(DOWNLOAD_NOTICE_EN).sort();
    for (const [lang, pack] of Object.entries(packs)) {
      expect(Object.keys(pack).sort(), lang).toEqual(keys);
      for (const key of keys) expect(pack[key], `${lang} ${key}`).not.toBe(DOWNLOAD_NOTICE_EN[key]);
    }
  });

  it('every kind has a title and body lines', () => {
    for (const kind of DOWNLOAD_NOTICE_KINDS) {
      expect(DOWNLOAD_NOTICE_EN[`downloadNotice.${kind}.title`], kind).toBeTruthy();
    }
  });

  it('loads a language on demand and falls back to English until then', async () => {
    expect(downloadNoticeText('downloadNotice.acknowledge', 'ru')).toBe('I understand');
    await loadDownloadNoticeStrings('ru');
    expect(downloadNoticeText('downloadNotice.acknowledge', 'ru')).toBe('Понятно');
  });
});
