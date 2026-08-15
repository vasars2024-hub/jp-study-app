import { describe, expect, it } from 'vitest';
import {
  WORKBENCH_STEP_IDS,
  canEnterStep,
  createWorkbenchFlow,
  findStep,
  goToStep,
  nextStep,
  previousStep,
  recordStep,
  stepIsPassable,
  workbenchFlowProgress,
  type WorkbenchFlowState,
} from '../ankiWorkbenchFlow';

/** Satisfy every step from `source` up to (not including) `stopBefore`. */
function walkTo(stopBefore: number): WorkbenchFlowState {
  let state = createWorkbenchFlow();
  for (let i = 0; i < stopBefore; i += 1) {
    state = recordStep(state, WORKBENCH_STEP_IDS[i]!, {
      satisfied: true,
      outcomeKey: `ankiWorkbench.step.${WORKBENCH_STEP_IDS[i]}.outcome`,
      affected: (i + 1) * 10,
    });
    const moved = nextStep(state);
    state = moved.state;
  }
  return state;
}

describe('createWorkbenchFlow', () => {
  it('starts on the source step with all seven steps unsatisfied', () => {
    const state = createWorkbenchFlow();
    expect(state.current).toBe('source');
    expect(state.steps).toHaveLength(7);
    expect(state.steps.map((s) => s.id)).toEqual([
      'source', 'browse', 'enrich', 'fields', 'rules', 'review', 'apply',
    ]);
    expect(state.steps.some((s) => s.satisfied)).toBe(false);
    expect(state.steps.some((s) => s.stale)).toBe(false);
  });

  it('holds no user-visible English — outcome sentences are keys the surface resolves', () => {
    for (const step of createWorkbenchFlow().steps) {
      expect(step.outcomeKey).toBe('');
    }
  });
});

describe('locking', () => {
  it('refuses a jump past the first unsatisfied step and names what blocks it', () => {
    const state = createWorkbenchFlow();
    expect(canEnterStep(state, 'browse')).toBe(false);
    const moved = goToStep(state, 'apply');
    expect(moved.ok).toBe(false);
    expect(moved.reason).toBe('locked');
    expect(moved.blockedBy).toBe('source');
    // A refused move must not half-apply.
    expect(moved.state).toBe(state);
    expect(moved.state.current).toBe('source');
  });

  it('unlocks exactly one step per satisfied step', () => {
    const state = recordStep(createWorkbenchFlow(), 'source', { satisfied: true });
    expect(canEnterStep(state, 'browse')).toBe(true);
    expect(canEnterStep(state, 'enrich')).toBe(false);
  });

  it('treats a blocked validation as not passable even when the step is satisfied', () => {
    const state = recordStep(createWorkbenchFlow(), 'source', {
      satisfied: true,
      validation: 'blocked',
    });
    expect(stepIsPassable(findStep(state, 'source'))).toBe(false);
    expect(canEnterStep(state, 'browse')).toBe(false);
  });

  it('lets a warning through — only blocked stops the flow', () => {
    const state = recordStep(createWorkbenchFlow(), 'source', {
      satisfied: true,
      validation: 'warning',
    });
    expect(canEnterStep(state, 'browse')).toBe(true);
  });

  it('rejects an unknown step id without changing state', () => {
    const state = createWorkbenchFlow();
    const moved = goToStep(state, 'nope' as never);
    expect(moved.ok).toBe(false);
    expect(moved.reason).toBe('unknown-step');
    expect(moved.state).toBe(state);
  });
});

describe('back never loses work', () => {
  it('walks back to source and forward again with every recorded value intact', () => {
    const state = walkTo(4);
    expect(state.current).toBe('rules');

    let back = state;
    for (let i = 0; i < 4; i += 1) back = previousStep(back).state;
    expect(back.current).toBe('source');
    expect(findStep(back, 'fields').affected).toBe(40);
    expect(findStep(back, 'fields').satisfied).toBe(true);
    expect(findStep(back, 'fields').outcomeKey).toBe('ankiWorkbench.step.fields.outcome');

    const forward = goToStep(back, 'rules');
    expect(forward.ok).toBe(true);
    expect(findStep(forward.state, 'browse').affected).toBe(20);
  });

  it('allows Back from the very first step to fail rather than wrap around', () => {
    const moved = previousStep(createWorkbenchFlow());
    expect(moved.ok).toBe(false);
    expect(moved.state.current).toBe('source');
  });

  it('marks later steps stale rather than erasing them when the source changes', () => {
    const state = walkTo(4);
    const changed = recordStep(state, 'source', {
      satisfied: true,
      outcomeKey: 'ankiWorkbench.step.source.outcome',
      affected: 999,
      invalidatesLaterSteps: true,
    });

    const browse = findStep(changed, 'browse');
    expect(browse.stale).toBe(true);
    // The whole point: the numbers survive, so the surface can say what went stale.
    expect(browse.satisfied).toBe(true);
    expect(browse.affected).toBe(20);
    expect(browse.outcomeKey).toBe('ankiWorkbench.step.browse.outcome');

    // Stale means not passable, so the flow cannot walk over it unexamined.
    expect(stepIsPassable(browse)).toBe(false);
    expect(canEnterStep(changed, 'enrich')).toBe(false);
    expect(canEnterStep(changed, 'browse')).toBe(true);
  });

  it('clears a step’s own staleness the moment it is recorded again', () => {
    const state = recordStep(walkTo(4), 'source', { satisfied: true, invalidatesLaterSteps: true });
    expect(findStep(state, 'browse').stale).toBe(true);
    const rebrowsed = recordStep(state, 'browse', { satisfied: true, affected: 21 });
    expect(findStep(rebrowsed, 'browse').stale).toBe(false);
    expect(findStep(rebrowsed, 'enrich').stale).toBe(true);
    expect(canEnterStep(rebrowsed, 'enrich')).toBe(true);
  });

  it('pulls the user back to the blocking step instead of stranding them on a locked one', () => {
    const state = walkTo(4);
    expect(state.current).toBe('rules');
    const changed = recordStep(state, 'source', { satisfied: true, invalidatesLaterSteps: true });
    // `rules` is now locked behind a stale `browse`; standing there would be a lie.
    expect(changed.current).toBe('browse');
    expect(canEnterStep(changed, 'rules')).toBe(false);
  });

  it('does not move the user when the recorded change leaves their step reachable', () => {
    const state = walkTo(4);
    const rerecorded = recordStep(state, 'browse', { affected: 25 });
    expect(rerecorded.current).toBe('rules');
    expect(findStep(rerecorded, 'browse').affected).toBe(25);
  });
});

describe('workbenchFlowProgress', () => {
  it('counts completed, stale and where Next stops', () => {
    const fresh = workbenchFlowProgress(createWorkbenchFlow());
    expect(fresh).toEqual({ completed: 0, total: 7, stale: 0, blockedAt: 'source', done: false });

    const partway = workbenchFlowProgress(walkTo(3));
    expect(partway.completed).toBe(3);
    expect(partway.blockedAt).toBe('fields');
    expect(partway.done).toBe(false);

    const stale = workbenchFlowProgress(
      recordStep(walkTo(4), 'source', { satisfied: true, invalidatesLaterSteps: true }),
    );
    expect(stale.stale).toBe(3);
    expect(stale.completed).toBe(1);
    expect(stale.blockedAt).toBe('browse');
  });

  it('is only done once apply itself is recorded', () => {
    const nearly = walkTo(6);
    expect(workbenchFlowProgress(nearly).done).toBe(false);
    const applied = recordStep(nearly, 'apply', { satisfied: true, affected: 70 });
    expect(workbenchFlowProgress(applied).done).toBe(true);
    expect(nextStep(applied).ok).toBe(false);
  });
});
