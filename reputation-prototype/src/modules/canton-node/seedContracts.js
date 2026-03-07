/**
 * Seed data for contract ledger
 * Publishes sample contracts for demonstration
 */

import { TEMPLATE_IDS, cloneSample } from '../../config/contracts.js';

export function seedContracts(ledger) {
  const config = cloneSample(TEMPLATE_IDS.REPUTATION_CONFIGURATION);
  const interaction = cloneSample(TEMPLATE_IDS.COMPLETED_INTERACTION);
  const feedbackBuyer = cloneSample(TEMPLATE_IDS.FEEDBACK);
  const feedbackAgent = cloneSample(TEMPLATE_IDS.FEEDBACK);

  feedbackAgent.from = 'AGENT_ALICE';
  feedbackAgent.to = 'BUYER_BOB';
  feedbackAgent.componentRatings = {
    Reliability: 80,
    DocumentationAccuracy: 75,
    Efficiency: 78,
  };
  feedbackAgent.submittedAt = '2026-02-27T11:05:00Z';

  ledger.publish(TEMPLATE_IDS.REPUTATION_CONFIGURATION, config);
  ledger.publish(TEMPLATE_IDS.COMPLETED_INTERACTION, interaction);
  ledger.publish(TEMPLATE_IDS.FEEDBACK, feedbackBuyer);
  ledger.publish(TEMPLATE_IDS.FEEDBACK, feedbackAgent);

  // Seed a new configuration version with additional components
  const nextConfig = cloneSample(TEMPLATE_IDS.REPUTATION_CONFIGURATION);
  nextConfig.version = 2;
  
  // Add Communication component if not present
  const hasComm = nextConfig.components.some(c => c.componentId === 'Communication');
  if (!hasComm) {
    nextConfig.components.push({
      componentId: 'Communication',
      description: 'Communication Quality',
      initialValue: 50,
    });
  }

  // Update role weights for v2
  nextConfig.roleWeights = [
    {
      roleId: 'AGENT',
      componentWeights: {
        Reliability: 0.2,
        DocumentationAccuracy: 0.2,
        Efficiency: 0.2,
        Communication: 0.4,
      },
    },
    {
      roleId: 'BUYER',
      componentWeights: {
        Reliability: 0.5,
        DocumentationAccuracy: 0.2,
        Efficiency: 0.2,
        Communication: 0.1,
      },
    },
  ];

  ledger.publish(TEMPLATE_IDS.REPUTATION_CONFIGURATION, nextConfig);
}

