export function issueReputationCredential({ subject, configuration, disclosedComponentIds = [] }) {
  const includeAll = disclosedComponentIds.length === 0;

  const disclosedComponents = Object.fromEntries(
    Object.entries(subject.components)
      .filter(([componentId]) => includeAll || disclosedComponentIds.includes(componentId))
      .map(([componentId, component]) => [
        componentId,
        {
          value: component.value,
          interactionCount: component.interactionCount,
        },
      ])
  );

  return {
    id: `vc:reputation:${subject.party}:${Date.now()}`,
    type: ['VerifiableCredential', 'ReputationCredential'],
    issuer: configuration.operator,
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: subject.party,
      roleId: subject.roleId,
      overallScore: subject.overallScore,
      components: disclosedComponents,
      configId: configuration.configId,
      configVersion: configuration.version,
    },
    proof: {
      type: 'MockProof',
      purpose: 'prototype-only',
    },
  };
}
