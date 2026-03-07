/**
 * Contract payload validation
 * Validates that payloads match contract field definitions
 */

import { matches } from '../utils/types.js';
import { getByPath, getFirstMatch } from '../utils/paths.js';
import { getDefinition as getContractDefinition } from '../../config/contracts.js';

function readFirstFieldValue(payload, fieldDef) {
  const paths = [fieldDef.path, ...(fieldDef.aliases || [])];
  const { found, value } = getFirstMatch(payload, paths);
  return { found, value };
}

function validateField(field, payload) {
  const { found, value } = readFirstFieldValue(payload, field);

  if (!found && field.required && field.defaultValue === undefined) {
    return `Missing required field: ${field.path}`;
  }

  if (found && !matches(value, field.type)) {
    return `Invalid type for ${field.path}. Expected ${field.type}.`;
  }

  return null;
}

export function validate(templateId, payload) {
  const def = getContractDefinition(templateId);
  if (!def) {
    return { ok: false, errors: [`Unknown templateId: ${templateId}`] };
  }

  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, errors: ['Payload must be a JSON object.'] };
  }

  const errors = def.fields
    .map(field => validateField(field, payload))
    .filter(Boolean);

  return { ok: errors.length === 0, errors };
}

// Legacy name for backwards compatibility
export { validate as validateContractPayload };
