// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  NoctisAssetManifest,
  NoctisManifestError,
  SceneManifest,
  validateAssetManifest,
  validateSceneManifest,
} from '../../rendering/manifest';
import * as path from 'path';
import { validateAssetPackage } from '../../assets/validateAssets';

const assetManifest: NoctisAssetManifest = {
  schemaVersion: 1,
  assets: [{
    id: 'noctis.environment.era1.ancestral_basin.ridge.v01.base',
    path: 'runtime/environments/era1/ancestral_basin/ridge_v01_base.webp',
    class: 'environment',
    era: 'era1',
    sceneOrFamily: 'ancestral_basin',
    role: 'base',
    width: 1920,
    height: 1200,
    format: 'webp',
    alpha: false,
    pairedAssetIds: [],
    licenseRecordId: 'license.pending',
    provenanceRecordId: 'provenance.ridge.v01',
    contentHash: 'a'.repeat(64),
  }],
};

const sceneManifest: SceneManifest = {
  schemaVersion: 2,
  id: 'noctis.scene.era1.ancestral_basin',
  era: 'era1',
  canvas: { width: 1920, height: 1200 },
  cropSafe: { left: 0.15, top: 0.08, right: 0.85, bottom: 0.88 },
  focusBounds: { left: 0.25, top: 0.25, right: 0.75, bottom: 0.8 },
  layers: [{
    id: 'far-ridge',
    role: 'far',
    order: 10,
    assetId: assetManifest.assets[0].id,
    fallbackId: 'fallback.ridge',
    required: true,
    depthBand: 'far',
  }],
  routeAnchors: [{ id: 'hearth', point: { x: 0.5, y: 0.66 } }],
  depthBands: [{ id: 'far', min: 0.05, max: 0.35 }],
  seededVariants: [],
  world: {
    coordinateSpace: { width: 3600, height: 2400 },
    originRegionId: 'origin_basin',
    expansionMode: 'monotone_connected_regions',
    eraBounds: [
      { era: 'SPORE_HEARTH', bounds: { x: 1200, y: 920, width: 1200, height: 860 } },
      { era: 'CRYSTAL_INSCRIPTION', bounds: { x: 260, y: 740, width: 3080, height: 1040 } },
    ],
    lods: [
      { id: 'overview', minWorldUnitsPerViewport: 1200, maxWorldUnitsPerViewport: 4000 },
      { id: 'district', minWorldUnitsPerViewport: 520, maxWorldUnitsPerViewport: 1200 },
      { id: 'detail', minWorldUnitsPerViewport: 180, maxWorldUnitsPerViewport: 520 },
    ],
    regions: [{
      id: 'origin_basin',
      label: 'Ancestral Basin',
      introducedEra: 'SPORE_HEARTH',
      stratum: 'surface',
      bounds: { x: 1200, y: 920, width: 1200, height: 860 },
      connectionIds: [],
      overviewLodId: 'overview',
      districtLodId: 'district',
      detailLodId: 'detail',
    }],
    focusTargets: [{
      id: 'ancestral_hearth',
      label: 'Ancestral spore-hearth',
      regionId: 'origin_basin',
      stratum: 'surface',
      point: { x: 1800, y: 1420 },
      detailBounds: { x: 1490, y: 1225, width: 620, height: 390 },
      introducedEra: 'SPORE_HEARTH',
    }],
  },
};

describe('Noctis manifest validation', () => {
  it('accepts a complete asset and scene contract', () => {
    expect(validateAssetManifest(assetManifest)).toBe(assetManifest);
    expect(validateSceneManifest(sceneManifest, assetManifest)).toBe(sceneManifest);
  });

  it('rejects a source path and unordered scene layers', () => {
    const badAssets = JSON.parse(JSON.stringify(assetManifest)) as NoctisAssetManifest;
    badAssets.assets[0].path = 'source/ridge.webp';
    expect(() => validateAssetManifest(badAssets)).toThrow(NoctisManifestError);
    const badScene = JSON.parse(JSON.stringify(sceneManifest)) as SceneManifest;
    badScene.layers.push({ ...badScene.layers[0], id: 'terrain', fallbackId: 'fallback.terrain', order: 5 });
    expect(() => validateSceneManifest(badScene)).toThrow('strictly increasing');
  });

  it('rejects world bounds that shrink in a later era', () => {
    const badScene = JSON.parse(JSON.stringify(sceneManifest)) as SceneManifest;
    badScene.world.eraBounds[1].bounds = { x: 1300, y: 1000, width: 900, height: 700 };
    expect(() => validateSceneManifest(badScene)).toThrow('expand monotonically');
  });

  it('validates the in-progress production package without pretending the inventory is complete', () => {
    const summary = validateAssetPackage(path.resolve(__dirname, '../../assets'));
    expect(summary.runtimeAssetCount).toBeGreaterThanOrEqual(3);
    expect(summary.plannedAssetCount).toBeGreaterThan(40);
    expect(summary.runtimeAssetCount).toBeLessThan(summary.plannedAssetCount);
    expect(summary.sceneLayerCount).toBeGreaterThan(10);
    expect(summary.complete).toBe(false);
  });
});
