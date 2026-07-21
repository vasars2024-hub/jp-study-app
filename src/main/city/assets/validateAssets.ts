import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import {
  NoctisAssetManifest,
  NoctisManifestError,
  SceneManifest,
  validateAssetManifest,
  validateSceneManifest,
} from '../rendering/manifest';

interface InventoryFamily {
  briefId: string;
  ids: string[];
}

interface AssetInventory {
  schemaVersion: number;
  families: InventoryFamily[];
}

interface ProvenanceLedger {
  schemaVersion: number;
  licenseRecords: Array<{ id: string }>;
  entries: Array<{ id: string; assetIds: string[]; licenseRecordId: string; approval: string }>;
}

export interface AssetValidationSummary {
  runtimeAssetCount: number;
  plannedAssetCount: number;
  sceneLayerCount: number;
  initialPayloadBytes: number;
  complete: boolean;
}

function readJson<T>(file: string): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch (error) {
    throw new NoctisManifestError(`${path.basename(file)} could not be read: ${String(error)}`);
  }
}

function imageDimensions(file: string, format: string): { width: number; height: number } {
  const data = fs.readFileSync(file);
  if (format === 'png') {
    if (data.length < 24 || data.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new NoctisManifestError(`${file} is not a PNG`);
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (format === 'webp') {
    if (data.length < 30 || data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WEBP') {
      throw new NoctisManifestError(`${file} is not a WebP`);
    }
    const chunk = data.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      const width = 1 + data[24] + data[25] * 256 + data[26] * 65536;
      const height = 1 + data[27] + data[28] * 256 + data[29] * 65536;
      return { width, height };
    }
    if (chunk === 'VP8L') {
      if (data[20] !== 0x2f) throw new NoctisManifestError(`${file} has an invalid VP8L header`);
      const width = 1 + data[21] + ((data[22] & 0x3f) << 8);
      const height = 1 + ((data[22] & 0xc0) >> 6) + (data[23] << 2) + ((data[24] & 0x0f) << 10);
      return { width, height };
    }
    if (chunk === 'VP8 ') {
      if (data.toString('hex', 23, 26) !== '9d012a') throw new NoctisManifestError(`${file} has an invalid VP8 header`);
      return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
    }
    throw new NoctisManifestError(`${file} uses an unsupported WebP encoding`);
  }
  const source = data.toString('utf-8', 0, Math.min(data.length, 4096));
  const svg = source.match(/<svg\b[^>]*\bwidth=["'](\d+)["'][^>]*\bheight=["'](\d+)["']/i);
  if (!svg) throw new NoctisManifestError(`${file} has no explicit SVG dimensions`);
  return { width: Number(svg[1]), height: Number(svg[2]) };
}

function validateInventory(inventory: AssetInventory): string[] {
  if (inventory.schemaVersion !== 1 || !Array.isArray(inventory.families)) throw new NoctisManifestError('asset inventory schema is invalid');
  const ids: string[] = [];
  inventory.families.forEach((family) => {
    if (!family.briefId || !Array.isArray(family.ids) || family.ids.length === 0) throw new NoctisManifestError('asset inventory family is incomplete');
    family.ids.forEach((id) => {
      if (!/^noctis\.[a-z0-9_.]+$/.test(id) || ids.indexOf(id) >= 0) throw new NoctisManifestError(`asset inventory id is invalid or duplicated: ${id}`);
      ids.push(id);
    });
  });
  return ids;
}

/** Mechanical ingestion gate. Canon and visual approval remain human review steps. */
export function validateAssetPackage(assetRoot: string, requireComplete = false): AssetValidationSummary {
  const manifestRoot = path.join(assetRoot, 'manifests');
  const assets = validateAssetManifest(readJson<NoctisAssetManifest>(path.join(manifestRoot, 'asset-manifest.json')));
  const scene = readJson<SceneManifest>(path.join(manifestRoot, 'scene-manifest.json'));
  validateSceneManifest(scene, requireComplete ? assets : undefined);
  const inventoryIds = validateInventory(readJson<AssetInventory>(path.join(manifestRoot, 'asset-inventory.json')));
  const provenance = readJson<ProvenanceLedger>(path.join(manifestRoot, 'provenance.json'));
  if (provenance.schemaVersion !== 1 || !Array.isArray(provenance.entries) || !Array.isArray(provenance.licenseRecords)) {
    throw new NoctisManifestError('provenance ledger schema is invalid');
  }

  const licenseIds = new Set(provenance.licenseRecords.map((record) => record.id));
  const provenanceByAsset = new Map<string, { licenseRecordId: string; approval: string }>();
  provenance.entries.forEach((entry) => {
    entry.assetIds.forEach((id) => provenanceByAsset.set(id, entry));
  });
  const runtimeRoot = path.resolve(assetRoot, 'runtime');
  let totalBytes = 0;
  const sceneAssetIds = new Set(scene.layers.map((layer) => layer.assetId).filter((id): id is string => Boolean(id)));

  assets.assets.forEach((asset) => {
    const file = path.resolve(assetRoot, asset.path);
    if (file.indexOf(`${runtimeRoot}${path.sep}`) !== 0) throw new NoctisManifestError(`${asset.id} resolves outside runtime`);
    if (!fs.existsSync(file)) throw new NoctisManifestError(`${asset.id} file is missing`);
    const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (digest !== asset.contentHash) throw new NoctisManifestError(`${asset.id} hash mismatch`);
    const dimensions = imageDimensions(file, asset.format);
    if (dimensions.width !== asset.width || dimensions.height !== asset.height) throw new NoctisManifestError(`${asset.id} dimension mismatch`);
    const entry = provenanceByAsset.get(asset.id);
    if (!entry || entry.approval !== 'runtime_approved') throw new NoctisManifestError(`${asset.id} has no runtime-approved provenance`);
    if (entry.licenseRecordId !== asset.licenseRecordId || !licenseIds.has(asset.licenseRecordId)) throw new NoctisManifestError(`${asset.id} has no reviewed license record`);
    if (sceneAssetIds.has(asset.id)) totalBytes += fs.statSync(file).size;
  });

  if (totalBytes > 18 * 1024 * 1024) throw new NoctisManifestError('initial scene payload exceeds the 18 MB hard cap');
  const runtimeInventoryIds = inventoryIds.filter((id) => !id.startsWith('noctis.reference.'));
  const present = new Set(assets.assets.map((asset) => asset.id));
  const complete = runtimeInventoryIds.every((id) => present.has(id));
  if (requireComplete && !complete) throw new NoctisManifestError('runtime asset inventory is incomplete');

  return {
    runtimeAssetCount: assets.assets.length,
    plannedAssetCount: inventoryIds.length,
    sceneLayerCount: scene.layers.length,
    initialPayloadBytes: totalBytes,
    complete,
  };
}
