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

export const REQUIRED_FIELDS = Object.freeze({
  [TEMPLATES.CONFIG]:      ['operator', 'configId', 'activatedAt'],
  [TEMPLATES.INTERACTION]: ['operator', 'interactionId', 'interactionType', 'participants', 'completedAt'],
  [TEMPLATES.FEEDBACK]:    ['operator', 'interactionId', 'from', 'to', 'ratings', 'submittedAt'],
  [TEMPLATES.TOKEN]:       ['operator', 'owner'],
  [TEMPLATES.PARTY_ROLE]:  ['operator', 'party', 'roleId'],
});
