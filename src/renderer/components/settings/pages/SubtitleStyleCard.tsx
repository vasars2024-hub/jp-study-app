/**
 * Settings > Study — "Subtitle style" (round-2 J9).
 *
 * Searching Settings (or the palette) for "subtitle style", "subtitle size" or
 * "bigger subtitles" found only the subtitle PROVIDER card, an Advanced-only
 * Scraper page that downloads files and styles nothing. The style itself lives
 * with the player: size, position and background in Media Center > Settings,
 * colour, font and outline in the player's Study panel while a video plays.
 *
 * This card is the searchable door to both. It mirrors the one setting people
 * reach for most — the size — against the player's own stored preferences
 * (`playerPreferencesStore`, the same patch writer the Media Center and the
 * player use, so an open player takes the change live), and opens the Media
 * Center's settings for the rest.
 */
import { useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useT } from '../../../i18n';
import { requestMediaCenter } from '../../../mediaCenterIntent';
import {
  onPlayerPreferencesChanged,
  readStoredPlayerPreferences,
  writePlayerPreferencesPatch,
} from '../../../playerPreferencesStore';
import { normalizeVideoCoreStudyPreferences } from '../../../../shared/videoCoreStudy';

/** This surface's name on `playerPreferencesStore` writes, so it ignores its own echo. */
const SOURCE = 'settings-subtitle-style';

function storedSize(): number {
  return normalizeVideoCoreStudyPreferences(readStoredPlayerPreferences()).subtitleFontSize;
}

export default function SubtitleStyleCard() {
  const { t } = useT();
  const [size, setSize] = useState(storedSize);
  useEffect(() => onPlayerPreferencesChanged(SOURCE, () => setSize(storedSize())), []);

  const change = (value: number): void => {
    // The player's own normalizer clamps it, so the stored value is always one
    // the player accepts (16–48 px).
    const next = normalizeVideoCoreStudyPreferences({ subtitleFontSize: value }).subtitleFontSize;
    setSize(next);
    writePlayerPreferencesPatch({ subtitleFontSize: next }, SOURCE);
  };

  return (
    <SettingsCard
      id="subtitle-style"
      title={t('playerUi.subtitleStyle.title')}
      description={t('playerUi.subtitleStyle.desc')}
    >
      <div className="os-viz-row">
        <span className="os-viz-label muted">{t('playerUi.subtitleStyle.size')}</span>
        <input
          type="range"
          min={16}
          max={48}
          step={1}
          value={size}
          onChange={(e) => change(Number(e.target.value))}
          aria-label={t('playerUi.subtitleStyle.size')}
          data-subtitle-style="size"
        />
        <span className="muted">{t('playerUi.subtitleStyle.px', { size })}</span>
      </div>
      <p className="muted os-set-hint">{t('playerUi.subtitleStyle.more')}</p>
      <div className="fm-actions">
        <button
          type="button"
          className="btn"
          data-subtitle-style="open-player-settings"
          onClick={() => requestMediaCenter({ tab: 'settings' })}
        >
          {t('playerUi.subtitleStyle.open')}
        </button>
      </div>
    </SettingsCard>
  );
}
