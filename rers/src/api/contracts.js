// Interaction lifecycle template short names → status label
export const INTERACTION_TEMPLATES = Object.freeze({
  DraftInteraction:      'Draft',
  InProgressInteraction: 'InProgress',
  CompletedInteraction:  'Completed',
  DiscardedInteraction:  'Discarded',
});

// Role template short names → role type string
export const ROLE_TEMPLATES = Object.freeze({
  AgentRole: 'Agent',
  BuyerRole: 'Buyer',
});

// Interaction configuration template short names — these implement Configuration interface
// AND have a CreateObservations choice. RoleConfiguration is excluded (it only has CreateRole).
export const CONFIGURATION_TEMPLATES = Object.freeze({
  PropertyPurchaseConfiguration: true,
});

// Feedback request template short names
export const FEEDBACK_REQUEST_TEMPLATES = Object.freeze({
  PropertyPurchaseFeedbackRequest: true,
});

// Submitted feedback template short names
export const FEEDBACK_TEMPLATES = Object.freeze({
  PropertyPurchaseFeedback: true,
});

// Module paths used to derive full package-qualified IDs at runtime from a known package prefix.
// Key is the template/interface short name; value is "Module.Path:EntityName".
export const KNOWN_MODULE_PATHS = Object.freeze({
  DraftInteraction:                    'Reputation.Interaction.Draft:DraftInteraction',
  InProgressInteraction:               'Reputation.Interaction.InProgress:InProgressInteraction',
  CompletedInteraction:                'Reputation.Interaction.Completed:CompletedInteraction',
  DiscardedInteraction:                'Reputation.Interaction.Discarded:DiscardedInteraction',
  PropertyPurchaseConfiguration:       'Reputation.PropertyPurchase.Configuration:PropertyPurchaseConfiguration',
  PropertyPurchaseFeedbackRequest:     'Reputation.PropertyPurchase.Feedback:PropertyPurchaseFeedbackRequest',
  PropertyPurchaseFeedback:            'Reputation.PropertyPurchase.Feedback:PropertyPurchaseFeedback',
  ConfigurationInterface:              'Reputation.Interface.Configuration:Configuration',
});

// Legacy template short names used by Contracts.jsx
export const TEMPLATES = Object.freeze({
  PARTY_ROLE:  'PartyRole',
  INTERACTION: 'CompletedInteraction',
  FEEDBACK:    'Feedback',
});

// ─── DAML Map field schema (used by LedgerClient to serialize map fields before submission)
export const PAYLOAD_MAPS = Object.freeze({});

export const CHOICE_MAPS = Object.freeze({});
