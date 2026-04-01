import { createRequire } from 'node:module';

const require        = createRequire(import.meta.url);
const { Reputation } = require('./codegen/reputation-0.0.1/lib/index.js');

// ─── Template name constants ──────────────────────────────────────────────────
// Short names used in switch statements and ledger.create() / ledger.exercise().

export const TEMPLATES = Object.freeze({
  CONFIG:      'ReputationConfiguration',
  INTERACTION: 'CompletedInteraction',
  FEEDBACK:    'Feedback',
  TOKEN:       'ReputationToken',
  PARTY_ROLE:  'PartyRole',
});

// ─── Full template IDs ────────────────────────────────────────────────────────
// Sourced directly from codegen — updates automatically on every `daml codegen js`.
// Use these whenever submitting commands to the Canton node.

export const TEMPLATE_IDS = Object.freeze({
  [TEMPLATES.CONFIG]:      Reputation.ReputationConfiguration.templateIdWithPackageId,
  [TEMPLATES.INTERACTION]: Reputation.CompletedInteraction.templateIdWithPackageId,
  [TEMPLATES.FEEDBACK]:    Reputation.Feedback.templateIdWithPackageId,
  [TEMPLATES.TOKEN]:       Reputation.ReputationToken.templateIdWithPackageId,
  [TEMPLATES.PARTY_ROLE]:  Reputation.PartyRole.templateIdWithPackageId,
});

// ─── Choice name constants ────────────────────────────────────────────────────

export const CHOICES = Object.freeze({
  CONFIG:      { UPDATE: 'UpdateConfig',       ARCHIVE: 'Archive' },
  INTERACTION: { SET_PROCESSED: 'SetProcessed', ARCHIVE: 'Archive' },
  FEEDBACK:    { SET_VISIBILITY: 'SetVisibility', ARCHIVE: 'Archive' },
  TOKEN:       { UPDATE_SCORE: 'UpdateScore',   ARCHIVE: 'Archive' },
  PARTY_ROLE:  { ARCHIVE: 'Archive' },
});

// ─── Daml Map field schema ────────────────────────────────────────────────────
// '*' marks a Daml DA.Map leaf (serialize as [[key,value],...]).
// A nested object marks a record or list whose items contain Map fields.
// Used by LedgerClient.create() / exercise() to encode payloads generically.

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

// ─── Primitive coercions ──────────────────────────────────────────────────────

function str(v, fallback = '')     { return typeof v === 'string' ? v : String(fallback); }
function int(v, fallback = 0)      { const n = parseInt(v, 10); return Number.isFinite(n) ? n : fallback; }
// Canton serializes Numeric(10) as a string e.g. "70.0000000000" — Number() handles both
function num(v, fallback = 0)      { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function bool(v, fallback = false) { return typeof v === 'boolean' ? v : fallback; }
function arr(v)                    { return Array.isArray(v) ? v : []; }
function numericMap(v) {
  if (Array.isArray(v)) return Object.fromEntries(v.map(([k, val]) => [String(k), num(val)]));
  if (!v || typeof v !== 'object') return {};
  return Object.fromEntries(Object.entries(v).map(([k, val]) => [String(k), num(val)]));
}
function toIso(v) {
  if (typeof v !== 'string') return new Date().toISOString();
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// ─── Sub-record normalizers ───────────────────────────────────────────────────
// One function per DAML record type in module.js.

function normalizeSystemParameters(p) {
  const s = (p && typeof p === 'object') ? p : {};
  return {
    reputationScoreFloor:   num(s.reputationScoreFloor,   0),
    reputationScoreCeiling: num(s.reputationScoreCeiling, 100),
  };
}

function normalizeComponentDefinition(p) {
  return {
    componentId:  str(p?.componentId),
    description:  str(p?.description),
    initialValue: num(p?.initialValue, 70),
  };
}

function normalizeRoleWeights(p) {
  return {
    roleId:           str(p?.roleId),
    componentWeights: numericMap(p?.componentWeights),
  };
}

function normalizeRatingRule(p) {
  return {
    componentId:         str(p?.componentId),
    conditionField:      str(p?.conditionField),
    conditionComparator: str(p?.conditionComparator, 'EQ').toUpperCase(),
    conditionValue:      num(p?.conditionValue, 0),
    ratingValue:         num(p?.ratingValue,    70),
  };
}

function normalizeInteractionType(p) {
  return {
    interactionTypeId: str(p?.interactionTypeId),
    description:       str(p?.description),
    ratingRules:       arr(p?.ratingRules).map(normalizeRatingRule),
  };
}

function normalizeComponent(p) {
  return {
    componentId:      str(p?.componentId),
    value:            num(p?.value, 0),
    interactionCount: int(p?.interactionCount, 0),
  };
}

// ─── Template normalizers ─────────────────────────────────────────────────────
// One function per DAML template. Field names match module.js exactly.
// Each function is also exported individually for use in the engine and db.

export function normalizeConfig(p) {
  return {
    operator:         str(p?.operator,  'Operator'),
    configId:         str(p?.configId,  'DEFAULT'),
    version:          int(p?.version,   1),
    activatedAt:      toIso(p?.activatedAt),
    systemParameters: normalizeSystemParameters(p?.systemParameters),
    components:       arr(p?.components).map(normalizeComponentDefinition),
    roleWeights:      arr(p?.roleWeights).map(normalizeRoleWeights),
    interactionTypes: arr(p?.interactionTypes).map(normalizeInteractionType),
  };
}

export function normalizeInteraction(p) {
  return {
    operator:        str(p?.operator,        'Operator'),
    interactionId:   str(p?.interactionId,   'unknown'),
    interactionType: str(p?.interactionType, 'UNKNOWN'),
    participants:    arr(p?.participants).map((x) => str(x)),
    outcome:         numericMap(p?.outcome),
    completedAt:     toIso(p?.completedAt),
    processed:       bool(p?.processed, false),
  };
}

export function normalizeFeedback(p) {
  return {
    operator:       str(p?.operator,      'Operator'),
    interactionId:  str(p?.interactionId, 'unknown'),
    from:           str(p?.from,          'UNKNOWN'),
    to:             str(p?.to,            'UNKNOWN'),
    ratings:        numericMap(p?.ratings),
    comments:       p?.comments ?? null,
    submittedAt:    toIso(p?.submittedAt),
    publicFeedback: bool(p?.publicFeedback, false),
  };
}

export function normalizeToken(p) {
  const raw = p?.components;
  const entries = Array.isArray(raw)
    ? raw.map(([k, v]) => [String(k), normalizeComponent(v)])
    : Object.entries(raw && typeof raw === 'object' ? raw : {}).map(([k, v]) => [String(k), normalizeComponent(v)]);
  return {
    operator:   str(p?.operator,  'Operator'),
    owner:      str(p?.owner,     'UNKNOWN'),
    score:      num(p?.score,     0),
    components: Object.fromEntries(entries),
    issuedAt:   toIso(p?.issuedAt),
    updateAt:   toIso(p?.updateAt),
  };
}

export function normalizePartyRole(p) {
  return {
    operator:   str(p?.operator,   'Operator'),
    party:      str(p?.party,      'UNKNOWN'),
    roleId:     str(p?.roleId,     'UNKNOWN'),
    assignedAt: toIso(p?.assignedAt),
  };
}

// ─── Generic normalize / validate ─────────────────────────────────────────────
// Used by the web app's /mock/contracts/:templateId route.

const NORMALIZERS = {
  [TEMPLATES.CONFIG]:      normalizeConfig,
  [TEMPLATES.INTERACTION]: normalizeInteraction,
  [TEMPLATES.FEEDBACK]:    normalizeFeedback,
  [TEMPLATES.TOKEN]:       normalizeToken,
  [TEMPLATES.PARTY_ROLE]:  normalizePartyRole,
};

// Required fields per template — the minimum the Canton node needs to accept a submission.
const REQUIRED_FIELDS = {
  [TEMPLATES.CONFIG]:      ['operator', 'configId', 'activatedAt'],
  [TEMPLATES.INTERACTION]: ['operator', 'interactionId', 'interactionType', 'participants', 'completedAt'],
  [TEMPLATES.FEEDBACK]:    ['operator', 'interactionId', 'from', 'to', 'ratings', 'submittedAt'],
  [TEMPLATES.TOKEN]:       ['operator', 'owner'],
  [TEMPLATES.PARTY_ROLE]:  ['operator', 'party', 'roleId'],
};

export function normalize(templateId, payload) {
  const fn = NORMALIZERS[templateId];
  if (!fn) throw new Error(`Unknown template: ${templateId}`);
  return fn(payload);
}

export function validate(templateId, payload) {
  if (!NORMALIZERS[templateId])
    return { ok: false, errors: [`Unknown template: ${templateId}`] };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return { ok: false, errors: ['Payload must be a JSON object'] };

  const required = REQUIRED_FIELDS[templateId] ?? [];
  const errors   = required
    .filter((key) => payload[key] == null || payload[key] === '')
    .map((key)    => `Missing required field: ${key}`);

  return { ok: errors.length === 0, errors };
}