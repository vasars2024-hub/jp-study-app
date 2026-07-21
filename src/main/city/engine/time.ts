import {
  ACTIVE_DOMAIN_DECAY_RATE,
  ACTIVITY_DECAY_RATE,
  CIRCULATION_DECAY_RATE,
  CRYSTAL_DAMPING_MAX,
  DORMANCY_ILLUMINATION,
  ENERGY_DISCHARGE_PER_MINUTE,
  ILLUMINATION_DECAY_RATE,
  REAWAKENING_MINUTES,
  RESERVOIR_DECAY_RATE,
} from './constants';
import { cloneState } from './state';
import { CivilizationState, InterpretedLearningInput } from './types';
import { clamp, saturating, unit } from './math';

function decay(value: number, rate: number, minutes: number): number {
  return value * Math.exp(-rate * minutes);
}

export function applyElapsedTime(state: CivilizationState, elapsedMinutes: number): CivilizationState {
  const next = cloneState(state);
  const elapsed = Number.isFinite(elapsedMinutes) ? Math.max(0, elapsedMinutes) : 0;
  if (elapsed === 0 || next.status === 'hibernating') return next;

  const shielded = Math.min(elapsed, next.ecology.energy / ENERGY_DISCHARGE_PER_MINUTE);
  next.ecology.energy = Math.max(0, next.ecology.energy - shielded * ENERGY_DISCHARGE_PER_MINUTE);
  const exposed = elapsed - shielded;
  if (exposed <= 0) return next;

  const damping = clamp(saturating(next.ecology.crystalRecord, 140) * CRYSTAL_DAMPING_MAX, 0, CRYSTAL_DAMPING_MAX);
  const factor = 1 - damping;
  next.ecology.illumination = unit(decay(next.ecology.illumination, ILLUMINATION_DECAY_RATE * factor, exposed));
  next.ecology.circulation = unit(decay(next.ecology.circulation, CIRCULATION_DECAY_RATE * factor, exposed));
  next.ecology.reservoirs.brine = decay(next.ecology.reservoirs.brine, RESERVOIR_DECAY_RATE * factor, exposed);
  next.ecology.reservoirs.glucans = decay(next.ecology.reservoirs.glucans, RESERVOIR_DECAY_RATE * factor, exposed);
  next.ecology.reservoirs.catalysts = decay(next.ecology.reservoirs.catalysts, RESERVOIR_DECAY_RATE * factor, exposed);
  next.ecology.mycelialActivity = decay(next.ecology.mycelialActivity, ACTIVITY_DECAY_RATE * factor, exposed);
  next.ecology.crystalActivity = decay(next.ecology.crystalActivity, ACTIVITY_DECAY_RATE * factor, exposed);
  next.citizen.activity = unit(decay(next.citizen.activity, ACTIVITY_DECAY_RATE * factor, exposed));
  next.technology.activePractice = unit(decay(next.technology.activePractice, ACTIVE_DOMAIN_DECAY_RATE * factor, exposed));
  next.culture.activeExpression = unit(decay(next.culture.activeExpression, ACTIVE_DOMAIN_DECAY_RATE * factor, exposed));
  next.economy.activeCoordination = unit(decay(next.economy.activeCoordination, ACTIVE_DOMAIN_DECAY_RATE * factor, exposed));

  if (next.ecology.illumination < DORMANCY_ILLUMINATION) enterHibernation(next);
  return next;
}

function enterHibernation(state: CivilizationState): void {
  state.status = 'hibernating';
  state.ecology.illumination = 0;
  state.ecology.circulation = 0;
  state.ecology.mycelialActivity = 0;
  state.ecology.crystalActivity = 0;
  state.citizen.activity = 0;
  state.technology.activePractice = 0;
  state.culture.activeExpression = 0;
  state.economy.activeCoordination = 0;
}

export function canWake(input: InterpretedLearningInput): boolean {
  return input.focusDuration >= REAWAKENING_MINUTES;
}

export function wake(state: CivilizationState, input: InterpretedLearningInput): CivilizationState {
  const next = cloneState(state);
  if (next.status !== 'hibernating' || !canWake(input)) return next;
  next.status = 'active';
  next.ecology.illumination = unit(0.16 + Math.min(0.24, input.focusDuration / 180));
  next.ecology.circulation = unit(0.08 + Math.min(0.2, input.focusDuration / 240));
  next.citizen.activity = unit(0.12 + input.profile.sustainedAttention * 0.25);
  return next;
}
