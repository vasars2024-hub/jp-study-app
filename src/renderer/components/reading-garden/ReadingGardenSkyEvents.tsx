import { useEffect, useRef, useState } from "react";

export type MooncapSkySimKind = "meteor" | "asteroid" | "barrage";

export const MOONCAP_SKY_SIM_EVENT = "jp-mooncap-sky-sim";

type EventKind = "meteor" | "asteroid" | "ice";
type SkySimHandler = (kind: MooncapSkySimKind) => void;

const skySimHandlers = new Set<SkySimHandler>();

type EventKindSpawn = EventKind;

interface SkyStreak {
  kind: EventKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  length: number;
  width: number;
  alpha: number;
  /** 0 cool white, 1 cyan ice, 2 warm ember rim */
  tint: 0 | 1 | 2;
  spark: boolean;
  flickerPhase: number;
  flickerSpeed: number;
}

const METEOR_INTERVAL_MS = 30_000;
const ASTEROID_INTERVAL_MS = 5 * 60_000;
const BARRAGE_MIN_MS = 10 * 60_000;
const BARRAGE_MAX_MS = 15 * 60_000;

function jitter(base: number, spread: number) {
  return base + (Math.random() * 2 - 1) * spread;
}

function nextBarrageDelay() {
  return BARRAGE_MIN_MS + Math.random() * (BARRAGE_MAX_MS - BARRAGE_MIN_MS);
}

/**
 * Sky vault spawn: upper-right plate sky, drifting left and down.
 * `boost` makes developer-forced events easier to see while testing.
 */
function spawnStreak(
  width: number,
  height: number,
  kind: EventKindSpawn = "meteor",
  boost = false,
): SkyStreak {
  const startX = width * (0.58 + Math.random() * 0.3);
  const startY = height * (0.04 + Math.random() * 0.16);
  const isMeteor = kind === "meteor";
  const speed = isMeteor
    ? 28 + Math.random() * 22
    : kind === "asteroid"
      ? 70 + Math.random() * 40
      : 55 + Math.random() * 45;
  const dive = isMeteor
    ? 0.18 + Math.random() * 0.22
    : 0.26 + Math.random() * 0.3;
  const scale =
    kind === "asteroid" ? 1.55 : kind === "ice" ? 1.12 + Math.random() * 0.35 : 1;
  const baseAlpha = isMeteor
    ? 0.12 + Math.random() * 0.1
    : kind === "asteroid"
      ? 0.34 + Math.random() * 0.12
      : 0.28 + Math.random() * 0.14;
  return {
    kind,
    x: startX,
    y: startY,
    vx: -speed,
    vy: speed * dive,
    life: 0,
    maxLife: isMeteor
      ? 3.8 + Math.random() * 2.4
      : kind === "asteroid"
        ? 2.2 + Math.random() * 0.8
        : 1.4 + Math.random() * 0.7,
    length: (isMeteor ? 38 : kind === "asteroid" ? 58 : 44) * scale,
    width: (isMeteor ? 1.05 : kind === "asteroid" ? 2.5 : 1.85) * scale,
    alpha: boost ? Math.min(0.72, baseAlpha * 2.4) : baseAlpha,
    tint:
      kind === "ice"
        ? Math.random() > 0.45
          ? 1
          : 2
        : kind === "asteroid"
          ? Math.random() > 0.65
            ? 2
            : 0
          : Math.random() > 0.7
            ? 1
            : 0,
    spark: kind !== "meteor",
    flickerPhase: Math.random() * Math.PI * 2,
    flickerSpeed: isMeteor
      ? 7 + Math.random() * 9
      : 3.5 + Math.random() * 4,
  };
}

function tintColors(tint: 0 | 1 | 2): {
  head: string;
  mid: string;
  glow: string;
} {
  if (tint === 1) {
    return {
      head: "rgba(210, 250, 255, 0.95)",
      mid: "rgba(120, 220, 235, 0.4)",
      glow: "rgba(120, 220, 240, 0.35)",
    };
  }
  if (tint === 2) {
    return {
      head: "rgba(255, 236, 220, 0.95)",
      mid: "rgba(255, 170, 120, 0.4)",
      glow: "rgba(255, 170, 120, 0.32)",
    };
  }
  return {
    head: "rgba(236, 250, 255, 0.95)",
    mid: "rgba(190, 225, 240, 0.4)",
    glow: "rgba(180, 230, 240, 0.3)",
  };
}

function flickerEnvelope(streak: SkyStreak): number {
  const a = Math.sin(streak.life * streak.flickerSpeed + streak.flickerPhase);
  const b = Math.sin(
    streak.life * streak.flickerSpeed * 1.73 + streak.flickerPhase * 1.4,
  );
  const c = Math.sin(
    streak.life * streak.flickerSpeed * 0.41 + streak.flickerPhase * 2.1,
  );
  const raw = 0.42 + a * 0.28 + b * 0.18 + c * 0.12;
  if (streak.kind === "meteor") {
    return Math.max(0.18, Math.min(1, raw * raw));
  }
  return Math.max(0.45, Math.min(1, 0.7 + raw * 0.3));
}

function drawStreak(
  ctx: CanvasRenderingContext2D,
  streak: SkyStreak,
  width: number,
  height: number,
) {
  if (streak.life < 0) return;
  const progress = streak.life / streak.maxLife;
  const envelope =
    progress < 0.1
      ? progress / 0.1
      : progress > 0.62
        ? Math.max(0, 1 - (progress - 0.62) / 0.38)
        : 1;
  const leftFade =
    streak.x <= width * 0.28
      ? 0
      : streak.x < width * 0.38
        ? (streak.x - width * 0.28) / (width * 0.1)
        : 1;
  const horizonY = height * 0.4;
  const horizonFade =
    streak.y >= horizonY
      ? 0
      : streak.y > horizonY * 0.82
        ? 1 - (streak.y - horizonY * 0.82) / (horizonY * 0.18)
        : 1;
  const alpha =
    streak.alpha * envelope * flickerEnvelope(streak) * leftFade * horizonFade;
  if (alpha < 0.008) return;

  const speed = Math.hypot(streak.vx, streak.vy) || 1;
  const ux = streak.vx / speed;
  const uy = streak.vy / speed;
  const tailX = streak.x - ux * streak.length;
  const tailY = streak.y - uy * streak.length;
  const colors = tintColors(streak.tint);
  const soft = streak.kind === "meteor" ? 0.65 : 1;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = alpha * 0.4 * soft;
  ctx.strokeStyle = colors.glow;
  ctx.lineWidth = streak.width * (streak.kind === "meteor" ? 2.4 : 3.2);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(streak.x, streak.y);
  ctx.stroke();

  const gradient = ctx.createLinearGradient(tailX, tailY, streak.x, streak.y);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(0.55, colors.mid);
  gradient.addColorStop(1, colors.head);
  ctx.globalAlpha = alpha * soft;
  ctx.strokeStyle = gradient;
  ctx.lineWidth = streak.width;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(streak.x, streak.y);
  ctx.stroke();

  const headRadius =
    streak.kind === "asteroid"
      ? streak.width * 2.8
      : streak.kind === "ice"
        ? streak.width * 2.2
        : streak.width * 1.35;
  const head = ctx.createRadialGradient(
    streak.x,
    streak.y,
    0,
    streak.x,
    streak.y,
    headRadius * 3.2,
  );
  head.addColorStop(0, colors.head);
  head.addColorStop(0.35, colors.glow);
  head.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = alpha * (streak.kind === "meteor" ? 0.55 : 0.85);
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.arc(streak.x, streak.y, headRadius * 3.2, 0, Math.PI * 2);
  ctx.fill();

  if (streak.spark) {
    const sparkCount = streak.kind === "asteroid" ? 3 : 4;
    for (let i = 0; i < sparkCount; i += 1) {
      const along = 0.2 + i * 0.18 + progress * 0.1;
      const sx = streak.x - ux * streak.length * along + uy * (i - 1.2) * 2.2;
      const sy = streak.y - uy * streak.length * along - ux * (i - 1.2) * 2.2;
      ctx.globalAlpha = alpha * Math.max(0.05, 0.25 - i * 0.04);
      ctx.fillStyle =
        streak.tint === 2
          ? "rgba(255, 200, 160, 0.9)"
          : "rgba(200, 245, 255, 0.9)";
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.4, streak.width * 0.35), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (streak.kind === "ice") {
    ctx.globalAlpha = alpha * 0.35;
    ctx.strokeStyle = "rgba(160, 230, 255, 0.7)";
    ctx.lineWidth = streak.width * 0.55;
    ctx.beginPath();
    ctx.moveTo(tailX + uy * 1.5, tailY - ux * 1.5);
    ctx.lineTo(streak.x + uy * 1.5, streak.y - ux * 1.5);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.22;
    ctx.strokeStyle = "rgba(255, 170, 130, 0.65)";
    ctx.beginPath();
    ctx.moveTo(tailX - uy * 1.5, tailY + ux * 1.5);
    ctx.lineTo(streak.x - uy * 1.5, streak.y + ux * 1.5);
    ctx.stroke();
  }

  ctx.restore();
}

export function simulateMooncapSkyEvent(kind: MooncapSkySimKind) {
  for (const handler of skySimHandlers) {
    handler(kind);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<MooncapSkySimKind>(MOONCAP_SKY_SIM_EVENT, {
        detail: kind,
      }),
    );
  }
}

const SIM_BUTTONS: { kind: MooncapSkySimKind; label: string }[] = [
  { kind: "meteor", label: "Star" },
  { kind: "asteroid", label: "Asteroid" },
  { kind: "barrage", label: "Ice barrage" },
];

export function MooncapSkyDevConsole() {
  const [open, setOpen] = useState(true);
  const [last, setLast] = useState<string>("idle");

  if (!import.meta.env.DEV) return null;

  // `lq-hit-scope` is L2's hit-area floor applied by container: the toggle rendered
  // 62x22 and the four action buttons 146x29 against category 1's 32px pointer floor,
  // and they arrive as a family. The expander is a centred transparent `::after`, so
  // nothing in the console grows visually. No `overflow: hidden` in this chain.
  return (
    <div className="reading-garden-sky-console lq-hit-scope" data-open={open ? "1" : "0"}>
      <button
        type="button"
        className="reading-garden-sky-console-toggle"
        onClick={() => setOpen((value) => !value)}
      >
        Sky sim
      </button>
      {open && (
        <div className="reading-garden-sky-console-body">
          <p>Force sky events</p>
          <div className="reading-garden-sky-console-actions">
            {SIM_BUTTONS.map((button) => (
              <button
                key={button.kind}
                type="button"
                onClick={() => {
                  simulateMooncapSkyEvent(button.kind);
                  setLast(button.label);
                }}
              >
                {button.label}
              </button>
            ))}
          </div>
          <small>Last: {last}</small>
        </div>
      )}
    </div>
  );
}

export default function ReadingGardenSkyEvents() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const streaks: SkyStreak[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let frame = 0;
    let last = performance.now();
    let visible = document.visibilityState === "visible";

    let nextMeteorAt = performance.now() + jitter(8_000, 4_000);
    let nextAsteroidAt =
      performance.now() + jitter(ASTEROID_INTERVAL_MS * 0.55, 50_000);
    let nextBarrageAt =
      performance.now() + nextBarrageDelay() * (0.4 + Math.random() * 0.25);
    let barrageRemaining = 0;
    let barrageGap = 0;
    let barrageBoost = false;

    const measureHost = () => {
      const host = canvas.parentElement;
      const garden = canvas.closest(".reading-garden");
      const hostRect = host?.getBoundingClientRect();
      if (hostRect && hostRect.width >= 2 && hostRect.height >= 2) {
        return hostRect;
      }
      return garden?.getBoundingClientRect() ?? hostRect ?? null;
    };

    const resize = () => {
      const rect = measureHost();
      if (!rect || rect.width < 2 || rect.height < 2) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const spawnCompanions = (
      count: number,
      kind: EventKind,
      boost = false,
    ) => {
      for (let i = 0; i < count; i += 1) {
        const streak = spawnStreak(
          width,
          height,
          kind === "asteroid" ? "meteor" : kind,
          boost,
        );
        streak.life = -i * 0.12;
        streak.x += (Math.random() - 0.5) * width * 0.05;
        streak.y += (Math.random() - 0.5) * height * 0.03;
        streaks.push(streak);
      }
    };

    const fireSim: SkySimHandler = (kind) => {
      resize();
      if (width < 2 || height < 2) return;
      if (kind === "meteor") {
        streaks.push(spawnStreak(width, height, "meteor", true));
        return;
      }
      if (kind === "asteroid") {
        streaks.push(spawnStreak(width, height, "asteroid", true));
        spawnCompanions(3 + Math.floor(Math.random() * 3), "asteroid", true);
        return;
      }
      barrageRemaining = 8 + Math.floor(Math.random() * 4);
      barrageGap = 0;
      barrageBoost = true;
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (!visible) {
        last = now;
        return;
      }
      if (width < 2 || height < 2) {
        resize();
        last = now;
        return;
      }

      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const ambientAllowed = !reducedMotion.matches;

      if (ambientAllowed) {
        if (now >= nextMeteorAt) {
          streaks.push(spawnStreak(width, height, "meteor"));
          nextMeteorAt = now + jitter(METEOR_INTERVAL_MS, 9_000);
        }

        if (now >= nextAsteroidAt) {
          streaks.push(spawnStreak(width, height, "asteroid"));
          spawnCompanions(3 + Math.floor(Math.random() * 3), "asteroid");
          nextAsteroidAt = now + jitter(ASTEROID_INTERVAL_MS, 45_000);
        }

        if (barrageRemaining <= 0 && now >= nextBarrageAt) {
          barrageRemaining = 7 + Math.floor(Math.random() * 6);
          barrageGap = 0;
          barrageBoost = false;
          nextBarrageAt = now + nextBarrageDelay();
        }
      }

      if (barrageRemaining > 0) {
        barrageGap -= dt;
        if (barrageGap <= 0) {
          streaks.push(spawnStreak(width, height, "ice", barrageBoost));
          if (Math.random() > 0.4) {
            spawnCompanions(
              1 + Math.floor(Math.random() * 2),
              "ice",
              barrageBoost,
            );
          }
          barrageRemaining -= 1;
          barrageGap = 0.18 + Math.random() * 0.35;
        }
      }

      ctx.clearRect(0, 0, width, height);
      for (let i = streaks.length - 1; i >= 0; i -= 1) {
        const streak = streaks[i];
        if (streak.life >= 0) {
          streak.x += streak.vx * dt;
          streak.y += streak.vy * dt;
          streak.vx *= 1 - 0.015 * dt;
          streak.vy *= 1 + 0.01 * dt;
          drawStreak(ctx, streak, width, height);
        }
        streak.life += dt;
        if (
          streak.life >= streak.maxLife ||
          streak.x < width * 0.26 ||
          streak.x > width + 80 ||
          streak.y > height * 0.42
        ) {
          streaks.splice(i, 1);
        }
      }
    };

    const onVisibility = () => {
      visible = document.visibilityState === "visible";
      last = performance.now();
    };

    resize();
    skySimHandlers.add(fireSim);
    const observer = new ResizeObserver(() => resize());
    const host = canvas.parentElement;
    const garden = canvas.closest(".reading-garden");
    if (host) observer.observe(host);
    if (garden && garden !== host) observer.observe(garden);
    document.addEventListener("visibilitychange", onVisibility);
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      skySimHandlers.delete(fireSim);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="reading-garden-sky-events"
      aria-hidden="true"
    />
  );
}
