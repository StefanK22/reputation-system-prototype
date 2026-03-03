import { getByPath } from '../lib/objectPath.js';
import { getContractDefinition } from '../shared/contracts/registry.js';

function readField(payload, fieldDef) {
  const candidatePaths = [fieldDef.path, ...(fieldDef.aliases || [])];
  for (const candidatePath of candidatePaths) {
    const value = getByPath(payload, candidatePath);
    if (value !== undefined) {
      return { found: true, value };
    }
  }
  return { found: false, value: undefined };
}

function isIsoDate(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function matchesType(value, type) {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'isoDate':
      return isIsoDate(value);
    case 'array':
      return Array.isArray(value);
    case 'object':
      return value != null && typeof value === 'object' && !Array.isArray(value);
    case 'numberMap':
      return (
        value != null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.values(value).every((item) => typeof item === 'number' && Number.isFinite(item))
      );
    default:
      return true;
  }
}

export function validateContractPayload(templateId, payload) {
  const definition = getContractDefinition(templateId);
  if (!definition) {
    return { ok: false, errors: [`Unknown templateId: ${templateId}`] };
  }

  const errors = [];

  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      ok: false,
      errors: ['Payload must be a JSON object.'],
    };
  }

  for (const field of definition.fields) {
    const { found, value } = readField(payload, field);

    if (!found) {
      if (field.required && field.defaultValue === undefined) {
        errors.push(`Missing required field: ${field.path}`);
      }
      continue;
    }

    if (!matchesType(value, field.type)) {
      errors.push(`Invalid type for ${field.path}. Expected ${field.type}.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
