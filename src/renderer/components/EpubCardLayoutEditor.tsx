import { useMemo, useRef } from 'react';
import {
  EPUB_CARD_LAYOUT_PRESETS,
  applyEpubCardLayoutPreset,
} from '../../shared/epubDeck';
// `epubDeck` imports this type but never re-exported it, so taking it from there was a
// pre-existing type error. It is defined in the mining data model; type-only, so the
// barrel costs nothing at runtime.
import type { EpubCardLayoutPreset } from '../../shared/miningTypes';
import { useT } from '../i18n';
import EpubVariablePalette from './EpubVariablePalette';
import { Select } from './ui';

type Side = 'front' | 'back';

type Props = {
  preset: EpubCardLayoutPreset;
  front: string;
  back: string;
  onApply: (next: { preset: EpubCardLayoutPreset; front: string; back: string }) => void;
};

const PRESET_LABEL_KEYS: Record<Exclude<EpubCardLayoutPreset, 'custom'>, string> = {
  'ja-en': 'epub.layout.preset.ja-en',
  'en-ja': 'epub.layout.preset.en-ja',
  'expression-reading': 'epub.layout.preset.expression-reading',
  'reading-expression': 'epub.layout.preset.reading-expression',
  'ja-sentence': 'epub.layout.preset.ja-sentence',
};

export default function EpubCardLayoutEditor({
  preset,
  front,
  back,
  onApply,
}: Props) {
  const { t, lang } = useT();
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);
  const lastFocused = useRef<Side>('front');

  const presetOptions = useMemo(
    () =>
      EPUB_CARD_LAYOUT_PRESETS.map((item) => ({
        id: item.id,
        label: t(PRESET_LABEL_KEYS[item.id]),
      })),
    [t, lang],
  );

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
        {t('epub.layout.preset')}
        <Select value={preset} onChange={(e) => applyPreset(e.target.value as EpubCardLayoutPreset)}>
          {presetOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
          <option value="custom">{t('epub.layout.custom')}</option>
        </Select>
      </label>

      <div className="fm-rows">
        <label className="fm-row">
          <span className="fm-field-name">{t('epub.layout.front')}</span>
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
          <span className="fm-field-name">{t('epub.layout.back')}</span>
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
