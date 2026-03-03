const reputationConfigurationSample = {
  operator: 'Operator',
  configId: 'REAL_ESTATE_CONFIG',
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
  defaultRoleId: 'AGENT',
};

const completedInteractionSample = {
  platform: 'Operator',
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
  platform: 'Operator',
  interactionId: 'sell_001',
  from: 'BUYER_BOB',
  to: 'AGENT_ALICE',
  componentRatings: {
    Reliability: 92,
    DocumentationAccuracy: 88,
    Efficiency: 84,
  },
  submittedAt: '2026-02-27T11:00:00Z',
  phase: 'FINAL',
};

export const TEMPLATE_IDS = Object.freeze({
  REPUTATION_CONFIGURATION: 'ReputationConfiguration',
  COMPLETED_INTERACTION: 'CompletedInteraction',
  FEEDBACK: 'Feedback',
});

export const CONTRACT_REGISTRY = Object.freeze({
  [TEMPLATE_IDS.REPUTATION_CONFIGURATION]: {
    templateId: TEMPLATE_IDS.REPUTATION_CONFIGURATION,
    title: 'Reputation Configuration',
    fields: [
      {
        key: 'operator',
        path: 'operator',
        type: 'string',
        required: true,
        defaultValue: 'Operator',
      },
      {
        key: 'configId',
        path: 'configId',
        type: 'string',
        required: true,
        defaultValue: 'REAL_ESTATE_CONFIG',
      },
      {
        key: 'version',
        path: 'version',
        type: 'number',
        required: true,
        defaultValue: 1,
      },
      {
        key: 'activationTime',
        path: 'activationTime',
        type: 'isoDate',
        required: true,
      },
      {
        key: 'systemParameters',
        path: 'systemParameters',
        type: 'object',
        required: true,
      },
      {
        key: 'components',
        path: 'components',
        type: 'array',
        required: true,
      },
      {
        key: 'roleWeights',
        path: 'roleWeights',
        type: 'array',
        required: true,
      },
      {
        key: 'interactionTypes',
        path: 'interactionTypes',
        aliases: ['iinteractionTypes'],
        type: 'array',
        required: true,
      },
      {
        key: 'partyRoles',
        path: 'partyRoles',
        type: 'object',
        required: false,
        defaultValue: {},
      },
      {
        key: 'defaultRoleId',
        path: 'defaultRoleId',
        type: 'string',
        required: false,
        defaultValue: 'AGENT',
      },
    ],
    samplePayload: reputationConfigurationSample,
  },
  [TEMPLATE_IDS.COMPLETED_INTERACTION]: {
    templateId: TEMPLATE_IDS.COMPLETED_INTERACTION,
    title: 'Completed Interaction',
    fields: [
      {
        key: 'platform',
        path: 'platform',
        type: 'string',
        required: true,
        defaultValue: 'Operator',
      },
      {
        key: 'participants',
        path: 'participants',
        type: 'array',
        required: true,
      },
      {
        key: 'interactionType',
        path: 'interactionType',
        type: 'string',
        required: true,
      },
      {
        key: 'outcome',
        path: 'outcome',
        type: 'object',
        required: true,
      },
      {
        key: 'completedAt',
        path: 'completedAt',
        type: 'isoDate',
        required: true,
      },
      {
        key: 'configVersion',
        path: 'configVersion',
        type: 'number',
        required: true,
        defaultValue: 1,
      },
      {
        key: 'evaluated',
        path: 'evaluated',
        type: 'boolean',
        required: true,
        defaultValue: false,
      },
    ],
    samplePayload: completedInteractionSample,
  },
  [TEMPLATE_IDS.FEEDBACK]: {
    templateId: TEMPLATE_IDS.FEEDBACK,
    title: 'Feedback',
    fields: [
      {
        key: 'platform',
        path: 'platform',
        type: 'string',
        required: true,
        defaultValue: 'Operator',
      },
      {
        key: 'interactionId',
        path: 'interactionId',
        type: 'string',
        required: true,
      },
      {
        key: 'from',
        path: 'from',
        type: 'string',
        required: true,
      },
      {
        key: 'to',
        path: 'to',
        type: 'string',
        required: true,
      },
      {
        key: 'componentRatings',
        path: 'componentRatings',
        type: 'numberMap',
        required: true,
      },
      {
        key: 'submittedAt',
        path: 'submittedAt',
        type: 'isoDate',
        required: true,
      },
      {
        key: 'phase',
        path: 'phase',
        type: 'string',
        required: true,
        defaultValue: 'FINAL',
      },
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
