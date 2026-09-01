export const AUTOMATION_BUILDER_SCRIPT = 'automation-builder.ps1';
export const AUTOMATION_BUILDER_CONFIG_DIR = 'automation-configs';

export const AUTOMATION_BUILDER_COMMAND =
  'powershell -ExecutionPolicy Bypass -File ".\\automation-builder.ps1"';

/**
 * The absolute-path launch command, built from a path resolved at runtime.
 *
 * This used to be a module constant holding a developer's own home directory —
 * `C:\Users\Arseniy\Projects\jp-study-app\...` — baked into shipped source,
 * rendered into a visible input and copied to the clipboard on request. It was
 * inert for every other user, and it is one of the reasons `RULINGS_2026-08-04`
 * §R2 judged the git history unpublishable. Audit F9.
 *
 * The main process already resolves the real script location (`app.getAppPath()`
 * then `process.cwd()`), so there was never a need to guess it here.
 */
export function automationBuilderDirectCommand(scriptPath: string): string {
  return `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`;
}

export interface AutomationBuilderDescriptor {
  name: string;
  script: string;
  configDir: string;
  launchCommand: string;
  stopKey: string;
  capabilities: string[];
  safetyNotes: string[];
  migrationNotes: string[];
}

export interface AutomationBuilderLaunchResult {
  ok: boolean;
  pid?: number;
  scriptPath?: string;
  error?: string;
}

export const AUTOMATION_BUILDER: AutomationBuilderDescriptor = {
  name: 'Automation Builder',
  script: AUTOMATION_BUILDER_SCRIPT,
  configDir: AUTOMATION_BUILDER_CONFIG_DIR,
  launchCommand: AUTOMATION_BUILDER_COMMAND,
  stopKey: 'F9',
  capabilities: [
    'cursor movement',
    'mouse clicks',
    'keyboard capture',
    'session recording',
    'wait steps',
    'type words',
    'saved JSON configs',
  ],
  safetyNotes: [
    'Runs as a Windows PowerShell tool outside the Electron renderer.',
    'Can move the cursor, click, and send keys, so the user should launch it intentionally.',
    'Session recording stops with F9.',
    'Saved configs live in automation-configs and are not Blanc memory settings.',
  ],
  migrationNotes: [
    'Keep the PowerShell script as the first Windows adapter while the shared automation API is designed.',
    'Later, expose script configs through the toolbox registry instead of embedding automation logic in React.',
    'Any launcher IPC should be allowlisted to this script, not a generic shell execution bridge.',
  ],
};
