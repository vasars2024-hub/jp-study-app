import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { MushroomStage } from '../components/reading-garden/ReadingGarden';
import './readingGardenPhaseGallery.css';

const PHASES = Array.from({ length: 50 }, (_, index) => index + 1);
const BANDS = Array.from({ length: 5 }, (_, index) =>
  PHASES.slice(index * 10, index * 10 + 10),
);

function PhaseCard({
  phase,
  selected,
  onSelect,
}: {
  phase: number;
  selected: boolean;
  onSelect: (phase: number) => void;
}) {
  return (
    <button
      type="button"
      className={`phase-card${selected ? ' is-selected' : ''}`}
      onClick={() => onSelect(phase)}
      aria-pressed={selected}
    >
      <span className="phase-card-asset">
        <MushroomStage stage={phase} />
      </span>
      <span className="phase-card-copy">
        <strong>{String(phase).padStart(2, '0')}</strong>
        <small>{(phase - 1) * 50} pages</small>
      </span>
    </button>
  );
}

function PhaseGallery() {
  const [selected, setSelected] = useState(1);

  return (
    <main className="phase-gallery">
      <header className="phase-gallery-header">
        <div>
          <p>Mooncap developer view</p>
          <h1>All 50 growth phases</h1>
        </div>
        <div className="phase-gallery-rule">
          <strong>50</strong>
          <span>EPUB pages per evolution</span>
        </div>
      </header>

      <aside className="phase-inspector" aria-label={`Selected phase ${selected}`}>
        <div className="phase-inspector-asset">
          <MushroomStage stage={selected} />
        </div>
        <div className="phase-inspector-copy">
          <p>Selected phase</p>
          <strong>{String(selected).padStart(2, '0')}</strong>
          <span>{(selected - 1) * 50} lifetime pages required</span>
          <input
            aria-label="Selected mushroom phase"
            type="range"
            min="1"
            max="50"
            value={selected}
            onChange={(event) => setSelected(Number(event.target.value))}
          />
        </div>
      </aside>

      <div className="phase-bands">
        {BANDS.map((phases, bandIndex) => (
          <section className="phase-band" key={bandIndex}>
            <header>
              <span>Band {bandIndex + 1}</span>
              <strong>
                {String(phases[0]).padStart(2, '0')}–
                {String(phases[phases.length - 1]).padStart(2, '0')}
              </strong>
            </header>
            <div className="phase-grid">
              {phases.map((phase) => (
                <PhaseCard
                  key={phase}
                  phase={phase}
                  selected={selected === phase}
                  onSelect={setSelected}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Mooncap phase gallery root is missing.');

createRoot(root).render(
  <StrictMode>
    <PhaseGallery />
  </StrictMode>,
);
