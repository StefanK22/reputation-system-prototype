import { cloneContractSample, TEMPLATE_IDS } from '../shared/contracts/registry.js';

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
  const newconfig = cloneContractSample(TEMPLATE_IDS.REPUTATION_CONFIGURATION);
  newconfig.version = 2;
  newconfig.components.push({ 
    componentId: "Communication",
    description: "Communication Quality",
    initialValue: 50,
  });
  newconfig.roleWeights = [
    {
      roleId: "AGENT",
      componentWeights: {
        Reliability: 0.2,
        DocumentationAccuracy: 0.2,
        Efficiency: 0.2,
        Communication: 0.4
      }
    },
    {
      roleId: "BUYER",
      componentWeights: {
        Reliability: 0.5,
        DocumentationAccuracy: 0.2,
        Efficiency: 0.2,
        Communication: 0.1
      }
    }
  ];
  ledger.publish(TEMPLATE_IDS.REPUTATION_CONFIGURATION, newconfig);
}
