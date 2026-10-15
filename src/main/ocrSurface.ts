/** Shared surface adapter. Engine buttons prefer a reader while retaining fallback. */
import {
  defaultRouterDeps, recognizeLineWithRouter, recognizeWithRouter, routerImageFromNative,
  type RouterDeps, type OcrRouterRead,
} from './ocrRouter';
import type { OcrRouterOptions } from '../shared/ocrRouterTypes';

export interface SurfaceOcrOptions extends OcrRouterOptions {
  engine?: 'auto' | 'web' | 'manga';
  line?: boolean;
}

export function readOcrSurface(
  image: Electron.NativeImage,
  opts: SurfaceOcrOptions,
  deps: RouterDeps = defaultRouterDeps(),
): Promise<OcrRouterRead> {
  const preferred = opts.engine && opts.engine !== 'auto' ? opts.engine : null;
  const routed = preferred ? {
    ...deps,
    providers: deps.providers.map((p) => ({ ...p, tier: p.id === preferred ? -10 : p.tier })),
  } : deps;
  return (opts.line ? recognizeLineWithRouter : recognizeWithRouter)(routerImageFromNative(image), opts, routed);
}
