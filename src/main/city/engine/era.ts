import { ERA_GATES, ERA_WEIGHTS } from './constants';
import { CivilizationState, ERA_ORDER, EraContributions, EraState } from './types';
import { geometricMean } from './math';

function contributions(state: CivilizationState): EraContributions {
  return {
    technology: state.technology.xTechnology,
    ecology: state.ecology.xEcology,
    citizen: state.citizen.xCitizen,
    culture: state.culture.xCulture,
    memory: state.memory.xMemory,
    economy: state.economy.xEconomy,
  };
}

function readiness(values: EraContributions): number {
  return geometricMean(
    [values.technology, values.ecology, values.citizen, values.culture, values.memory, values.economy],
    [ERA_WEIGHTS.technology, ERA_WEIGHTS.ecology, ERA_WEIGHTS.citizen, ERA_WEIGHTS.culture, ERA_WEIGHTS.memory, ERA_WEIGHTS.economy],
  );
}

export function resolveEra(state: CivilizationState): EraState {
  const values = contributions(state);
  const combinedReadiness = readiness(values);
  const currentIndex = ERA_ORDER.indexOf(state.era.designation);
  const nextDesignation = ERA_ORDER[currentIndex + 1];
  if (!nextDesignation) return { ...state.era, contributions: values, combinedReadiness };

  const gate = ERA_GATES[nextDesignation];
  const qualifies = gate !== undefined
    && combinedReadiness >= gate.threshold
    && values.technology >= gate.floors.technology
    && values.ecology >= gate.floors.ecology
    && values.citizen >= gate.floors.citizen
    && values.culture >= gate.floors.culture
    && values.memory >= gate.floors.memory
    && values.economy >= gate.floors.economy;
  if (!qualifies) return { ...state.era, contributions: values, combinedReadiness };

  return {
    designation: nextDesignation,
    history: state.era.history.concat(nextDesignation),
    contributions: values,
    combinedReadiness,
  };
}
