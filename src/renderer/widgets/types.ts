// Shared contract for Home Workspace widgets. A widget is a small self-contained
// React component that reads/writes only its own `settings` bag (persisted with
// the desktop layout) and, where useful, the app's existing data buses
// (playerBus, stats, knownWords, …). Widgets never own window chrome — the
// WidgetFrame host supplies drag/resize/lock/collapse and passes these props.

import type { ComponentType } from 'react';

export type WidgetCategory = 'Productivity' | 'Study' | 'Music' | 'Statistics' | 'Utility' | 'System';

export const WIDGET_CATEGORIES: WidgetCategory[] = [
  'Productivity',
  'Study',
  'Music',
  'Statistics',
  'Utility',
  'System',
];

export interface WidgetProps {
  /** Persisted per-instance settings (opaque bag). Read with `readSetting`. */
  settings: Record<string, unknown>;
  /** Merge a partial patch into this widget's settings (persists + re-renders). */
  setSettings: (patch: Record<string, unknown>) => void;
  /** Current content size in px, so widgets can adapt their layout. */
  size: { w: number; h: number };
}

export interface WidgetDef {
  /** Stable key stored in WidgetSnapshot.type and the registry. */
  type: string;
  /** i18n key for the display title (see shared/i18n/catalogs.ts `widgets.title.*`). */
  titleKey: string;
  category: WidgetCategory;
  /** i18n key for the one-line description shown on the gallery card (`widgets.desc.*`). */
  descKey: string;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  component: ComponentType<WidgetProps>;
}

/** Typed, tolerant read of a persisted setting with a fallback. */
export function readSetting<T>(settings: Record<string, unknown>, key: string, fallback: T): T {
  const v = settings[key];
  return v === undefined || v === null ? fallback : (v as T);
}
