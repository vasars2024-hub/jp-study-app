/**
 * Shimeji motion helpers — edge-normal orientation, ceiling travel, throw arcs.
 * Pure functions so multi-monitor mapping and unit tests share one source of truth.
 */

export type CompanionEdge = 'floor' | 'left' | 'right' | 'ceiling';

export interface ShimejiBody {
  x: number;
  y: number;
  facing: 1 | -1;
  edge?: CompanionEdge;
  motion?: string;
  motionTargetX?: number;
  motionTargetY?: number;
  motionSide?: 'left' | 'right';
  motionVx?: number;
  motionVy?: number;
}

export function edgeRotationDeg(edge: CompanionEdge | undefined): number {
  switch (edge) {
    case 'left':
      return 90;
    case 'right':
      return -90;
    case 'ceiling':
      return 180;
    default:
      return 0;
  }
}

/** CSS transform: position + edge-normal rotation + along-edge facing flip. */
export function companionCssTransform(
  c: Pick<ShimejiBody, 'x' | 'y' | 'facing' | 'edge'>,
  opts?: { includeTranslate?: boolean },
): string {
  const rot = edgeRotationDeg(c.edge);
  const flip = `scaleX(${c.facing})`;
  const orient = rot ? `rotate(${rot}deg) ${flip}` : flip;
  if (opts?.includeTranslate === false) return orient;
  return `translate3d(${c.x}px, ${c.y}px, 0) ${orient}`;
}

/** Un-flip chrome (menus) so UI stays readable while the sprite rotates. */
export function companionChromeCounterScale(facing: 1 | -1, edge?: CompanionEdge): string {
  const rot = edgeRotationDeg(edge);
  // Inverse of rotate(rot) scaleX(facing): scaleX(facing) rotate(-rot)
  return `scaleX(${facing}) rotate(${-rot}deg)`;
}

export function setMotionField<T extends { motion?: string }>(c: T, motion: string): boolean {
  if (c.motion === motion) return false;
  c.motion = motion;
  return true;
}

/**
 * Advance one shimeji physics step.
 * Facing follows along-edge travel; sprite orientation follows the edge normal
 * (via `edge` → rotation), never the velocity sign alone.
 */
export function updateShimejiMotion(
  c: ShimejiBody,
  w: number,
  h: number,
  dt: number,
  speed: number,
  physics: { gravity: number; damping: number },
  size: number,
): boolean {
  const pad = 8;
  const floorY = Math.max(pad, h - size - pad);
  const rightX = Math.max(pad, w - size - pad);
  let changed = false;
  // Allow quiet / low-activeness pets to actually walk slowly (old floor of 26
  // made reactivity "quiet" a no-op for shimeji locomotion).
  const moveSpeed = Math.max(speed, 3);
  const activity = Math.min(1.4, Math.max(0.12, moveSpeed / 18));

  if (!c.motion || c.motion === 'stand' || c.motion === 'sit' || c.motion === 'drag' || c.motion === 'celebrate') {
    changed = setMotionField(c, 'walk') || changed;
  }

  if (c.motion === 'fall') {
    const damp = Math.pow(physics.damping, dt);
    const vx = (c.motionVx ?? 0) * damp;
    const vy = (c.motionVy ?? 0) * damp + physics.gravity * dt;
    c.motionVx = vx;
    c.motionVy = vy;
    c.edge = 'floor';
    c.x = clamp(c.x + vx * dt, pad, rightX);
    c.y = clamp(c.y + vy * dt, pad, floorY);
    if (c.facing !== (vx >= 0 ? 1 : -1) && Math.abs(vx) > 12) {
      c.facing = vx >= 0 ? 1 : -1;
      changed = true;
    }

    if (c.y >= floorY - 1) {
      c.y = floorY;
      c.motionVx = 0;
      c.motionVy = 0;
      c.edge = 'floor';
      c.motionTargetX = c.facing === 1 ? rightX : pad;
      changed = setMotionField(c, 'walk') || changed;
      return changed;
    }

    // Stick to a wall if the throw hits a side edge with meaningful horizontal speed.
    if ((c.x <= pad + 1 || c.x >= rightX - 1) && Math.abs(vx) > 40) {
      c.x = c.x <= pad + 1 ? pad : rightX;
      c.motionSide = c.x <= pad + 1 ? 'left' : 'right';
      c.motionVx = 0;
      c.motionVy = 0;
      c.motionTargetY = pad;
      c.edge = c.motionSide;
      changed = setMotionField(c, 'wall') || changed;
    }
    return changed;
  }

  // Not falling — clear stale throw velocity so the next drop starts clean.
  if (c.motionVx) c.motionVx = 0;
  if (c.motionVy) c.motionVy = 0;

  if (c.motion === 'wall') {
    const side = c.motionSide ?? (c.x < w / 2 ? 'left' : 'right');
    c.motionSide = side;
    c.edge = side;
    c.x = side === 'left' ? pad : rightX;
    const targetY = clamp(c.motionTargetY ?? pad, pad, floorY);
    const dir: 1 | -1 = targetY < c.y ? -1 : 1;
    // Along-edge facing (climb direction). Orientation comes from edge normal.
    c.facing = dir;
    c.y = clamp(c.y + dir * moveSpeed * 0.82 * dt, pad, floorY);
    if (Math.abs(c.y - targetY) <= 2) {
      c.y = targetY;
      if (targetY <= pad + 1) {
        // Cross the ceiling toward the opposite wall — do not exit on entry x.
        c.motionTargetX = side === 'left' ? rightX : pad;
        c.edge = 'ceiling';
        changed = setMotionField(c, 'ceiling') || changed;
      } else {
        c.motionTargetX = side === 'left' ? rightX : pad;
        c.edge = 'floor';
        c.facing = side === 'left' ? 1 : -1;
        changed = setMotionField(c, 'walk') || changed;
      }
    }
    return changed;
  }

  if (c.motion === 'ceiling') {
    c.y = pad;
    c.edge = 'ceiling';
    const targetX = clamp(c.motionTargetX ?? (c.facing === 1 ? rightX : pad), pad, rightX);
    const dir: 1 | -1 = targetX >= c.x ? 1 : -1;
    c.facing = dir;
    c.x = clamp(c.x + dir * moveSpeed * 0.72 * dt, pad, rightX);
    // Only finish when the target is reached — NOT when still on the entry wall edge.
    if (Math.abs(c.x - targetX) <= 2) {
      c.x = clamp(targetX, pad, rightX);
      c.motionSide = c.x < w / 2 ? 'left' : 'right';
      c.edge = c.motionSide;
      c.motionTargetY = Math.random() < 0.35 ? floorY : pad + Math.random() * Math.max(40, floorY - pad);
      changed = setMotionField(c, 'wall') || changed;
    } else if (Math.random() < dt * 0.035 * activity) {
      c.motionTargetY = undefined;
      c.motionSide = undefined;
      c.edge = 'floor';
      changed = setMotionField(c, 'fall') || changed;
    }
    return changed;
  }

  c.y = floorY;
  c.edge = 'floor';
  changed = setMotionField(c, 'walk') || changed;
  if (typeof c.motionTargetX !== 'number') c.motionTargetX = c.facing === 1 ? rightX : pad;
  const targetX = clamp(c.motionTargetX, pad, rightX);
  const dir: 1 | -1 = targetX >= c.x ? 1 : -1;
  c.facing = dir;
  c.x = clamp(c.x + dir * moveSpeed * dt, pad, rightX);
  if (Math.abs(c.x - targetX) <= 2 || c.x <= pad + 1 || c.x >= rightX - 1) {
    c.x = clamp(c.x <= pad + 1 ? pad : c.x >= rightX - 1 ? rightX : targetX, pad, rightX);
    c.motionSide = c.x < w / 2 ? 'left' : 'right';
    c.edge = c.motionSide;
    c.motionTargetY = pad;
    changed = setMotionField(c, 'wall') || changed;
  } else if (Math.random() < dt * 0.025 * activity) {
    c.motionTargetX = c.facing === 1 ? pad + Math.random() * rightX * 0.42 : rightX - Math.random() * rightX * 0.42;
  }
  return changed;
}

export function clampThrowVelocity(v: number, max = 2200): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(max, Math.max(-max, v));
}

function clamp(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n));
}

/** Map desk-normalized coords onto a host display work area (physical DIP). */
export function mapDeskToDisplayWorkArea(
  nx: number,
  ny: number,
  workArea: { x: number; y: number; width: number; height: number },
  hostOrigin: { x: number; y: number },
): { left: number; top: number } {
  const u = Math.min(1, Math.max(0, nx));
  const v = Math.min(1, Math.max(0, ny));
  return {
    left: workArea.x - hostOrigin.x + u * workArea.width,
    top: workArea.y - hostOrigin.y + v * workArea.height,
  };
}

/**
 * Pick the display whose work area contains the virtual-desktop point, or the
 * nearest work area if the point sits in a monitor gap.
 */
export function pickDisplayForVirtualPoint(
  vx: number,
  vy: number,
  displays: Array<{ workArea: { x: number; y: number; width: number; height: number } }>,
): number {
  if (!displays.length) return 0;
  for (let i = 0; i < displays.length; i++) {
    const wa = displays[i].workArea;
    if (vx >= wa.x && vx < wa.x + wa.width && vy >= wa.y && vy < wa.y + wa.height) return i;
  }
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < displays.length; i++) {
    const wa = displays[i].workArea;
    const cx = clamp(vx, wa.x, wa.x + wa.width);
    const cy = clamp(vy, wa.y, wa.y + wa.height);
    const d = (cx - vx) * (cx - vx) + (cy - vy) * (cy - vy);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}
