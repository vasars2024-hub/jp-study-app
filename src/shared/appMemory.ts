/**
 * Per-process memory of THIS app, as main reads it from `app.getAppMetrics()`,
 * with each renderer attributed to the window it draws. Blanc's System Monitor
 * shows it so the user can see what Blanc — and Study OS beside it — cost.
 */

/** What a process is, in words the UI translates (never shown raw). */
export type AppProcessRole =
  | 'study-os'
  | 'blanc'
  | 'popout'
  | 'window'
  | 'browser'
  | 'gpu'
  | 'utility'
  | 'other';

export interface AppProcessMemory {
  pid: number;
  role: AppProcessRole;
  /** Window title for a renderer, or Electron's process type/name otherwise. */
  label: string;
  /** Working set (resident memory), bytes. */
  workingSetBytes: number;
  /** Private bytes where the platform reports it (Windows), bytes. */
  privateBytes?: number;
  /** CPU since the previous sample, percent of one core. */
  cpuPercent: number;
}

export interface AppMemoryReport {
  at: number;
  processes: AppProcessMemory[];
  totalWorkingSetBytes: number;
  /** Present only when every process reported private bytes. */
  totalPrivateBytes?: number;
}

/** Sum a report's processes; pure, so it is testable without Electron. */
export function summarizeAppMemory(processes: AppProcessMemory[], at = Date.now()): AppMemoryReport {
  const totalWorkingSetBytes = processes.reduce((sum, p) => sum + p.workingSetBytes, 0);
  const allPrivate = processes.length > 0 && processes.every((p) => typeof p.privateBytes === 'number');
  return {
    at,
    processes: [...processes].sort((a, b) => b.workingSetBytes - a.workingSetBytes),
    totalWorkingSetBytes,
    ...(allPrivate ? { totalPrivateBytes: processes.reduce((sum, p) => sum + (p.privateBytes ?? 0), 0) } : {}),
  };
}
