/**
 * Settings → Motion & Accessibility (Road to v1.01 · Phase 4.5).
 *
 * Motion Mode writes through to `displayPrefs.animationLevel` (see
 * motionPrefs.ts) — the Display page's "Animation" card is the same switch
 * viewed from the accessibility side, deliberately, so the two can never
 * disagree.
 */
import { useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import { useT } from '../../../i18n';
import {
  effectiveVelocity,
  loadMotionPrefs,
  onMotionPrefsChanged,
  resetMotionPrefs,
  saveMotionPrefs,
  VELOCITY_MAX,
  VELOCITY_MIN,
  type MotionModeId,
  type MotionPrefs,
  type ParticleDensityId,
} from '../../../motion/motionPrefs';
import { fireRewardAt } from '../../../motion/rewardBurst';
import LiquidMeter from '../../../motion/LiquidMeter';
import ScoreTicker from '../../../motion/ScoreTicker';

export default function MotionPage() {
  const { t } = useT();
  const { seg, focusSettingId } = useSettings();
  const [m, setM] = useState<MotionPrefs>(loadMotionPrefs);
  // Preview state so the sliders are verifiable by eye, not just by trust.
  const [previewFill, setPreviewFill] = useState(0.35);
  const [previewScore, setPreviewScore] = useState(0);

  useEffect(() => onMotionPrefsChanged(setM), []);

  const patch = (p: Partial<MotionPrefs>) => setM(saveMotionPrefs(p));

  const velocityLabel =
    m.velocity === 0
      ? t('settings.motion.velocity.instant')
      : `${m.velocity.toFixed(2)}×`;

  return (
    <>
      <SettingsCard
        id="motion-mode"
        title={t('search.motionMode')}
        description={t('search.motionMode.desc')}
        highlight={focusSettingId === 'motion-mode'}
      >
        <div className="os-viz-row">
          {(
            [
              ['normal', 'settings.motion.mode.normal'],
              ['performance', 'settings.motion.mode.performance'],
              ['disabled', 'settings.motion.mode.disabled'],
            ] as [MotionModeId, string][]
          ).map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              className={seg(m.motionMode === id)}
              onClick={() => patch({ motionMode: id })}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <p className="muted os-set-hint">{t('settings.motion.mode.hint')}</p>
      </SettingsCard>

      <SettingsCard
        id="motion-velocity"
        title={t('search.motionVelocity')}
        description={t('search.motionVelocity.desc')}
        highlight={focusSettingId === 'motion-velocity'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.motion.velocity.label')}</span>
          <input
            type="range"
            min={VELOCITY_MIN}
            max={VELOCITY_MAX}
            step={0.05}
            value={m.velocity}
            disabled={m.motionMode === 'disabled'}
            onChange={(e) => patch({ velocity: Number(e.target.value) })}
            aria-label={t('settings.motion.velocity.label')}
          />
          <span className="muted">{velocityLabel}</span>
        </div>
        <p className="muted os-set-hint">{t('settings.motion.velocity.hint')}</p>

        <div className="os-viz-row" style={{ gap: 12, alignItems: 'center' }}>
          <span className="os-viz-label muted">{t('settings.motion.preview')}</span>
          <LiquidMeter
            value={previewFill}
            className="motion-preview-meter"
            label={t('settings.motion.preview')}
          />
          <button
            type="button"
            className="btn small"
            onClick={() => setPreviewFill((v) => (v >= 1 ? 0.15 : Math.min(1, v + 0.35)))}
          >
            {t('settings.motion.preview.fill')}
          </button>
          <ScoreTicker value={previewScore} />
          <button
            type="button"
            className="btn small"
            onClick={() => setPreviewScore((s) => s + Math.round(40 + Math.random() * 260))}
          >
            {t('settings.motion.preview.score')}
          </button>
        </div>
      </SettingsCard>

      <SettingsCard
        id="motion-particles"
        title={t('search.motionParticles')}
        description={t('search.motionParticles.desc')}
        highlight={focusSettingId === 'motion-particles'}
      >
        <div className="os-viz-row">
          {(
            [
              ['off', 'settings.motion.particles.off'],
              ['low', 'settings.motion.particles.low'],
              ['high', 'settings.motion.particles.high'],
            ] as [ParticleDensityId, string][]
          ).map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              className={seg(m.rewardParticles === id)}
              disabled={m.motionMode === 'disabled'}
              onClick={() => patch({ rewardParticles: id })}
            >
              {t(labelKey)}
            </button>
          ))}
          <button
            type="button"
            className="btn small"
            disabled={m.motionMode === 'disabled' || m.rewardParticles === 'off'}
            onClick={(e) => fireRewardAt(e.currentTarget)}
          >
            {t('settings.motion.particles.test')}
          </button>
        </div>
        <p className="muted os-set-hint">{t('settings.motion.particles.hint')}</p>
      </SettingsCard>

      <SettingsCard
        id="motion-companion-weight"
        title={t('search.motionCompanionWeight')}
        description={t('search.motionCompanionWeight.desc')}
        highlight={focusSettingId === 'motion-companion-weight'}
      >
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.motion.weight.light')}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={m.companionWeight}
            onChange={(e) => patch({ companionWeight: Number(e.target.value) })}
            aria-label={t('search.motionCompanionWeight')}
          />
          <span className="os-viz-label muted">{t('settings.motion.weight.heavy')}</span>
        </div>
        <p className="muted os-set-hint">{t('settings.motion.weight.hint')}</p>
      </SettingsCard>

      <SettingsCard
        id="motion-reset"
        title={t('settings.motion.reset.title')}
        description={t('settings.motion.reset.desc')}
      >
        <button
          type="button"
          className="btn small"
          onClick={() => {
            setM(resetMotionPrefs());
            setPreviewFill(0.35);
            setPreviewScore(0);
          }}
        >
          {t('settings.motion.reset.action')}
        </button>
        <p className="muted os-set-hint">
          {t('settings.motion.effective', { velocity: effectiveVelocity(m).toFixed(2) })}
        </p>
      </SettingsCard>
    </>
  );
}
