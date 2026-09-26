import { describe, expect, it } from 'vitest';
import { withLiveRoutineAssignments } from './companionAssignments';
import type { CompanionInstance } from './companionCatalog';

const pet = (over: Partial<CompanionInstance> = {}): CompanionInstance =>
  ({
    id: 'c-aero',
    typeId: 'aero',
    x: 10,
    y: 20,
    facing: 1,
    mood: 'curious',
    motion: 'walk',
    ...over,
  }) as CompanionInstance;

describe('withLiveRoutineAssignments', () => {
  it('keeps an assignment made in another window while saving local positions', () => {
    const merged = withLiveRoutineAssignments(
      [pet({ x: 500, y: 300 })],
      [pet({ x: 10, y: 20, holdRoutineId: 'r-tea' })],
    );

    expect(merged[0].holdRoutineId).toBe('r-tea');
    expect([merged[0].x, merged[0].y]).toEqual([500, 300]);
  });

  it('reconciles all three assignment fields and no motion-owned field', () => {
    const merged = withLiveRoutineAssignments(
      [pet({ x: 1, y: 2, facing: -1, mood: 'happy', motion: 'fall' })],
      [pet({
        x: 900,
        y: 900,
        primaryRoutineId: 'p',
        secondaryRoutineId: 's',
        holdRoutineId: 'h',
      })],
    );
    expect(merged[0]).toMatchObject({
      x: 1,
      y: 2,
      facing: -1,
      mood: 'happy',
      motion: 'fall',
      primaryRoutineId: 'p',
      secondaryRoutineId: 's',
      holdRoutineId: 'h',
    });
  });

  it('keeps a cleared assignment cleared', () => {
    const merged = withLiveRoutineAssignments(
      [pet({ holdRoutineId: 'r-old' })],
      [pet({ holdRoutineId: '' })],
    );
    expect(merged[0].holdRoutineId).toBe('');
  });

  it('does not resurrect dismissed companions or drop a new companion', () => {
    const dismissed = withLiveRoutineAssignments(
      [pet({ id: 'a' })],
      [pet({ id: 'a' }), pet({ id: 'b' })],
    );
    const fresh = pet({ id: 'brand-new', holdRoutineId: 'keep-me' });

    expect(dismissed.map((companion) => companion.id)).toEqual(['a']);
    expect(withLiveRoutineAssignments([fresh], [])).toEqual([fresh]);
  });
});
