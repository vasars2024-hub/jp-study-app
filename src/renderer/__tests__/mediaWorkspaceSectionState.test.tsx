// @vitest-environment jsdom
/**
 * The `player`/`video` compatibility section says what is true about the workspace.
 *
 * The defect: every non-`disabled` server status rendered "The media workspace is open in
 * front of this window." — for a closed overlay, and for a server that was `stopped`,
 * `starting`, `offline` or `failed`. The pure branching is pinned first, then the rendered
 * view, so a section that ignored the helper would still fail here.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { en } from '../../shared/i18n/catalogs/en';
import { registerMediaWorkspaceHost, setMediaWorkspaceOpen } from '../../shared/mediaWorkspace';
import type { SeanimeStatus, SeanimeStatusKind } from '../../shared/seanime';
import {
  mediaWorkspaceSectionState,
  type MediaWorkspaceSectionFacts,
} from '../mediaWorkspaceSectionState';
import MediaWorkspaceSectionView from '../views/MediaWorkspaceSectionView';

const facts = (patch: Partial<MediaWorkspaceSectionFacts>): MediaWorkspaceSectionFacts => ({
  availability: 'available',
  hostExists: true,
  open: false,
  serverKind: 'ready',
  ...patch,
});

describe('mediaWorkspaceSectionState', () => {
  it('only claims "open" when the overlay is actually open', () => {
    expect(mediaWorkspaceSectionState(facts({ open: true }))).toBe('open');
    expect(mediaWorkspaceSectionState(facts({ open: false }))).toBe('closed');
  });

  it('offers to start a server that is stopped, offline or failed', () => {
    for (const kind of ['stopped', 'offline', 'failed'] as SeanimeStatusKind[]) {
      expect(mediaWorkspaceSectionState(facts({ serverKind: kind })), kind).toBe('needs-server');
    }
  });

  it('says the server is starting while it starts', () => {
    expect(mediaWorkspaceSectionState(facts({ serverKind: 'starting' }))).toBe('starting');
  });

  it('treats an unanswered status as closed, never as open', () => {
    expect(mediaWorkspaceSectionState(facts({ serverKind: null }))).toBe('closed');
  });

  it('keeps the rollback and the pending blank', () => {
    expect(mediaWorkspaceSectionState(facts({ availability: 'pending' }))).toBe('pending');
    expect(mediaWorkspaceSectionState(facts({ availability: 'unavailable' }))).toBe('legacy');
    expect(mediaWorkspaceSectionState(facts({ serverKind: 'disabled' }))).toBe('legacy');
  });

  it('says so when this window has no host to open', () => {
    expect(mediaWorkspaceSectionState(facts({ hostExists: false }))).toBe('no-host');
    // An open overlay elsewhere does not make this window able to open one.
    expect(mediaWorkspaceSectionState(facts({ hostExists: false, open: true }))).toBe('no-host');
  });
});

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let releaseHost: (() => void) | null = null;
let pushStatus: ((status: SeanimeStatus) => void) | null = null;
const seanimeStart = vi.fn(async () => undefined);

function status(kind: SeanimeStatusKind): SeanimeStatus {
  return { kind } as SeanimeStatus;
}

function installApi(initial: SeanimeStatusKind): void {
  (window as unknown as { api: unknown }).api = {
    seanimeStatus: async () => status(initial),
    onSeanimeStatus: (cb: (s: SeanimeStatus) => void) => {
      pushStatus = cb;
      return () => { pushStatus = null; };
    },
    seanimeStart,
  };
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  releaseHost?.();
  releaseHost = null;
  setMediaWorkspaceOpen(false);
  seanimeStart.mockClear();
});

async function mount(initial: SeanimeStatusKind): Promise<HTMLDivElement> {
  installApi(initial);
  releaseHost = registerMediaWorkspaceHost();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(createElement(MediaWorkspaceSectionView, { legacyTab: 'video' }));
  });
  // Two IPC round trips (availability, live status) settle on the next ticks.
  await act(async () => { await Promise.resolve(); });
  return host;
}

const section = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-media-workspace-section]');

describe('MediaWorkspaceSectionView', () => {
  it('does not say "open in front of this window" when the server is stopped', async () => {
    const el = await mount('stopped');
    expect(section(el)?.dataset.mediaWorkspaceSection).toBe('needs-server');
    expect(el.textContent).not.toContain(en['mediaWorkspace.section.open'] as string);
    const button = [...el.querySelectorAll('button')]
      .find((b) => b.textContent === en['mediaWorkspace.startServer']);
    expect(button).toBeDefined();
    await act(async () => { button?.click(); });
    expect(seanimeStart).toHaveBeenCalledTimes(1);
  });

  it('follows the live status push and the overlay', async () => {
    const el = await mount('stopped');
    await act(async () => { pushStatus?.(status('starting')); });
    expect(section(el)?.dataset.mediaWorkspaceSection).toBe('starting');
    await act(async () => { pushStatus?.(status('ready')); });
    expect(section(el)?.dataset.mediaWorkspaceSection).toBe('closed');
    expect(el.textContent).toContain(en['mediaWorkspace.section.closed'] as string);
    expect(el.textContent).toContain(en['mediaWorkspace.section.open.action'] as string);
    await act(async () => { setMediaWorkspaceOpen(true); });
    expect(section(el)?.dataset.mediaWorkspaceSection).toBe('open');
    expect(el.textContent).toContain(en['mediaWorkspace.section.open'] as string);
    await act(async () => { setMediaWorkspaceOpen(false); });
    expect(section(el)?.dataset.mediaWorkspaceSection).toBe('closed');
  });
});
