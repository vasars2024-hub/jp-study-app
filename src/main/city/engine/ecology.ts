import { ENERGY_CAPACITY_BASE, ENERGY_CAPACITY_CRYSTAL_SCALE, SUCCESSION_THRESHOLDS } from './constants';
import { CivilizationState, EcologyState, InterpretedLearningInput } from './types';
import { mean, saturating, unit } from './math';

function stageFor(record: number): number {
  let stage = 1;
  SUCCESSION_THRESHOLDS.forEach((threshold, index) => {
    if (record >= threshold) stage = index + 1;
  });
  return Math.min(5, stage);
}

export function proposeEcology(
  prior: CivilizationState,
  input: InterpretedLearningInput,
  activeGrowth: boolean,
): EcologyState {
  const next: EcologyState = {
    ...prior.ecology,
    reservoirs: { ...prior.ecology.reservoirs },
  };
  const effectiveMinutes = Math.max(
    input.focusDuration,
    input.profile.revisionStrength * 2,
    input.completion ? 1 : 0,
  );
  if (effectiveMinutes <= 0) return next;

  const nutrientQuality = 0.3 + mean([
    input.profile.retention,
    input.profile.conceptualDepth,
    input.profile.sustainedAttention,
  ]) * 0.7;
  const nutrient = effectiveMinutes * nutrientQuality;
  next.reservoirs.brine += nutrient * input.pathways.brine;
  next.reservoirs.glucans += nutrient * input.pathways.glucans;
  next.reservoirs.catalysts += nutrient * input.pathways.catalysts;
  next.energyCapacity = ENERGY_CAPACITY_BASE + saturating(next.crystalRecord, 180) * ENERGY_CAPACITY_CRYSTAL_SCALE;
  next.energy = Math.min(next.energyCapacity, next.energy + effectiveMinutes * (0.45 + input.profile.retention * 0.55));

  // A short session while dormant may replenish reserves, but cannot create active progress.
  if (!activeGrowth) return next;

  next.illumination = unit(next.illumination + saturating(effectiveMinutes, 90) * (0.16 + input.profile.conceptualDepth * 0.24));
  next.circulation = unit(next.circulation + saturating(effectiveMinutes, 120) * (0.1 + input.profile.interdisciplinaryConnection * 0.22));
  const strain = input.difficulty * (1 - input.profile.mastery) * 0.16;
  const recovery = input.profile.retention * 0.09 + input.profile.revisionStrength * 0.08;
  next.stability = unit(next.stability + recovery - strain);

  const glucanGrowth = nutrient * input.pathways.glucans;
  const catalystGrowth = nutrient * input.pathways.catalysts;
  next.mycelialRecord += glucanGrowth;
  next.mycelialActivity += glucanGrowth * (0.45 + input.profile.retention * 0.55);
  next.crystalRecord += catalystGrowth;
  next.crystalActivity += catalystGrowth * (0.4 + input.profile.conceptualDepth * 0.6);
  next.photophoreDiversity = Math.max(
    next.photophoreDiversity,
    unit(mean([input.profile.disciplinaryExposure, input.profile.interdisciplinaryConnection, input.profile.curiosity])),
  );
  next.circulationReach = Math.max(
    next.circulationReach,
    unit(mean([input.profile.sustainedAttention, input.profile.retention, saturating(next.mycelialRecord, 160)])),
  );
  next.successionStage = Math.max(next.successionStage, stageFor(next.mycelialRecord + next.crystalRecord));
  next.energyCapacity = ENERGY_CAPACITY_BASE + saturating(next.crystalRecord, 180) * ENERGY_CAPACITY_CRYSTAL_SCALE;
  next.xEcology = Math.max(next.xEcology, unit(mean([
    saturating(next.mycelialRecord, 220),
    saturating(next.crystalRecord, 180),
    next.photophoreDiversity,
    next.circulationReach,
    (next.successionStage - 1) / 4,
  ])));
  return next;
}
