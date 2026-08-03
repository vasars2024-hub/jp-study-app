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
