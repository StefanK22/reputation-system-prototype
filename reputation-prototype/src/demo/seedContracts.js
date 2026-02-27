import { defaultReputationConfiguration } from '../contracts/defaultConfig.js';
import { TEMPLATE_IDS } from '../contracts/templateIds.js';

export function seedContracts(ledger) {
  ledger.publish(TEMPLATE_IDS.REPUTATION_CONFIGURATION, defaultReputationConfiguration);

  ledger.publish(TEMPLATE_IDS.COMPLETED_INTERACTION, {
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
  });

  ledger.publish(TEMPLATE_IDS.FEEDBACK, {
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
  });

  ledger.publish(TEMPLATE_IDS.FEEDBACK, {
    platform: 'Operator',
    interactionId: 'sell_001',
    from: 'AGENT_ALICE',
    to: 'BUYER_BOB',
    componentRatings: {
      Reliability: 80,
      DocumentationAccuracy: 75,
      Efficiency: 78,
    },
    submittedAt: '2026-02-27T11:05:00Z',
    phase: 'FINAL',
  });
}
