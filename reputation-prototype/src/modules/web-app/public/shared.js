import React from 'https://esm.sh/react@18.2.0';
import htm   from 'https://esm.sh/htm@3.1.1';

export const html = htm.bind(React.createElement);
export const CONDITION_OPERATORS = ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE'];

export const pretty = (v) => JSON.stringify(v, null, 2);
export const clone  = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
export const toNum  = (v, fb = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fb; };

// ─── API ─────────────────────────────────────────────────────────────────────

export function requestJson(path, options = {}) {
  return fetch(path, options).then(async (res) => {
    const text = await res.text();
    const body = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error((body.error || `HTTP ${res.status}`) + (body.details ? ` (${body.details.join('; ')})` : ''));
    return body;
  });
}

// ─── Contract form helpers ────────────────────────────────────────────────────

function getByPath(obj, path) {
  return path.split('.').reduce((cur, k) => (cur != null && typeof cur === 'object' ? cur[k] : undefined), obj);
}

function stringifyValue(value, type) {
  if (type === 'boolean') return Boolean(value);
  if (value == null) return '';
  return (type === 'object' || type === 'array' || type === 'numberMap') ? pretty(value) : String(value);
}

function parseValue(raw, type) {
  if (type === 'boolean') return Boolean(raw);
  const text = String(raw ?? '').trim();
  if (type === 'number') {
    if (!text) throw new Error('Expected number');
    const n = Number(text);
    if (!Number.isFinite(n)) throw new Error('Expected valid number');
    return n;
  }
  if (type === 'object' || type === 'array' || type === 'numberMap') {
    if (!text) throw new Error('Expected JSON value');
    const parsed = JSON.parse(text);
    if (type === 'array'     && !Array.isArray(parsed))   throw new Error('Expected JSON array');
    if (type === 'object'    &&  Array.isArray(parsed))   throw new Error('Expected JSON object');
    if (type === 'numberMap' && !Object.values(parsed).every((v) => typeof v === 'number')) throw new Error('Expected numeric map');
    return parsed;
  }
  return text;
}

export function initialFieldState(definition) {
  return Object.fromEntries(
    definition.fields.map((f) => {
      const fromSample = getByPath(definition.sample, f.path);
      return [f.key, stringifyValue(fromSample !== undefined ? fromSample : f.defaultValue, f.type)];
    })
  );
}

export function buildPayload(definition, fieldState) {
  const payload = {};
  for (const f of definition.fields) {
    const raw = fieldState[f.key];
    if (raw === '' || raw == null) { if (f.defaultValue !== undefined) setByPath(payload, f.path, f.defaultValue); continue; }
    setByPath(payload, f.path, parseValue(raw, f.type));
  }
  return payload;
}

function setByPath(target, path, value) {
  const keys = path.split('.');
  let cur = target;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

// ─── Config editor helpers ────────────────────────────────────────────────────

export function normalizeConfigDraft(activeConfig, definition) {
  const fb   = clone(definition?.sample ?? {});
  const base = { ...fb, ...(activeConfig ?? {}) };

  base.systemParameters = { ...(fb.systemParameters ?? {}), ...(activeConfig?.systemParameters ?? {}) };

  base.components = Array.isArray(activeConfig?.components)
    ? activeConfig.components.map((c) => ({ componentId: String(c.componentId || ''), description: String(c.description || ''), initialValue: toNum(c.initialValue, 70) }))
    : clone(fb.components ?? []);

  base.roleWeights = Array.isArray(activeConfig?.roleWeights)
    ? activeConfig.roleWeights.map((r) => ({
        roleId: String(r.roleId || ''),
        componentWeights: Object.fromEntries(Object.entries(r.componentWeights ?? {}).map(([k, w]) => [String(k), toNum(w, 0)])),
      }))
    : clone(fb.roleWeights ?? []);

  base.interactionTypes = Array.isArray(activeConfig?.interactionTypes)
    ? activeConfig.interactionTypes.map((t) => ({
        interactionTypeId: String(t.interactionTypeId || ''),
        description: String(t.description || ''),
        ratingRules: (t.ratingRules ?? []).map((r) => ({
          componentId: String(r.componentId || ''), conditionField: String(r.conditionField || ''),
          conditionOperator: String(r.conditionOperator || 'EQ').toUpperCase(),
          conditionValue: toNum(r.conditionValue, 0), assignedRating: toNum(r.assignedRating, 70),
        })),
      }))
    : clone(fb.interactionTypes ?? []);

  base.partyRoles    = (activeConfig?.partyRoles && typeof activeConfig.partyRoles === 'object') ? clone(activeConfig.partyRoles) : clone(fb.partyRoles ?? {});
  base.defaultRoleId = String(base.defaultRoleId || fb.defaultRoleId || '');
  base.operator      = String(base.operator      || fb.operator      || '');
  base.configId      = String(base.configId      || fb.configId      || '');
  base.version       = toNum(base.version, 1);
  base.activationTime = String(base.activationTime || new Date().toISOString());
  base.systemParameters.reputationFloor   = toNum(base.systemParameters.reputationFloor, 0);
  base.systemParameters.reputationCeiling = toNum(base.systemParameters.reputationCeiling, 100);
  return base;
}

export function reconcileDraft(draft) {
  draft.roleWeights = Array.isArray(draft.roleWeights) ? draft.roleWeights : [];
  draft.partyRoles  = (draft.partyRoles && typeof draft.partyRoles === 'object') ? draft.partyRoles : {};

  const componentIds = [...new Set((draft.components ?? []).map((c) => String(c.componentId || '')))];
  for (const role of draft.roleWeights) {
    const cur = role.componentWeights ?? {};
    role.componentWeights = Object.fromEntries(componentIds.map((id) => [id, toNum(cur[id], 0)]));
  }

  const roleIds = draft.roleWeights.map((r) => String(r.roleId || '')).filter(Boolean);
  if (draft.defaultRoleId && !roleIds.includes(draft.defaultRoleId)) draft.defaultRoleId = roleIds[0] || '';
  Object.keys(draft.partyRoles).forEach((p) => { if (!roleIds.includes(draft.partyRoles[p])) delete draft.partyRoles[p]; });
}

export function serializeDraft(draft) {
  const p = clone(draft);
  p.version          = toNum(p.version, 1);
  p.systemParameters = { ...p.systemParameters, reputationFloor: toNum(p.systemParameters?.reputationFloor, 0), reputationCeiling: toNum(p.systemParameters?.reputationCeiling, 100) };
  p.components       = (p.components ?? []).map((c) => ({ componentId: String(c.componentId || ''), description: String(c.description || ''), initialValue: toNum(c.initialValue, 70) }));
  p.roleWeights      = (p.roleWeights ?? []).map((r) => ({ roleId: String(r.roleId || ''), componentWeights: Object.fromEntries(Object.entries(r.componentWeights ?? {}).map(([k, w]) => [k, toNum(w, 0)])) }));
  p.interactionTypes = (p.interactionTypes ?? []).map((t) => ({ interactionTypeId: String(t.interactionTypeId || ''), description: String(t.description || ''), ratingRules: (t.ratingRules ?? []).map((r) => ({ componentId: String(r.componentId || ''), conditionField: String(r.conditionField || ''), conditionOperator: String(r.conditionOperator || 'EQ').toUpperCase(), conditionValue: toNum(r.conditionValue, 0), assignedRating: toNum(r.assignedRating, 70) })) }));
  p.partyRoles       = Object.fromEntries(Object.entries(p.partyRoles ?? {}).map(([k, v]) => [String(k), String(v)]));
  p.defaultRoleId    = String(p.defaultRoleId || '');
  p.operator         = String(p.operator      || '');
  p.configId         = String(p.configId      || '');
  p.activationTime   = String(p.activationTime || new Date().toISOString());
  return p;
}