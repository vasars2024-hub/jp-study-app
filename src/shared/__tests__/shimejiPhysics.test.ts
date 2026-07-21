import { describe, expect, it } from 'vitest';
import {
  clampThrowVelocity,
  companionCssTransform,
  edgeRotationDeg,
  mapDeskToDisplayWorkArea,
  pickDisplayForVirtualPoint,
  updateShimejiMotion,
  type ShimejiBody,
} from '../../renderer/environment/shimejiPhysics';
import {
  hourInTriggerWindow,
  routinesMatchingTrigger,
  sanitizeTrigger,
  type BuddyRoutineTriggerFields,
} from '../../renderer/environment/buddyTriggers';
import { splitSyllables } from '../../renderer/environment/beepSpeech';

function body(partial: Partial<ShimejiBody> = {}): ShimejiBody {
  return {
    x: 100,
    y: 200,
    facing: 1,
    edge: 'floor',
    motion: 'walk',
    ...partial,
  };
}

describe('shimejiPhysics', () => {
  it('edge rotation follows surface normal', () => {
    expect(edgeRotationDeg('floor')).toBe(0);
    expect(edgeRotationDeg('left')).toBe(90);
    expect(edgeRotationDeg('right')).toBe(-90);
    expect(edgeRotationDeg('ceiling')).toBe(180);
  });

  it('css transform uses edge rotate + along-edge facing', () => {
    expect(companionCssTransform({ x: 10, y: 20, facing: -1, edge: 'ceiling' })).toBe(
      'translate3d(10px, 20px, 0) rotate(180deg) scaleX(-1)',
    );
    expect(
      companionCssTransform({ x: 0, y: 0, facing: 1, edge: 'left' }, { includeTranslate: false }),
    ).toBe('rotate(90deg) scaleX(1)');
  });

  it('ceiling walk does not exit on the entry wall edge', () => {
    const c = body({
      x: 8,
      y: 8,
      motion: 'ceiling',
      edge: 'ceiling',
      motionSide: 'left',
      motionTargetX: 400,
      facing: 1,
    });
    updateShimejiMotion(c, 500, 400, 0.05, 30, { gravity: 1200, damping: 0.98 }, 96);
    expect(c.motion).toBe('ceiling');
    expect(c.x).toBeGreaterThan(8);
    expect(c.edge).toBe('ceiling');
  });

  it('wall climb facing follows climb direction (along-edge), not wall side alone', () => {
    const up = body({
      x: 8,
      y: 200,
      motion: 'wall',
      motionSide: 'left',
      motionTargetY: 8,
    });
    updateShimejiMotion(up, 500, 400, 0.05, 30, { gravity: 1200, damping: 0.98 }, 96);
    expect(up.edge).toBe('left');
    expect(up.facing).toBe(-1); // climbing up

    const down = body({
      x: 8,
      y: 40,
      motion: 'wall',
      motionSide: 'left',
      motionTargetY: 280,
    });
    updateShimejiMotion(down, 500, 400, 0.05, 30, { gravity: 1200, damping: 0.98 }, 96);
    expect(down.facing).toBe(1); // climbing down
  });

  it('fall integrates throw velocity on both axes', () => {
    const c = body({
      x: 100,
      y: 50,
      motion: 'fall',
      motionVx: 400,
      motionVy: -100,
      edge: 'floor',
    });
    const x0 = c.x;
    updateShimejiMotion(c, 500, 400, 0.05, 30, { gravity: 1200, damping: 1 }, 96);
    expect(c.x).toBeGreaterThan(x0);
    expect(c.motionVy ?? 0).toBeGreaterThan(-100); // gravity added
  });

  it('clamps throw velocity', () => {
    expect(clampThrowVelocity(99999)).toBe(2200);
    expect(clampThrowVelocity(-99999)).toBe(-2200);
    expect(clampThrowVelocity(Number.NaN)).toBe(0);
  });

  it('picks nearest display when virtual point sits in a gap', () => {
    const displays = [
      { workArea: { x: 0, y: 0, width: 100, height: 100 } },
      { workArea: { x: 200, y: 0, width: 100, height: 100 } },
    ];
    expect(pickDisplayForVirtualPoint(50, 50, displays)).toBe(0);
    expect(pickDisplayForVirtualPoint(250, 50, displays)).toBe(1);
    expect(pickDisplayForVirtualPoint(150, 50, displays)).toBe(0); // equidistant → first closer by clamp
  });

  it('maps desk coords into a display work area relative to host origin', () => {
    const pos = mapDeskToDisplayWorkArea(
      0.5,
      0.25,
      { x: 1920, y: 0, width: 1920, height: 1080 },
      { x: 0, y: 0 },
    );
    expect(pos.left).toBe(1920 + 960);
    expect(pos.top).toBe(270);
  });
});

describe('buddy triggers', () => {
  it('matches overnight time windows', () => {
    expect(hourInTriggerWindow(22, 21, 5)).toBe(true);
    expect(hourInTriggerWindow(3, 21, 5)).toBe(true);
    expect(hourInTriggerWindow(12, 21, 5)).toBe(false);
    expect(hourInTriggerWindow(7, 5, 11)).toBe(true);
  });

  it('filters routines by trigger kind', () => {
    const routines: BuddyRoutineTriggerFields[] = [
      {
        id: 'a',
        trigger: { kind: 'timeOfDay', startHour: 5, endHour: 11 },
      },
      { id: 'b', trigger: { kind: 'musicPlaying' } },
      { id: 'c', trigger: { kind: 'idle', afterMs: 60_000 } },
    ];
    expect(routinesMatchingTrigger(routines, 'musicPlaying').map((r) => r.id)).toEqual(['b']);
    expect(routinesMatchingTrigger(routines, 'idle', { afterMs: 90_000 }).map((r) => r.id)).toEqual([
      'c',
    ]);
    expect(routinesMatchingTrigger(routines, 'idle', { afterMs: 10_000 })).toEqual([]);
    expect(
      routinesMatchingTrigger(routines, 'timeOfDay', { hour: 8 }).map((r) => r.id),
    ).toEqual(['a']);
  });

  it('sanitizes trigger payloads', () => {
    expect(sanitizeTrigger({ kind: 'musicPlaying' })).toEqual({ kind: 'musicPlaying' });
    expect(sanitizeTrigger({ kind: 'idle', afterMs: 5 })).toEqual({ kind: 'idle', afterMs: 15_000 });
    expect(sanitizeTrigger({ kind: 'timeOfDay', startHour: 25, endHour: -1 })).toEqual({
      kind: 'timeOfDay',
      startHour: 23,
      endHour: 0,
    });
  });
});

describe('beep speech syllables', () => {
  it('splits kana and latin into mora-ish units', () => {
    expect(splitSyllables('こんにちは').length).toBeGreaterThanOrEqual(4);
    expect(splitSyllables('Ready').length).toBeGreaterThanOrEqual(1);
  });
});
