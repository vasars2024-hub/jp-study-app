// @vitest-environment node
/**
 * The e2e harness's teardown (tools/e2e/isolation.cjs `runProcesses`): which processes
 * belong to one run. Two runs' headless apps once outlived their runs for hours; the
 * teardown must find everything of its run by the run's own paths, and must never touch
 * the owner's dev Gum (run from the repo, its own profile) or another live run's app.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(__filename);
interface Row { ProcessId: number; ParentProcessId?: number; Name: string; CommandLine: string | null; Created?: number }
const iso = require('../../../tools/e2e/isolation.cjs') as {
  runProcesses(rows: Row[], opts: { runDir: string; appDir?: string | null; otherRunIds?: string[]; exceptPids?: number[] }): { ours: Row[]; ambiguous: Row[] };
};

const TEMP = 'C:\\Users\\owner\\AppData\\Local\\Temp';
const RUN = `${TEMP}\\gum-e2e-2026-10-15T16-52-12-858Z-p21508`;
const SNAP = 'C:\\repo\\tools\\e2e\\out\\builds\\2026-10-15T16-52-13-985Z-p21508\\app';
const ELECTRON = 'C:\\repo\\node_modules\\electron\\dist\\electron.exe';

const rows: Row[] = [
  { ProcessId: 10, Name: 'electron.exe', CommandLine: `${ELECTRON} ${SNAP} --e2e --e2e-run=${RUN} --mute-audio` },
  { ProcessId: 11, Name: 'electron.exe', CommandLine: `"${ELECTRON}" --type=gpu-process --user-data-dir="${RUN}\\profile"` },
  { ProcessId: 12, Name: 'seanime.exe', CommandLine: `C:\\Apps\\seanime.exe --datadir=${RUN}\\profile\\seanime-e2e --port=5000` },
  // Forward slashes and other casing name the same run.
  { ProcessId: 13, Name: 'ffmpeg.exe', CommandLine: `ffmpeg.exe -i ${RUN.toLowerCase().replace(/\\/g, '/')}/media/a.mp4` },
  // A child naming only the snapshot (no profile flag).
  { ProcessId: 14, Name: 'electron.exe', CommandLine: `"${ELECTRON}" --type=crashpad-handler --app-path=${SNAP}` },
  // The owner's dev Gum: run from the repo with its own profile.
  { ProcessId: 20, Name: 'electron.exe', CommandLine: `${ELECTRON} C:\\repo --user-data-dir=C:\\Users\\owner\\gum-snip-test-profile` },
  { ProcessId: 21, Name: 'electron.exe', CommandLine: `"${ELECTRON}" --type=renderer --user-data-dir="C:\\Users\\owner\\gum-snip-test-profile"` },
  // Another run, on another snapshot.
  { ProcessId: 30, Name: 'electron.exe', CommandLine: `${ELECTRON} C:\\repo\\tools\\e2e\\out\\builds\\other\\app --e2e-run=${TEMP}\\gum-e2e-other-run` },
  // A shell that only mentions the run's path (an agent grepping for it) is not the run.
  { ProcessId: 40, Name: 'powershell.exe', CommandLine: `powershell -Command "Get-CimInstance | ? CommandLine -like '*${RUN}*'"` },
  { ProcessId: 41, Name: 'bash.exe', CommandLine: `bash -c "grep ${RUN} run.log"` },
  { ProcessId: 50, Name: 'System Idle Process', CommandLine: null },
];

describe('e2e teardown: which processes are this run\'s', () => {
  it('finds the app, its Chromium children, the media server and ffmpeg by the run\'s own paths', () => {
    const { ours, ambiguous } = iso.runProcesses(rows, { runDir: RUN, appDir: SNAP });
    expect(ours.map((p) => p.ProcessId).sort()).toEqual([10, 11, 12, 13, 14]);
    expect(ambiguous).toEqual([]);
  });

  it('never the owner\'s dev Gum, another run\'s app, or a shell that mentions the path', () => {
    const { ours } = iso.runProcesses(rows, { runDir: RUN, appDir: SNAP });
    const ids = ours.map((p) => p.ProcessId);
    for (const id of [20, 21, 30, 40, 41, 50]) expect(ids).not.toContain(id);
  });

  it('with another live run on the same snapshot, a process naming only the snapshot is reported, not killed', () => {
    const shared: Row[] = [
      ...rows,
      { ProcessId: 60, Name: 'electron.exe', CommandLine: `${ELECTRON} ${SNAP} --e2e-run=${TEMP}\\gum-e2e-sharing-run` },
    ];
    const { ours, ambiguous } = iso.runProcesses(shared, { runDir: RUN, appDir: SNAP, otherRunIds: ['sharing-run'] });
    expect(ours.map((p) => p.ProcessId).sort()).toEqual([10, 11, 12, 13]);
    // 14 names the snapshot and no run: it could be either run's.
    expect(ambiguous.map((p) => p.ProcessId)).toEqual([14]);
  });

  it('skips the PIDs it is told to (the watchdog, the harness)', () => {
    const { ours } = iso.runProcesses(rows, { runDir: RUN, appDir: SNAP, exceptPids: [10, 11] });
    expect(ours.map((p) => p.ProcessId).sort()).toEqual([12, 13, 14]);
  });
});
