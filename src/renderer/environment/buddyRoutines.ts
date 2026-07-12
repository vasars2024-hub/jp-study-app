/**
 * Programmable buddy routines — allowlisted action chains for companions.
 * No eval / shell / network. Nested routines depth-capped.
 */
import type { CompanionMood, CompanionTypeId } from './companionCatalog';
import type { EnvironmentSettings } from './types';
import { loadEnvironment, saveEnvironment } from './environmentStore';
import { runCommand } from '../keyboardShortcuts';
import { next as musicNext, prev as musicPrev, toggle as musicToggle } from '../playerBus';
import { speak, ttsAvailable } from '../tts';

export const BUDDY_TOAST_EVENT = 'buddy:toast';
export const BUDDY_RUN_EVENT = 'buddy:run';
export const MAX_ROUTINE_DEPTH = 3;
export const MAX_STEPS = 32;
export const MAX_WAIT_MS = 10_000;

export type BuddyStep =
  | { type: 'openApp'; appId: string }
  | { type: 'runCommand'; commandId: string }
  | { type: 'dispatch'; event: string; detail?: string }
  | {
      type: 'toggleEnv';
      key: 'particles' | 'companions' | 'lighting' | 'living' | 'rotation';
      value?: 'on' | 'off' | 'toggle';
    }
  | { type: 'setMood'; mood: CompanionMood; status?: string }
  | { type: 'speak'; text: string }
  | { type: 'wait'; ms: number }
  | { type: 'notify'; title: string; body?: string }
  | { type: 'music'; action: 'playPause' | 'next' | 'prev' }
  | { type: 'clipboard'; action: 'open' }
  | { type: 'palette'; mode?: 'commands' | 'search' }
  | { type: 'routine'; routineId: string };

export interface BuddyRoutine {
  id: string;
  name: string;
  forType?: CompanionTypeId | '*';
  steps: BuddyStep[];
  builtin?: boolean;
}

export interface BuddyRunContext {
  companionId: string;
  typeId: CompanionTypeId;
  /** Update companion fields in live list + optionally persist. */
  patchCompanion: (patch: { mood?: CompanionMood; status?: string }) => void;
}

const STEP_TYPES = new Set([
  'openApp',
  'runCommand',
  'dispatch',
  'toggleEnv',
  'setMood',
  'speak',
  'wait',
  'notify',
  'music',
  'clipboard',
  'palette',
  'routine',
]);

const MOODS = new Set<CompanionMood>(['calm', 'happy', 'sleepy', 'curious', 'celebrate']);

export function getDefaultBuddyRoutines(): BuddyRoutine[] {
  return [
    {
      id: 'br-buddy-review',
      name: 'Start review',
      forType: 'study-buddy',
      builtin: true,
      steps: [
        { type: 'openApp', appId: 'flashcards' },
        { type: 'setMood', mood: 'celebrate', status: "Let's review" },
        { type: 'wait', ms: 1800 },
        { type: 'setMood', mood: 'happy', status: 'Cards ready' },
      ],
    },
    {
      id: 'br-buddy-focus',
      name: 'Deep focus',
      forType: 'study-buddy',
      builtin: true,
      steps: [
        { type: 'openApp', appId: 'library' },
        { type: 'toggleEnv', key: 'particles', value: 'off' },
        { type: 'setMood', mood: 'calm', status: 'Quiet desk' },
        { type: 'notify', title: 'Focus mode', body: 'Particles dimmed · Library open' },
      ],
    },
    {
      id: 'br-critter-weather',
      name: 'Weather toggle',
      forType: 'critter',
      builtin: true,
      steps: [
        { type: 'toggleEnv', key: 'particles', value: 'toggle' },
        { type: 'setMood', mood: 'curious', status: 'Chasing weather' },
        { type: 'notify', title: 'Critter', body: 'Particles toggled' },
      ],
    },
    {
      id: 'br-critter-dance',
      name: 'Weather dance',
      forType: 'critter',
      builtin: true,
      steps: [
        { type: 'toggleEnv', key: 'particles', value: 'on' },
        { type: 'setMood', mood: 'celebrate', status: 'Dance!' },
        { type: 'wait', ms: 1200 },
        { type: 'setMood', mood: 'curious', status: 'Exploring' },
      ],
    },
    {
      id: 'br-time-calendar',
      name: 'Open calendar',
      forType: 'timekeeper',
      builtin: true,
      steps: [
        { type: 'openApp', appId: 'calendar' },
        { type: 'setMood', mood: 'curious', status: hourStatus() },
      ],
    },
    {
      id: 'br-time-stats',
      name: 'Clock in',
      forType: 'timekeeper',
      builtin: true,
      steps: [
        { type: 'openApp', appId: 'stats' },
        { type: 'setMood', mood: 'happy', status: 'Logging progress' },
      ],
    },
    {
      id: 'br-noctis-city',
      name: 'Visit Noctis',
      forType: 'noctis',
      builtin: true,
      steps: [
        { type: 'openApp', appId: 'city' },
        { type: 'setMood', mood: 'curious', status: 'City lights' },
        { type: 'dispatch', event: 'noctis:pulse', detail: 'buddy' },
      ],
    },
    {
      id: 'br-noctis-study',
      name: 'Study light',
      forType: 'noctis',
      builtin: true,
      steps: [
        { type: 'openApp', appId: 'dictionary' },
        { type: 'setMood', mood: 'curious', status: 'Crystal warmed' },
        { type: 'notify', title: 'Noctis', body: 'Dictionary open' },
      ],
    },
  ];
}

function hourStatus(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return 'Good morning';
  if (h >= 11 && h < 17) return 'Day watch';
  if (h >= 17 && h < 21) return 'Evening hours';
  return 'Night watch';
}

/** Default primary / secondary routine ids by companion type. */
export function defaultRoutineIdsForType(typeId: CompanionTypeId): {
  primary: string;
  secondary: string;
  menu: string[];
} {
  switch (typeId) {
    case 'study-buddy':
      return { primary: 'br-buddy-review', secondary: 'br-buddy-focus', menu: ['br-buddy-review', 'br-buddy-focus'] };
    case 'critter':
      return { primary: 'br-critter-weather', secondary: 'br-critter-dance', menu: ['br-critter-weather', 'br-critter-dance'] };
    case 'timekeeper':
      return { primary: 'br-time-calendar', secondary: 'br-time-stats', menu: ['br-time-calendar', 'br-time-stats'] };
    case 'noctis':
      return { primary: 'br-noctis-city', secondary: 'br-noctis-study', menu: ['br-noctis-city', 'br-noctis-study'] };
    default:
      return { primary: 'br-buddy-review', secondary: 'br-buddy-focus', menu: [] };
  }
}

export function sanitizeStep(raw: unknown): BuddyStep | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const type = String(s.type ?? '');
  if (!STEP_TYPES.has(type)) return null;
  switch (type) {
    case 'openApp':
      return typeof s.appId === 'string' && s.appId ? { type, appId: s.appId } : null;
    case 'runCommand':
      return typeof s.commandId === 'string' && s.commandId ? { type, commandId: s.commandId } : null;
    case 'dispatch':
      return typeof s.event === 'string' && s.event
        ? { type, event: s.event, detail: typeof s.detail === 'string' ? s.detail : undefined }
        : null;
    case 'toggleEnv': {
      const key = s.key;
      if (
        key !== 'particles' &&
        key !== 'companions' &&
        key !== 'lighting' &&
        key !== 'living' &&
        key !== 'rotation'
      )
        return null;
      const value =
        s.value === 'on' || s.value === 'off' || s.value === 'toggle' ? s.value : 'toggle';
      return { type, key, value };
    }
    case 'setMood': {
      const mood = s.mood as CompanionMood;
      if (!MOODS.has(mood)) return null;
      return {
        type,
        mood,
        status: typeof s.status === 'string' ? s.status.slice(0, 80) : undefined,
      };
    }
    case 'speak':
      return typeof s.text === 'string' && s.text.trim()
        ? { type, text: s.text.trim().slice(0, 200) }
        : null;
    case 'wait': {
      const ms = typeof s.ms === 'number' ? Math.max(0, Math.min(MAX_WAIT_MS, Math.round(s.ms))) : 0;
      return { type, ms };
    }
    case 'notify':
      return typeof s.title === 'string' && s.title.trim()
        ? {
            type,
            title: s.title.trim().slice(0, 60),
            body: typeof s.body === 'string' ? s.body.slice(0, 120) : undefined,
          }
        : null;
    case 'music':
      return s.action === 'playPause' || s.action === 'next' || s.action === 'prev'
        ? { type, action: s.action }
        : null;
    case 'clipboard':
      return { type, action: 'open' };
    case 'palette':
      return {
        type,
        mode: s.mode === 'search' ? 'search' : 'commands',
      };
    case 'routine':
      return typeof s.routineId === 'string' && s.routineId ? { type, routineId: s.routineId } : null;
    default:
      return null;
  }
}

export function sanitizeRoutine(raw: unknown): BuddyRoutine | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  if (typeof r.name !== 'string' || !r.name.trim()) return null;
  const stepsIn = Array.isArray(r.steps) ? r.steps : [];
  const steps = stepsIn.map(sanitizeStep).filter(Boolean) as BuddyStep[];
  if (steps.length > MAX_STEPS) steps.length = MAX_STEPS;
  const forType =
    r.forType === '*' ||
    r.forType === 'study-buddy' ||
    r.forType === 'critter' ||
    r.forType === 'timekeeper' ||
    r.forType === 'noctis'
      ? r.forType
      : undefined;
  return {
    id: r.id,
    name: r.name.trim().slice(0, 48),
    forType,
    steps,
    builtin: r.builtin === true,
  };
}

/** Merge user routines with missing builtins (by id). */
export function mergeBuddyRoutines(saved: unknown): BuddyRoutine[] {
  const defaults = getDefaultBuddyRoutines();
  const list: BuddyRoutine[] = [];
  if (Array.isArray(saved)) {
    for (const raw of saved) {
      const r = sanitizeRoutine(raw);
      if (r) list.push(r);
    }
  }
  const have = new Set(list.map((r) => r.id));
  for (const d of defaults) {
    if (!have.has(d.id)) list.push(d);
  }
  return list;
}

export function resetBuiltinRoutines(current: BuddyRoutine[]): BuddyRoutine[] {
  const customs = current.filter((r) => !r.builtin);
  const builtins = getDefaultBuddyRoutines();
  return [...builtins, ...customs];
}

export function routinesForType(routines: BuddyRoutine[], typeId: CompanionTypeId): BuddyRoutine[] {
  return routines.filter((r) => !r.forType || r.forType === '*' || r.forType === typeId);
}

function toast(title: string, body?: string): void {
  try {
    window.dispatchEvent(new CustomEvent(BUDDY_TOAST_EVENT, { detail: { title, body } }));
  } catch {
    /* ignore */
  }
}

function openApp(appId: string): void {
  window.dispatchEvent(new CustomEvent('os:open', { detail: appId }));
}

function applyToggleEnv(
  key: 'particles' | 'companions' | 'lighting' | 'living' | 'rotation',
  value: 'on' | 'off' | 'toggle',
): void {
  const env = loadEnvironment();
  const nextOn = (cur: boolean) => (value === 'on' ? true : value === 'off' ? false : !cur);
  switch (key) {
    case 'living':
      saveEnvironment({ enabled: nextOn(env.enabled) });
      break;
    case 'particles':
      saveEnvironment({
        enabled: env.enabled || nextOn(env.particlesEnabled),
        particlesEnabled: nextOn(env.particlesEnabled),
      });
      break;
    case 'companions':
      saveEnvironment({
        enabled: env.enabled || nextOn(env.companionsEnabled),
        companionsEnabled: nextOn(env.companionsEnabled),
      });
      break;
    case 'lighting':
      saveEnvironment({
        enabled: env.enabled || nextOn(env.dayCycleLighting),
        dayCycleLighting: nextOn(env.dayCycleLighting),
      });
      break;
    case 'rotation':
      saveEnvironment({
        enabled: env.enabled || nextOn(env.rotationEnabled),
        rotationEnabled: nextOn(env.rotationEnabled),
      });
      break;
  }
}

async function runStep(step: BuddyStep, ctx: BuddyRunContext, depth: number): Promise<void> {
  switch (step.type) {
    case 'openApp':
      openApp(step.appId);
      return;
    case 'runCommand':
      runCommand(step.commandId);
      return;
    case 'dispatch':
      window.dispatchEvent(new CustomEvent(step.event, { detail: step.detail }));
      return;
    case 'toggleEnv':
      applyToggleEnv(step.key, step.value ?? 'toggle');
      return;
    case 'setMood':
      ctx.patchCompanion({ mood: step.mood, status: step.status });
      return;
    case 'speak':
      if (ttsAvailable()) speak(step.text, 'ja');
      return;
    case 'wait':
      await new Promise((r) => setTimeout(r, step.ms));
      return;
    case 'notify':
      toast(step.title, step.body);
      if (step.body) ctx.patchCompanion({ status: step.body.slice(0, 40) });
      return;
    case 'music':
      if (step.action === 'playPause') musicToggle();
      else if (step.action === 'next') musicNext();
      else musicPrev();
      return;
    case 'clipboard':
      window.dispatchEvent(new CustomEvent('clipboard:open'));
      return;
    case 'palette':
      window.dispatchEvent(
        new CustomEvent('palette:open', { detail: step.mode === 'search' ? 'search' : 'commands' }),
      );
      return;
    case 'routine':
      await runBuddyRoutine(step.routineId, ctx, depth + 1);
      return;
  }
}

const lastRunAt = new Map<string, number>();

export async function runBuddyRoutine(
  routineId: string,
  ctx: BuddyRunContext,
  depth = 0,
): Promise<{ ok: boolean; error?: string }> {
  if (depth > MAX_ROUTINE_DEPTH) {
    return { ok: false, error: 'Routine nesting too deep.' };
  }
  const debounceKey = `${ctx.companionId}:${routineId}`;
  const now = Date.now();
  if ((lastRunAt.get(debounceKey) ?? 0) + 400 > now && depth === 0) {
    return { ok: false, error: 'Too fast.' };
  }
  lastRunAt.set(debounceKey, now);

  const env = loadEnvironment();
  if (!env.enabled || !env.companionsEnabled) {
    return { ok: false, error: 'Companions are off.' };
  }
  const routines = env.buddyRoutines?.length ? env.buddyRoutines : getDefaultBuddyRoutines();
  const routine = routines.find((r) => r.id === routineId);
  if (!routine) return { ok: false, error: 'Routine not found.' };
  if (routine.forType && routine.forType !== '*' && routine.forType !== ctx.typeId) {
    return { ok: false, error: 'Routine not for this buddy.' };
  }

  try {
    if (depth === 0) toast(routine.name);
    const steps = routine.steps.slice(0, MAX_STEPS);
    for (const step of steps) {
      await runStep(step, ctx, depth);
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    toast('Buddy routine failed', message);
    return { ok: false, error: message };
  }
}

export function resolvePrimaryRoutineId(
  c: { typeId: CompanionTypeId; primaryRoutineId?: string },
): string {
  return c.primaryRoutineId || defaultRoutineIdsForType(c.typeId).primary;
}

export function resolveSecondaryRoutineId(
  c: { typeId: CompanionTypeId; secondaryRoutineId?: string },
): string {
  return c.secondaryRoutineId || defaultRoutineIdsForType(c.typeId).secondary;
}

export function resolveMenuRoutineIds(
  c: { typeId: CompanionTypeId; menuRoutineIds?: string[] },
  all: BuddyRoutine[],
): BuddyRoutine[] {
  const ids =
    c.menuRoutineIds?.length ? c.menuRoutineIds : defaultRoutineIdsForType(c.typeId).menu;
  const byId = new Map(all.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as BuddyRoutine[];
}
