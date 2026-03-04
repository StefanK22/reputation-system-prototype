import {
  asArray,
  asBoolean,
  asIsoString,
  asNumber,
  asNumberMap,
  asObject,
  asString,
} from '../lib/objectPath.js';
import { TEMPLATE_IDS } from '../shared/contracts/constants.js';
import { getContractDefinition } from '../shared/contracts/registry.js';
import { cloneJsonValue, readFirstFieldValue } from '../shared/contracts/fieldAccess.js';

function coerceFieldValue(value, fieldDef) {
  const defaultValue = cloneJsonValue(fieldDef.defaultValue);

  switch (fieldDef.type) {
    case 'string':
      return asString(value, asString(defaultValue, ''));
    case 'number':
      return asNumber(value, asNumber(defaultValue, 0));
    case 'boolean':
      return asBoolean(value, asBoolean(defaultValue, false));
    case 'isoDate':
      return asIsoString(value, new Date().toISOString());
    case 'array':
      return asArray(value);
    case 'object':
      return asObject(value);
    case 'numberMap':
      return asNumberMap(value);
    default:
      return value ?? defaultValue;
  }
}

function extractContractValues(templateId, payload) {
  const definition = getContractDefinition(templateId);
  if (!definition) {
    throw new Error(`Unknown contract template: ${templateId}`);
  }

  const values = {};
  for (const fieldDef of definition.fields) {
    const { found, value } = readFirstFieldValue(payload, fieldDef);
    const raw = found ? value : cloneJsonValue(fieldDef.defaultValue);
    values[fieldDef.key] = coerceFieldValue(raw, fieldDef);
  }

  return values;
}

export function normalizeCompletedInteraction(payload) {
  const values = extractContractValues(TEMPLATE_IDS.COMPLETED_INTERACTION, payload);

  return {
    platform: values.platform || 'UNKNOWN_PLATFORM',
    participants: asArray(values.participants).map(String),
    interactionType: values.interactionType || 'UNKNOWN_INTERACTION',
    outcome: asObject(values.outcome),
    completedAt: values.completedAt,
    configVersion: values.configVersion || 1,
    evaluated: Boolean(values.evaluated),
  };
}

export function normalizeFeedback(payload) {
  const values = extractContractValues(TEMPLATE_IDS.FEEDBACK, payload);

  return {
    platform: values.platform || 'UNKNOWN_PLATFORM',
    interactionId: values.interactionId || 'unknown_interaction',
    from: values.from || 'UNKNOWN_PARTY',
    to: values.to || 'UNKNOWN_PARTY',
    componentRatings: asNumberMap(values.componentRatings),
    submittedAt: values.submittedAt,
    phase: values.phase || 'FINAL',
  };
}

export function normalizeReputationConfiguration(payload) {
  const values = extractContractValues(TEMPLATE_IDS.REPUTATION_CONFIGURATION, payload);
  const systemParametersRaw = asObject(values.systemParameters);
  const systemParameters = {
    ...systemParametersRaw,
    reputationFloor: asNumber(systemParametersRaw.reputationFloor, 0),
    reputationCeiling: asNumber(systemParametersRaw.reputationCeiling, 100),
  };

  return {
    operator: values.operator || 'Operator',
    configId: values.configId || 'DEFAULT_CONFIG',
    version: values.version || 1,
    activationTime: values.activationTime,
    systemParameters,
    components: asArray(values.components).map((item) => {
      const obj = asObject(item);
      return {
        componentId: asString(obj.componentId),
        description: asString(obj.description),
        initialValue: asNumber(obj.initialValue, 70),
      };
    }),
    roleWeights: asArray(values.roleWeights).map((item) => {
      const obj = asObject(item);
      return {
        roleId: asString(obj.roleId),
        componentWeights: asNumberMap(obj.componentWeights),
      };
    }),
    interactionTypes: asArray(values.interactionTypes).map((item) => {
      const obj = asObject(item);
      return {
        interactionTypeId: asString(obj.interactionTypeId),
        description: asString(obj.description),
        ratingRules: asArray(obj.ratingRules).map((rule) => {
          const ruleObj = asObject(rule);
          return {
            componentId: asString(ruleObj.componentId),
            conditionField: asString(ruleObj.conditionField),
            conditionOperator: asString(ruleObj.conditionOperator, 'EQ').toUpperCase(),
            conditionValue: asNumber(ruleObj.conditionValue, 0),
            assignedRating: asNumber(ruleObj.assignedRating, 70),
          };
        }),
      };
    }),
    partyRoles: Object.fromEntries(
      Object.entries(asObject(values.partyRoles)).map(([party, roleId]) => [String(party), String(roleId)])
    ),
    defaultRoleId: asString(values.defaultRoleId, ''),
  };
}
