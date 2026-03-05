import { TEMPLATE_IDS } from '../../shared/contracts/constants.js';
import { cloneContractSample } from '../../shared/contracts/registry.js';

const COMMUNICATION_COMPONENT = Object.freeze({
  componentId: 'Communication',
  description: 'Communication Quality',
  initialValue: 50,
});

const ROLE_WEIGHTS_V2 = Object.freeze({
  AGENT: {
    Reliability: 0.2,
    DocumentationAccuracy: 0.2,
    Efficiency: 0.2,
    Communication: 0.4,
  },
  BUYER: {
    Reliability: 0.5,
    DocumentationAccuracy: 0.2,
    Efficiency: 0.2,
    Communication: 0.1,
  },
});

export function seedContracts(ledger) {
  const defaultConfiguration = cloneContractSample(TEMPLATE_IDS.REPUTATION_CONFIGURATION);
  const completedInteraction = cloneContractSample(TEMPLATE_IDS.COMPLETED_INTERACTION);
  const feedbackFromBuyer = cloneContractSample(TEMPLATE_IDS.FEEDBACK);
  const feedbackFromAgent = cloneContractSample(TEMPLATE_IDS.FEEDBACK);

  feedbackFromAgent.from = 'AGENT_ALICE';
  feedbackFromAgent.to = 'BUYER_BOB';
  feedbackFromAgent.componentRatings = {
    Reliability: 80,
    DocumentationAccuracy: 75,
    Efficiency: 78,
  };
  feedbackFromAgent.submittedAt = '2026-02-27T11:05:00Z';

  ledger.publish(TEMPLATE_IDS.REPUTATION_CONFIGURATION, defaultConfiguration);
  ledger.publish(TEMPLATE_IDS.COMPLETED_INTERACTION, completedInteraction);
  ledger.publish(TEMPLATE_IDS.FEEDBACK, feedbackFromBuyer);
  ledger.publish(TEMPLATE_IDS.FEEDBACK, feedbackFromAgent);

  const nextConfiguration = cloneContractSample(TEMPLATE_IDS.REPUTATION_CONFIGURATION);
  nextConfiguration.version = 2;
  nextConfiguration.components.push({ ...COMMUNICATION_COMPONENT });
  nextConfiguration.roleWeights = Object.entries(ROLE_WEIGHTS_V2).map(([roleId, componentWeights]) => ({
    roleId,
    componentWeights: { ...componentWeights },
  }));

  ledger.publish(TEMPLATE_IDS.REPUTATION_CONFIGURATION, nextConfiguration);
}
