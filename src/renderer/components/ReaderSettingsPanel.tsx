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
  clampContentWidth,
  CONTENT_WIDTH_MIN,
  CONTENT_WIDTH_MAX,
} from '../readerSettings';
import { useT } from '../i18n';

interface Props {
  settings: ReaderSettings;
  onChange: (s: ReaderSettings) => void;
  /** When true, render as a full-width block (Settings app) not a floating popover. */
  embedded?: boolean;
}

type BoolKey =
  | 'justify'
  | 'kerning'
  | 'vpal'
  | 'prettyWrap'
  | 'prioritizeStyles'
  | 'hideFurigana'
  | 'wordHighlight'
  | 'hyperlinksEnabled';

const FLOW_OPTIONS: { id: ReaderFlow; labelKey: string }[] = [
  { id: 'paginated', labelKey: 'settings.reader.flow.pages' },
  { id: 'scrolled', labelKey: 'settings.reader.flow.scroll' },
];

const WRITING_OPTIONS: { id: ReaderWritingMode; labelKey: string }[] = [
  { id: 'auto', labelKey: 'settings.reader.write.auto' },
  { id: 'horizontal', labelKey: 'settings.reader.write.horizontal' },
  { id: 'vertical', labelKey: 'settings.reader.write.vertical' },
];

const THEME_OPTIONS: { id: ReaderTheme; labelKey: string }[] = [
  { id: 'light', labelKey: 'settings.reader.theme.light' },
  { id: 'cream', labelKey: 'settings.reader.theme.cream' },
  { id: 'sepia', labelKey: 'settings.reader.theme.sepia' },
  { id: 'gray', labelKey: 'settings.reader.theme.gray' },
  { id: 'dark', labelKey: 'settings.reader.theme.dark' },
  { id: 'black', labelKey: 'settings.reader.theme.black' },
  { id: 'wired', labelKey: 'settings.reader.theme.wired' },
];

const TOGGLES: { key: BoolKey; labelKey: string }[] = [
  { key: 'justify', labelKey: 'settings.reader.toggle.justify' },
  { key: 'kerning', labelKey: 'settings.reader.toggle.kerning' },
  { key: 'vpal', labelKey: 'settings.reader.toggle.vpal' },
  { key: 'prettyWrap', labelKey: 'settings.reader.toggle.prettyWrap' },
  { key: 'prioritizeStyles', labelKey: 'settings.reader.toggle.prioritizeStyles' },
  { key: 'hideFurigana', labelKey: 'settings.reader.toggle.hideFurigana' },
  { key: 'wordHighlight', labelKey: 'settings.reader.toggle.wordHighlight' },
  { key: 'hyperlinksEnabled', labelKey: 'settings.reader.toggle.hyperlinks' },
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
  const { t } = useT();
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
        label={t('settings.reader.textSize')}
        value={`${s.fontSize}%`}
        onDec={() => set({ fontSize: clampFontSize(s.fontSize - 10) })}
        onInc={() => set({ fontSize: clampFontSize(s.fontSize + 10) })}
        decDisabled={s.fontSize <= FONT_MIN}
        incDisabled={s.fontSize >= FONT_MAX}
      />

      <div className="sp-row sp-col">
        <span className="sp-label">{t('settings.reader.readingMode')}</span>
        <div className="sp-seg">
          {FLOW_OPTIONS.map((f) => (
            <button
              key={f.id}
              className={`sp-seg-btn ${s.flow === f.id ? 'active' : ''}`}
              onClick={() => set({ flow: f.id })}
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="sp-row sp-col">
        <span className="sp-label">{t('settings.reader.direction')}</span>
        <div className="sp-seg">
          {WRITING_OPTIONS.map((w) => (
            <button
              key={w.id}
              className={`sp-seg-btn ${s.writingMode === w.id ? 'active' : ''}`}
              onClick={() => set({ writingMode: w.id })}
              lang="ja"
            >
              {t(w.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="sp-row sp-col">
        <span className="sp-label">{t('settings.reader.theme')}</span>
        <div className="sp-seg sp-seg-wrap">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={`sp-seg-btn ${s.theme === opt.id ? 'active' : ''}`}
              onClick={() => set({ theme: opt.id })}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="sp-row">
        <span className="sp-label">{t('settings.reader.font')}</span>
        <select value={s.font} onChange={(e) => set({ font: e.target.value as ReaderFont })}>
          <option value="default">{t('settings.reader.font.default')}</option>
          <option value="serif">{t('settings.reader.font.serif')}</option>
          <option value="sans">{t('settings.reader.font.sans')}</option>
          <option value="rounded">{t('settings.reader.font.rounded')}</option>
        </select>
      </div>

      <div className="sp-row">
        <span className="sp-label">{t('settings.reader.fontWeight')}</span>
        <select
          value={s.fontWeight}
          onChange={(e) => set({ fontWeight: Number(e.target.value) })}
        >
          <option value={0}>{t('settings.reader.weight.default')}</option>
          <option value={300}>{t('settings.reader.weight.light')}</option>
          <option value={400}>{t('settings.reader.weight.normal')}</option>
          <option value={500}>{t('settings.reader.weight.medium')}</option>
          <option value={700}>{t('settings.reader.weight.bold')}</option>
        </select>
      </div>

      <Stepper
        label={t('settings.reader.lineHeight')}
        value={s.lineHeight.toFixed(2)}
        onDec={() => set({ lineHeight: clampLineHeight(s.lineHeight - 0.05) })}
        onInc={() => set({ lineHeight: clampLineHeight(s.lineHeight + 0.05) })}
        decDisabled={s.lineHeight <= LINE_HEIGHT_MIN}
        incDisabled={s.lineHeight >= LINE_HEIGHT_MAX}
      />

      <Stepper
        label={t('settings.reader.indent')}
        value={`${s.paragraphIndent}em`}
        onDec={() => set({ paragraphIndent: clampIndent(s.paragraphIndent - 0.5) })}
        onInc={() => set({ paragraphIndent: clampIndent(s.paragraphIndent + 0.5) })}
        decDisabled={s.paragraphIndent <= 0}
        incDisabled={s.paragraphIndent >= INDENT_MAX}
      />

      <Stepper
        label={t('settings.reader.margin')}
        value={`${s.sideMargin}%`}
        onDec={() => set({ sideMargin: clampMargin(s.sideMargin - 2) })}
        onInc={() => set({ sideMargin: clampMargin(s.sideMargin + 2) })}
        decDisabled={s.sideMargin <= 0}
        incDisabled={s.sideMargin >= MARGIN_MAX}
      />

      <Stepper
        label={t('settings.reader.contentWidth')}
        value={`${s.contentWidth}rem`}
        onDec={() => set({ contentWidth: clampContentWidth(s.contentWidth - 4) })}
        onInc={() => set({ contentWidth: clampContentWidth(s.contentWidth + 4) })}
        decDisabled={s.contentWidth <= CONTENT_WIDTH_MIN}
        incDisabled={s.contentWidth >= CONTENT_WIDTH_MAX}
      />

      <div className="sp-toggles">
        {TOGGLES.map((opt) => (
          <label key={opt.key} className="sp-toggle">
            <input
              type="checkbox"
              checked={!!s[opt.key]}
              onChange={(e) => set({ [opt.key]: e.target.checked })}
            />
            <span>{t(opt.labelKey)}</span>
          </label>
        ))}
      </div>

      <p className="sp-hint">{t('settings.reader.hint')}</p>
    </div>
  );
}
