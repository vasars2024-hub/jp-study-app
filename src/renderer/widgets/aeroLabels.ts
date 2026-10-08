import { t } from '../i18n';

// Aero gives a handful of widgets their period "Sidebar gadget" names (CPU
// Meter, Notes, Clock…), mirroring wiredLabels.ts. The strings live in the
// i18n catalog under `aeroVista.gadget.<type>`; this module only knows which
// widget types carry one. Types without an override resolve to the caller's
// fallback (the widget's normal translated title).
const AERO_GADGET_TYPES = [
  'clock-analog',
  'clock-digital',
  'calendar',
  'world-clock',
  'todo',
  'cpu-usage',
  'memory-usage',
  'battery',
  'network',
  'mini-player',
  'clipboard',
] as const;

const AERO_GADGET_TYPE_SET: ReadonlySet<string> = new Set(AERO_GADGET_TYPES);

export function aeroGadgetTitle(type: string, fallback: string): string {
  if (!AERO_GADGET_TYPE_SET.has(type)) return fallback;
  const key = `aeroVista.gadget.${type}`;
  const resolved = t(key);
  return resolved === key ? fallback : resolved;
}

/** The widget types that carry an Aero gadget name (for catalog coverage tests). */
export const AERO_GADGET_LABEL_TYPES: readonly string[] = AERO_GADGET_TYPES;
