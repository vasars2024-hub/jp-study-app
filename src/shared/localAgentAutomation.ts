import type { AgentPermissionLevel } from './localAgent';

export type AgentAutomationFrequency = 'daily' | 'weekly';

export interface AgentAutomation {
  id: string;
  name: string;
  objective: string;
  frequency: AgentAutomationFrequency;
  time: string;
  weekday?: number;
  enabled: boolean;
  permission: AgentPermissionLevel;
  createdAt: number;
}

const PERMISSIONS = new Set<AgentPermissionLevel>(['read-only', 'limited-actions', 'full-automation']);
const FREQUENCIES = new Set<AgentAutomationFrequency>(['daily', 'weekly']);

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validTime(value: unknown): string {
  const time = text(value, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : '09:00';
}

function validWeekday(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(6, Math.max(0, Math.round(value)))
    : 1;
}

export function normalizeAgentAutomations(input: unknown): AgentAutomation[] {
  const raw = Array.isArray(input) ? input : [];
  const ids = new Set<string>();
  const entries: AgentAutomation[] = [];
  for (const value of raw.slice(0, 100)) {
    if (!value || typeof value !== 'object') continue;
    const candidate = value as Partial<AgentAutomation>;
    const id = text(candidate.id, 120);
    const name = text(candidate.name, 120);
    const objective = text(candidate.objective, 500);
    if (!id || ids.has(id) || !name || !objective) continue;
    const frequency = FREQUENCIES.has(candidate.frequency as AgentAutomationFrequency)
      ? candidate.frequency as AgentAutomationFrequency
      : 'daily';
    const permission = PERMISSIONS.has(candidate.permission as AgentPermissionLevel)
      ? candidate.permission as AgentPermissionLevel
      : 'read-only';
    ids.add(id);
    entries.push({
      id,
      name,
      objective,
      frequency,
      time: validTime(candidate.time),
      ...(frequency === 'weekly' ? { weekday: validWeekday(candidate.weekday) } : {}),
      enabled: candidate.enabled !== false,
      permission,
      createdAt: typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt)
        ? Math.max(0, Math.floor(candidate.createdAt))
        : 0,
    });
  }
  return entries;
}

export function nextAgentAutomationRun(
  automation: AgentAutomation,
  from = new Date(),
): Date {
  const [hour, minute] = automation.time.split(':').map(Number);
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setHours(hour, minute, 0, 0);
  if (automation.frequency === 'daily') {
    if (next <= from) next.setDate(next.getDate() + 1);
    return next;
  }
  const weekday = automation.weekday ?? 1;
  let delta = (weekday - next.getDay() + 7) % 7;
  if (delta === 0 && next <= from) delta = 7;
  next.setDate(next.getDate() + delta);
  return next;
}

export function automationDueAt(automation: AgentAutomation, now = new Date()): boolean {
  if (!automation.enabled) return false;
  const [hour, minute] = automation.time.split(':').map(Number);
  if (now.getHours() !== hour || now.getMinutes() !== minute) return false;
  return automation.frequency !== 'weekly' || now.getDay() === (automation.weekday ?? 1);
}

