// Dev-only harness: exercises the Phase 4.5 motion system in a plain browser.
// `npm start` isn't drivable by this repo's screenshot tooling, and every prior
// phase that shipped on "tests are green" alone shipped real bugs (see the
// Arena: 5 of 10 games displayed their own answer while 400+ tests passed).
//
//   npx vite --config vite.renderer.config.ts --port 5175
//   → http://127.0.0.1:5175/motion-harness.html
//
// Not imported by the app; `vite build` emits index.html only.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../theme/tokens.css';
import '../styles.css';
import '../theme/motion.css';
import '../motion/motion-system.css';
import {
  bootMotionPrefs,
  effectiveVelocity,
  loadMotionPrefs,
  saveMotionPrefs,
  type MotionModeId,
  type MotionPrefs,
  type ParticleDensityId,
} from '../motion/motionPrefs';
import { installRewardBursts, fireRewardAt } from '../motion/rewardBurst';
import LiquidMeter from '../motion/LiquidMeter';
import ScoreTicker from '../motion/ScoreTicker';

// The motion system touches storage + the sound engine, not the preload bridge,
// so the stub only needs to exist for anything that reaches for window.api.
(window as unknown as { api: unknown }).api = {};

bootMotionPrefs();
installRewardBursts();

function Harness() {
  const [m, setM] = useState<MotionPrefs>(loadMotionPrefs);
  const [fill, setFill] = useState(0.3);
  const [score, setScore] = useState(0);
  const [showBadge, setShowBadge] = useState(true);
  const patch = (p: Partial<MotionPrefs>) => setM(saveMotionPrefs(p));

  useEffect(() => {
    document.body.style.padding = '20px';
    document.body.style.fontFamily = 'system-ui, sans-serif';
  }, []);

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 760 }}>
      <h2>Phase 4.5 — motion harness</h2>

      <section data-testid="controls" style={{ display: 'grid', gap: 8 }}>
        <div>
          <b>Mode:</b>{' '}
          {(['normal', 'performance', 'disabled'] as MotionModeId[]).map((id) => (
            <button
              key={id}
              data-testid={`mode-${id}`}
              onClick={() => patch({ motionMode: id })}
              style={{ fontWeight: m.motionMode === id ? 700 : 400, marginRight: 6 }}
            >
              {id}
            </button>
          ))}
          <span data-testid="mode-value"> = {m.motionMode}</span>
        </div>

        <div>
          <b>Velocity:</b>{' '}
          <input
            data-testid="velocity"
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={m.velocity}
            onChange={(e) => patch({ velocity: Number(e.target.value) })}
          />
          <span data-testid="velocity-value"> {m.velocity.toFixed(2)}×</span>
          <span data-testid="effective-velocity"> (effective {effectiveVelocity(m).toFixed(2)}×)</span>
        </div>

        <div>
          <b>Particles:</b>{' '}
          {(['off', 'low', 'high'] as ParticleDensityId[]).map((id) => (
            <button
              key={id}
              data-testid={`particles-${id}`}
              onClick={() => patch({ rewardParticles: id })}
              style={{ fontWeight: m.rewardParticles === id ? 700 : 400, marginRight: 6 }}
            >
              {id}
            </button>
          ))}
          <span data-testid="particles-value"> = {m.rewardParticles}</span>
        </div>

        <div>
          <b>Companion weight:</b>{' '}
          <input
            data-testid="weight"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={m.companionWeight}
            onChange={(e) => patch({ companionWeight: Number(e.target.value) })}
          />
          <span data-testid="weight-value"> {m.companionWeight.toFixed(2)}</span>
        </div>
      </section>

      <section>
        <h3>Liquid meter</h3>
        <div style={{ width: 320, height: 18 }}>
          <LiquidMeter value={fill} celebrateOnFull label="demo" />
        </div>
        <button data-testid="fill-up" onClick={() => setFill((v) => (v >= 1 ? 0.15 : Math.min(1, v + 0.35)))}>
          fill +35%
        </button>
        <span data-testid="fill-value"> {fill.toFixed(2)}</span>
      </section>

      <section>
        <h3>Score ticker</h3>
        <div style={{ fontSize: 34 }}>
          <ScoreTicker value={score} />
        </div>
        <button data-testid="add-score" onClick={() => setScore((s) => s + 250)}>
          +250
        </button>
      </section>

      <section>
        <h3>Reward burst</h3>
        <button data-testid="burst" onClick={(e) => fireRewardAt(e.currentTarget)}>
          fire confetti
        </button>
      </section>

      <section>
        <h3>Badge reveal</h3>
        <button data-testid="toggle-badge" onClick={() => setShowBadge((b) => !b)}>
          re-reveal
        </button>
        {showBadge && (
          <div className="motion-badge" data-testid="badge" style={{ width: 220, marginTop: 8 }}>
            <div
              className="motion-badge-card"
              style={{ padding: 12, background: '#222', borderRadius: 8, position: 'relative' }}
            >
              <span className="motion-badge-glow" aria-hidden="true" />
              <b>Badge unlocked</b>
            </div>
          </div>
        )}
      </section>

      <section>
        <h3>Morpheme glow (hover)</h3>
        <p style={{ fontSize: 22 }}>
          <span className="motion-morpheme" style={{ ['--glow-hue' as string]: '120' }}>
            日本語
          </span>{' '}
          <span className="motion-morpheme" style={{ ['--glow-hue' as string]: '35' }}>
            を
          </span>{' '}
          <span className="motion-morpheme is-glowing" style={{ ['--glow-hue' as string]: '0' }}>
            勉強
          </span>
        </p>
      </section>
    </div>
  );
}

const container = document.getElementById('root');
if (container) createRoot(container).render(<Harness />);
