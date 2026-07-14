import type {
  ReaderSettings,
  ReaderTheme,
  ReaderFont,
  ReaderFlow,
  ReaderWritingMode,
} from '../readerSettings';
import {
  DEFAULT_SETTINGS,
  clampFontSize,
  FONT_MIN,
  FONT_MAX,
  clampLineHeight,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_MAX,
  clampIndent,
  INDENT_MAX,
  clampMargin,
  MARGIN_MAX,
} from '../readerSettings';

interface Props {
  settings: ReaderSettings;
  onChange: (s: ReaderSettings) => void;
  /** When true, render as a full-width block (Settings app) not a floating popover. */
  embedded?: boolean;
}

const FLOW_OPTIONS: { id: ReaderFlow; label: string }[] = [
  { id: 'paginated', label: 'Pages' },
  { id: 'scrolled', label: 'Scroll' },
];

const WRITING_OPTIONS: { id: ReaderWritingMode; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'horizontal', label: '横 Rows' },
  { id: 'vertical', label: '縦 Tategaki' },
];

const THEME_OPTIONS: { id: ReaderTheme; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'cream', label: 'Cream' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'gray', label: 'Gray' },
  { id: 'dark', label: 'Dark' },
  { id: 'black', label: 'Black' },
];

type BoolKey =
  | 'justify'
  | 'kerning'
  | 'vpal'
  | 'prettyWrap'
  | 'prioritizeStyles'
  | 'hideFurigana'
  | 'wordHighlight'
  | 'hyperlinksEnabled';
const TOGGLES: { key: BoolKey; label: string }[] = [
  { key: 'justify', label: 'Justify text' },
  { key: 'kerning', label: 'Font kerning' },
  { key: 'vpal', label: 'Punctuation spacing' },
  { key: 'prettyWrap', label: 'Pretty wrap' },
  { key: 'prioritizeStyles', label: 'Prioritize my styles' },
  { key: 'hideFurigana', label: 'Hide furigana' },
  { key: 'wordHighlight', label: 'Vocabulary colors (New / Learning / Known)' },
  {
    key: 'hyperlinksEnabled',
    label: 'Hyperlinks (Wikipedia → import as EPUB)',
  },
];

function Stepper(props: {
  label: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
  decDisabled: boolean;
  incDisabled: boolean;
}) {
  return (
    <div className="sp-row">
      <span className="sp-label">{props.label}</span>
      <div className="sp-stepper">
        <button className="btn small" disabled={props.decDisabled} onClick={props.onDec}>
          −
        </button>
        <span className="sp-value">{props.value}</span>
        <button className="btn small" disabled={props.incDisabled} onClick={props.onInc}>
          +
        </button>
      </div>
    </div>
  );
}

export default function ReaderSettingsPanel({ settings, onChange, embedded = false }: Props) {
  // Backfill defaults so a settings object saved before a field existed (or a
  // stale one) can never blank the panel with an undefined read.
  const s: ReaderSettings = { ...DEFAULT_SETTINGS, ...settings };
  const set = (patch: Partial<ReaderSettings>) => onChange({ ...s, ...patch });

  return (
    <div
      className={`settings-panel reader-settings${embedded ? ' reader-settings-embedded' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <Stepper
        label="Text size"
        value={`${s.fontSize}%`}
        onDec={() => set({ fontSize: clampFontSize(s.fontSize - 10) })}
        onInc={() => set({ fontSize: clampFontSize(s.fontSize + 10) })}
        decDisabled={s.fontSize <= FONT_MIN}
        incDisabled={s.fontSize >= FONT_MAX}
      />

      <div className="sp-row sp-col">
        <span className="sp-label">Reading mode</span>
        <div className="sp-seg">
          {FLOW_OPTIONS.map((f) => (
            <button
              key={f.id}
              className={`sp-seg-btn ${s.flow === f.id ? 'active' : ''}`}
              onClick={() => set({ flow: f.id })}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sp-row sp-col">
        <span className="sp-label">Direction</span>
        <div className="sp-seg">
          {WRITING_OPTIONS.map((w) => (
            <button
              key={w.id}
              className={`sp-seg-btn ${s.writingMode === w.id ? 'active' : ''}`}
              onClick={() => set({ writingMode: w.id })}
              lang="ja"
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sp-row sp-col">
        <span className="sp-label">Theme</span>
        <div className="sp-seg sp-seg-wrap">
          {THEME_OPTIONS.map((t) => (
            <button
              key={t.id}
              className={`sp-seg-btn ${s.theme === t.id ? 'active' : ''}`}
              onClick={() => set({ theme: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sp-row">
        <span className="sp-label">Font</span>
        <select value={s.font} onChange={(e) => set({ font: e.target.value as ReaderFont })}>
          <option value="default">Publisher default</option>
          <option value="serif">Serif (Mincho)</option>
          <option value="sans">Sans (Gothic)</option>
          <option value="rounded">Rounded</option>
        </select>
      </div>

      <div className="sp-row">
        <span className="sp-label">Font weight</span>
        <select
          value={s.fontWeight}
          onChange={(e) => set({ fontWeight: Number(e.target.value) })}
        >
          <option value={0}>Default</option>
          <option value={300}>Light</option>
          <option value={400}>Normal</option>
          <option value={500}>Medium</option>
          <option value={700}>Bold</option>
        </select>
      </div>

      <Stepper
        label="Line height"
        value={s.lineHeight.toFixed(2)}
        onDec={() => set({ lineHeight: clampLineHeight(s.lineHeight - 0.05) })}
        onInc={() => set({ lineHeight: clampLineHeight(s.lineHeight + 0.05) })}
        decDisabled={s.lineHeight <= LINE_HEIGHT_MIN}
        incDisabled={s.lineHeight >= LINE_HEIGHT_MAX}
      />

      <Stepper
        label="Paragraph indent"
        value={`${s.paragraphIndent}em`}
        onDec={() => set({ paragraphIndent: clampIndent(s.paragraphIndent - 0.5) })}
        onInc={() => set({ paragraphIndent: clampIndent(s.paragraphIndent + 0.5) })}
        decDisabled={s.paragraphIndent <= 0}
        incDisabled={s.paragraphIndent >= INDENT_MAX}
      />

      <Stepper
        label="Side margin"
        value={`${s.sideMargin}%`}
        onDec={() => set({ sideMargin: clampMargin(s.sideMargin - 2) })}
        onInc={() => set({ sideMargin: clampMargin(s.sideMargin + 2) })}
        decDisabled={s.sideMargin <= 0}
        incDisabled={s.sideMargin >= MARGIN_MAX}
      />

      <div className="sp-toggles">
        {TOGGLES.map((t) => (
          <label key={t.key} className="sp-toggle">
            <input
              type="checkbox"
              checked={!!s[t.key]}
              onChange={(e) => set({ [t.key]: e.target.checked })}
            />
            <span>{t.label}</span>
          </label>
        ))}
      </div>

      <p className="sp-hint">Hold Ctrl and scroll to resize. Settings save automatically.</p>
    </div>
  );
}
