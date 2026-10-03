// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ResourceMyTools, useResources } from '../components/resources/ResourcesContent';

vi.mock('../i18n', () => ({ useT: () => ({ t: (key: string) => key, lang: 'en' }) }));
vi.mock('../components/ui', () => ({ confirmDialog: vi.fn(), showToast: vi.fn() }));
import { showToast } from '../components/ui';

let root: Root | undefined;
let state: ReturnType<typeof useResources>;

function Harness() {
  state = useResources();
  return <ResourceMyTools state={state} />;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('keeps a failed note save editable and retries the same draft successfully', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const tool = { id: 'tool-1', name: 'Dictionary', url: 'https://example.com', note: 'Old note' };
  const toolsList = vi.fn().mockResolvedValue({ tools: [tool] });
  const toolsUpdate = vi.fn().mockRejectedValueOnce(new Error('Disk full'))
    .mockImplementationOnce(async (_id, patch) => Object.assign(tool, patch));
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      toolsList, toolsUpdate,
      catalogGet: vi.fn().mockResolvedValue(null),
      catalogRefresh: vi.fn().mockResolvedValue({ catalog: null, source: 'builtin' }),
    },
  });
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<Harness />));
  await act(async () => {
    (host.querySelector('.mytool-note') as HTMLButtonElement).click();
  });
  await act(async () => state.setNoteDraft('Review these kanji tomorrow'));

  const save = async () => {
    await act(async () => {
      (host.querySelector('[aria-label="common.save"]') as HTMLButtonElement).click();
    });
  };
  await save();
  expect(showToast).toHaveBeenCalledWith({ message: 'resources.myTools.noteSaveFailed', kind: 'error' });
  expect(host.querySelector('input')?.value).toBe('Review these kanji tomorrow');
  expect(state.editingTool).toBe(tool.id);
  expect(tool.note).toBe('Old note');
  expect(toolsList).toHaveBeenCalledTimes(1);

  await save();
  expect(toolsUpdate).toHaveBeenNthCalledWith(2, tool.id, { note: 'Review these kanji tomorrow' });
  expect(host.querySelector('input')).toBeNull();
  expect(host.querySelector('.mytool-note')?.textContent).toBe('Review these kanji tomorrow');
  expect(toolsList).toHaveBeenCalledTimes(2);
});
