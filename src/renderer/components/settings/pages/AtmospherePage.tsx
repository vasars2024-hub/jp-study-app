import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import PlaylistEditor from '../../PlaylistEditor';
import {
  PARTICLE_PRESETS,
  resolveWall,
  type ParticlePresetId,
  type PerformanceTier,
} from '../../../environment';
import { useT } from '../../../i18n';

export default function AtmospherePage() {
  const { t } = useT();
  const s = useSettings();
  const { env, patchEnv, seg, focusSettingId } = s;
  const resolved = env.enabled && env.rotationEnabled ? resolveWall(env) : null;

  return (
    <>
      <SettingsCard
        id="living-layer"
        title={t('settings.atmosphere.livingLayer.title')}
        description={t('settings.atmosphere.livingLayer.desc')}
        highlight={focusSettingId === 'living-layer'}
        trailing={
          <label className="os-toggle os-toggle-compact">
            <input
              type="checkbox"
              checked={env.enabled}
              onChange={(e) => patchEnv({ enabled: e.target.checked })}
              aria-label={t('settings.atmosphere.enableLivingLayer')}
            />
            <span>{env.enabled ? t('common.on') : t('common.off')}</span>
          </label>
        }
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.atmosphere.performance')}</span>
          {([
            ['off', t('common.off')],
            ['low', t('settings.atmosphere.perf.low')],
            ['medium', t('settings.atmosphere.perf.medium')],
            ['high', t('settings.atmosphere.perf.high')],
          ] as [PerformanceTier, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={seg(env.performanceTier === id)}
              onClick={() => patchEnv({ performanceTier: id })}
              disabled={!env.enabled}
            >
              {label}
            </button>
          ))}
        </div>
      </SettingsCard>

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
        {resolved && (
          <p className="muted os-set-hint">
            {t('settings.atmosphere.now')} <strong>{resolved.item.label ?? resolved.item.ref}</strong>
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

      <SettingsCard
        id="lighting"
        title={t('settings.atmosphere.lighting.title')}
        description={t('settings.atmosphere.lighting.desc')}
        highlight={focusSettingId === 'lighting'}
        trailing={
          <label className="os-toggle os-toggle-compact">
            <input
              type="checkbox"
              checked={env.dayCycleLighting}
              disabled={!env.enabled}
              onChange={(e) => patchEnv({ dayCycleLighting: e.target.checked })}
              aria-label={t('settings.atmosphere.enableLighting')}
            />
            <span>{env.dayCycleLighting ? t('common.on') : t('common.off')}</span>
          </label>
        }
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.atmosphere.intensity')}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={env.lightingIntensity}
            disabled={!env.enabled || !env.dayCycleLighting}
            onChange={(e) => patchEnv({ lightingIntensity: Number(e.target.value) })}
          />
          <span className="muted">{Math.round(env.lightingIntensity * 100)}%</span>
        </div>
      </SettingsCard>

      <SettingsCard
        id="particles"
        title={t('settings.atmosphere.particles.title')}
        description={t('settings.atmosphere.particles.desc')}
        highlight={
          focusSettingId === 'particles' ||
          focusSettingId === 'particle-size' ||
          focusSettingId === 'snow-accumulation'
        }
        trailing={
          <label className="os-toggle os-toggle-compact">
            <input
              type="checkbox"
              checked={env.particlesEnabled}
              disabled={!env.enabled}
              onChange={(e) => patchEnv({ particlesEnabled: e.target.checked })}
              aria-label={t('settings.atmosphere.enableParticles')}
            />
            <span>{env.particlesEnabled ? t('common.on') : t('common.off')}</span>
          </label>
        }
      >
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={env.matchParticleSuggestions}
            disabled={!env.enabled || !env.particlesEnabled}
            onChange={(e) => patchEnv({ matchParticleSuggestions: e.target.checked })}
          />
          <span>{t('settings.atmosphere.matchWallpaper')}</span>
        </label>
        <div className="os-viz-row" style={{ flexWrap: 'wrap' }}>
          <span className="os-viz-label muted">{t('settings.atmosphere.presets')}</span>
          {PARTICLE_PRESETS.map((p) => {
            const on = env.particlePresets.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                className={seg(on)}
                disabled={!env.enabled || !env.particlesEnabled || env.matchParticleSuggestions}
                title={p.label}
                onClick={() => {
                  const next: ParticlePresetId[] = on
                    ? env.particlePresets.filter((id) => id !== p.id)
                    : [...env.particlePresets, p.id];
                  patchEnv({ particlePresets: next.length ? next : [p.id] });
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.atmosphere.density')}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={env.particleDensity}
            disabled={!env.enabled || !env.particlesEnabled}
            onChange={(e) => patchEnv({ particleDensity: Number(e.target.value) })}
          />
          <span className="muted">{Math.round(env.particleDensity * 100)}%</span>
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.atmosphere.intensity')}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={env.particleIntensity ?? 0.8}
            disabled={!env.enabled || !env.particlesEnabled}
            onChange={(e) => patchEnv({ particleIntensity: Number(e.target.value) })}
          />
          <span className="muted">{Math.round((env.particleIntensity ?? 0.8) * 100)}%</span>
        </div>
        <div className="os-viz-row" data-setting-id="particle-size">
          <span className="os-viz-label muted">{t('settings.atmosphere.size')}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={env.particleSize ?? 0.55}
            disabled={!env.enabled || !env.particlesEnabled}
            onChange={(e) => patchEnv({ particleSize: Number(e.target.value) })}
          />
          <span className="muted">{Math.round((env.particleSize ?? 0.55) * 100)}%</span>
        </div>
        <label className="os-toggle" data-setting-id="snow-accumulation">
          <input
            type="checkbox"
            checked={env.snowAccumulation !== false}
            disabled={!env.enabled || !env.particlesEnabled}
            onChange={(e) => patchEnv({ snowAccumulation: e.target.checked })}
          />
          <span>{t('settings.atmosphere.snowAccumulation')}</span>
        </label>
      </SettingsCard>

      <SettingsCard
        id="achievements"
        title={t('settings.atmosphere.achievements.title')}
        description={t('settings.atmosphere.achievements.desc')}
        highlight={focusSettingId === 'achievements'}
      >
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={env.achievementCelebrations}
            disabled={!env.enabled}
            onChange={(e) => patchEnv({ achievementCelebrations: e.target.checked })}
          />
          <span>{t('settings.atmosphere.celebrateStreaks')}</span>
        </label>
        <p className="muted os-set-hint">{t('settings.atmosphere.noctisNote')}</p>
      </SettingsCard>
    </>
  );
}
