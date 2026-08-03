import { createEmptyExternalPlayerPreferences, normalizeExternalPlayerPreferences, type ExternalPlayerPreferences } from '../shared/externalPlayer';
export const EXTERNAL_PLAYER_STORAGE_KEY = 'jp-external-player-preferences-v1';
let fallback: ExternalPlayerPreferences | null = null;
export function loadExternalPlayerPreferences(): ExternalPlayerPreferences { try { const raw = localStorage.getItem(EXTERNAL_PLAYER_STORAGE_KEY); if (raw) return (fallback = normalizeExternalPlayerPreferences(JSON.parse(raw))); } catch { /* memory fallback */ } return fallback ?? createEmptyExternalPlayerPreferences(); }
export function saveExternalPlayerPreferences(input: unknown): ExternalPlayerPreferences { const value = normalizeExternalPlayerPreferences(input); fallback = value; try { localStorage.setItem(EXTERNAL_PLAYER_STORAGE_KEY, JSON.stringify(value)); } catch { /* memory fallback */ } return value; }
