export const OBS_TEMPLATES   = { AgentObservation: 'Agent', BuyerObservation: 'Buyer', FeedbackObservation: 'Feedback' };
export const OBS_COMP_IDS    = ['Reliability', 'Responsiveness', 'Accuracy'];
export const OBS_COMP_COLORS = { Reliability: '#1a6abf', Responsiveness: '#7a5abf', Accuracy: '#2a7a6a' };

// DAML Map [[k, v], ...] → plain object
export function toMap(v) {
  if (!v) return {};
  if (Array.isArray(v)) return Object.fromEntries(v);
  return v;
}

// Canton HTTP JSON API v2 serializes DAML Decimal as strings (e.g. "0.75000000000").
// Also handles plain numbers and Canton v1-style {Some: x} wrapping.
export function optDecimal(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  const inner = v?.Some;
  if (inner !== null && inner !== undefined) {
    const n = typeof inner === 'number' ? inner : parseFloat(inner);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Parse raw contract fields into a normalized observation object.
// Includes `payload` (raw DAML fields) and `templateId` for role-specific display.
export function parseObservation(c) {
  const view = c.interfaceViews?.['Observation'] ?? c.interfaceViews?.['Observation.I'] ?? {};
  const components = {};
  for (const [k, v] of Object.entries(toMap(view.componentValues))) {
    const val = optDecimal(v);
    if (val !== null) components[k] = val;
  }
  return {
    contractId:    c.contractId,
    templateId:    c.templateId,
    role:          OBS_TEMPLATES[c.templateId],
    interactionId: view.interactionId,
    subject:       view.subject,
    recordedAt:    view.recordedAt || c.createdAt,
    processed:     view.processed === true,
    components,
    payload:       c.payload ?? {},
  };
}
