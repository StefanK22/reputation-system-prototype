// Interaction lifecycle template short names → status label
export const INTERACTION_TEMPLATES = Object.freeze({
  DraftInteraction:      'Draft',
  InProgressInteraction: 'InProgress',
  CompletedInteraction:  'Completed',
  DiscardedInteraction:  'Discarded',
});

// Role template short names → role type string
export const ROLE_TEMPLATES = Object.freeze({
  AgentRole:    'Agent',
  BuyerRole:    'Buyer',
  LandlordRole: 'Landlord',
  TenantRole:   'Tenant',
});

// Interaction configuration template short names — these implement Configuration interface
// AND have a CreateObservations choice. RoleConfiguration is excluded (it only has CreateRole).
export const CONFIGURATION_TEMPLATES = Object.freeze({
  PropertyPurchaseConfiguration: true,
  RentalAgreementConfiguration:  true,
});

// Feedback request template short names
export const FEEDBACK_REQUEST_TEMPLATES = Object.freeze({
  PropertyPurchaseFeedbackRequest:    true,
  RentalAgreementFeedbackRequest:     true,
});

// Submitted feedback template short names
export const FEEDBACK_TEMPLATES = Object.freeze({
  PropertyPurchaseFeedback:           true,
  RentalAgreementLandlordFeedback:    true,
  RentalAgreementTenantFeedback:      true,
});

// Module paths used to derive full package-qualified IDs at runtime from a known package prefix.
// Key is the template/interface short name; value is "Module.Path:EntityName".
export const KNOWN_MODULE_PATHS = Object.freeze({
  DraftInteraction:                    'Reputation.Interaction.Draft:DraftInteraction',
  InProgressInteraction:               'Reputation.Interaction.InProgress:InProgressInteraction',
  CompletedInteraction:                'Reputation.Interaction.Completed:CompletedInteraction',
  DiscardedInteraction:                'Reputation.Interaction.Discarded:DiscardedInteraction',
  ScoringConfiguration:                'Reputation.Configuration.Scoring:ScoringConfiguration',
  RoleConfiguration:                   'Reputation.Role.Configuration:RoleConfiguration',
  AgentRole:                           'Reputation.Role.Agent:AgentRole',
  BuyerRole:                           'Reputation.Role.Buyer:BuyerRole',
  LandlordRole:                        'Reputation.Role.Landlord:LandlordRole',
  TenantRole:                          'Reputation.Role.Tenant:TenantRole',
  PropertyPurchaseConfiguration:       'Reputation.PropertyPurchase.Configuration:PropertyPurchaseConfiguration',
  PropertyPurchaseFeedbackRequest:     'Reputation.PropertyPurchase.Feedback:PropertyPurchaseFeedbackRequest',
  PropertyPurchaseFeedback:            'Reputation.PropertyPurchase.Feedback:PropertyPurchaseFeedback',
  RentalAgreementConfiguration:        'Reputation.RentalAgreement.Configuration:RentalAgreementConfiguration',
  RentalAgreementFeedbackRequest:      'Reputation.RentalAgreement.FeedbackRequest:RentalAgreementFeedbackRequest',
  RentalAgreementLandlordFeedback:     'Reputation.RentalAgreement.Feedback:RentalAgreementLandlordFeedback',
  RentalAgreementTenantFeedback:       'Reputation.RentalAgreement.Feedback:RentalAgreementTenantFeedback',
  ConfigurationInterface:              'Reputation.Interface.Configuration:Configuration',
  DisclosureRequest:                   'Reputation.Disclosure:DisclosureRequest',
  ConfigurationDisclosure:             'Reputation.Disclosure:ConfigurationDisclosure',
});

// Legacy template short names used by Contracts.jsx
export const TEMPLATES = Object.freeze({
  PARTY_ROLE:  'PartyRole',
  INTERACTION: 'CompletedInteraction',
  FEEDBACK:    'Feedback',
});

// Daml package name (from daml.yaml). Used to build package-name-qualified template IDs,
// which Canton's HTTP API prefers over the deprecated hex package-ID form.
export const DAML_PACKAGE_NAME = 'reputation';

// ─── DAML Map field schema (used by LedgerClient to serialize map fields before submission)
export const PAYLOAD_MAPS = Object.freeze({});

export const CHOICE_MAPS = Object.freeze({});
