/**
 * Contract schema normalization
 * Transforms raw payloads into normalized domain objects
 */

import { toObject, toIsoString, toNumberMap, coerce } from '../utils/types.js';
import { getByPath, getFirstMatch } from '../utils/paths.js';
import { TEMPLATE_IDS, getDefinition as getContractDefinition } from '../../config/contracts.js';

function readFirstFieldValue(payload, fieldDef) {
  const paths = [fieldDef.path, ...(fieldDef.aliases || [])];
  const { found, value } = getFirstMatch(payload, paths);
  return { found, value };
}

function extractValues(templateId, payload) {
  const def = getContractDefinition(templateId);
  if (!def) {
    throw new Error(`Unknown contract template: ${templateId}`);
  }

  const values = {};
  for (const fieldDef of def.fields) {
    const { found, value } = readFirstFieldValue(payload, fieldDef);
    const raw = found ? value : JSON.parse(JSON.stringify(fieldDef.defaultValue));
    values[fieldDef.key] = coerce(raw, fieldDef.type, fieldDef.defaultValue);
  }

  return values;
}

export function normalizeConfiguration(payload) {
  const values = extractValues(TEMPLATE_IDS.REPUTATION_CONFIGURATION, payload);
  const sysParamsRaw = toObject(values.systemParameters);
  const systemParameters = {
    ...sysParamsRaw,
    reputationFloor: Number(sysParamsRaw.reputationFloor) || 0,
    reputationCeiling: Number(sysParamsRaw.reputationCeiling) || 100,
  };

  return {
    operator: values.operator || 'Operator',
    configId: values.configId || 'DEFAULT_CONFIG',
    version: values.version || 1,
    activationTime: values.activationTime,
    systemParameters,
    components: (Array.isArray(values.components) ? values.components : []).map((item) => {
      const obj = toObject(item);
      return {
        componentId: String(obj.componentId || ''),
        description: String(obj.description || ''),
        initialValue: Number(obj.initialValue) || 70,
      };
    }),
    roleWeights: (Array.isArray(values.roleWeights) ? values.roleWeights : []).map((item) => {
      const obj = toObject(item);
      return {
        roleId: String(obj.roleId || ''),
        componentWeights: toNumberMap(obj.componentWeights),
      };
    }),
    interactionTypes: (Array.isArray(values.interactionTypes) ? values.interactionTypes : []).map((item) => {
      const obj = toObject(item);
      return {
        interactionTypeId: String(obj.interactionTypeId || ''),
        description: String(obj.description || ''),
        ratingRules: (Array.isArray(obj.ratingRules) ? obj.ratingRules : []).map((rule) => {
          const r = toObject(rule);
          return {
            componentId: String(r.componentId || ''),
            conditionField: String(r.conditionField || ''),
            conditionOperator: String(r.conditionOperator || ''),
            conditionValue: Number(r.conditionValue) || 0,
            assignedRating: Number(r.assignedRating) || 70,
          };
        }),
      };
    }),
    partyRoles: toObject(values.partyRoles),
    defaultRoleId: values.defaultRoleId || 'AGENT',
  };
}

export function normalizeInteraction(payload) {
  const values = extractValues(TEMPLATE_IDS.COMPLETED_INTERACTION, payload);

  return {
    platform: values.platform || 'UNKNOWN_PLATFORM',
    participants: (Array.isArray(values.participants) ? values.participants : []).map(String),
    interactionType: values.interactionType || 'UNKNOWN_INTERACTION',
    outcome: toObject(values.outcome),
    completedAt: values.completedAt,
    configVersion: values.configVersion || 1,
    evaluated: Boolean(values.evaluated),
  };
}

export function normalizeFeedback(payload) {
  const values = extractValues(TEMPLATE_IDS.FEEDBACK, payload);

  return {
    platform: values.platform || 'UNKNOWN_PLATFORM',
    interactionId: values.interactionId || 'unknown_interaction',
    from: values.from || 'UNKNOWN_PARTY',
    to: values.to || 'UNKNOWN_PARTY',
    componentRatings: toNumberMap(values.componentRatings),
    submittedAt: values.submittedAt,
    phase: values.phase || 'FINAL',
  };
}

// Legacy names for backwards compatibility
export { normalizeConfiguration as normalizeReputationConfiguration };
export { normalizeInteraction as normalizeCompletedInteraction };

