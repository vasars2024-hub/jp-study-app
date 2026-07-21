import { useState } from 'react';
import type { FormalityVariants } from '../../../shared/translateAnalysisCore';

type Register = 'casual' | 'polite' | 'businessSafe';

const REGISTERS: Array<{ id: Register; label: string }> = [
  { id: 'casual', label: 'Casual' },
  { id: 'polite', label: 'Polite' },
  { id: 'businessSafe', label: 'Business-safe' },
];

// Three discrete registers, so a segmented control (the app's existing
// .gram-level-btn idiom) with a CSS-sliding thumb — not a literal slider.
// All three variants arrive in one analysis call; switching is instant.
export default function FormalityToggle({
  variants,
  lang,
}: {
  variants: FormalityVariants;
  lang: string;
}) {
  const [register, setRegister] = useState<Register>('polite');
  const activeIndex = REGISTERS.findIndex((r) => r.id === register);

  return (
    <div className="tr-analysis-section formality-section">
      <h4 className="tr-analysis-title">Formality</h4>
      <div className="formality-toggle" role="radiogroup" aria-label="Formality register">
        <span
          className="formality-thumb"
          aria-hidden
          style={{ transform: `translateX(${activeIndex * 100}%)` }}
        />
        {REGISTERS.map((r) => (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={register === r.id}
            className={`formality-btn ${register === r.id ? 'active' : ''}`}
            onClick={() => setRegister(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <p className="formality-output" lang={lang}>
        {variants[register]}
      </p>
    </div>
  );
}
