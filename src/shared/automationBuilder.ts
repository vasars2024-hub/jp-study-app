export const AUTOMATION_BUILDER_SCRIPT = 'automation-builder.ps1';
export const AUTOMATION_BUILDER_CONFIG_DIR = 'automation-configs';

export const AUTOMATION_BUILDER_COMMAND =
  'powershell -ExecutionPolicy Bypass -File ".\\automation-builder.ps1"';

export const AUTOMATION_BUILDER_DIRECT_COMMAND =
  'powershell -ExecutionPolicy Bypass -File "C:\\Users\\Arseniy\\Projects\\jp-study-app\\automation-builder.ps1"';

export interface AutomationBuilderDescriptor {
  name: string;
  script: string;
  configDir: string;
  launchCommand: string;
  directLaunchCommand: string;
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
  directLaunchCommand: AUTOMATION_BUILDER_DIRECT_COMMAND,
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
