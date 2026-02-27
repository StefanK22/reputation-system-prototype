import {
  asArray,
  asBoolean,
  asIsoString,
  asNumber,
  asNumberMap,
  asObject,
  asString,
  getByPath,
} from '../lib/objectPath.js';

// Single place to change incoming contract shape mappings.
export const contractMappings = {
  completedInteraction: {
    platform: 'platform',
    participants: 'participants',
    interactionType: 'interactionType',
    outcome: 'outcome',
    completedAt: 'completedAt',
    configVersion: 'configVersion',
    evaluated: 'evaluated',
  },
  feedback: {
    platform: 'platform',
    interactionId: 'interactionId',
    from: 'from',
    to: 'to',
    componentRatings: 'componentRatings',
    submittedAt: 'submittedAt',
    phase: 'phase',
  },
  reputationConfiguration: {
    operator: 'operator',
    configId: 'configId',
    version: 'version',
    activationTime: 'activationTime',
    systemParameters: 'systemParameters',
    components: 'components',
    roleWeights: 'roleWeights',
    interactionTypes: 'interactionTypes',
    interactionTypesFallback: 'iinteractionTypes',
    partyRoles: 'partyRoles',
    defaultRoleId: 'defaultRoleId',
  },
};

export function normalizeCompletedInteraction(payload) {
  const mapping = contractMappings.completedInteraction;
  return {
    platform: asString(getByPath(payload, mapping.platform), 'UNKNOWN_PLATFORM'),
    participants: asArray(getByPath(payload, mapping.participants)).map(String),
    interactionType: asString(getByPath(payload, mapping.interactionType), 'UNKNOWN_INTERACTION'),
    outcome: asObject(getByPath(payload, mapping.outcome)),
    completedAt: asIsoString(getByPath(payload, mapping.completedAt), new Date().toISOString()),
    configVersion: asNumber(getByPath(payload, mapping.configVersion), 1),
    evaluated: asBoolean(getByPath(payload, mapping.evaluated), false),
  };
}

export function normalizeFeedback(payload) {
  const mapping = contractMappings.feedback;
  return {
    platform: asString(getByPath(payload, mapping.platform), 'UNKNOWN_PLATFORM'),
    interactionId: asString(getByPath(payload, mapping.interactionId), 'unknown_interaction'),
    from: asString(getByPath(payload, mapping.from), 'UNKNOWN_PARTY'),
    to: asString(getByPath(payload, mapping.to), 'UNKNOWN_PARTY'),
    componentRatings: asNumberMap(getByPath(payload, mapping.componentRatings)),
    submittedAt: asIsoString(getByPath(payload, mapping.submittedAt), new Date().toISOString()),
    phase: asString(getByPath(payload, mapping.phase), 'FINAL'),
  };
}

export function normalizeReputationConfiguration(payload) {
  const mapping = contractMappings.reputationConfiguration;

  const interactionTypesRaw =
    getByPath(payload, mapping.interactionTypes) ??
    getByPath(payload, mapping.interactionTypesFallback) ??
    [];

  const systemParametersRaw = asObject(getByPath(payload, mapping.systemParameters));

  return {
    operator: asString(getByPath(payload, mapping.operator), 'Operator'),
    configId: asString(getByPath(payload, mapping.configId), 'DEFAULT_CONFIG'),
    version: asNumber(getByPath(payload, mapping.version), 1),
    activationTime: asIsoString(getByPath(payload, mapping.activationTime), new Date().toISOString()),
    systemParameters: {
      reputationFloor: asNumber(systemParametersRaw.reputationFloor, 0),
      reputationCeiling: asNumber(systemParametersRaw.reputationCeiling, 100),
      sensitivityK: asNumber(systemParametersRaw.sensitivityK, 2),
    },
    components: asArray(getByPath(payload, mapping.components)).map((item) => {
      const obj = asObject(item);
      return {
        componentId: asString(obj.componentId),
        description: asString(obj.description),
        initialValue: asNumber(obj.initialValue, 70),
        minValue: asNumber(obj.minValue, 0),
        maxValue: asNumber(obj.maxValue, 100),
      };
    }),
    roleWeights: asArray(getByPath(payload, mapping.roleWeights)).map((item) => {
      const obj = asObject(item);
      return {
        roleId: asString(obj.roleId),
        componentWeights: asNumberMap(obj.componentWeights),
      };
    }),
    interactionTypes: asArray(interactionTypesRaw).map((item) => {
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
      Object.entries(asObject(getByPath(payload, mapping.partyRoles))).map(([party, roleId]) => [
        String(party),
        String(roleId),
      ])
    ),
    defaultRoleId: asString(getByPath(payload, mapping.defaultRoleId), ''),
  };
}
