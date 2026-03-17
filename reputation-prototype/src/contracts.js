/**
 * Single source of truth for all contract definitions.
 * Changing field names, types, or samples here propagates everywhere automatically.
 */

export const TEMPLATES = Object.freeze({
  CONFIG:      'ReputationConfiguration',
  INTERACTION: 'CompletedInteraction',
  FEEDBACK:    'Feedback',
  TOKEN:       'ReputationToken',
});

// ─── Field definitions ────────────────────────────────────────────────────────

function field(key, type, opts = {}) {
  return { key, path: opts.path || key, type, required: opts.required !== false, ...opts };
}

// ─── Sample payloads ──────────────────────────────────────────────────────────

const CONFIG_SAMPLE = {
  operator: 'Operator',
  configId: 'REAL_ESTATE_CONFIG',
  version: 1,
  activationTime: '2026-03-01T00:00:00Z',
  systemParameters: { reputationFloor: 0, reputationCeiling: 100 },
  components: [
    { componentId: 'Reliability',            description: 'Completes transactions successfully',  initialValue: 70 },
    { componentId: 'DocumentationAccuracy',  description: 'Correct and timely document handling', initialValue: 70 },
    { componentId: 'Efficiency',             description: 'Speed of transaction completion',       initialValue: 70 },
  ],
  roleWeights: [
    { roleId: 'AGENT', componentWeights: { Reliability: 0.2, DocumentationAccuracy: 0.4, Efficiency: 0.4 } },
    { roleId: 'BUYER', componentWeights: { Reliability: 0.5, DocumentationAccuracy: 0.25, Efficiency: 0.25 } },
  ],
  interactionTypes: [
    {
      interactionTypeId: 'SELL',
      description: 'Property sale workflow',
      ratingRules: [
        { componentId: 'Reliability',           conditionField: 'closedSuccessfully', conditionOperator: 'EQ',  conditionValue: 1, assignedRating: 85 },
        { componentId: 'Reliability',           conditionField: 'cancelled',          conditionOperator: 'EQ',  conditionValue: 1, assignedRating: 50 },
        { componentId: 'DocumentationAccuracy', conditionField: 'documentRejections', conditionOperator: 'GT',  conditionValue: 2, assignedRating: 60 },
        { componentId: 'DocumentationAccuracy', conditionField: 'documentRejections', conditionOperator: 'EQ',  conditionValue: 0, assignedRating: 85 },
      ],
    },
  ],
  partyRoles: { AGENT_ALICE: 'AGENT', BUYER_BOB: 'BUYER', SELLER_CAROL: 'BUYER' },
  defaultRoleId: 'AGENT',
};

const INTERACTION_SAMPLE = {
  platform: 'Operator',
  participants: ['AGENT_ALICE', 'BUYER_BOB'],
  interactionType: 'SELL',
  outcome: { closedSuccessfully: 1, cancelled: 0, documentRejections: 0 },
  completedAt: '2026-02-27T10:00:00Z',
  configVersion: 1,
};

const FEEDBACK_SAMPLE = {
  platform: 'Operator',
  interactionId: 'sell_001',
  from: 'BUYER_BOB',
  to: 'AGENT_ALICE',
  componentRatings: { Reliability: 92, DocumentationAccuracy: 88, Efficiency: 84 },
  submittedAt: '2026-02-27T11:00:00Z',
  phase: 'FINAL',
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export const REGISTRY = Object.freeze({
  [TEMPLATES.CONFIG]: {
    templateId: TEMPLATES.CONFIG,
    title: 'Reputation Configuration',
    isConfigTemplate: true,
    fields: [
      field('operator',         'string',  { defaultValue: 'Operator' }),
      field('configId',         'string',  { defaultValue: 'REAL_ESTATE_CONFIG' }),
      field('version',          'number',  { defaultValue: 1 }),
      field('activationTime',   'isoDate'),
      field('systemParameters', 'object'),
      field('components',       'array'),
      field('roleWeights',      'array'),
      field('interactionTypes', 'array'),
      field('partyRoles',       'object',  { required: false, defaultValue: {} }),
      field('defaultRoleId',    'string',  { required: false, defaultValue: 'AGENT' }),
    ],
    sample: CONFIG_SAMPLE,
  },
  [TEMPLATES.INTERACTION]: {
    templateId: TEMPLATES.INTERACTION,
    title: 'Completed Interaction',
    fields: [
      field('platform',        'string', { defaultValue: 'Operator' }),
      field('participants',    'array'),
      field('interactionType', 'string'),
      field('outcome',         'object'),
      field('completedAt',     'isoDate'),
      field('configVersion',   'number',  { defaultValue: 1 }),
    ],
    sample: INTERACTION_SAMPLE,
  },
  [TEMPLATES.FEEDBACK]: {
    templateId: TEMPLATES.FEEDBACK,
    title: 'Feedback',
    fields: [
      field('platform',          'string'),
      field('interactionId',     'string'),
      field('from',              'string'),
      field('to',                'string'),
      field('componentRatings',  'numberMap'),
      field('submittedAt',       'isoDate'),
      field('phase',             'string', { defaultValue: 'FINAL' }),
    ],
    sample: FEEDBACK_SAMPLE,
  },
});

export const getContract   = (id) => REGISTRY[id] ?? null;
export const listContracts = ()   => Object.values(REGISTRY);
export const cloneSample   = (id) => JSON.parse(JSON.stringify(getContract(id)?.sample ?? {}));

// ─── Type coercion ────────────────────────────────────────────────────────────

function coerce(value, type, def) {
  if (type === 'string')    return typeof value === 'string' ? value : String(def ?? '');
  if (type === 'number')    { const n = Number(value); return Number.isFinite(n) ? n : Number(def ?? 0); }
  if (type === 'boolean')   return typeof value === 'boolean' ? value : Boolean(def ?? false);
  if (type === 'isoDate')   {
    if (typeof value !== 'string') return def ?? new Date().toISOString();
    const d = new Date(value);
    return isNaN(d.getTime()) ? (def ?? new Date().toISOString()) : d.toISOString();
  }
  if (type === 'array')     return Array.isArray(value) ? value : (Array.isArray(def) ? def : []);
  if (type === 'object')    return (value && typeof value === 'object' && !Array.isArray(value)) ? value : (def ?? {});
  if (type === 'numberMap') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, Number(v) || 0]));
  }
  return value ?? def;
}

function matchesType(value, type) {
  if (type === 'string')    return typeof value === 'string';
  if (type === 'number')    return typeof value === 'number' && Number.isFinite(value);
  if (type === 'boolean')   return typeof value === 'boolean';
  if (type === 'isoDate')   return typeof value === 'string' && !isNaN(new Date(value).getTime());
  if (type === 'array')     return Array.isArray(value);
  if (type === 'object')    return value != null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'numberMap') return value != null && typeof value === 'object' && !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === 'number' && Number.isFinite(v));
  return true;
}

function extractField(payload, f) {
  for (const p of [f.path, ...(f.aliases ?? [])]) {
    let cur = payload;
    let ok = true;
    for (const k of p.split('.')) {
      if (cur == null || typeof cur !== 'object' || !(k in cur)) { ok = false; break; }
      cur = cur[k];
    }
    if (ok && cur !== undefined) return coerce(cur, f.type, f.defaultValue);
  }
  return coerce(undefined, f.type, f.defaultValue);
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validate(templateId, payload) {
  const def = getContract(templateId);
  if (!def) return { ok: false, errors: [`Unknown template: ${templateId}`] };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return { ok: false, errors: ['Payload must be a JSON object'] };

  const errors = def.fields.flatMap((f) => {
    let found = false;
    let value;
    for (const p of [f.path, ...(f.aliases ?? [])]) {
      let cur = payload; let ok = true;
      for (const k of p.split('.')) {
        if (cur == null || !(k in cur)) { ok = false; break; }
        cur = cur[k];
      }
      if (ok) { found = true; value = cur; break; }
    }
    if (!found && f.required && f.defaultValue === undefined) return [`Missing required field: ${f.path}`];
    if (found && !matchesType(value, f.type)) return [`Invalid type for ${f.path}: expected ${f.type}`];
    return [];
  });

  return { ok: errors.length === 0, errors };
}

// ─── Domain normalizers (used by the engine) ─────────────────────────────────

export function normalizeConfig(payload) {
  const def = getContract(TEMPLATES.CONFIG);
  const v   = Object.fromEntries(def.fields.map((f) => [f.key, extractField(payload, f)]));
  const sys = v.systemParameters ?? {};
  return {
    operator:         String(v.operator || 'Operator'),
    configId:         String(v.configId  || 'DEFAULT'),
    version:          Number(v.version)  || 1,
    activationTime:   v.activationTime,
    systemParameters: {
      reputationFloor:   Number(sys.reputationFloor)   || 0,
      reputationCeiling: Number(sys.reputationCeiling) || 100,
    },
    components: (v.components ?? []).map((c) => ({
      componentId:  String(c.componentId  || ''),
      description:  String(c.description  || ''),
      initialValue: Number(c.initialValue) || 70,
    })),
    roleWeights: (v.roleWeights ?? []).map((r) => ({
      roleId: String(r.roleId || ''),
      componentWeights: Object.fromEntries(
        Object.entries(r.componentWeights ?? {}).map(([k, w]) => [k, Number(w) || 0])
      ),
    })),
    interactionTypes: (v.interactionTypes ?? []).map((t) => ({
      interactionTypeId: String(t.interactionTypeId || ''),
      description:       String(t.description       || ''),
      ratingRules: (t.ratingRules ?? []).map((r) => ({
        componentId:       String(r.componentId       || ''),
        conditionField:    String(r.conditionField    || ''),
        conditionOperator: String(r.conditionOperator || 'EQ').toUpperCase(),
        conditionValue:    Number(r.conditionValue)   || 0,
        assignedRating:    Number(r.assignedRating)   || 70,
      })),
    })),
    partyRoles:    Object.fromEntries(Object.entries(v.partyRoles ?? {}).map(([p, r]) => [String(p), String(r)])),
    defaultRoleId: String(v.defaultRoleId || 'AGENT'),
  };
}

export function normalizeInteraction(payload) {
  const def = getContract(TEMPLATES.INTERACTION);
  const v   = Object.fromEntries(def.fields.map((f) => [f.key, extractField(payload, f)]));
  return {
    platform:       String(v.platform       || 'UNKNOWN'),
    participants:   (v.participants ?? []).map(String),
    interactionType: String(v.interactionType || 'UNKNOWN'),
    outcome:        v.outcome ?? {},
    completedAt:    v.completedAt,
    configVersion:  Number(v.configVersion) || 1,
  };
}

export function normalizeFeedback(payload) {
  const def = getContract(TEMPLATES.FEEDBACK);
  const v   = Object.fromEntries(def.fields.map((f) => [f.key, extractField(payload, f)]));
  return {
    platform:         String(v.platform     || 'UNKNOWN'),
    interactionId:    String(v.interactionId || 'unknown'),
    from:             String(v.from          || 'UNKNOWN'),
    to:               String(v.to            || 'UNKNOWN'),
    componentRatings: v.componentRatings ?? {},
    submittedAt:      v.submittedAt,
    phase:            String(v.phase         || 'FINAL'),
  };
}