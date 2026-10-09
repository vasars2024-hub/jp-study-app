// @vitest-environment jsdom
/** gram2 — "Review grammar" from another surface lands on the Review tab, mounted or not. */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../components/grammar/GrammarExplorer', () => ({ default: () => <div data-testid="explorer" /> }));
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
vi.mock('../extensionBridgeUi', () => ({ openAppSection: vi.fn() }));

import GrammarView from '../views/GrammarView';
import { openGrammarReview } from '../grammarDue';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  sessionStorage.clear();
});

async function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root?.render(<GrammarView />));
  return host;
}

describe('openGrammarReview', () => {
  it('opens the Review tab of a Grammar view mounted after the request (handoff)', async () => {
    openGrammarReview();
    const host = await mount();
    expect(host.querySelector('[data-testid="review"]')).not.toBeNull();
    expect(host.querySelector('#gram-mode-tab-review')?.getAttribute('aria-selected')).toBe('true');
  });

  it('switches a mounted view, and leaves no handoff to replay on remount', async () => {
    const host = await mount();
    expect(host.querySelector('[data-testid="explorer"]')).not.toBeNull();
    await act(async () => openGrammarReview());
    expect(host.querySelector('[data-testid="review"]')).not.toBeNull();
    expect(sessionStorage.getItem('jp-pending-grammar-review')).toBeNull();
  });
});
