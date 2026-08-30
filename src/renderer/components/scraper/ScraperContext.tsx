import { createContext, useContext } from 'react';
import type { ScraperController } from './types';

const ScraperContext = createContext<ScraperController | null>(null);

export const ScraperProvider = ScraperContext.Provider;

/**
 * Every page reads the shell through this rather than taking props, matching
 * the Settings app. Throwing on a missing provider turns a class of silent
 * blank-screen bugs into an immediate, locatable error.
 */
export function useScraper(): ScraperController {
  const value = useContext(ScraperContext);
  if (!value) throw new Error('useScraper() must be called inside <ScraperProvider>.');
  return value;
}

/**
 * The deep-link target, or null. Deliberately does NOT throw: ScrCard is the one
 * consumer, and it is a presentational primitive that must keep rendering in a
 * test or harness that mounts a page without the shell around it. A card that
 * simply never highlights there is the right failure.
 */
export function useScraperFocusId(): string | null {
  return useContext(ScraperContext)?.focusSettingId ?? null;
}
