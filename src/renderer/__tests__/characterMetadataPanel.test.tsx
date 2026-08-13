// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}));

import CharacterMetadataPanel from '../components/lexicon/CharacterMetadataPanel';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe('CharacterMetadataPanel', () => {
  it('renders grounded facts and every contributing source without placeholders', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root?.render(<CharacterMetadataPanel character={{
      lang: 'ja', char: '猫', strokes: 11, radical: '犬',
      components: ['犭', '苗'], readings: ['ビョウ', 'ねこ'], meanings: ['cat'],
      jlpt: 'N3', grade: 8, frequency: 1702,
      sources: [
        { dictId: 'kanjidic', dictTitle: 'KANJIDIC2', licence: 'CC BY-SA 4.0' },
        { dictId: 'user', dictTitle: 'My characters', attribution: 'Local import' },
      ],
    }} />));

    expect(host.textContent).toContain('猫');
    expect(host.textContent).toContain('11');
    expect(host.textContent).toContain('犭 · 苗');
    expect(host.querySelector('.lexicon-character-components')?.textContent).toContain('犭');
    expect(host.textContent).toContain('ビョウ · ねこ');
    expect(host.textContent).toContain('KANJIDIC2');
    expect(host.textContent).toContain('CC BY-SA 4.0');
    expect(host.textContent).toContain('Local import');
    expect(host.textContent).not.toContain('undefined');
  });
});
