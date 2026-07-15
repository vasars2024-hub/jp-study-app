import { useEffect, useMemo, useState } from 'react';
import type { CompanionMood } from './companionCatalog';

export type ShimejiMotion = 'stand' | 'walk' | 'sit' | 'wall' | 'ceiling' | 'fall' | 'drag' | 'celebrate';

const frameUrls = {
  shime1: new URL('../assets/shimeji/miko/shime1.png', import.meta.url).href,
  shime1b: new URL('../assets/shimeji/miko/shime1b.png', import.meta.url).href,
  shime2b: new URL('../assets/shimeji/miko/shime2b.png', import.meta.url).href,
  shime3b: new URL('../assets/shimeji/miko/shime3b.png', import.meta.url).href,
  shime4: new URL('../assets/shimeji/miko/shime4.png', import.meta.url).href,
  shime5: new URL('../assets/shimeji/miko/shime5.png', import.meta.url).href,
  shime6: new URL('../assets/shimeji/miko/shime6.png', import.meta.url).href,
  shime11: new URL('../assets/shimeji/miko/shime11.png', import.meta.url).href,
  shime12: new URL('../assets/shimeji/miko/shime12.png', import.meta.url).href,
  shime13: new URL('../assets/shimeji/miko/shime13.png', import.meta.url).href,
  shime14: new URL('../assets/shimeji/miko/shime14.png', import.meta.url).href,
  shime18: new URL('../assets/shimeji/miko/shime18.png', import.meta.url).href,
  shime19: new URL('../assets/shimeji/miko/shime19.png', import.meta.url).href,
  shime23: new URL('../assets/shimeji/miko/shime23.png', import.meta.url).href,
  shime24: new URL('../assets/shimeji/miko/shime24.png', import.meta.url).href,
  shime25: new URL('../assets/shimeji/miko/shime25.png', import.meta.url).href,
  shime42: new URL('../assets/shimeji/miko/shime42.png', import.meta.url).href,
  shime43: new URL('../assets/shimeji/miko/shime43.png', import.meta.url).href,
  shime44: new URL('../assets/shimeji/miko/shime44.png', import.meta.url).href,
  shime45: new URL('../assets/shimeji/miko/shime45.png', import.meta.url).href,
  shime46: new URL('../assets/shimeji/miko/shime46.png', import.meta.url).href,
};

const sequences: Record<ShimejiMotion, string[]> = {
  stand: [frameUrls.shime1],
  walk: [frameUrls.shime1b, frameUrls.shime2b, frameUrls.shime3b],
  sit: [frameUrls.shime11],
  wall: [frameUrls.shime14, frameUrls.shime12, frameUrls.shime13, frameUrls.shime13, frameUrls.shime12],
  ceiling: [frameUrls.shime25, frameUrls.shime23, frameUrls.shime24, frameUrls.shime24, frameUrls.shime23],
  fall: [frameUrls.shime4],
  drag: [frameUrls.shime5, frameUrls.shime6],
  celebrate: [frameUrls.shime42, frameUrls.shime43, frameUrls.shime44, frameUrls.shime45, frameUrls.shime46],
};

function sequenceFor(motion: ShimejiMotion | undefined, mood: CompanionMood, dragging: boolean): string[] {
  if (dragging) return sequences.drag;
  if (mood === 'celebrate') return sequences.celebrate;
  if (mood === 'sleepy') return sequences.sit;
  return sequences[motion ?? 'stand'] ?? sequences.stand;
}

function delayFor(motion: ShimejiMotion | undefined, mood: CompanionMood, dragging: boolean): number {
  if (dragging) return 90;
  if (mood === 'celebrate') return 85;
  if (motion === 'wall' || motion === 'ceiling') return 105;
  if (motion === 'walk') return 120;
  return 180;
}

export default function ShimejiSprite({
  motion,
  mood,
  dragging = false,
}: {
  motion?: ShimejiMotion;
  mood: CompanionMood;
  dragging?: boolean;
}) {
  const seq = useMemo(() => sequenceFor(motion, mood, dragging), [dragging, mood, motion]);
  const delay = delayFor(motion, mood, dragging);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setTick(0);
  }, [seq]);

  useEffect(() => {
    if (document.documentElement.classList.contains('reduce-motion') || seq.length <= 1) return;
    const id = window.setInterval(() => setTick((n) => n + 1), delay);
    return () => window.clearInterval(id);
  }, [delay, seq.length]);

  return (
    <img
      className={`os-companion-sprite os-companion-sprite--${motion ?? 'stand'}`}
      src={seq[tick % seq.length]}
      alt=""
      draggable={false}
    />
  );
}
