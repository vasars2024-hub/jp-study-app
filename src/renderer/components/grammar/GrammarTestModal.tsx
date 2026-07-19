import { useMemo, useState } from 'react';
import type { NormalizedGrammarPoint } from '../../data/grammar';
import type { PracticeFilters } from '../../data/grammar/practiceFilters';
import { addDeckCards, createDeckFolder } from '../../flashcardDeck';
import { useT } from '../../i18n';

type Phase = 'setup' | 'play' | 'done';
type Grade = 'again' | 'hard' | 'good';

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function GrammarTestModal({
  pool,
  initialFilters,
  onClose,
}: {
  pool: NormalizedGrammarPoint[];
  initialFilters: PracticeFilters;
  onClose: () => void;
}) {
  const { t } = useT();
  const [phase, setPhase] = useState<Phase>('setup');
  const [count, setCount] = useState(10);
  const [custom, setCustom] = useState('10');
  const [deck, setDeck] = useState<NormalizedGrammarPoint[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [missed, setMissed] = useState<NormalizedGrammarPoint[]>([]);
  const [goodCount, setGoodCount] = useState(0);

  const maxAvailable = pool.length;
  const card = deck[index] ?? null;

  const summary = useMemo(() => {
    const total = deck.length;
    return { total, good: goodCount, missed: missed.length };
  }, [deck.length, goodCount, missed.length]);

  function start(n: number) {
    const size = Math.max(1, Math.min(n, maxAvailable || 1));
    const picked = shuffle(pool).slice(0, Math.min(size, pool.length));
    if (!picked.length) return;
    setDeck(picked);
    setIndex(0);
    setRevealed(false);
    setMissed([]);
    setGoodCount(0);
    setPhase('play');
  }

  function grade(g: Grade) {
    if (!card) return;
    if (g === 'again' || g === 'hard') {
      setMissed((prev) => (prev.some((p) => p.id === card.id) ? prev : [...prev, card]));
    } else {
      setGoodCount((c) => c + 1);
    }
    if (index + 1 >= deck.length) {
      setPhase('done');
      return;
    }
    setIndex((i) => i + 1);
    setRevealed(false);
  }

  function addMissedToDeck() {
    if (!missed.length) return;
    createDeckFolder('Grammar');
    addDeckCards(
      missed.map((p) => ({
        word: p.title,
        reading: '',
        meaning: p.meaning,
        sentence: p.examples[0]?.jp,
        front: p.title,
        back: `${p.meaning}${p.structure ? `\n${p.structure}` : ''}`,
        source: 'import' as const,
        folder: 'Grammar',
      })),
    );
  }

  return (
    <div className="gx-test-overlay" role="dialog" aria-modal="true" aria-label={t('grammar.test.title')}>
      <div className="gx-test-modal">
        <header className="gx-test-head">
          <h2>{t('grammar.test.title')}</h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('common.close')}
          </button>
        </header>

        {phase === 'setup' && (
          <div className="gx-test-setup">
            <p className="muted">
              {t('grammar.test.setupHint', { count: maxAvailable })}
              {initialFilters.lang !== 'all' ? ` · ${initialFilters.lang}` : ''}
            </p>
            {!maxAvailable ? (
              <p className="muted">{t('grammar.test.noPool')}</p>
            ) : (
              <>
                <div className="gx-test-counts">
                  {[5, 10, 20].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`btn ${count === n ? 'primary' : ''}`}
                      disabled={n > maxAvailable}
                      onClick={() => {
                        setCount(n);
                        setCustom(String(n));
                      }}
                    >
                      {n}
                    </button>
                  ))}
                  <label className="gx-test-custom">
                    {t('grammar.test.custom')}
                    <input
                      type="number"
                      min={1}
                      max={maxAvailable}
                      value={custom}
                      onChange={(e) => {
                        setCustom(e.target.value);
                        const n = Number(e.target.value);
                        if (Number.isFinite(n) && n > 0) setCount(Math.floor(n));
                      }}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!maxAvailable}
                  onClick={() => start(count)}
                >
                  {t('grammar.test.start')}
                </button>
              </>
            )}
          </div>
        )}

        {phase === 'play' && card && (
          <div className="gx-test-play">
            <p className="muted">
              {t('grammar.test.progress', { current: index + 1, total: deck.length })}
            </p>
            <div className="gx-test-card">
              <div className="gx-test-pattern">{card.title}</div>
              <div className="gx-test-level">{card.level}</div>
              {revealed ? (
                <div className="gx-test-reveal">
                  <p>{card.meaning}</p>
                  {card.structure ? <p className="muted">{card.structure}</p> : null}
                  {card.examples[0] ? (
                    <p className="gx-test-ex">
                      {card.examples[0].jp}
                      {card.examples[0].en ? ` — ${card.examples[0].en}` : ''}
                    </p>
                  ) : null}
                </div>
              ) : (
                <button type="button" className="btn" onClick={() => setRevealed(true)}>
                  {t('grammar.test.reveal')}
                </button>
              )}
            </div>
            {revealed && (
              <div className="gx-test-grades">
                <button type="button" className="btn" onClick={() => grade('again')}>
                  {t('grammar.test.again')}
                </button>
                <button type="button" className="btn" onClick={() => grade('hard')}>
                  {t('grammar.test.hard')}
                </button>
                <button type="button" className="btn primary" onClick={() => grade('good')}>
                  {t('grammar.test.good')}
                </button>
              </div>
            )}
          </div>
        )}

        {phase === 'done' && (
          <div className="gx-test-done">
            <p>
              {t('grammar.test.score', {
                good: summary.good,
                total: summary.total,
                missed: summary.missed,
              })}
            </p>
            <div className="gx-test-done-actions">
              <button
                type="button"
                className="btn"
                disabled={!missed.length}
                onClick={addMissedToDeck}
              >
                {t('grammar.test.addMissed')}
              </button>
              <button type="button" className="btn primary" onClick={() => start(count)}>
                {t('grammar.test.retry')}
              </button>
              <button type="button" className="btn ghost" onClick={onClose}>
                {t('common.close')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
