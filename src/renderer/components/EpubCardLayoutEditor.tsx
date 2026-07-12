import { useRef } from 'react';
import {
  EPUB_CARD_LAYOUT_PRESETS,
  applyEpubCardLayoutPreset,
  type EpubCardLayoutPreset,
} from '../../shared/mining';
import EpubVariablePalette from './EpubVariablePalette';

type Side = 'front' | 'back';

type Props = {
  preset: EpubCardLayoutPreset;
  front: string;
  back: string;
  onApply: (next: { preset: EpubCardLayoutPreset; front: string; back: string }) => void;
};

export default function EpubCardLayoutEditor({
  preset,
  front,
  back,
  onApply,
}: Props) {
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);
  const lastFocused = useRef<Side>('front');

  function insertVar(varKey: string) {
    const token = `{${varKey}}`;
    const side = lastFocused.current;
    const el = side === 'front' ? frontRef.current : backRef.current;
    const current = side === 'front' ? front : back;
    let next: string;
    let caret: number;
    if (el && document.activeElement === el && el.selectionStart != null) {
      const start = el.selectionStart;
      const end = el.selectionEnd ?? start;
      next = current.slice(0, start) + token + current.slice(end);
      caret = start + token.length;
    } else {
      next = current ? `${current} ${token}` : token;
      caret = next.length;
    }
    onApply({ preset: 'custom', front: side === 'front' ? next : front, back: side === 'back' ? next : back });
    requestAnimationFrame(() => {
      const again = side === 'front' ? frontRef.current : backRef.current;
      if (again) {
        again.focus();
        again.setSelectionRange(caret, caret);
      }
    });
  }

  function applyPreset(presetId: EpubCardLayoutPreset) {
    if (presetId === 'custom') {
      onApply({ preset: 'custom', front, back });
      return;
    }
    const match = applyEpubCardLayoutPreset(presetId);
    if (!match) {
      onApply({ preset: 'custom', front, back });
      return;
    }
    onApply({ preset: match.cardLayoutPreset, front: match.front, back: match.back });
  }

  return (
    <div className="epub-card-layout-editor">
      <label className="epub-layout-preset">
        Preset
        <select value={preset} onChange={(e) => applyPreset(e.target.value as EpubCardLayoutPreset)}>
          {EPUB_CARD_LAYOUT_PRESETS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </label>

      <div className="fm-rows">
        <label className="fm-row">
          <span className="fm-field-name">Front</span>
          <input
            ref={frontRef}
            className="fm-input"
            value={front}
            spellCheck={false}
            placeholder="{expression:ja}"
            onFocus={() => {
              lastFocused.current = 'front';
            }}
            onChange={(e) => {
              onApply({ preset: 'custom', front: e.target.value, back });
            }}
          />
        </label>
        <label className="fm-row">
          <span className="fm-field-name">Back</span>
          <input
            ref={backRef}
            className="fm-input"
            value={back}
            spellCheck={false}
            placeholder="{meaning:en}"
            onFocus={() => {
              lastFocused.current = 'back';
            }}
            onChange={(e) => {
              onApply({ preset: 'custom', front, back: e.target.value });
            }}
          />
        </label>
      </div>

      <EpubVariablePalette onInsert={insertVar} />
    </div>
  );
}
