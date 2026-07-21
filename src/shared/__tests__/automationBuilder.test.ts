import { describe, expect, it } from 'vitest';
import { AUTOMATION_BUILDER } from '../automationBuilder';
import { getToolboxModule } from '../toolboxRegistry';

describe('Automation Builder adapter descriptor', () => {
  it('documents the existing PowerShell tool without generic shell execution', () => {
    expect(AUTOMATION_BUILDER.script).toBe('automation-builder.ps1');
    expect(AUTOMATION_BUILDER.configDir).toBe('automation-configs');
    expect(AUTOMATION_BUILDER.launchCommand).toContain('-File ".\\automation-builder.ps1"');
    expect(AUTOMATION_BUILDER.stopKey).toBe('F9');
  });

  it('registers Automation Builder as a real experimental toolbox module', () => {
    const module = getToolboxModule('automation-builder');

    expect(module?.status).toBe('experimental');
    expect(module?.appearsInBlanc).toBe(true);
    expect(module?.externalAdapter.strategy).toBe('manual-integration');
    expect(module?.permissions).toContain('automation-control');
  });
});
