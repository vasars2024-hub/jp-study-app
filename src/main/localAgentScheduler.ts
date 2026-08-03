import { BrowserWindow, ipcMain } from 'electron';
import { automationDueAt, normalizeAgentAutomations, type AgentAutomation } from '../shared/localAgentAutomation';

let schedules: AgentAutomation[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
const fired = new Set<string>();

function dayKey(date = new Date()): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function broadcast(automation: AgentAutomation): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('localAgent:trigger', automation);
  }
}

function tick(): void {
  const now = new Date();
  const day = dayKey(now);
  for (const automation of schedules) {
    if (!automationDueAt(automation, now)) continue;
    const key = `${automation.id}:${day}:${automation.time}`;
    if (fired.has(key)) continue;
    fired.add(key);
    broadcast(automation);
  }
  for (const key of fired) if (!key.includes(`:${day}:`)) fired.delete(key);
}

function sync(raw: unknown): void {
  schedules = normalizeAgentAutomations(raw);
  if (!schedules.length) {
    if (timer) clearInterval(timer);
    timer = null;
    return;
  }
  if (!timer) timer = setInterval(tick, 30_000);
  tick();
}

export function registerLocalAgentSchedulerIpc(): void {
  ipcMain.on('localAgent:syncAutomations', (_event, raw: unknown) => sync(raw));
}

export function stopLocalAgentScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
  schedules = [];
  fired.clear();
}
