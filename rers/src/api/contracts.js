// Browser-compatible subset of src/contracts.js.
// TEMPLATES and CHOICES are plain string constants — no Node.js or codegen deps.
// TEMPLATE_IDS are not included: full IDs are discovered at runtime from the
// ledger via ledger.queryAll() which returns rawTemplateId on each contract.

export const TEMPLATES = Object.freeze({
  CONFIG:      'ReputationConfiguration',
  INTERACTION: 'CompletedInteraction',
  FEEDBACK:    'Feedback',
  TOKEN:       'ReputationToken',
  PARTY_ROLE:  'PartyRole',
});

export const CHOICES = Object.freeze({
  CONFIG:      { UPDATE: 'UpdateConfig',         ARCHIVE: 'Archive' },
  INTERACTION: { SET_PROCESSED: 'SetProcessed',  ARCHIVE: 'Archive' },
  FEEDBACK:    { SET_VISIBILITY: 'SetVisibility', ARCHIVE: 'Archive' },
  TOKEN:       { UPDATE_SCORE: 'UpdateScore',    ARCHIVE: 'Archive' },
  PARTY_ROLE:  { ARCHIVE: 'Archive' },
});

// ─── Daml Map field schema (mirrors src/contracts.js PAYLOAD_MAPS / CHOICE_MAPS)
export const PAYLOAD_MAPS = Object.freeze({
  [TEMPLATES.CONFIG]:      { roleWeights: { componentWeights: '*' } },
  [TEMPLATES.TOKEN]:       { components: '*' },
  [TEMPLATES.INTERACTION]: { outcome: '*' },
  [TEMPLATES.FEEDBACK]:    { ratings: '*' },
});

export const CHOICE_MAPS = Object.freeze({
  [CHOICES.TOKEN.UPDATE_SCORE]:  { newComponents: '*' },
  [CHOICES.CONFIG.UPDATE]:       { newRoleWeights: { componentWeights: '*' } },
});

export const REQUIRED_FIELDS = Object.freeze({
  [TEMPLATES.CONFIG]:      ['operator', 'configId', 'activatedAt'],
  [TEMPLATES.INTERACTION]: ['operator', 'interactionId', 'interactionType', 'participants', 'completedAt'],
  [TEMPLATES.FEEDBACK]:    ['operator', 'interactionId', 'from', 'to', 'ratings', 'submittedAt'],
  [TEMPLATES.TOKEN]:       ['operator', 'owner'],
  [TEMPLATES.PARTY_ROLE]:  ['operator', 'party', 'roleId'],
});
