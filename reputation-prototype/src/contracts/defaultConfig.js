export const defaultReputationConfiguration = {
  operator: 'Operator',
  configId: 'REAL_ESTATE_CONFIG',
  version: 1,
  activationTime: '2026-01-01T00:00:00Z',
  systemParameters: {
    reputationFloor: 0,
    reputationCeiling: 100,
    sensitivityK: 2,
  },
  components: [
    {
      componentId: 'Reliability',
      description: 'Completes transactions successfully',
      initialValue: 70,
      minValue: 0,
      maxValue: 100,
    },
    {
      componentId: 'DocumentationAccuracy',
      description: 'Correct and timely document handling',
      initialValue: 70,
      minValue: 0,
      maxValue: 100,
    },
    {
      componentId: 'Efficiency',
      description: 'Speed of transaction completion',
      initialValue: 70,
      minValue: 0,
      maxValue: 100,
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
