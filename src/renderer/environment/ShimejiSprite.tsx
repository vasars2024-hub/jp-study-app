import { useEffect, useMemo, useState } from 'react';
import type { CompanionMood } from './companionCatalog';
import { getShimejiPack, type ShimejiMotion, type ShimejiPackId } from './shimejiPacks';

function sequenceFor(
  packId: ShimejiPackId | undefined,
  motion: ShimejiMotion | undefined,
  mood: CompanionMood,
  dragging: boolean,
): string[] {
  const pack = getShimejiPack(packId);
  if (!pack) return [];
  if (dragging) return pack.drag;
  if (mood === 'celebrate') return pack.celebrate;
  if (mood === 'sleepy') return pack.sit;
  return pack[motion ?? 'stand'] ?? pack.stand;
}

function delayFor(
  motion: ShimejiMotion | undefined,
  mood: CompanionMood,
  dragging: boolean,
  activeness: number,
): number {
  let base = 180;
  if (dragging) base = 90;
  else if (mood === 'celebrate') base = 85;
  else if (motion === 'wall' || motion === 'ceiling') base = 105;
  else if (motion === 'walk') base = 120;
  // Higher activeness → snappier frames. Default 0.4 ≈ 1.37× slower than classic.
  const a = Math.min(1, Math.max(0, activeness));
  const scale = 1.75 - a * 0.95;
  return Math.max(50, Math.round(base * scale));
}

export default function ShimejiSprite({
  motion,
  mood,
  dragging = false,
  pack,
  activeness = 0.4,
}: {
  motion?: ShimejiMotion;
  mood: CompanionMood;
  dragging?: boolean;
  pack?: ShimejiPackId;
  /** 0–1 locomotion / frame pace from companion settings. */
  activeness?: number;
}) {
  const seq = useMemo(() => sequenceFor(pack, motion, mood, dragging), [dragging, mood, motion, pack]);
  const delay = delayFor(motion, mood, dragging, activeness);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setTick(0);
  }, [seq]);

  useEffect(() => {
    if (!pack || document.documentElement.classList.contains('reduce-motion') || seq.length <= 1) return;
    const id = window.setInterval(() => setTick((n) => n + 1), delay);
    return () => window.clearInterval(id);
  }, [delay, pack, seq.length]);

  if (pack && seq.length > 0) {
    return (
      <img
        className={`os-companion-sprite os-companion-sprite--${motion ?? 'stand'} os-companion-sprite--${pack}${dragging ? ' is-dragging' : ''}`}
        src={seq[tick % seq.length]}
        alt=""
        draggable={false}
      />
    );
  }

  return (
    <div className={`wired-shimeji wired-shimeji--${motion ?? 'stand'} mood-${mood}${dragging ? ' is-dragging' : ''}`} aria-hidden="true">
      <span className="wired-shimeji-antenna" />
      <span className="wired-shimeji-badge" />
      <div className="wired-shimeji-head">
        <span className="wired-shimeji-ear wired-shimeji-ear--left" />
        <span className="wired-shimeji-ear wired-shimeji-ear--right" />
        <span className="wired-shimeji-eye wired-shimeji-eye--left" />
        <span className="wired-shimeji-eye wired-shimeji-eye--right" />
        <span className="wired-shimeji-nose" />
        <span className="wired-shimeji-mouth" />
      </div>
      <div className="wired-shimeji-body">
        <span className="wired-shimeji-pocket" />
      </div>
      <span className="wired-shimeji-tail" />
    </div>
  );
}
