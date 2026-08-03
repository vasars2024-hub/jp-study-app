import { useEffect, useRef } from 'react';

import {
  READING_GARDEN_PROGRESS_EVENT,
  type ReadingGardenProgress,
} from '../../readingGardenProgress';

const particleAtlasUrl = new URL(
  '../../assets/reading-garden/particle-atlas-v1.png',
  import.meta.url,
).href;
const groundInsectAtlasUrl = new URL(
  '../../assets/reading-garden/ground-insect-atlas-v1.png',
  import.meta.url,
).href;
const aerialInsectAtlasUrl = new URL(
  '../../assets/reading-garden/aerial-insect-atlas-v1.png',
  import.meta.url,
).href;
const PARTICLE_ATLAS_COLUMNS = 5;
const PARTICLE_ATLAS_ROWS = 4;
const GROUND_INSECT_COLUMNS = 8;
const GROUND_INSECT_ROWS = 4;
const AERIAL_INSECT_COLUMNS = 8;
const AERIAL_INSECT_ROWS = 2;

interface Firefly {
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
  phase: number;
  speed: number;
  radius: number;
  warmth: number;
  spriteColumn: number;
}

interface Mote {
  x: number;
  y: number;
  phase: number;
  speed: number;
  radius: number;
  drift: number;
  spriteRow: 1 | 3;
  spriteColumn: number;
}

interface DewDrop {
  x: number;
  y: number;
  startY: number;
  endY: number;
  speed: number;
  phase: number;
  spriteColumn: 0 | 1 | 2;
}

interface BurstMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  spriteRow: 1 | 3;
  spriteColumn: number;
}

interface GroundBug {
  x: number;
  lane: number;
  speed: number;
  direction: 1 | -1;
  phase: number;
  kind: 0 | 1 | 2 | 3;
  routeMin: number;
  routeMax: number;
  pauseRemaining: number;
}

interface AerialInsect {
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
  phase: number;
  speed: number;
  kind: 0 | 1;
  direction: 1 | -1;
  scale: number;
}

function seeded(index: number, salt: number): number {
  const value = Math.sin(index * 91.117 + salt * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

export default function ReadingGardenLifeCanvas({ stage }: { stage: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    let width = 1;
    let height = 1;
    let frame = 0;
    let frameScheduled = false;
    let previous = performance.now();
    let visible = document.visibilityState !== 'hidden';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fireflies: Firefly[] = [];
    const motes: Mote[] = [];
    const dewDrops: DewDrop[] = [];
    const burstMotes: BurstMote[] = [];
    const bugs: GroundBug[] = [];
    const aerialInsects: AerialInsect[] = [];
    const particleAtlas = new Image();
    particleAtlas.decoding = 'async';
    let particleAtlasReady = false;
    const groundInsectAtlas = new Image();
    groundInsectAtlas.decoding = 'async';
    let groundInsectAtlasReady = false;
    const aerialInsectAtlas = new Image();
    aerialInsectAtlas.decoding = 'async';
    let aerialInsectAtlasReady = false;
    let burstSerial = 0;
    let pagePulseUntil = 0;

    const rebuild = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      fireflies.length = 0;
      const fireflyCount = reducedMotion.matches ? 2 : Math.min(6, 3 + Math.floor(stage / 15));
      for (let index = 0; index < fireflyCount; index += 1) {
        const leftClearing = index % 2 === 0;
        const x = width * (leftClearing
          ? 0.1 + seeded(index, 3) * 0.2
          : 0.7 + seeded(index, 3) * 0.2);
        const y = height * (0.38 + seeded(index, 7) * 0.34);
        fireflies.push({
          x,
          y,
          anchorX: x,
          anchorY: y,
          phase: seeded(index, 11) * Math.PI * 2,
          speed: 0.24 + seeded(index, 13) * 0.42,
          radius: 0.8 + seeded(index, 17) * 0.7,
          warmth: seeded(index, 19),
          spriteColumn: index % PARTICLE_ATLAS_COLUMNS,
        });
      }

      motes.length = 0;
      const moteCount = reducedMotion.matches ? 8 : 18;
      for (let index = 0; index < moteCount; index += 1) {
        motes.push({
          x: seeded(index, 23) * width,
          y: seeded(index, 29) * height,
          phase: seeded(index, 31) * Math.PI * 2,
          speed: 2 + seeded(index, 37) * 5,
          radius: 0.35 + seeded(index, 41) * 1.1,
          drift: -0.5 + seeded(index, 43),
          spriteRow: index % 3 === 0 ? 1 : 3,
          spriteColumn: index % PARTICLE_ATLAS_COLUMNS,
        });
      }

      dewDrops.length = 0;
      if (stage >= 16) {
        const dewCount = reducedMotion.matches ? 1 : Math.min(3, 1 + Math.floor(stage / 18));
        for (let index = 0; index < dewCount; index += 1) {
          const startY = height * (0.39 + seeded(index, 79) * 0.08);
          const endY = height * (0.72 + seeded(index, 83) * 0.1);
          dewDrops.push({
            x: width * (0.37 + seeded(index, 89) * 0.26),
            y: startY + (endY - startY) * seeded(index, 97),
            startY,
            endY,
            speed: 30 + seeded(index, 101) * 22,
            phase: seeded(index, 103) * Math.PI * 2,
            spriteColumn: (index % 3) as 0 | 1 | 2,
          });
        }
      }

      bugs.length = 0;
      const bugCount = reducedMotion.matches ? 1 : Math.min(4, 2 + Math.floor(stage / 18));
      for (let index = 0; index < bugCount; index += 1) {
        const routeMin = width * (0.05 + seeded(index, 139) * 0.16);
        const routeMax = width * (0.72 + seeded(index, 149) * 0.2);
        bugs.push({
          x: routeMin + (routeMax - routeMin) * seeded(index, 47),
          lane: seeded(index, 53),
          speed: 8 + seeded(index, 59) * 17,
          direction: seeded(index, 61) > 0.5 ? 1 : -1,
          phase: seeded(index, 67) * Math.PI * 2,
          kind: (stage >= 31 ? index % 4 : index % 3) as 0 | 1 | 2 | 3,
          routeMin,
          routeMax,
          pauseRemaining: seeded(index, 151) * 1.2,
        });
      }

      aerialInsects.length = 0;
      if (stage >= 12) {
        aerialInsects.push({
          anchorX: width * 0.19,
          anchorY: height * (0.35 + seeded(stage, 157) * 0.11),
          x: width * 0.19,
          y: height * 0.4,
          phase: seeded(stage, 163) * Math.PI * 2,
          speed: 0.2 + seeded(stage, 167) * 0.09,
          kind: 0,
          direction: 1,
          scale: 0.76 + seeded(stage, 173) * 0.18,
        });
      }
      if (stage >= 27) {
        aerialInsects.push({
          anchorX: width * 0.81,
          anchorY: height * (0.46 + seeded(stage, 179) * 0.1),
          x: width * 0.81,
          y: height * 0.51,
          phase: seeded(stage, 181) * Math.PI * 2,
          speed: 0.13 + seeded(stage, 191) * 0.07,
          kind: 1,
          direction: -1,
          scale: 0.72 + seeded(stage, 193) * 0.16,
        });
      }
    };

    const drawAtlasSprite = (
      row: number,
      column: number,
      x: number,
      y: number,
      size: number,
      alpha = 1,
      rotation = 0,
    ): boolean => {
      if (!particleAtlasReady) return false;
      const sourceWidth = particleAtlas.naturalWidth / PARTICLE_ATLAS_COLUMNS;
      const sourceHeight = particleAtlas.naturalHeight / PARTICLE_ATLAS_ROWS;
      context.save();
      context.translate(x, y);
      context.rotate(rotation);
      context.globalAlpha = alpha;
      context.imageSmoothingEnabled = false;
      context.drawImage(
        particleAtlas,
        column * sourceWidth,
        row * sourceHeight,
        sourceWidth,
        sourceHeight,
        -size / 2,
        -size / 2,
        size,
        size,
      );
      context.restore();
      return true;
    };

    const drawGroundInsectSprite = (
      bug: GroundBug,
      frameIndex: number,
      x: number,
      y: number,
      size: number,
      alpha: number,
    ): boolean => {
      if (!groundInsectAtlasReady) return false;
      const sourceWidth = groundInsectAtlas.naturalWidth / GROUND_INSECT_COLUMNS;
      const sourceHeight = groundInsectAtlas.naturalHeight / GROUND_INSECT_ROWS;
      context.save();
      context.translate(x, y);
      context.scale(bug.direction, 1);
      context.globalAlpha = alpha;
      context.imageSmoothingEnabled = false;
      context.drawImage(
        groundInsectAtlas,
        frameIndex * sourceWidth,
        bug.kind * sourceHeight,
        sourceWidth,
        sourceHeight,
        -size / 2,
        -size / 2,
        size,
        size,
      );
      context.restore();
      return true;
    };

    const drawAerialInsect = (insect: AerialInsect, time: number) => {
      if (!aerialInsectAtlasReady) return;
      const sourceWidth = aerialInsectAtlas.naturalWidth / AERIAL_INSECT_COLUMNS;
      const sourceHeight = aerialInsectAtlas.naturalHeight / AERIAL_INSECT_ROWS;
      const framesPerSecond = insect.kind === 0 ? 12 : 8;
      const frameIndex =
        Math.floor(time * framesPerSecond + insect.phase * 1.7) %
        AERIAL_INSECT_COLUMNS;
      const size = (insect.kind === 0 ? 25 : 34) * insect.scale;
      const tilt =
        Math.sin(time * insect.speed * 2.3 + insect.phase) *
        (insect.kind === 0 ? 0.14 : 0.08);
      context.save();
      context.translate(insect.x, insect.y);
      context.rotate(tilt);
      context.scale(insect.direction, 1);
      context.globalAlpha = insect.kind === 0 ? 0.46 : 0.42;
      context.imageSmoothingEnabled = false;
      context.drawImage(
        aerialInsectAtlas,
        frameIndex * sourceWidth,
        insect.kind * sourceHeight,
        sourceWidth,
        sourceHeight,
        -size / 2,
        -size / 2,
        size,
        size,
      );
      context.restore();
    };

    const drawFirefly = (fly: Firefly, time: number) => {
      const pulse = 0.58 + Math.sin(time * 2.4 + fly.phase) * 0.26;
      const warm = fly.warmth > 0.72;
      const color = warm ? '244,199,103' : fly.warmth > 0.3 ? '119,236,194' : '104,230,245';
      const glow = context.createRadialGradient(fly.x, fly.y, 0, fly.x, fly.y, fly.radius * 6);
      glow.addColorStop(0, `rgba(245,255,224,${pulse})`);
      glow.addColorStop(0.16, `rgba(${color},${pulse * 0.75})`);
      glow.addColorStop(1, `rgba(${color},0)`);
      context.fillStyle = glow;
      context.beginPath();
      context.arc(fly.x, fly.y, fly.radius * 6, 0, Math.PI * 2);
      context.fill();
      const drewSprite = drawAtlasSprite(
        0,
        fly.spriteColumn,
        fly.x,
        fly.y,
        13 + fly.radius * 4,
        Math.min(0.78, pulse + 0.08),
        Math.sin(time * 0.37 + fly.phase) * 0.16,
      );
      if (!drewSprite) {
        context.fillStyle = `rgba(244,255,230,${Math.min(1, pulse + 0.2)})`;
        context.beginPath();
        context.arc(fly.x, fly.y, fly.radius, 0, Math.PI * 2);
        context.fill();
      }
    };

    const drawBug = (bug: GroundBug, time: number) => {
      const routeProgress =
        (bug.x - bug.routeMin) / Math.max(1, bug.routeMax - bug.routeMin);
      const y =
        height * (0.81 + bug.lane * 0.11) +
        Math.sin(routeProgress * Math.PI * 2 + bug.phase) * height * 0.009;
      const bob = Math.sin(time * 10 + bug.phase) * 0.8;
      const scale = 0.65 + bug.lane * 0.5;
      const framesPerSecond = bug.kind === 1 ? 10 : bug.kind === 3 ? 12 : 8;
      const frameTime =
        bug.pauseRemaining > 0 ? bug.phase * 1.7 : time * framesPerSecond + bug.phase;
      const frameIndex = Math.floor(frameTime) % GROUND_INSECT_COLUMNS;
      const baseSize =
        bug.kind === 0 ? 50 : bug.kind === 1 ? 43 : bug.kind === 2 ? 52 : 69;
      if (
        drawGroundInsectSprite(
          bug,
          frameIndex,
          bug.x,
          y + bob,
          baseSize * scale,
          0.82,
        )
      ) {
        return;
      }
      context.save();
      context.translate(bug.x, y + bob);
      context.scale(bug.direction * scale, scale);
      context.strokeStyle = 'rgba(20,18,28,0.92)';
      context.fillStyle =
        bug.kind === 0
          ? 'rgba(62,46,63,0.96)'
          : bug.kind === 1
            ? 'rgba(37,54,53,0.96)'
            : 'rgba(75,55,38,0.96)';
      context.lineWidth = 1.2;
      for (let leg = -1; leg <= 1; leg += 1) {
        const lx = leg * 3;
        const stride = Math.sin(time * 15 + bug.phase + leg) * 2.2;
        context.beginPath();
        context.moveTo(lx, 1);
        context.lineTo(lx + stride, 4.5);
        context.stroke();
        context.beginPath();
        context.moveTo(lx, -1);
        context.lineTo(lx - stride, -4);
        context.stroke();
      }
      context.beginPath();
      if (bug.kind === 1 || bug.kind === 3) {
        context.ellipse(0, 0, 7.4, 2.7, 0, 0, Math.PI * 2);
      } else {
        context.ellipse(0, 0, 5.1, 3.4, 0, 0, Math.PI * 2);
      }
      context.fill();
      context.beginPath();
      context.arc(5.2, 0, 2.2, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = 'rgba(88,221,199,0.38)';
      context.beginPath();
      context.moveTo(6.1, -1);
      context.quadraticCurveTo(9, -4, 10.4, -2.2);
      context.stroke();
      context.restore();
    };

    const scheduleFrame = () => {
      if (frameScheduled || !visible || reducedMotion.matches) return;
      frameScheduled = true;
      frame = requestAnimationFrame((now) => {
        frameScheduled = false;
        draw(now);
      });
    };

    const draw = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - previous) / 1000));
      previous = now;
      context.clearRect(0, 0, width, height);
      const time = now / 1000;

      for (const mote of motes) {
        if (!reducedMotion.matches) {
          mote.y -= mote.speed * dt;
          mote.x += (Math.sin(time * 0.45 + mote.phase) * 2.2 + mote.drift) * dt;
          if (mote.y < -4) {
            mote.y = height + 4;
            mote.x = seeded(Math.floor(now + mote.phase * 100), 73) * width;
          }
        }
        const alpha = 0.08 + (Math.sin(time + mote.phase) + 1) * 0.055;
        const spriteSize =
          mote.spriteRow === 1 ? 16 + mote.radius * 7 : 9 + mote.radius * 4;
        const drewSprite = drawAtlasSprite(
          mote.spriteRow,
          mote.spriteColumn,
          mote.x,
          mote.y,
          spriteSize,
          alpha * 2.5,
          Math.sin(time * 0.12 + mote.phase) * 0.35,
        );
        if (!drewSprite) {
          context.fillStyle = `rgba(174,210,205,${alpha})`;
          context.beginPath();
          context.arc(mote.x, mote.y, mote.radius, 0, Math.PI * 2);
          context.fill();
        }
      }

      for (const drop of dewDrops) {
        if (!reducedMotion.matches) {
          drop.y += drop.speed * dt;
          if (drop.y > drop.endY) drop.y = drop.startY;
        }
        const travel = Math.max(
          0,
          Math.min(1, (drop.y - drop.startY) / Math.max(1, drop.endY - drop.startY)),
        );
        const alpha = Math.sin(Math.PI * travel) * 0.72;
        drawAtlasSprite(
          2,
          drop.spriteColumn,
          drop.x,
          drop.y,
          34,
          alpha,
          Math.sin(time * 0.24 + drop.phase) * 0.08,
        );
      }

      for (let index = burstMotes.length - 1; index >= 0; index -= 1) {
        const mote = burstMotes[index];
        if (!reducedMotion.matches) {
          mote.life -= dt;
          mote.x += mote.vx * dt;
          mote.y += mote.vy * dt;
          mote.vy += 12 * dt;
        }
        if (mote.life <= 0) {
          burstMotes.splice(index, 1);
          continue;
        }
        const alpha = Math.min(1, mote.life / mote.maxLife) * 0.72;
        drawAtlasSprite(
          mote.spriteRow,
          mote.spriteColumn,
          mote.x,
          mote.y,
          mote.size,
          alpha,
          mote.vx * 0.015,
        );
      }

      if (now < pagePulseUntil) {
        const pulseProgress = 1 - (pagePulseUntil - now) / 920;
        const pulseAlpha = Math.sin(Math.PI * Math.max(0, Math.min(1, pulseProgress))) * 0.1;
        const pulse = context.createRadialGradient(
          width * 0.5,
          height * 0.77,
          0,
          width * 0.5,
          height * 0.77,
          width * 0.24,
        );
        pulse.addColorStop(0, `rgba(112,232,226,${pulseAlpha})`);
        pulse.addColorStop(1, 'rgba(112,232,226,0)');
        context.fillStyle = pulse;
        context.fillRect(0, height * 0.55, width, height * 0.4);
      }

      for (const fly of fireflies) {
        if (!reducedMotion.matches) {
          fly.x =
            fly.anchorX +
            Math.sin(time * fly.speed + fly.phase) * width * 0.035 +
            Math.sin(time * 0.19 + fly.phase) * width * 0.016;
          fly.y =
            fly.anchorY +
            Math.cos(time * fly.speed * 0.83 + fly.phase) * height * 0.035;
        }
        drawFirefly(fly, time);
      }

      for (const insect of aerialInsects) {
        if (!reducedMotion.matches) {
          const primaryWave = time * insect.speed + insect.phase;
          const secondaryWave = time * insect.speed * 0.61 + insect.phase * 1.7;
          insect.x =
            insect.anchorX +
            Math.sin(primaryWave) * width * 0.045 +
            Math.sin(secondaryWave) * width * 0.018;
          insect.y =
            insect.anchorY +
            Math.cos(primaryWave * 1.37) * height * 0.028 +
            Math.sin(secondaryWave * 1.9) * height * 0.012;
          insect.direction =
            Math.cos(primaryWave) + Math.cos(secondaryWave) * 0.25 >= 0 ? 1 : -1;
        }
        drawAerialInsect(insect, time);
      }

      for (const bug of bugs) {
        if (!reducedMotion.matches) {
          if (bug.pauseRemaining > 0) {
            bug.pauseRemaining = Math.max(0, bug.pauseRemaining - dt);
          } else {
            bug.x += bug.speed * bug.direction * dt;
            if (bug.direction > 0 && bug.x >= bug.routeMax) {
              bug.x = bug.routeMax;
              bug.direction = -1;
              bug.pauseRemaining = 0.45 + (Math.sin(time + bug.phase) + 1) * 0.55;
            } else if (bug.direction < 0 && bug.x <= bug.routeMin) {
              bug.x = bug.routeMin;
              bug.direction = 1;
              bug.pauseRemaining =
                0.45 + (Math.cos(time * 0.7 + bug.phase) + 1) * 0.55;
            }
          }
        }
        drawBug(bug, time);
      }

      scheduleFrame();
    };

    const onVisibility = () => {
      visible = document.visibilityState !== 'hidden';
      if (visible) {
        cancelAnimationFrame(frame);
        frameScheduled = false;
        previous = performance.now();
        scheduleFrame();
      } else {
        cancelAnimationFrame(frame);
        frameScheduled = false;
      }
    };
    const onPageRead = (event: Event) => {
      const detail = (event as CustomEvent<ReadingGardenProgress>).detail;
      if (!detail || reducedMotion.matches) return;
      burstSerial += 1;
      const count = 7 + (burstSerial % 4);
      for (let index = 0; index < count; index += 1) {
        const seedIndex = burstSerial * 19 + index;
        const maxLife = 0.72 + seeded(seedIndex, 107) * 0.38;
        burstMotes.push({
          x: width * (0.42 + seeded(seedIndex, 109) * 0.16),
          y: height * (0.75 + seeded(seedIndex, 113) * 0.055),
          vx: -18 + seeded(seedIndex, 127) * 36,
          vy: -34 - seeded(seedIndex, 131) * 28,
          life: maxLife,
          maxLife,
          size: 11 + seeded(seedIndex, 137) * 11,
          spriteRow: index % 3 === 0 ? 1 : 3,
          spriteColumn: index % PARTICLE_ATLAS_COLUMNS,
        });
      }
      pagePulseUntil = performance.now() + 920;
      scheduleFrame();
    };
    const onMotionChange = () => {
      cancelAnimationFrame(frame);
      frameScheduled = false;
      rebuild();
      draw(performance.now());
    };
    const resize = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frameScheduled = false;
      rebuild();
      draw(performance.now());
    });
    resize.observe(canvas);
    reducedMotion.addEventListener('change', onMotionChange);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener(READING_GARDEN_PROGRESS_EVENT, onPageRead);
    particleAtlas.onload = () => {
      particleAtlasReady = true;
      draw(performance.now());
    };
    particleAtlas.src = particleAtlasUrl;
    groundInsectAtlas.onload = () => {
      groundInsectAtlasReady = true;
      draw(performance.now());
    };
    groundInsectAtlas.src = groundInsectAtlasUrl;
    aerialInsectAtlas.onload = () => {
      aerialInsectAtlasReady = true;
      draw(performance.now());
    };
    aerialInsectAtlas.src = aerialInsectAtlasUrl;
    rebuild();
    draw(previous);

    return () => {
      cancelAnimationFrame(frame);
      frameScheduled = false;
      resize.disconnect();
      reducedMotion.removeEventListener('change', onMotionChange);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener(READING_GARDEN_PROGRESS_EVENT, onPageRead);
      particleAtlas.onload = null;
      groundInsectAtlas.onload = null;
      aerialInsectAtlas.onload = null;
    };
  }, [stage]);

  return <canvas ref={canvasRef} className="reading-garden-life" aria-hidden="true" />;
}
