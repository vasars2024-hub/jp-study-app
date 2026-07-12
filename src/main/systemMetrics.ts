// Lightweight OS metrics for desktop widgets. Polled from the renderer; keep
// work cheap (no heavy sampling loops in main).

import os from 'node:os';
import { clipboard, ipcMain, powerMonitor } from 'electron';

export interface SystemMetrics {
  /** 0–1 approximate CPU load (1-minute loadavg / cores on Unix; Windows uses moving sample). */
  cpuLoad: number;
  freemem: number;
  totalmem: number;
  /** Platform string from Node (`win32`, `darwin`, …). */
  platform: string;
  /** OS uptime in seconds. */
  uptime: number;
  /** 0–1 battery fraction when known; null if unknown / AC-only desktop. */
  battery?: number | null;
  onBattery?: boolean | null;
  onlineHint?: boolean;
}

// Windows loadavg is always zeros — track process CPU time deltas as a coarse stand-in.
let lastCpu: { idle: number; total: number; at: number } | null = null;

function cpuTimes(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    idle += c.times.idle;
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
  }
  return { idle, total };
}

function sampleCpuLoad(): number {
  const cores = Math.max(1, os.cpus().length);
  const load = os.loadavg()[0];
  if (load > 0) {
    return Math.min(1, load / cores);
  }
  // Windows / zero-loadavg path: delta of idle vs total across samples.
  const now = Date.now();
  const cur = cpuTimes();
  if (!lastCpu) {
    lastCpu = { ...cur, at: now };
    return 0;
  }
  const idleDelta = cur.idle - lastCpu.idle;
  const totalDelta = cur.total - lastCpu.total;
  lastCpu = { ...cur, at: now };
  if (totalDelta <= 0) return 0;
  const busy = 1 - idleDelta / totalDelta;
  return Math.min(1, Math.max(0, busy));
}

function readBattery(): { battery: number | null; onBattery: boolean | null } {
  try {
    // Electron powerMonitor: onBatteryPower is widely available; percentage is
    // not standardized across versions — probe carefully.
    const onBattery = powerMonitor.isOnBatteryPower();
    const pm = powerMonitor as Electron.PowerMonitor & {
      getSystemIdleState?: (s: number) => string;
    };
    void pm;
    return { battery: null, onBattery };
  } catch {
    return { battery: null, onBattery: null };
  }
}

export function getSystemMetrics(): SystemMetrics {
  const bat = readBattery();
  return {
    cpuLoad: sampleCpuLoad(),
    freemem: os.freemem(),
    totalmem: os.totalmem(),
    platform: process.platform,
    uptime: os.uptime(),
    battery: bat.battery,
    onBattery: bat.onBattery,
  };
}

export function registerSystemMetricsIpc(): void {
  ipcMain.handle('system:getMetrics', async (): Promise<SystemMetrics> => getSystemMetrics());
  ipcMain.handle('clipboard:readText', async (): Promise<string> => {
    try {
      return clipboard.readText() || '';
    } catch {
      return '';
    }
  });
}
