export type AssetClass = 'environment' | 'character' | 'motion' | 'particle' | 'ui';
export type AssetRole = 'base' | 'emissive' | 'tint' | 'occlusion' | 'reflection' | 'refraction' | 'motion' | 'atmosphere';
export type AssetFormat = 'png' | 'webp' | 'svg';

export interface NormalizedPoint { x: number; y: number }
export interface NormalizedBounds { left: number; top: number; right: number; bottom: number }
export interface WorldPoint { x: number; y: number }
export interface WorldBounds { x: number; y: number; width: number; height: number }

export interface NoctisAssetRecord {
  id: string;
  path: string;
  class: AssetClass;
  era: string;
  sceneOrFamily: string;
  role: AssetRole;
  width: number;
  height: number;
  format: AssetFormat;
  alpha: boolean;
  anchor?: NormalizedPoint;
  cropSafe?: NormalizedBounds;
  pairedAssetIds: string[];
  fallbackAssetId?: string;
  licenseRecordId: string;
  provenanceRecordId: string;
  contentHash: string;
}

export interface NoctisAssetManifest {
  schemaVersion: number;
  assets: NoctisAssetRecord[];
}

export interface SceneLayerRecord {
  id: string;
  role: string;
  order: number;
  assetId?: string;
  fallbackId: string;
  required: boolean;
  depthBand: string;
}

export interface WorldRegionRecord {
  id: string;
  label: string;
  introducedEra: string;
  stratum: 'stellar' | 'surface' | 'root' | 'deep';
  bounds: WorldBounds;
  connectionIds: string[];
  overviewLodId: string;
  districtLodId: string;
  detailLodId?: string;
}

export interface WorldFocusRecord {
  id: string;
  label: string;
  regionId: string;
  stratum: 'stellar' | 'surface' | 'root' | 'deep';
  point: WorldPoint;
  detailBounds: WorldBounds;
  introducedEra: string;
}

export interface SemanticLodRecord {
  id: string;
  minWorldUnitsPerViewport: number;
  maxWorldUnitsPerViewport: number;
}

export interface SceneWorldRecord {
  coordinateSpace: { width: number; height: number };
  originRegionId: string;
  expansionMode: 'monotone_connected_regions';
  eraBounds: Array<{ era: string; bounds: WorldBounds }>;
  regions: WorldRegionRecord[];
  focusTargets: WorldFocusRecord[];
  lods: SemanticLodRecord[];
}

export interface SceneManifest {
  schemaVersion: number;
  id: string;
  era: string;
  canvas: { width: number; height: number };
  cropSafe: NormalizedBounds;
  focusBounds: NormalizedBounds;
  layers: SceneLayerRecord[];
  routeAnchors: Array<{ id: string; point: NormalizedPoint }>;
  depthBands: Array<{ id: string; min: number; max: number }>;
  seededVariants: Array<{ family: string; assetIds: string[] }>;
  world: SceneWorldRecord;
}

export class NoctisManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoctisManifestError';
  }
}

function fail(message: string): never { throw new NoctisManifestError(message); }
function normalized(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) fail(`${path} must be within [0,1]`);
}
function bounds(value: NormalizedBounds, path: string): void {
  normalized(value.left, `${path}.left`);
  normalized(value.top, `${path}.top`);
  normalized(value.right, `${path}.right`);
  normalized(value.bottom, `${path}.bottom`);
  if (value.left >= value.right || value.top >= value.bottom) fail(`${path} must have positive area`);
}

function worldBounds(value: WorldBounds, path: string, coordinateSpace?: { width: number; height: number }): void {
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)
    || !Number.isFinite(value.width) || !Number.isFinite(value.height)
    || value.width <= 0 || value.height <= 0) fail(`${path} must have finite positive geometry`);
  if (coordinateSpace && (value.x < 0 || value.y < 0
    || value.x + value.width > coordinateSpace.width
    || value.y + value.height > coordinateSpace.height)) fail(`${path} must remain inside world coordinates`);
}

function containsWorldBounds(outer: WorldBounds, inner: WorldBounds): boolean {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height;
}

export function validateAssetManifest(manifest: NoctisAssetManifest): NoctisAssetManifest {
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.assets)) fail('asset manifest schema is invalid');
  const ids = new Set<string>();
  const paths = new Set<string>();
  manifest.assets.forEach((asset, index) => {
    const path = `assets[${index}]`;
    if (!/^noctis\.[a-z0-9_.]+$/.test(asset.id)) fail(`${path}.id is not canonical`);
    if (ids.has(asset.id)) fail(`${path}.id is duplicated`);
    if (paths.has(asset.path)) fail(`${path}.path is duplicated`);
    if (!asset.path.startsWith('runtime/') || asset.path.includes('..') || /[A-Z\\ ]/.test(asset.path)) fail(`${path}.path must be a lowercase runtime path`);
    if (!Number.isInteger(asset.width) || asset.width <= 0 || !Number.isInteger(asset.height) || asset.height <= 0) fail(`${path} dimensions are invalid`);
    if (!asset.path.endsWith(`.${asset.format}`)) fail(`${path}.format does not match its path`);
    if (!asset.licenseRecordId || !asset.provenanceRecordId) fail(`${path} provenance is incomplete`);
    if (!/^[a-f0-9]{64}$/.test(asset.contentHash)) fail(`${path}.contentHash must be sha256`);
    if (!Array.isArray(asset.pairedAssetIds)) fail(`${path}.pairedAssetIds must be an array`);
    if (asset.anchor) { normalized(asset.anchor.x, `${path}.anchor.x`); normalized(asset.anchor.y, `${path}.anchor.y`); }
    if (asset.cropSafe) bounds(asset.cropSafe, `${path}.cropSafe`);
    ids.add(asset.id);
    paths.add(asset.path);
  });
  manifest.assets.forEach((asset) => {
    asset.pairedAssetIds.forEach((id) => {
      const paired = manifest.assets.find((candidate) => candidate.id === id);
      if (!paired) fail(`${asset.id} names a missing paired asset`);
      if (paired.width !== asset.width || paired.height !== asset.height) fail(`${asset.id} paired bounds do not match`);
    });
    if (asset.fallbackAssetId && !ids.has(asset.fallbackAssetId)) fail(`${asset.id} names a missing fallback`);
  });
  return manifest;
}

export function validateSceneManifest(scene: SceneManifest, assets?: NoctisAssetManifest): SceneManifest {
  if (scene.schemaVersion !== 2 || !scene.id || !scene.era || !scene.world) fail('scene manifest schema is invalid');
  if (!Number.isInteger(scene.canvas.width) || scene.canvas.width <= 0
    || !Number.isInteger(scene.canvas.height) || scene.canvas.height <= 0) fail('scene canvas is invalid');
  bounds(scene.cropSafe, 'scene.cropSafe');
  bounds(scene.focusBounds, 'scene.focusBounds');
  const layerIds = new Set<string>();
  const fallbackIds = new Set<string>();
  let priorOrder = -Infinity;
  scene.layers.forEach((layer, index) => {
    if (!layer.id || layerIds.has(layer.id)) fail(`layers[${index}].id is missing or duplicated`);
    if (!layer.fallbackId || fallbackIds.has(layer.fallbackId)) fail(`layers[${index}].fallbackId is missing or duplicated`);
    if (!Number.isFinite(layer.order) || layer.order <= priorOrder) fail('scene layer order must be strictly increasing');
    if (assets && layer.assetId && !assets.assets.some((asset) => asset.id === layer.assetId)) fail(`${layer.id} names a missing asset`);
    layerIds.add(layer.id);
    fallbackIds.add(layer.fallbackId);
    priorOrder = layer.order;
  });
  const anchorIds = new Set<string>();
  scene.routeAnchors.forEach((anchor) => {
    if (!anchor.id || anchorIds.has(anchor.id)) fail('route anchor id is missing or duplicated');
    normalized(anchor.point.x, `${anchor.id}.x`);
    normalized(anchor.point.y, `${anchor.id}.y`);
    anchorIds.add(anchor.id);
  });
  scene.depthBands.forEach((band) => {
    normalized(band.min, `${band.id}.min`);
    normalized(band.max, `${band.id}.max`);
    if (!band.id || band.min >= band.max) fail('depth band is invalid');
  });
  const coordinateSpace = scene.world.coordinateSpace;
  if (!Number.isFinite(coordinateSpace.width) || coordinateSpace.width <= 0
    || !Number.isFinite(coordinateSpace.height) || coordinateSpace.height <= 0) fail('world coordinate space is invalid');
  if (scene.world.expansionMode !== 'monotone_connected_regions') fail('world expansion mode is invalid');
  const lodIds = new Set<string>();
  scene.world.lods.forEach((lod) => {
    if (!lod.id || lodIds.has(lod.id) || !Number.isFinite(lod.minWorldUnitsPerViewport)
      || !Number.isFinite(lod.maxWorldUnitsPerViewport)
      || lod.minWorldUnitsPerViewport < 0
      || lod.minWorldUnitsPerViewport >= lod.maxWorldUnitsPerViewport) fail('semantic LOD is invalid');
    lodIds.add(lod.id);
  });
  const regionIds = new Set<string>();
  scene.world.regions.forEach((region, index) => {
    if (!region.id || regionIds.has(region.id) || !region.label || !region.introducedEra) fail(`world.regions[${index}] is invalid`);
    worldBounds(region.bounds, `world.regions[${index}].bounds`, coordinateSpace);
    if (!Array.isArray(region.connectionIds)) fail(`${region.id}.connectionIds must be an array`);
    [region.overviewLodId, region.districtLodId, region.detailLodId].filter(Boolean).forEach((lodId) => {
      if (!lodIds.has(lodId as string)) fail(`${region.id} names a missing semantic LOD`);
    });
    regionIds.add(region.id);
  });
  if (!regionIds.has(scene.world.originRegionId)) fail('world origin region is missing');
  scene.world.regions.forEach((region) => {
    region.connectionIds.forEach((connectionId) => {
      const connected = scene.world.regions.find((candidate) => candidate.id === connectionId);
      if (!connected) fail(`${region.id} names a missing connection`);
      if (!connected.connectionIds.includes(region.id)) fail(`${region.id} connection to ${connectionId} is not reciprocal`);
    });
  });
  const focusIds = new Set<string>();
  scene.world.focusTargets.forEach((focus, index) => {
    const region = scene.world.regions.find((candidate) => candidate.id === focus.regionId);
    if (!focus.id || focusIds.has(focus.id) || !focus.label || !focus.introducedEra || !region) fail(`world.focusTargets[${index}] is invalid`);
    if (!Number.isFinite(focus.point.x) || !Number.isFinite(focus.point.y)
      || focus.point.x < region.bounds.x || focus.point.x > region.bounds.x + region.bounds.width
      || focus.point.y < region.bounds.y || focus.point.y > region.bounds.y + region.bounds.height) fail(`${focus.id} point is outside its region`);
    worldBounds(focus.detailBounds, `${focus.id}.detailBounds`, coordinateSpace);
    focusIds.add(focus.id);
  });
  let priorEraBounds: WorldBounds | null = null;
  const eraIds = new Set<string>();
  scene.world.eraBounds.forEach((entry, index) => {
    if (!entry.era || eraIds.has(entry.era)) fail(`world.eraBounds[${index}] era is missing or duplicated`);
    worldBounds(entry.bounds, `world.eraBounds[${index}].bounds`, coordinateSpace);
    if (priorEraBounds && !containsWorldBounds(entry.bounds, priorEraBounds)) fail('world era bounds must expand monotonically');
    priorEraBounds = entry.bounds;
    eraIds.add(entry.era);
  });
  return scene;
}
