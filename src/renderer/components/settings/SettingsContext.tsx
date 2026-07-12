import { createContext, useContext } from 'react';
import type { SettingsController } from './types';

const Ctx = createContext<SettingsController | null>(null);

export const SettingsProvider = Ctx.Provider;

export function useSettings(): SettingsController {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSettings outside SettingsProvider');
  return v;
}
