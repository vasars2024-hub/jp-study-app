// @vitest-environment jsdom
/**
 * v1 release: the About screen.
 *
 * Version, the GPL-3.0-or-later licence and its source link, the open source
 * licences rendered offline, the dictionary credits with the EDRDG statement,
 * and the privacy statement. The privacy text in the app IS PRIVACY.md: the
 * panel bundles the file itself, and the rendered statement is checked against
 * the file paragraph by paragraph, so the two can never drift apart.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseReleaseMarkdown, type MdInline } from '../../shared/releaseMarkdown';
import { TELEMETRY_CONSENT_KEY } from '../../shared/stats';
import { SETTINGS_REGISTRY } from '../components/settings/settingsRegistry';
import AboutPanel, { ABOUT_PRIVACY_SOURCE, ABOUT_SOURCE_URL } from '../components/about/AboutPanel';
import { a11yViolations } from './helpers/axeAudit';

const ROOT = resolve(__dirname, '..', '..', '..');
const PRIVACY_FILE = readFileSync(resolve(ROOT, 'PRIVACY.md'), 'utf8');

let root: Root | null = null;
let host: HTMLDivElement;
let api: Record<string, ReturnType<typeof vi.fn>>;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  localStorage.clear();
  api = {
    appVersion: vi.fn(async () => '1.0.1'),
    appUpdateOpenLink: vi.fn(async () => true),
    statsPing: vi.fn(async () => ({ sent: true })),
  };
  (window as unknown as { api: unknown }).api = api;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host.remove();
});

async function settle(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function until(check: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await settle(1);
  }
}

function tab(id: string): HTMLButtonElement {
  const el = host.querySelector<HTMLButtonElement>(`[role="tab"][data-about-tab-id="${id}"]`);
  if (!el) throw new Error(`no tab ${id}`);
  return el;
}

function buttonText(text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  if (!found) throw new Error(`no button "${text}"`);
  return found;
}

async function mount(): Promise<void> {
  await act(async () => root!.render(<AboutPanel />));
  await settle();
}

const inlineText = (nodes: MdInline[]): string =>
  nodes
    .map((n) => {
      if (n.t === 'text' || n.t === 'code') return n.v;
      if (n.t === 'br') return '\n';
      return inlineText(n.c);
    })
    .join('');

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

describe('overview', () => {
  it('shows the version, the GPL licence and opens the source repository through main', async () => {
    await mount();
    expect(host.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('About Gum');
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(4);
    expect(host.querySelector('.about-version')?.textContent).toBe('Version 1.0.1');
    expect(host.textContent).toContain('GNU General Public License, version 3 or later');
    const link = host.querySelector<HTMLAnchorElement>('a.about-link')!;
    expect(link.getAttribute('href')).toBe('https://github.com/vasars2024-hub/jp-study-app');
    await act(async () => link.click());
    expect(api.appUpdateOpenLink).toHaveBeenCalledWith(ABOUT_SOURCE_URL);
  });

  it('reads the full GPL text offline', async () => {
    await mount();
    await act(async () => buttonText('Read the licence').click());
    await until(() => /GNU GENERAL PUBLIC LICENSE/.test(host.querySelector('pre.about-pre')?.textContent ?? ''));
    expect(host.querySelector('pre.about-pre')?.textContent).toContain('Version 3, 29 June 2007');
  });

  it('moves between tabs with the arrow keys (roving tabindex)', async () => {
    await mount();
    await act(async () => {
      tab('overview').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(tab('licences').getAttribute('aria-selected')).toBe('true');
    expect(tab('licences').tabIndex).toBe(0);
    expect(tab('overview').tabIndex).toBe(-1);
    await act(async () => {
      tab('licences').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(tab('privacy').getAttribute('aria-selected')).toBe('true');
  });
});

describe('privacy (in-app text and PRIVACY.md are one)', () => {
  it('the panel bundles PRIVACY.md byte for byte', () => {
    expect(ABOUT_PRIVACY_SOURCE.replace(/\r\n/g, '\n')).toBe(PRIVACY_FILE.replace(/\r\n/g, '\n'));
  });

  it('renders every heading, paragraph and list item of PRIVACY.md', async () => {
    await mount();
    await act(async () => tab('privacy').click());
    await settle();
    const rendered = norm(host.querySelector('.about-privacy-md')?.textContent ?? '');
    const blocks = parseReleaseMarkdown(PRIVACY_FILE);
    expect(blocks.length).toBeGreaterThan(20);
    for (const block of blocks) {
      const parts =
        block.t === 'list' ? block.items.map((item) => inlineText(item.c)) : 'c' in block ? [inlineText(block.c)] : [];
      for (const part of parts) expect(rendered).toContain(norm(part));
    }
  });

  it('the learner-map switch is off by default and records consent when turned on', async () => {
    await mount();
    await act(async () => tab('privacy').click());
    const toggle = host.querySelector<HTMLInputElement>('.about-consent input[type="checkbox"]')!;
    expect(toggle.checked).toBe(false);
    await act(async () => toggle.click());
    await settle();
    expect(localStorage.getItem(TELEMETRY_CONSENT_KEY)).toBe('yes');
    expect(api.statsPing).toHaveBeenCalledTimes(1);
    await act(async () => toggle.click());
    expect(localStorage.getItem(TELEMETRY_CONSENT_KEY)).toBe('no');
  });
});

describe('credits and open source licences', () => {
  it('credits the dictionaries with the EDRDG statement and the CC BY-SA licence', async () => {
    await mount();
    await act(async () => tab('credits').click());
    const jmdict = host.querySelector('[data-credit-id="jmdict"]')?.textContent ?? '';
    expect(jmdict).toContain('Electronic Dictionary Research and Development Group');
    expect(jmdict).toContain('used in conformance with the Group\'s licence');
    expect(jmdict).toContain('CC-BY-SA-4.0');
    for (const id of ['cc-cedict', 'tatoeba', 'kanjium', 'moedict', 'kuromoji-ipadic']) {
      expect(host.querySelector(`[data-credit-id="${id}"]`), id).not.toBeNull();
    }
  });

  it('renders THIRD_PARTY_NOTICES.md offline and shows any npm package\'s licence text', async () => {
    await mount();
    await act(async () => tab('licences').click());
    await until(() => (host.querySelector('.about-licences .about-md')?.textContent ?? '').includes('Third-party notices'));
    const md = host.querySelector('.about-licences .about-md')?.textContent ?? '';
    expect(md).toContain('This application uses the JMdict dictionary files.');
    await until(() => host.querySelectorAll('.about-pkg').length > 0);
    const search = host.querySelector<HTMLInputElement>('input.about-search')!;
    expect(search.labels?.[0]?.textContent).toBe('Search npm packages by name or licence');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(search, 'better-sqlite3');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const pkgs = [...host.querySelectorAll<HTMLButtonElement>('.about-pkg')];
    expect(pkgs.length).toBeGreaterThanOrEqual(1);
    await act(async () => pkgs[0].click());
    expect(pkgs[0].getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.about-pkg-text pre')?.textContent).toMatch(/MIT|Permission is hereby granted/);
  });
});

describe('accessibility', () => {
  it('every tab passes axe', async () => {
    await mount();
    for (const id of ['overview', 'licences', 'credits', 'privacy']) {
      await act(async () => tab(id).click());
      if (id === 'licences') await until(() => host.querySelectorAll('.about-pkg').length > 0);
      await settle();
      expect(await a11yViolations(host), id).toEqual([]);
    }
  }, 60_000);
});

describe('where it lives', () => {
  it('Settings search finds About on the Help page', () => {
    const entry = SETTINGS_REGISTRY.find((e) => e.id === 'about');
    expect(entry).toMatchObject({ pageId: 'help', titleKey: 'about.title', descKey: 'about.desc' });
  });
});
