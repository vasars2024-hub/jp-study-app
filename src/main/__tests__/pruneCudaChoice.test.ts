// @vitest-environment node
/**
 * tools/prune-packaged-app.cjs used to drop node-llama-cpp's CUDA backends (~540 MB) from
 * EVERY build, because "this machine has an AMD GPU" — so every release shipped without
 * them and an NVIDIA user ran local models on Vulkan or the CPU. Keeping or dropping them is
 * now a per-build choice (`--keep-cuda` / `--drop-cuda`, `GUM_CUDA=keep|drop`) that
 * defaults to KEEP. These tests run the real planner over a tiny fake packaged app.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require_ = createRequire(__filename);
type CudaChoice = { cuda: 'keep' | 'drop'; source: string };
const prune = require_('../../../tools/prune-packaged-app.cjs') as {
  planPrune: (appDir: string, env?: Record<string, string>, cli?: 'keep' | 'drop' | null) => {
    removedPackages: Array<{ name: string; rule: string }>;
    cuda: CudaChoice;
  };
  resolveCudaChoice: (env?: Record<string, string>, cli?: 'keep' | 'drop' | null) => CudaChoice;
  cudaFlag: (args: string[]) => 'keep' | 'drop' | null;
  CUDA_PACKAGES: string[];
};

let app: string;

function pkg(dir: string, json: Record<string, unknown>): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(json));
}

beforeEach(() => {
  app = fs.mkdtempSync(path.join(os.tmpdir(), 'gum-prune-cuda-'));
  fs.mkdirSync(path.join(app, '.vite', 'build'), { recursive: true });
  fs.writeFileSync(path.join(app, '.vite', 'build', 'main.js'), 'const l = require("node-llama-cpp");');
  const nm = path.join(app, 'node_modules');
  pkg(path.join(nm, 'node-llama-cpp'), {
    name: 'node-llama-cpp',
    optionalDependencies: {
      '@node-llama-cpp/win-x64-cuda': '1',
      '@node-llama-cpp/win-x64-cuda-ext': '1',
      '@node-llama-cpp/win-x64-vulkan': '1',
      '@node-llama-cpp/win-x64': '1',
    },
  });
  for (const name of ['win-x64-cuda', 'win-x64-cuda-ext', 'win-x64-vulkan', 'win-x64']) {
    pkg(path.join(nm, '@node-llama-cpp', name), { name: `@node-llama-cpp/${name}` });
  }
});

afterEach(() => {
  fs.rmSync(app, { recursive: true, force: true });
});

const removed = (plan: { removedPackages: Array<{ name: string }> }) => plan.removedPackages.map((p) => p.name).sort();

describe('CUDA backends are a per-build choice', () => {
  it('are KEPT by default: no flag, no env', () => {
    const plan = prune.planPrune(app, {});
    expect(plan.cuda).toEqual({ cuda: 'keep', source: 'default' });
    expect(removed(plan)).toEqual([]);
  });

  it('are dropped only when asked, by env or flag, with the vulkan and CPU backends untouched', () => {
    for (const plan of [prune.planPrune(app, { GUM_CUDA: 'drop' }), prune.planPrune(app, {}, 'drop')]) {
      expect(removed(plan)).toEqual([...prune.CUDA_PACKAGES].sort());
      expect(plan.removedPackages.every((p) => p.rule === 'llama-cuda')).toBe(true);
    }
  });

  it('a flag beats the environment, and the old GUM_KEEP_CUDA=1 still keeps them', () => {
    expect(prune.resolveCudaChoice({ GUM_CUDA: 'drop' }, 'keep')).toEqual({ cuda: 'keep', source: '--keep-cuda' });
    expect(prune.resolveCudaChoice({ GUM_CUDA: 'keep' }, 'drop')).toEqual({ cuda: 'drop', source: '--drop-cuda' });
    expect(prune.resolveCudaChoice({ GUM_KEEP_CUDA: '1' })).toEqual({ cuda: 'keep', source: 'GUM_KEEP_CUDA' });
    expect(prune.resolveCudaChoice({ GUM_CUDA: ' Drop ' })).toEqual({ cuda: 'drop', source: 'GUM_CUDA=drop' });
  });

  it('a mistyped choice fails the build instead of guessing', () => {
    expect(() => prune.resolveCudaChoice({ GUM_CUDA: 'no' })).toThrow(/keep" or "drop/);
    expect(() => prune.cudaFlag(['--keep-cuda', '--drop-cuda'])).toThrow(/not both/);
    expect(prune.cudaFlag(['--zip'])).toBeNull();
    expect(prune.cudaFlag(['--drop-cuda'])).toBe('drop');
  });

  it('no longer reasons from the build machine\'s GPU', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'tools', 'prune-packaged-app.cjs'), 'utf8');
    expect(src).not.toMatch(/This machine has an AMD GPU/);
  });

  it('release scripts keep CUDA; only the local portable build drops it, and says so', () => {
    const { scripts } = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    for (const name of ['make', 'publish', 'package:installer']) expect(scripts[name], name).not.toContain('--drop-cuda');
    expect(scripts['package:win']).toBe('node tools/package-app.cjs --drop-cuda');
  });
});
