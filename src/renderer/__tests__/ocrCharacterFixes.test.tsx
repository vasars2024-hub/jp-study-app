// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { OcrCharacterFixes } from '../components/OcrCharacterFixes';
import RegionEditorModal from '../components/manga/RegionEditorModal';

vi.mock('../appZoom', () => ({ getZoomFactor: () => 1 }));
vi.mock('../i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
let root: Root | null = null;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = null; document.body.replaceChildren(); });

describe('OCR one-click fixes', () => {
  it('replaces a code-point index and hides candidates after an unrelated edit', async () => {
    const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    const changed = vi.fn();
    const unsure = [{ at: 1, ch: '後', p: 0.4, alts: ['竜'] }];
    await act(async () => root?.render(<OcrCharacterFixes text="𠮷後" unsure={unsure} label="Corrected text" onChange={changed} />));
    await act(async () => host.querySelector<HTMLButtonElement>('button')?.click());
    expect(changed).toHaveBeenCalledWith('𠮷竜');
    await act(async () => root?.render(<OcrCharacterFixes text="別の文" unsure={unsure} label="Corrected text" onChange={changed} />));
    expect(host.querySelector('button')).toBeNull();
  });

  it('manga fixes use the existing save action and leave the other unsure characters fixable', async () => {
    const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    const onSaveLines = vi.fn();
    const block = { box: [0, 0, 100, 100] as [number, number, number, number], vertical: true,
      lines: ['𠮷後の後'], rawLines: ['𠮷後の後'], regionId: 'r',
      unsure: [{ at: 1, ch: '後', p: 0.4, alts: ['竜'] }, { at: 3, ch: '後', p: 0.5, alts: ['竜'] }] };
    const noop = () => undefined;
    await act(async () => root?.render(<RegionEditorModal
      page={{ version: '1.01', img_width: 100, img_height: 100, blocks: [block] }} block={block} pageUrl="image.png"
      anchor={{ x: 0, y: 0 }} busy={false} onClose={noop} onSaveLines={onSaveLines} onSetKind={noop}
      onSetVertical={noop} onRescan={noop} onMerge={noop} splitAxis="x" splitFraction={0.5}
      onSplitAxisChange={noop} onSplitFractionChange={noop} onConfirmSplit={noop}
    />));
    await act(async () => host.querySelector<HTMLButtonElement>('.ocr-character-fixes button')?.click());
    expect(onSaveLines).toHaveBeenLastCalledWith(['𠮷竜の後']);
    expect(host.querySelectorAll('.ocr-character-fixes button')).toHaveLength(1);
    await act(async () => host.querySelector<HTMLButtonElement>('.ocr-character-fixes button')?.click());
    expect(onSaveLines).toHaveBeenLastCalledWith(['𠮷竜の竜']);
    expect(host.querySelectorAll('.ocr-character-fixes button')).toHaveLength(0);
    expect(block.rawLines).toEqual(['𠮷後の後']);
  });
});
