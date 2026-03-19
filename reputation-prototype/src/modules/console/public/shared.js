import React from 'https://esm.sh/react@18.2.0';
import htm   from 'https://esm.sh/htm@3.1.1';

export const html = htm.bind(React.createElement);
export const pretty = (v) => JSON.stringify(v, null, 2);
export const clone  = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
export const toNum  = (v, fb = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fb; };
export const CONDITION_OPS = ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE'];

// ─── API ─────────────────────────────────────────────────────────────────────

async function request(path, opts = {}) {
  const res  = await fetch(path, opts);
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error((body.error || `HTTP ${res.status}`) + (body.details ? ` (${body.details.join('; ')})` : ''));
  return body;
}

const post = (path, data) => request(path, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data),
});

export const api = {
  contracts:  ()                          => request('/schema/contracts'),
  config:     ()                          => request('/config'),
  allConfigs:  ()                          => request('/config/all'),
  allSubjects: ()                          => request('/subjects'),
  rankings:   (limit = 20)               => request(`/rankings?limit=${limit}`),
  reputation: (party)                    => request(`/reputation/${encodeURIComponent(party)}`),
  events:     (from = 0)                 => request(`/events?from=${from}`),
  deploy:     (tid, payload) => post(`/mock/contracts/${encodeURIComponent(tid)}`, payload),
  issueVC:    (party, disc = [])         => post('/vc/request', { party, disclosedComponents: disc }),
};

// ─── Form helpers ────────────────────────────────────────────────────────────

function getByPath(obj, path) {
  return path.split('.').reduce((cur, k) => (cur != null && typeof cur === 'object' ? cur[k] : undefined), obj);
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

function stringifyVal(value, type) {
  if (type === 'boolean') return Boolean(value);
  if (value == null) return '';
  return (type === 'object' || type === 'array' || type === 'numberMap') ? pretty(value) : String(value);
}

function parseVal(raw, type) {
  if (type === 'boolean') return Boolean(raw);
  const text = String(raw ?? '').trim();
  if (type === 'number') { const n = Number(text); if (!text || !Number.isFinite(n)) throw new Error('Expected number'); return n; }
  if (type === 'object' || type === 'array' || type === 'numberMap') {
    if (!text) throw new Error('Expected JSON');
    const parsed = JSON.parse(text);
    if (type === 'array'     && !Array.isArray(parsed)) throw new Error('Expected array');
    if (type === 'object'    &&  Array.isArray(parsed)) throw new Error('Expected object');
    if (type === 'numberMap' && !Object.values(parsed).every((v) => typeof v === 'number')) throw new Error('Expected numeric map');
    return parsed;
  }
  return text;
}

export function fieldState(def) {
  return Object.fromEntries(def.fields.map((f) => {
    const v = getByPath(def.sample, f.path);
    return [f.key, stringifyVal(v !== undefined ? v : f.defaultValue, f.type)];
  }));
}

export function buildPayload(def, state) {
  const payload = {};
  for (const f of def.fields) {
    const raw = state[f.key];
    if (raw === '' || raw == null) { if (f.defaultValue !== undefined) setByPath(payload, f.path, f.defaultValue); continue; }
    setByPath(payload, f.path, parseVal(raw, f.type));
  }
  return payload;
}

// ─── Config draft helpers ────────────────────────────────────────────────────

export function initDraft(active, def) {
  const fb   = clone(def?.sample ?? {});
  const base = { ...fb, ...(active ?? {}) };
  base.systemParameters = { ...(fb.systemParameters ?? {}), ...(active?.systemParameters ?? {}) };
  base.components = Array.isArray(active?.components)
    ? active.components.map((c) => ({ componentId: String(c.componentId || ''), description: String(c.description || ''), initialValue: toNum(c.initialValue, 70) }))
    : clone(fb.components ?? []);
  base.roleWeights = Array.isArray(active?.roleWeights)
    ? active.roleWeights.map((r) => ({ roleId: String(r.roleId || ''), componentWeights: Object.fromEntries(Object.entries(r.componentWeights ?? {}).map(([k, w]) => [String(k), toNum(w, 0)])) }))
    : clone(fb.roleWeights ?? []);
  base.interactionTypes = Array.isArray(active?.interactionTypes)
    ? active.interactionTypes.map((t) => ({
        interactionTypeId: String(t.interactionTypeId || ''), description: String(t.description || ''),
        ratingRules: (t.ratingRules ?? []).map((r) => ({
          componentId: String(r.componentId || ''), conditionField: String(r.conditionField || ''),
          conditionOperator: String(r.conditionOperator || 'EQ').toUpperCase(),
          conditionValue: toNum(r.conditionValue, 0), assignedRating: toNum(r.assignedRating, 70),
        })),
      }))
    : clone(fb.interactionTypes ?? []);
  base.partyRoles    = (active?.partyRoles && typeof active.partyRoles === 'object') ? clone(active.partyRoles) : clone(fb.partyRoles ?? {});
  base.defaultRoleId = String(base.defaultRoleId || fb.defaultRoleId || '');
  base.operator      = String(base.operator || fb.operator || '');
  base.configId      = String(base.configId || fb.configId || '');
  base.version       = toNum(base.version, 1);
  base.activationTime = new Date().toISOString();
  base.systemParameters.reputationFloor   = toNum(base.systemParameters.reputationFloor, 0);
  base.systemParameters.reputationCeiling = toNum(base.systemParameters.reputationCeiling, 100);
  reconcile(base);
  return base;
}

export function reconcile(d) {
  d.roleWeights = Array.isArray(d.roleWeights) ? d.roleWeights : [];
  d.partyRoles  = (d.partyRoles && typeof d.partyRoles === 'object') ? d.partyRoles : {};
  const ids = [...new Set((d.components ?? []).map((c) => String(c.componentId || '')))];
  for (const role of d.roleWeights) {
    const cur = role.componentWeights ?? {};
    role.componentWeights = Object.fromEntries(ids.map((id) => [id, id in cur ? cur[id] : 0]));
  }
  const roleIds = d.roleWeights.map((r) => String(r.roleId || '')).filter(Boolean);
  if (d.defaultRoleId && !roleIds.includes(d.defaultRoleId)) d.defaultRoleId = roleIds[0] || '';
  Object.keys(d.partyRoles).forEach((p) => { if (!roleIds.includes(d.partyRoles[p])) delete d.partyRoles[p]; });
}

export function serializeDraft(d) {
  const p = clone(d);
  p.version          = toNum(p.version, 1);
  p.systemParameters = { reputationFloor: toNum(p.systemParameters?.reputationFloor, 0), reputationCeiling: toNum(p.systemParameters?.reputationCeiling, 100) };
  p.components       = (p.components ?? []).map((c) => ({ componentId: String(c.componentId || ''), description: String(c.description || ''), initialValue: toNum(c.initialValue, 70) }));
  p.roleWeights      = (p.roleWeights ?? []).map((r) => ({ roleId: String(r.roleId || ''), componentWeights: Object.fromEntries(Object.entries(r.componentWeights ?? {}).map(([k, w]) => [k, toNum(w, 0)])) }));
  p.interactionTypes = (p.interactionTypes ?? []).map((t) => ({ interactionTypeId: String(t.interactionTypeId || ''), description: String(t.description || ''), ratingRules: (t.ratingRules ?? []).map((r) => ({ componentId: String(r.componentId || ''), conditionField: String(r.conditionField || ''), conditionOperator: String(r.conditionOperator || 'EQ').toUpperCase(), conditionValue: toNum(r.conditionValue, 0), assignedRating: toNum(r.assignedRating, 70) })) }));
  p.partyRoles       = Object.fromEntries(Object.entries(p.partyRoles ?? {}).map(([k, v]) => [String(k), String(v)]));
  p.defaultRoleId    = String(p.defaultRoleId || '');
  p.operator         = String(p.operator || '');
  p.configId         = String(p.configId || '');
  p.activationTime   = String(p.activationTime || new Date().toISOString());
  return p;
}
