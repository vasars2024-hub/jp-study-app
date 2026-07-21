import type { CityPresentationModel, EraDesignation } from '../../engine/types';
import { ERA_ORDER } from '../../engine/types';

export type NoctisViewMode = 'glance' | 'district' | 'detail' | 'strata' | 'stellar' | 'explorer' | 'civilization';
export type WorldStratum = 'stellar' | 'surface' | 'root' | 'deep';

export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WorldRegion {
  id: string;
  label: string;
  introducedEra: EraDesignation;
  stratum: WorldStratum;
  bounds: WorldRect;
  connectionIds: string[];
}

export interface WorldFocus {
  id: string;
  regionId: string;
  label: string;
  eyebrow: string;
  description: string;
  x: number;
  y: number;
  cameraWidth: number;
  cameraHeight: number;
  introducedEra: EraDesignation;
  stratum: WorldStratum;
}

export interface NoctisWorldModel {
  coordinateWidth: number;
  coordinateHeight: number;
  revealedBounds: WorldRect;
  originRegionId: string;
  regions: WorldRegion[];
  focuses: WorldFocus[];
}

const REGIONS: WorldRegion[] = [
  {
    id: 'origin_basin',
    label: 'Ancestral Basin',
    introducedEra: 'SPORE_HEARTH',
    stratum: 'surface',
    bounds: { x: 1200, y: 920, width: 1200, height: 860 },
    connectionIds: ['west_terraces', 'east_channels', 'deep_works', 'stellar_chasm'],
  },
  {
    id: 'west_terraces',
    label: 'Inscription Terraces',
    introducedEra: 'CRYSTAL_INSCRIPTION',
    stratum: 'surface',
    bounds: { x: 260, y: 760, width: 1120, height: 980 },
    connectionIds: ['origin_basin', 'deep_works', 'network_reaches'],
  },
  {
    id: 'east_channels',
    label: 'Aqueduct Reaches',
    introducedEra: 'CRYSTAL_INSCRIPTION',
    stratum: 'surface',
    bounds: { x: 2220, y: 740, width: 1120, height: 1020 },
    connectionIds: ['origin_basin', 'deep_works', 'network_reaches'],
  },
  {
    id: 'deep_works',
    label: 'Phononic Deep Works',
    introducedEra: 'PHONONIC_SUBTERRANEAN',
    stratum: 'deep',
    bounds: { x: 720, y: 1580, width: 2180, height: 760 },
    connectionIds: ['origin_basin', 'west_terraces', 'east_channels', 'network_reaches'],
  },
  {
    id: 'network_reaches',
    label: 'Living Network Reaches',
    introducedEra: 'OPTOGENETIC_CIRCUIT',
    stratum: 'root',
    bounds: { x: 80, y: 360, width: 3280, height: 1920 },
    connectionIds: ['west_terraces', 'east_channels', 'deep_works', 'stellar_chasm'],
  },
  {
    id: 'stellar_chasm',
    label: 'Stellar Chasm',
    introducedEra: 'COSMIC_STELLAR',
    stratum: 'stellar',
    bounds: { x: 1040, y: 40, width: 1520, height: 1080 },
    connectionIds: ['origin_basin', 'network_reaches'],
  },
];

const FOCUS_DEFINITIONS: Array<Omit<WorldFocus, 'description'>> = [
  { id: 'ancestral_hearth', regionId: 'origin_basin', label: 'Ancestral spore-hearth', eyebrow: 'First civic light', x: 1800, y: 1420, cameraWidth: 620, cameraHeight: 390, introducedEra: 'SPORE_HEARTH', stratum: 'surface' },
  { id: 'ordinary_shelters', regionId: 'origin_basin', label: 'Ordinary shelter cluster', eyebrow: 'First dwellings', x: 2100, y: 1430, cameraWidth: 560, cameraHeight: 370, introducedEra: 'SPORE_HEARTH', stratum: 'surface' },
  { id: 'noctae_gathering', regionId: 'origin_basin', label: 'Noctae gathering', eyebrow: 'Civic life', x: 1880, y: 1510, cameraWidth: 650, cameraHeight: 410, introducedEra: 'SPORE_HEARTH', stratum: 'surface' },
  { id: 'first_current', regionId: 'origin_basin', label: 'First current', eyebrow: 'Liquid-light ecology', x: 1640, y: 1600, cameraWidth: 760, cameraHeight: 470, introducedEra: 'SPORE_HEARTH', stratum: 'surface' },
  { id: 'fungal_canopy', regionId: 'origin_basin', label: 'Fungal canopy cluster', eyebrow: 'Living ecology', x: 2190, y: 1360, cameraWidth: 650, cameraHeight: 410, introducedEra: 'SPORE_HEARTH', stratum: 'surface' },
  { id: 'basin_ridges', regionId: 'origin_basin', label: 'Close basin ridges', eyebrow: 'Ancestral boundary', x: 1510, y: 1110, cameraWidth: 760, cameraHeight: 470, introducedEra: 'SPORE_HEARTH', stratum: 'surface' },
  { id: 'living_root_paths', regionId: 'origin_basin', label: 'Living root paths', eyebrow: 'First shared routes', x: 1800, y: 1530, cameraWidth: 700, cameraHeight: 440, introducedEra: 'SPORE_HEARTH', stratum: 'surface' },
  { id: 'root_mouth', regionId: 'origin_basin', label: 'Unmapped root mouth', eyebrow: 'Future descent', x: 2040, y: 1640, cameraWidth: 620, cameraHeight: 390, introducedEra: 'SPORE_HEARTH', stratum: 'root' },
  { id: 'west_archive', regionId: 'west_terraces', label: 'Terrace archive', eyebrow: 'Tactile continuity', x: 760, y: 1230, cameraWidth: 720, cameraHeight: 450, introducedEra: 'CRYSTAL_INSCRIPTION', stratum: 'surface' },
  { id: 'east_aqueduct', regionId: 'east_channels', label: 'Aqueduct exchange', eyebrow: 'Shared cold light', x: 2820, y: 1280, cameraWidth: 780, cameraHeight: 490, introducedEra: 'CRYSTAL_INSCRIPTION', stratum: 'surface' },
  { id: 'pressure_exchange', regionId: 'deep_works', label: 'Pressure exchange', eyebrow: 'Deep civic work', x: 1800, y: 2070, cameraWidth: 860, cameraHeight: 540, introducedEra: 'PHONONIC_SUBTERRANEAN', stratum: 'deep' },
  { id: 'living_matrix', regionId: 'network_reaches', label: 'Living matrix', eyebrow: 'Connected thought', x: 3060, y: 650, cameraWidth: 820, cameraHeight: 520, introducedEra: 'OPTOGENETIC_CIRCUIT', stratum: 'root' },
  { id: 'rift_observatory', regionId: 'stellar_chasm', label: 'Rift observatory', eyebrow: 'The night above', x: 1800, y: 520, cameraWidth: 820, cameraHeight: 520, introducedEra: 'COSMIC_STELLAR', stratum: 'stellar' },
  { id: 'orbital_garden', regionId: 'stellar_chasm', label: 'Anchored orbital garden', eyebrow: 'Highest civic layer', x: 2200, y: 250, cameraWidth: 680, cameraHeight: 430, introducedEra: 'COSMIC_STELLAR', stratum: 'stellar' },
];

export function eraRank(era: EraDesignation): number {
  return ERA_ORDER.indexOf(era);
}

function revealed<T extends { introducedEra: EraDesignation }>(items: T[], era: EraDesignation): T[] {
  const rank = eraRank(era);
  return items.filter((item) => eraRank(item.introducedEra) <= rank);
}

export function unionWorldBounds(regions: WorldRegion[]): WorldRect {
  if (regions.length === 0) return { x: 1200, y: 920, width: 1200, height: 860 };
  const left = Math.min.apply(null, regions.map((region) => region.bounds.x));
  const top = Math.min.apply(null, regions.map((region) => region.bounds.y));
  const right = Math.max.apply(null, regions.map((region) => region.bounds.x + region.bounds.width));
  const bottom = Math.max.apply(null, regions.map((region) => region.bounds.y + region.bounds.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function qualitative(value: number): string {
  if (value < 0.12) return 'nearly still';
  if (value < 0.36) return 'quietly gathering';
  if (value < 0.68) return 'moving with a steady rhythm';
  return 'strong and intricately connected';
}

function focusDescription(id: string, model: CityPresentationModel | null): string {
  if (id === 'ancestral_hearth') return model && model.status === 'hibernating'
    ? 'The cold-light organs rest without losing their place in history.'
    : 'The first communal light remains low, close, and shared.';
  if (id === 'ordinary_shelters') return 'These are ordinary Noctae dwellings, grown as enclosed stalk-forms. The nearby fungal canopy is living ecology, not a specialist building.';
  if (id === 'noctae_gathering') return `A small civic gathering is ${qualitative(model ? model.activity01 : 0)} around the shared routes.`;
  if (id === 'first_current') return `The basin current is ${qualitative(model ? model.circulation01 : 0)}.`;
  if (id === 'fungal_canopy') return `The living canopy cluster is ${qualitative(model ? model.ecology.mycelialMaturity01 : 0)}. It shelters the settlement while the stalk-hollow dwellings beneath it serve civic life.`;
  if (id === 'basin_ridges') return 'The close ridges make the first settlement feel sheltered and deliberately cramped. Later growth continues through connected openings instead of stretching this chamber.';
  if (id === 'living_root_paths') return 'Woven roots hold dark walkable ground between the first dwellings. These routes grow gradually with the settlement and branch toward future connected regions.';
  if (id === 'root_mouth') return 'A surveyed opening leads below the first clearing. Darkness here means unrevealed depth, not an edge of the world.';
  if (id === 'west_archive') return `The tactile record has accumulated ${model ? model.memoryCount : 0} enduring entries.`;
  if (id === 'east_aqueduct') return `Shared circulation is ${qualitative(model ? model.circulation01 : 0)} across the eastern terraces.`;
  if (id === 'pressure_exchange') return 'Cold pressure, vibration, and fluid weight carry civic work through the deep tiers.';
  if (id === 'living_matrix') return `The civic network is ${qualitative(model ? model.civic.institutionalMaturity01 : 0)} without erasing its older routes.`;
  if (id === 'rift_observatory') return 'The civilization looks upward through the rift while every ancestral layer remains below.';
  return 'An orbital garden remains tethered to ridge lattice and the metabolic history beneath it.';
}

export function buildNoctisWorld(model: CityPresentationModel | null): NoctisWorldModel {
  const era = model ? model.era : 'SPORE_HEARTH';
  const regions = revealed(REGIONS, era);
  const focuses = revealed(FOCUS_DEFINITIONS, era).map((focus) => ({
    ...focus,
    description: focusDescription(focus.id, model),
  }));
  return {
    coordinateWidth: 3600,
    coordinateHeight: 2400,
    revealedBounds: unionWorldBounds(regions),
    originRegionId: 'origin_basin',
    regions,
    focuses,
  };
}

export function fitWorldRect(rect: WorldRect, aspect: number, paddingRatio: number): WorldRect {
  const padding = Math.max(0, paddingRatio);
  let width = rect.width * (1 + padding * 2);
  let height = rect.height * (1 + padding * 2);
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1.6;
  if (width / height > safeAspect) height = width / safeAspect;
  else width = height * safeAspect;
  return {
    x: rect.x + rect.width / 2 - width / 2,
    y: rect.y + rect.height / 2 - height / 2,
    width,
    height,
  };
}

export function focusWorldRect(focus: WorldFocus, aspect: number): WorldRect {
  return fitWorldRect({
    x: focus.x - focus.cameraWidth / 2,
    y: focus.y - focus.cameraHeight / 2,
    width: focus.cameraWidth,
    height: focus.cameraHeight,
  }, aspect, 0.08);
}

export function containsWorldRect(outer: WorldRect, inner: WorldRect): boolean {
  return inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height;
}
