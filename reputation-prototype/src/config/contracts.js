/**
 * Centralized contract definitions
 * Single source of truth for all contract templates, fields, samples, and configurations
 */

// Template identifiers
export const TEMPLATE_IDS = Object.freeze({
  REPUTATION_CONFIGURATION: 'ReputationConfiguration',
  COMPLETED_INTERACTION: 'CompletedInteraction',
  FEEDBACK: 'Feedback',
});

export const TEMPLATE_TITLES = Object.freeze({
  [TEMPLATE_IDS.REPUTATION_CONFIGURATION]: 'Reputation Configuration',
  [TEMPLATE_IDS.COMPLETED_INTERACTION]: 'Completed Interaction',
  [TEMPLATE_IDS.FEEDBACK]: 'Feedback',
});

// Default values
export const DEFAULTS = Object.freeze({
  OPERATOR: 'Operator',
  CONFIG_ID: 'REAL_ESTATE_CONFIG',
  DEFAULT_ROLE: 'AGENT',
  PHASE: 'FINAL',
});

// Field definition factory
function field(type, key, options = {}) {
  return {
    key,
    path: options.path || key,
    type,
    required: options.required !== false,
    ...(options.aliases && { aliases: options.aliases }),
    ...(options.defaultValue !== undefined && { defaultValue: options.defaultValue }),
  };
}

// Operators field (reused across contracts)
const operatorField = (key = 'operator') => 
  field('string', key, { defaultValue: DEFAULTS.OPERATOR });

// Component definition (reused in configs)
const COMPONENT_DEF = {
  Reliability: { 
    description: 'Completes transactions successfully', 
    initialValue: 70,
  },
  DocumentationAccuracy: { 
    description: 'Correct and timely document handling', 
    initialValue: 70,
  },
  Efficiency: { 
    description: 'Speed of transaction completion', 
    initialValue: 70,
  },
  Communication: { 
    description: 'Communication Quality', 
    initialValue: 50,
  },
};

// Role weights by version
const ROLE_WEIGHTS = Object.freeze({
  v1: {
    AGENT: { Reliability: 0.2, DocumentationAccuracy: 0.4, Efficiency: 0.4 },
    BUYER: { Reliability: 0.5, DocumentationAccuracy: 0.25, Efficiency: 0.25 },
  },
  v2: {
    AGENT: { Reliability: 0.2, DocumentationAccuracy: 0.2, Efficiency: 0.2, Communication: 0.4 },
    BUYER: { Reliability: 0.5, DocumentationAccuracy: 0.2, Efficiency: 0.2, Communication: 0.1 },
  },
});

// Interaction types and rules
const INTERACTION_TYPES = {
  SELL: {
    description: 'Property sale workflow',
    rules: [
      {
        component: 'Reliability',
        condition: { field: 'closedSuccessfully', op: 'EQ', value: 1 },
        rating: 85,
      },
      {
        component: 'Reliability',
        condition: { field: 'cancelled', op: 'EQ', value: 1 },
        rating: 50,
      },
      {
        component: 'DocumentationAccuracy',
        condition: { field: 'documentRejections', op: 'GT', value: 2 },
        rating: 60,
      },
      {
        component: 'DocumentationAccuracy',
        condition: { field: 'documentRejections', op: 'EQ', value: 0 },
        rating: 85,
      },
    ],
  },
};

// Build components array for config
function buildComponents(componentIds) {
  return componentIds.map(id => ({
    componentId: id,
    description: COMPONENT_DEF[id]?.description || '',
    initialValue: COMPONENT_DEF[id]?.initialValue || 70,
  }));
}

// Build role weights array
function buildRoleWeights(version) {
  const weights = ROLE_WEIGHTS[version] || ROLE_WEIGHTS.v1;
  return Object.entries(weights).map(([roleId, componentWeights]) => ({
    roleId,
    componentWeights,
  }));
}

// Build interaction types with rules
function buildInteractionTypes() {
  return Object.entries(INTERACTION_TYPES).map(([typeId, config]) => ({
    interactionTypeId: typeId,
    description: config.description,
    ratingRules: config.rules.map(rule => ({
      componentId: rule.component,
      conditionField: rule.condition.field,
      conditionOperator: rule.condition.op,
      conditionValue: rule.condition.value,
      assignedRating: rule.rating,
    })),
  }));
}

// Sample payloads
export const SAMPLES = Object.freeze({
  config: {
    operator: DEFAULTS.OPERATOR,
    configId: DEFAULTS.CONFIG_ID,
    version: 1,
    activationTime: '2026-03-01T00:00:00Z',
    systemParameters: {
      reputationFloor: 0,
      reputationCeiling: 100,
    },
    components: buildComponents(['Reliability', 'DocumentationAccuracy', 'Efficiency']),
    roleWeights: buildRoleWeights('v1'),
    interactionTypes: buildInteractionTypes(),
    partyRoles: {
      AGENT_ALICE: 'AGENT',
      BUYER_BOB: 'BUYER',
      SELLER_CAROL: 'BUYER',
    },
    defaultRoleId: DEFAULTS.DEFAULT_ROLE,
  },
  interaction: {
    platform: DEFAULTS.OPERATOR,
    participants: ['AGENT_ALICE', 'BUYER_BOB'],
    interactionType: 'SELL',
    outcome: {
      closedSuccessfully: 1,
      cancelled: 0,
      documentRejections: 0,
    },
    completedAt: '2026-02-27T10:00:00Z',
    configVersion: 1,
    evaluated: false,
  },
  feedback: {
    platform: DEFAULTS.OPERATOR,
    interactionId: 'sell_001',
    from: 'BUYER_BOB',
    to: 'AGENT_ALICE',
    componentRatings: {
      Reliability: 92,
      DocumentationAccuracy: 88,
      Efficiency: 84,
    },
    submittedAt: '2026-02-27T11:00:00Z',
    phase: DEFAULTS.PHASE,
  },
});

// Contract registry with field definitions
export const CONTRACTS = Object.freeze({
  [TEMPLATE_IDS.REPUTATION_CONFIGURATION]: {
    templateId: TEMPLATE_IDS.REPUTATION_CONFIGURATION,
    title: TEMPLATE_TITLES[TEMPLATE_IDS.REPUTATION_CONFIGURATION],
    fields: [
      operatorField('operator'),
      field('string', 'configId', { defaultValue: DEFAULTS.CONFIG_ID }),
      field('number', 'version', { defaultValue: 1 }),
      field('isoDate', 'activationTime'),
      field('object', 'systemParameters'),
      field('array', 'components'),
      field('array', 'roleWeights'),
      field('array', 'interactionTypes', { aliases: ['iinteractionTypes'] }),
      field('object', 'partyRoles', { required: false, defaultValue: {} }),
      field('string', 'defaultRoleId', { required: false, defaultValue: DEFAULTS.DEFAULT_ROLE }),
    ],
    sample: SAMPLES.config,
  },
  [TEMPLATE_IDS.COMPLETED_INTERACTION]: {
    templateId: TEMPLATE_IDS.COMPLETED_INTERACTION,
    title: TEMPLATE_TITLES[TEMPLATE_IDS.COMPLETED_INTERACTION],
    fields: [
      operatorField('platform'),
      field('array', 'participants'),
      field('string', 'interactionType'),
      field('object', 'outcome'),
      field('isoDate', 'completedAt'),
      field('number', 'configVersion', { defaultValue: 1 }),
      field('boolean', 'evaluated', { defaultValue: false }),
    ],
    sample: SAMPLES.interaction,
  },
  [TEMPLATE_IDS.FEEDBACK]: {
    templateId: TEMPLATE_IDS.FEEDBACK,
    title: TEMPLATE_TITLES[TEMPLATE_IDS.FEEDBACK],
    fields: [
      operatorField('platform'),
      field('string', 'interactionId'),
      field('string', 'from'),
      field('string', 'to'),
      field('numberMap', 'componentRatings'),
      field('isoDate', 'submittedAt'),
      field('string', 'phase', { defaultValue: DEFAULTS.PHASE }),
    ],
    sample: SAMPLES.feedback,
  },
});

export function getDefinition(templateId) {
  return CONTRACTS[templateId] || null;
}

export function listDefinitions() {
  return Object.values(CONTRACTS);
}

export function cloneSample(templateId) {
  const def = getDefinition(templateId);
  return def ? JSON.parse(JSON.stringify(def.sample)) : {};
}
