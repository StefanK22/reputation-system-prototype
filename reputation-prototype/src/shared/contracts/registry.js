import { CONTRACT_DEFAULTS, TEMPLATE_IDS, TEMPLATE_TITLES } from './constants.js';

function defineField({ key, path = key, type, required = true, defaultValue, aliases }) {
  return {
    key,
    path,
    type,
    required,
    ...(aliases ? { aliases } : {}),
    ...(defaultValue !== undefined ? { defaultValue } : {}),
  };
}

const field = {
  string: (key, options = {}) => defineField({ key, type: 'string', ...options }),
  number: (key, options = {}) => defineField({ key, type: 'number', ...options }),
  boolean: (key, options = {}) => defineField({ key, type: 'boolean', ...options }),
  isoDate: (key, options = {}) => defineField({ key, type: 'isoDate', ...options }),
  array: (key, options = {}) => defineField({ key, type: 'array', ...options }),
  object: (key, options = {}) => defineField({ key, type: 'object', ...options }),
  numberMap: (key, options = {}) => defineField({ key, type: 'numberMap', ...options }),
};

const operatorField = (key) =>
  field.string(key, {
    defaultValue: CONTRACT_DEFAULTS.OPERATOR,
  });

const reputationConfigurationSample = {
  operator: CONTRACT_DEFAULTS.OPERATOR,
  configId: CONTRACT_DEFAULTS.CONFIG_ID,
  version: 1,
  activationTime: '2026-03-01T00:00:00Z',
  systemParameters: {
    reputationFloor: 0,
    reputationCeiling: 100,
  },
  components: [
    {
      componentId: 'Reliability',
      description: 'Completes transactions successfully',
      initialValue: 70,
    },
    {
      componentId: 'DocumentationAccuracy',
      description: 'Correct and timely document handling',
      initialValue: 70,
    },
    {
      componentId: 'Efficiency',
      description: 'Speed of transaction completion',
      initialValue: 70,
    },
  ],
  roleWeights: [
    {
      roleId: 'AGENT',
      componentWeights: {
        Reliability: 0.2,
        DocumentationAccuracy: 0.4,
        Efficiency: 0.4,
      },
    },
    {
      roleId: 'BUYER',
      componentWeights: {
        Reliability: 0.5,
        DocumentationAccuracy: 0.25,
        Efficiency: 0.25,
      },
    },
  ],
  interactionTypes: [
    {
      interactionTypeId: 'SELL',
      description: 'Property sale workflow',
      ratingRules: [
        {
          componentId: 'Reliability',
          conditionField: 'closedSuccessfully',
          conditionOperator: 'EQ',
          conditionValue: 1,
          assignedRating: 85,
        },
        {
          componentId: 'Reliability',
          conditionField: 'cancelled',
          conditionOperator: 'EQ',
          conditionValue: 1,
          assignedRating: 50,
        },
        {
          componentId: 'DocumentationAccuracy',
          conditionField: 'documentRejections',
          conditionOperator: 'GT',
          conditionValue: 2,
          assignedRating: 60,
        },
        {
          componentId: 'DocumentationAccuracy',
          conditionField: 'documentRejections',
          conditionOperator: 'EQ',
          conditionValue: 0,
          assignedRating: 85,
        },
      ],
    },
  ],
  partyRoles: {
    AGENT_ALICE: 'AGENT',
    BUYER_BOB: 'BUYER',
    SELLER_CAROL: 'BUYER',
  },
  defaultRoleId: CONTRACT_DEFAULTS.DEFAULT_ROLE_ID,
};

const completedInteractionSample = {
  platform: CONTRACT_DEFAULTS.OPERATOR,
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
};

const feedbackSample = {
  platform: CONTRACT_DEFAULTS.OPERATOR,
  interactionId: 'sell_001',
  from: 'BUYER_BOB',
  to: 'AGENT_ALICE',
  componentRatings: {
    Reliability: 92,
    DocumentationAccuracy: 88,
    Efficiency: 84,
  },
  submittedAt: '2026-02-27T11:00:00Z',
  phase: CONTRACT_DEFAULTS.INTERACTION_PHASE,
};

export const CONTRACT_REGISTRY = Object.freeze({
  [TEMPLATE_IDS.REPUTATION_CONFIGURATION]: {
    templateId: TEMPLATE_IDS.REPUTATION_CONFIGURATION,
    title: TEMPLATE_TITLES[TEMPLATE_IDS.REPUTATION_CONFIGURATION],
    fields: [
      operatorField('operator'),
      field.string('configId', { defaultValue: CONTRACT_DEFAULTS.CONFIG_ID }),
      field.number('version', { defaultValue: 1 }),
      field.isoDate('activationTime'),
      field.object('systemParameters'),
      field.array('components'),
      field.array('roleWeights'),
      field.array('interactionTypes', { aliases: ['iinteractionTypes'] }),
      field.object('partyRoles', { required: false, defaultValue: {} }),
      field.string('defaultRoleId', { required: false, defaultValue: CONTRACT_DEFAULTS.DEFAULT_ROLE_ID }),
    ],
    samplePayload: reputationConfigurationSample,
  },
  [TEMPLATE_IDS.COMPLETED_INTERACTION]: {
    templateId: TEMPLATE_IDS.COMPLETED_INTERACTION,
    title: TEMPLATE_TITLES[TEMPLATE_IDS.COMPLETED_INTERACTION],
    fields: [
      operatorField('platform'),
      field.array('participants'),
      field.string('interactionType'),
      field.object('outcome'),
      field.isoDate('completedAt'),
      field.number('configVersion', { defaultValue: 1 }),
      field.boolean('evaluated', { defaultValue: false }),
    ],
    samplePayload: completedInteractionSample,
  },
  [TEMPLATE_IDS.FEEDBACK]: {
    templateId: TEMPLATE_IDS.FEEDBACK,
    title: TEMPLATE_TITLES[TEMPLATE_IDS.FEEDBACK],
    fields: [
      operatorField('platform'),
      field.string('interactionId'),
      field.string('from'),
      field.string('to'),
      field.numberMap('componentRatings'),
      field.isoDate('submittedAt'),
      field.string('phase', { defaultValue: CONTRACT_DEFAULTS.INTERACTION_PHASE }),
    ],
    samplePayload: feedbackSample,
  },
});

export function getContractDefinition(templateId) {
  return CONTRACT_REGISTRY[templateId] || null;
}

export function listContractDefinitions() {
  return Object.values(CONTRACT_REGISTRY);
}

export function cloneContractSample(templateId) {
  const definition = getContractDefinition(templateId);
  if (!definition) {
    return {};
  }

  return JSON.parse(JSON.stringify(definition.samplePayload));
}

export { TEMPLATE_IDS, TEMPLATE_TITLES, CONTRACT_DEFAULTS };
