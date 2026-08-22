import {
  agentPermissionRank,
  type AgentConfirmationReason,
  type AgentPermissionLevel,
  type AgentToolId,
  type AgentToolOperationId,
} from '../shared/localAgent';
import {
  effectiveAgentPermission,
  type AgentProfile,
} from '../shared/localAgentProfiles';
import type { LocalAgentSettings } from '../shared/localAgentSettings';
import type { AgentToolCapability } from './agentToolRegistry';

export type AgentCapabilityAvailabilityReason =
  | 'available'
  | 'agent-disabled'
  | 'profile-disabled'
  | 'profile-operation-disabled'
  | 'permission-insufficient'
  | 'adapter-not-implemented'
  | 'dedicated-analysis-required'
  | 'false-success-stub-removed';

export interface AgentCapabilityDirectoryRow {
  id: AgentToolOperationId;
  tool: AgentToolId;
  minimumPermission: AgentPermissionLevel;
  confirmation?: AgentConfirmationReason;
  available: boolean;
  reason: AgentCapabilityAvailabilityReason;
}

/**
 * Projects the three live authorities into one inspectable list. This helper
 * deliberately does not infer capability from an operation declaration alone:
 * a declared operation still needs an installed adapter, active Agent settings,
 * the profile allow-list, and enough effective permission.
 */
export function buildAgentCapabilityDirectory(
  capabilities: readonly AgentToolCapability[],
  settings: LocalAgentSettings,
  profile: AgentProfile,
): AgentCapabilityDirectoryRow[] {
  const effectivePermission = effectiveAgentPermission(settings.permission, profile);
  const enabledOperations = new Set(profile.enabledOperations);

  return capabilities.map((capability) => {
    const base = {
      id: capability.definition.id,
      tool: capability.definition.tool,
      minimumPermission: capability.definition.minimumPermission,
      ...(capability.definition.confirmation
        ? { confirmation: capability.definition.confirmation }
        : {}),
    };

    if (!capability.available) {
      return { ...base, available: false, reason: capability.reason };
    }
    if (!settings.enabled) {
      return { ...base, available: false, reason: 'agent-disabled' as const };
    }
    if (!profile.enabled) {
      return { ...base, available: false, reason: 'profile-disabled' as const };
    }
    if (!enabledOperations.has(capability.definition.id)) {
      return { ...base, available: false, reason: 'profile-operation-disabled' as const };
    }
    if (agentPermissionRank(effectivePermission) < agentPermissionRank(capability.definition.minimumPermission)) {
      return { ...base, available: false, reason: 'permission-insufficient' as const };
    }
    return { ...base, available: true, reason: 'available' as const };
  });
}

export function agentCapabilityOperationLabelKey(id: AgentToolOperationId): string {
  return `agent.capabilities.operation.${id}`;
}

