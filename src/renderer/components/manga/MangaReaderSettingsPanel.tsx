import { useState } from 'react';
import { Tabs, Slider, Select, Toggle } from '../ui';
import { useT } from '../../i18n';
import {
  CUBARI_THEME_COLORS,
  DEFAULT_MANGA_READER_SETTINGS,
  MAX_PAGE_WIDTH_MAX,
  MAX_PAGE_WIDTH_MIN,
  PRELOAD_CONCURRENCY_MAX,
  PRELOAD_CONCURRENCY_MIN,
  PRELOAD_PAGES_MAX,
  SCROLL_SPEED_MAX,
  SCROLL_SPEED_MIN,
  SPREAD_COUNT_MAX,
  type DetectionSensitivity,
  type MangaReaderSettings,
  type PageFitMode,
} from '../../mangaReaderSettings';

interface Props {
  settings: MangaReaderSettings;
  onChange: (patch: Partial<MangaReaderSettings>) => void;
  onClose: () => void;
}

const PAGE_FIT_MODES: PageFitMode[] = [
  'limit-all',
  'limit-width',
  'limit-height',
  'stretch-all',
  'stretch-width',
  'stretch-height',
];

export default function MangaReaderSettingsPanel({ settings, onChange, onClose }: Props) {
  const { t } = useT();
  const [tab, setTab] = useState('display');

  const tabs = [
    { id: 'display', label: t('manga.settings.tab.display') },
    { id: 'nav', label: t('manga.settings.tab.nav') },
    { id: 'interface', label: t('manga.settings.tab.interface') },
    { id: 'ocr', label: t('manga.settings.tab.ocr') },
    { id: 'theme', label: t('manga.settings.tab.theme') },
  ];

  return (
    <div className="manga-settings-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="manga-settings-panel" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="manga-settings-head">
          <span>{t('manga.settings.title')}</span>
          <button className="dict-x" onClick={onClose} aria-label={t('manga.ocr.close')}>
            ×
          </button>
        </div>
        <Tabs tabs={tabs} value={tab} onChange={setTab} aria-label={t('manga.settings.title')} />

        <div className="manga-settings-body">
          {tab === 'display' && (
            <>
              <div className="manga-settings-row">
                <label>{t('manga.settings.pageFit')}</label>
                <Select
                  value={settings.pageFit}
                  onChange={(e) => onChange({ pageFit: e.target.value as PageFitMode })}
                  options={PAGE_FIT_MODES.map((m) => ({ value: m, label: t(`manga.settings.pageFit.${m}`) }))}
                />
              </div>
              <div className="manga-settings-row">
                <label>
                  {t('manga.settings.maxPageWidth')}: {settings.maxPageWidthPct}%
                </label>
                <Slider
                  min={MAX_PAGE_WIDTH_MIN}
                  max={MAX_PAGE_WIDTH_MAX}
                  value={settings.maxPageWidthPct}
                  onChange={(e) => onChange({ maxPageWidthPct: Number(e.target.value) })}
                  aria-label={t('manga.settings.maxPageWidth')}
                />
              </div>
              <div className="manga-settings-row">
                <label>{t('manga.settings.spread')}</label>
                <div className="sp-seg">
                  <button
                    className={`sp-seg-btn ${settings.spreadPageCount === 1 ? 'active' : ''}`}
                    aria-pressed={settings.spreadPageCount === 1}
                    onClick={() => onChange({ spreadPageCount: 1, spreadPageOffset: 0 })}
                  >
                    {t('manga.settings.spread.single')}
                  </button>
                  <button
                    className={`sp-seg-btn ${settings.spreadPageCount === 2 && settings.spreadPageOffset === 0 ? 'active' : ''}`}
                    aria-pressed={settings.spreadPageCount === 2 && settings.spreadPageOffset === 0}
                    onClick={() => onChange({ spreadPageCount: 2, spreadPageOffset: 0 })}
                  >
                    {t('manga.settings.spread.double')}
                  </button>
                  <button
                    className={`sp-seg-btn ${settings.spreadPageCount === 2 && settings.spreadPageOffset === 1 ? 'active' : ''}`}
                    aria-pressed={settings.spreadPageCount === 2 && settings.spreadPageOffset === 1}
                    onClick={() => onChange({ spreadPageCount: 2, spreadPageOffset: 1 })}
                  >
                    {t('manga.settings.spread.doubleOdd')}
                  </button>
                </div>
              </div>
              <div className="manga-settings-row">
                <label>
                  {t('manga.settings.spreadCount')}: {settings.spreadPageCount}p
                </label>
                <Slider
                  min={1}
                  max={SPREAD_COUNT_MAX}
                  value={settings.spreadPageCount}
                  onChange={(e) => onChange({ spreadPageCount: Number(e.target.value) })}
                  aria-label={t('manga.settings.spreadCount')}
                />
              </div>
              <div className="manga-settings-row">
                <label>
                  {t('manga.settings.spreadOffset')}: {settings.spreadPageOffset}p
                </label>
                <Slider
                  min={0}
                  max={Math.max(0, settings.spreadPageCount - 1)}
                  value={settings.spreadPageOffset}
                  onChange={(e) => onChange({ spreadPageOffset: Number(e.target.value) })}
                  aria-label={t('manga.settings.spreadOffset')}
                />
              </div>
              <div className="manga-settings-row manga-settings-row-toggle">
                <Toggle
                  checked={settings.removeGapsVertical}
                  onChange={(e) => onChange({ removeGapsVertical: e.target.checked })}
                  label={t('manga.settings.removeGaps')}
                />
              </div>
            </>
          )}

          {tab === 'nav' && (
            <>
              <div className="manga-settings-row">
                <label>{t('manga.settings.layout')}</label>
                <div className="sp-seg">
                  <button
                    className={`sp-seg-btn ${settings.readerLayout === 'ltr' ? 'active' : ''}`}
                    aria-pressed={settings.readerLayout === 'ltr'}
                    onClick={() => onChange({ readerLayout: 'ltr' })}
                  >
                    {t('manga.settings.layout.ltr')}
                  </button>
                  <button
                    className={`sp-seg-btn ${settings.readerLayout === 'ttb' ? 'active' : ''}`}
                    aria-pressed={settings.readerLayout === 'ttb'}
                    onClick={() => onChange({ readerLayout: 'ttb' })}
                  >
                    {t('manga.settings.layout.ttb')}
                  </button>
                  <button
                    className={`sp-seg-btn ${settings.readerLayout === 'rtl' ? 'active' : ''}`}
                    aria-pressed={settings.readerLayout === 'rtl'}
                    onClick={() => onChange({ readerLayout: 'rtl' })}
                  >
                    {t('manga.settings.layout.rtl')}
                  </button>
                </div>
              </div>
              <div className="manga-settings-row">
                <label>
                  {t('manga.settings.preloadPages')}: {settings.preloadPages < 0 ? '∞' : settings.preloadPages}
                </label>
                <Slider
                  min={1}
                  max={PRELOAD_PAGES_MAX + 1}
                  value={settings.preloadPages < 0 ? PRELOAD_PAGES_MAX + 1 : settings.preloadPages}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    onChange({ preloadPages: v > PRELOAD_PAGES_MAX ? -1 : v });
                  }}
                  aria-label={t('manga.settings.preloadPages')}
                />
              </div>
              <div className="manga-settings-row">
                <label>
                  {t('manga.settings.preloadConcurrency')}: {settings.preloadConcurrency}
                </label>
                <Slider
                  min={PRELOAD_CONCURRENCY_MIN}
                  max={PRELOAD_CONCURRENCY_MAX}
                  step={5}
                  value={settings.preloadConcurrency}
                  onChange={(e) => onChange({ preloadConcurrency: Number(e.target.value) })}
                  aria-label={t('manga.settings.preloadConcurrency')}
                />
              </div>
              <div className="manga-settings-row">
                <label>
                  {t('manga.settings.scrollSpeed')}: {settings.scrollSpeedPx}px
                </label>
                <Slider
                  min={SCROLL_SPEED_MIN}
                  max={SCROLL_SPEED_MAX}
                  step={5}
                  value={settings.scrollSpeedPx}
                  onChange={(e) => onChange({ scrollSpeedPx: Number(e.target.value) })}
                  aria-label={t('manga.settings.scrollSpeed')}
                />
              </div>
              <div className="manga-settings-row manga-settings-row-toggle">
                <Toggle
                  checked={settings.resetScrollOnFlip}
                  onChange={(e) => onChange({ resetScrollOnFlip: e.target.checked })}
                  label={t('manga.settings.resetScroll')}
                />
              </div>
              <div className="manga-settings-row manga-settings-row-toggle">
                <Toggle
                  checked={settings.clickToTurnPages}
                  onChange={(e) => onChange({ clickToTurnPages: e.target.checked })}
                  label={t('manga.settings.clickToTurn')}
                />
              </div>
              <div className="manga-settings-row manga-settings-row-toggle">
                <Toggle
                  checked={settings.arrowKeysInVertical}
                  onChange={(e) => onChange({ arrowKeysInVertical: e.target.checked })}
                  label={t('manga.settings.arrowKeysVertical')}
                />
              </div>
              <div className="manga-settings-row manga-settings-row-toggle">
                <Toggle
                  checked={settings.swipeGesturesEnabled}
                  onChange={(e) => onChange({ swipeGesturesEnabled: e.target.checked })}
                  label={t('manga.settings.swipeGestures')}
                />
              </div>
              <div className="manga-settings-row">
                <label>{t('manga.settings.historyBehavior')}</label>
                <Select
                  value={settings.historyBehavior}
                  onChange={(e) =>
                    onChange({ historyBehavior: e.target.value as MangaReaderSettings['historyBehavior'] })
                  }
                  options={['none', 'title', 'chapter', 'chapter-skip', 'every-move'].map((v) => ({
                    value: v,
                    label: t(`manga.settings.historyBehavior.${v}`),
                  }))}
                />
                <p className="muted manga-settings-hint">{t('manga.settings.historyBehavior.hint')}</p>
              </div>
            </>
          )}

          {tab === 'interface' && (
            <>
              <div className="manga-settings-row">
                <label>{t('manga.settings.pageSelectorPosition')}</label>
                <div className="sp-seg">
                  <button
                    className={`sp-seg-btn ${settings.pageSelectorPosition === 'left' ? 'active' : ''}`}
                    aria-pressed={settings.pageSelectorPosition === 'left'}
                    onClick={() => onChange({ pageSelectorPosition: 'left' })}
                  >
                    {t('manga.settings.pageSelectorPosition.left')}
                  </button>
                  <button
                    className={`sp-seg-btn ${settings.pageSelectorPosition === 'bottom' ? 'active' : ''}`}
                    aria-pressed={settings.pageSelectorPosition === 'bottom'}
                    onClick={() => onChange({ pageSelectorPosition: 'bottom' })}
                  >
                    {t('manga.settings.pageSelectorPosition.bottom')}
                  </button>
                </div>
              </div>
              <div className="manga-settings-row manga-settings-row-toggle">
                <Toggle
                  checked={settings.pageSelectorPinned}
                  onChange={(e) => onChange({ pageSelectorPinned: e.target.checked })}
                  label={t('manga.settings.pageSelectorPinned')}
                />
              </div>
              <div className="manga-settings-row manga-settings-row-toggle">
                <Toggle
                  checked={settings.showPageNumber}
                  onChange={(e) => onChange({ showPageNumber: e.target.checked })}
                  label={t('manga.settings.showPageNumber')}
                />
              </div>
              <div className="manga-settings-row manga-settings-row-toggle">
                <Toggle
                  checked={settings.hoverHintsEnabled}
                  onChange={(e) => onChange({ hoverHintsEnabled: e.target.checked })}
                  label={t('manga.settings.hoverHints')}
                />
              </div>
              <div className="manga-settings-row manga-settings-row-toggle">
                <Toggle
                  checked={settings.showSidebarByDefault}
                  onChange={(e) => onChange({ showSidebarByDefault: e.target.checked })}
                  label={t('manga.settings.showSidebar')}
                />
              </div>
              <div className="manga-settings-row manga-settings-row-toggle">
                <Toggle
                  checked={settings.showPagePreviews}
                  onChange={(e) => onChange({ showPagePreviews: e.target.checked })}
                  label={t('manga.settings.showPreviews')}
                />
              </div>
            </>
          )}

          {tab === 'ocr' && (
            <>
              <div className="manga-settings-row manga-settings-row-toggle">
                <Toggle
                  checked={settings.autoTranslate}
                  onChange={(e) => onChange({ autoTranslate: e.target.checked })}
                  label={t('manga.settings.autoTranslate')}
                />
              </div>
              <p className="muted manga-settings-hint">{t('manga.settings.autoTranslate.hint')}</p>
              <div className="manga-settings-row">
                <label>{t('manga.settings.detectionSensitivity')}</label>
                <Select
                  value={settings.detectionSensitivity}
                  onChange={(e) =>
                    onChange({ detectionSensitivity: e.target.value as DetectionSensitivity })
                  }
                  options={(['low', 'normal', 'high'] as const).map((v) => ({
                    value: v,
                    label: t(`manga.settings.detectionSensitivity.${v}`),
                  }))}
                />
                <p className="muted manga-settings-hint">
                  {t('manga.settings.detectionSensitivity.hint')}
                </p>
              </div>
            </>
          )}

          {tab === 'theme' && (
            <>
              <div className="manga-settings-row">
                <label>{t('manga.settings.theme')}</label>
                <Select
                  value={settings.theme}
                  onChange={(e) => {
                    const theme = e.target.value as MangaReaderSettings['theme'];
                    if (theme === 'cubari') onChange({ theme, themeColors: { ...CUBARI_THEME_COLORS } });
                    else onChange({ theme });
                  }}
                  options={[
                    { value: 'app-default', label: t('manga.settings.theme.appDefault') },
                    { value: 'cubari', label: t('manga.settings.theme.cubari') },
                    { value: 'custom', label: t('manga.settings.theme.custom') },
                  ]}
                />
              </div>
              {(['interface', 'text', 'accent', 'background'] as const).map((key) => (
                <div className="manga-settings-row manga-settings-row-color" key={key}>
                  <label>{t(`manga.settings.color.${key}`)}</label>
                  <input
                    type="color"
                    value={settings.themeColors[key]}
                    onChange={(e) =>
                      onChange({
                        theme: 'custom',
                        themeColors: { ...settings.themeColors, [key]: e.target.value },
                      })
                    }
                  />
                </div>
              ))}
              <button
                className="btn small"
                onClick={() =>
                  onChange({ theme: 'app-default', themeColors: { ...DEFAULT_MANGA_READER_SETTINGS.themeColors } })
                }
              >
                {t('manga.settings.resetTheme')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
