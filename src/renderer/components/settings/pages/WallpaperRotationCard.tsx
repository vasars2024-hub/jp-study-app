/**
 * Wallpaper rotation — playlists, time-of-day rules and calendar walls.
 *
 * v1.0 audit §1.2 moved this card from Settings → Atmosphere to Settings →
 * Wallpaper. It reads the living-layer master switch (`env.enabled`) that lives
 * on the Atmosphere page, so on this page that dependency is invisible: the
 * controls would simply be dead with no stated reason. The card therefore says
 * so, and offers a jump to the switch, instead of silently disabling itself.
 */
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import PlaylistEditor from '../../PlaylistEditor';
import { resolveWall } from '../../../environment';
import { seedWallpaperLabelKey } from '../../../environment/types';
import { useT } from '../../../i18n';

export default function WallpaperRotationCard() {
  const { t } = useT();
  const { env, patchEnv, focusSettingId, navigate } = useSettings();
  const resolved = env.enabled && env.rotationEnabled ? resolveWall(env) : null;

  return (
    <SettingsCard
      id="rotation"
      title={t('settings.atmosphere.rotation.title')}
      description={t('settings.atmosphere.rotation.desc')}
      highlight={focusSettingId === 'rotation'}
      trailing={
        <label className="os-toggle os-toggle-compact">
          <input
            type="checkbox"
            checked={env.rotationEnabled}
            disabled={!env.enabled}
            onChange={(e) => patchEnv({ rotationEnabled: e.target.checked })}
            aria-label={t('settings.atmosphere.enableRotation')}
          />
          <span>{env.rotationEnabled ? t('common.on') : t('common.off')}</span>
        </label>
      }
    >
      {!env.enabled && (
        <p className="muted os-set-hint">
          {t('settings.wallpaper.rotationNeedsLivingLayer')}{' '}
          <button
            type="button"
            className="btn small"
            // `atmosphere` is an advanced page, so this needs `guided` or the
            // guard bounces Home and the hint above points at a dead button.
            onClick={() => navigate('atmosphere', 'living-layer', { guided: true })}
          >
            {t('settings.wallpaper.rotationOpenAtmosphere')}
          </button>
        </p>
      )}
      {resolved && (
        <p className="muted os-set-hint">
          {t('settings.atmosphere.now')} <strong>
            {(() => {
              const key = seedWallpaperLabelKey(resolved.item);
              return key ? t(key) : (resolved.item.label ?? resolved.item.ref);
            })()}
          </strong>
          {' — '}
          {resolved.reason}
        </p>
      )}
      <label className="os-toggle">
        <input
          type="checkbox"
          checked={env.calendarWallsEnabled}
          disabled={!env.enabled || !env.rotationEnabled}
          onChange={(e) => patchEnv({ calendarWallsEnabled: e.target.checked })}
        />
        <span>{t('settings.atmosphere.calendarWalls')}</span>
      </label>
      <PlaylistEditor env={env} disabled={!env.enabled || !env.rotationEnabled} onChange={patchEnv} />
    </SettingsCard>
  );
}
