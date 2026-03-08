import { TEMPLATES, cloneSample } from '../../contracts.js';

export function seed(ledger) {
  const config      = cloneSample(TEMPLATES.CONFIG);
  const interaction = cloneSample(TEMPLATES.INTERACTION);
  const fbBuyer     = cloneSample(TEMPLATES.FEEDBACK);
  const fbAgent     = { ...cloneSample(TEMPLATES.FEEDBACK), from: 'AGENT_ALICE', to: 'BUYER_BOB', componentRatings: { Reliability: 80, DocumentationAccuracy: 75, Efficiency: 78 }, submittedAt: '2026-02-27T11:05:00Z' };

  ledger.publish(TEMPLATES.CONFIG,      config);
  ledger.publish(TEMPLATES.INTERACTION, interaction);
  ledger.publish(TEMPLATES.FEEDBACK,    fbBuyer);
  ledger.publish(TEMPLATES.FEEDBACK,    fbAgent);

  // Config v2 adds Communication component
  const config2 = { ...cloneSample(TEMPLATES.CONFIG), version: 2 };
  if (!config2.components.some((c) => c.componentId === 'Communication'))
    config2.components.push({ componentId: 'Communication', description: 'Communication Quality', initialValue: 50 });

  config2.roleWeights = [
    { roleId: 'AGENT', componentWeights: { Reliability: 0.2, DocumentationAccuracy: 0.2, Efficiency: 0.2, Communication: 0.4 } },
    { roleId: 'BUYER', componentWeights: { Reliability: 0.5, DocumentationAccuracy: 0.2, Efficiency: 0.2, Communication: 0.1 } },
  ];
  ledger.publish(TEMPLATES.CONFIG, config2);
}