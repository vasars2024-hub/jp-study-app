// @vitest-environment jsdom
/**
 * dict3 — a conjugation-trace step opens its grammar point: `openGrammarPoint`
 * reaches a Grammar view that mounts after the click (handoff) and one already
 * mounted (live event), switches it to the points explorer, and hands the
 * explorer the point to focus. No handoff is left behind to replay later.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const focus = vi.hoisted(() => ({ requests: [] as Array<{ id: string; key: number } | null | undefined> }));
vi.mock('../components/grammar/GrammarExplorer', () => ({
  default: (props: { focusRequest?: { id: string; key: number } | null }) => {
    focus.requests.push(props.focusRequest);
    return <div data-testid="explorer" data-focus={props.focusRequest?.id ?? ''} />;
  },
}));
vi.mock('../components/grammar/GrammarPracticePanel', () => ({ default: () => <div data-testid="practice" /> }));
vi.mock('../components/grammar/GrammarReviewPanel', () => ({ default: () => <div data-testid="review" /> }));
vi.mock('../components/grammar/GrammarCurationPanel', () => ({ default: () => <div data-testid="curation" /> }));
vi.mock('../components/grammar/GrammarContent', () => ({
  GrammarDetail: () => null,
  GuidesBrowser: () => <div data-testid="guides" />,
  parsePracticeDeepLink: () => null,
}));
vi.mock('../components/ui', () => ({
  AppChrome: ({ children }: { children: ReactNode }) => <>{children}</>,
  StatusBarField: ({ children }: { children: ReactNode }) => <>{children}</>,
  StatusBarSpacer: () => null,
  useAeroMaterials: () => false,
  useWiredMaterials: () => false,
}));
vi.mock('../i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));

import GrammarView from '../views/GrammarView';
import { openGrammarPoint } from '../extensionBridgeUi';
import { PENDING_HANDOFF_KEYS } from '../pendingHandoff';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  focus.requests = [];
  document.body.replaceChildren();
  localStorage.clear();
});

async function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root?.render(<GrammarView />));
  return host;
}

describe('openGrammarPoint', () => {
  it('focuses the point in a Grammar view mounted after the click', async () => {
    const opened: string[] = [];
    const onOpen = (event: Event) => opened.push(String((event as CustomEvent).detail));
    window.addEventListener('os:open', onOpen);
    openGrammarPoint('n4-causative');
    window.removeEventListener('os:open', onOpen);
    expect(opened).toEqual(['grammar']);
    const host = await mount();
    expect(host.querySelector('[data-testid="explorer"]')?.getAttribute('data-focus')).toBe('n4-causative');
    expect(localStorage.getItem(PENDING_HANDOFF_KEYS.grammarPoint)).toBeNull();
  });

  it('switches a mounted view on another tab to the point, and clears the handoff', async () => {
    const host = await mount();
    await act(async () => host.querySelector<HTMLButtonElement>('#gram-mode-tab-review')?.click());
    expect(host.querySelector('[data-testid="review"]')).not.toBeNull();
    await act(async () => openGrammarPoint('n5-te-form'));
    expect(host.querySelector('[data-testid="explorer"]')?.getAttribute('data-focus')).toBe('n5-te-form');
    expect(localStorage.getItem(PENDING_HANDOFF_KEYS.grammarPoint)).toBeNull();
  });
});

describe('openGrammarPoint from a pop-out window', () => {
  const api = window as unknown as { api?: { extensionFocusMainAndOpen?: (target: string) => Promise<{ ok: boolean }> } };
  let previousApi: typeof api.api;

  function asPopout(section: string | null) {
    window.history.replaceState(null, '', section ? `/?popout=${section}` : '/');
  }

  beforeAll(() => {
    previousApi = api.api;
  });
  afterEach(() => {
    asPopout(null);
    api.api = previousApi;
  });

  it('raises the Study OS window and opens Grammar there, leaving the handoff for it', () => {
    asPopout('dictionary');
    const raise = vi.fn(async () => ({ ok: true }));
    api.api = { ...(previousApi ?? {}), extensionFocusMainAndOpen: raise };
    const opened: string[] = [];
    const onOpen = (event: Event) => opened.push(String((event as CustomEvent).detail));
    window.addEventListener('os:open', onOpen);
    openGrammarPoint('n4-passive');
    window.removeEventListener('os:open', onOpen);
    expect(raise).toHaveBeenCalledWith('grammar');
    // The pop-out has no desktop: no in-window open that would go nowhere.
    expect(opened).toEqual([]);
    expect(JSON.parse(localStorage.getItem(PENDING_HANDOFF_KEYS.grammarPoint) ?? 'null')).toBe('n4-passive');
  });

  it('a Grammar pop-out answers in place and does not raise the main window', async () => {
    asPopout('grammar');
    const raise = vi.fn(async () => ({ ok: true }));
    api.api = { ...(previousApi ?? {}), extensionFocusMainAndOpen: raise };
    const host = await mount();
    await act(async () => openGrammarPoint('n4-potential'));
    expect(raise).not.toHaveBeenCalled();
    expect(host.querySelector('[data-testid="explorer"]')?.getAttribute('data-focus')).toBe('n4-potential');
  });

  it('without the bridge the handoff is still left (no throw)', () => {
    asPopout('dictionary');
    api.api = undefined;
    expect(() => openGrammarPoint('n5-te-form')).not.toThrow();
    expect(localStorage.getItem(PENDING_HANDOFF_KEYS.grammarPoint)).not.toBeNull();
  });
});
