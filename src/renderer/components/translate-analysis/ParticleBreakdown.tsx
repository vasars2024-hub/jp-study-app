import { particleRole } from '../../../shared/particleRoles';
import type { JpToken } from '../../tokenizer';

// Fully offline particle view: the sentence with particle tokens rendered as
// colored chips, plus a list explaining each one. Explanations come from the
// curated table (generic) or, when the cloud analysis returned aligned
// sentence-specific notes, from the LLM.
export default function ParticleBreakdown({
  tokens,
  notes,
}: {
  tokens: JpToken[];
  /** Sentence-specific LLM notes, aligned to the particle tokens in order. */
  notes?: string[];
}) {
  const particles = tokens.filter((t) => t.pos === '助詞');
  if (!particles.length) return null;

  let particleIndex = -1;
  return (
    <div className="tr-analysis-section particle-breakdown">
      <h4 className="tr-analysis-title">Particles</h4>
      <p className="particle-sentence" lang="ja">
        {tokens.map((t, i) => {
          if (t.pos !== '助詞') return <span key={i}>{t.surface}</span>;
          const role = particleRole(t.surface, t.posDetail);
          return (
            <span key={i} className={`particle-chip particle-cat-${role.category}`}>
              {t.surface}
            </span>
          );
        })}
      </p>
      <ul className="particle-list">
        {tokens.map((t, i) => {
          if (t.pos !== '助詞') return null;
          particleIndex += 1;
          const role = particleRole(t.surface, t.posDetail);
          const note = notes?.[particleIndex]?.trim();
          return (
            <li key={i} className="particle-item">
              <span className={`particle-chip particle-cat-${role.category}`} lang="ja">
                {t.surface}
              </span>
              <span className="particle-role">{role.label}</span>
              <span className="particle-explanation muted">{note || role.explanation}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
