import { CityPresentationModel, CivilizationState, EngineEventFlag } from './types';
import { mean, saturating, unit } from './math';

export function projectCityPresentation(
  state: CivilizationState,
  flags: EngineEventFlag[] = [],
): CityPresentationModel {
  const totalReservoir = state.ecology.reservoirs.brine
    + state.ecology.reservoirs.glucans
    + state.ecology.reservoirs.catalysts;
  const denominator = Math.max(totalReservoir, 1);
  return {
    sceneId: `noctis-${state.era.designation.toLowerCase()}`,
    seed: state.seed,
    revision: state.revision,
    era: state.era.designation,
    status: state.status,
    illumination01: state.ecology.illumination,
    circulation01: state.ecology.circulation,
    stability01: state.ecology.stability,
    activity01: unit(mean([
      state.citizen.activity,
      state.technology.activePractice,
      state.culture.activeExpression,
      state.economy.activeCoordination,
    ])),
    pathwayBlend: {
      brine01: unit(state.ecology.reservoirs.brine / denominator),
      glucan01: unit(state.ecology.reservoirs.glucans / denominator),
      catalyst01: unit(state.ecology.reservoirs.catalysts / denominator),
    },
    ecology: {
      succession: state.ecology.successionStage,
      crystalMaturity01: saturating(state.ecology.crystalRecord, 180),
      mycelialMaturity01: saturating(state.ecology.mycelialRecord, 220),
    },
    civic: {
      density01: saturating(Math.max(0, state.citizen.population - 3), 120),
      institutionalMaturity01: unit(mean([
        state.citizen.institutionalParticipation,
        state.culture.institutionalContinuity,
        state.economy.institutionalCoordination,
      ])),
    },
    atmosphere: {
      intensity01: unit(mean([state.ecology.illumination, state.ecology.circulation, state.ecology.stability])),
      eventAccent: flags.length > 0 ? flags[0] : null,
    },
    memoryCount: state.memory.records.length,
  };
}
