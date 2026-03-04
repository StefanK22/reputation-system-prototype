import { getByPath } from '../../lib/objectPath.js';

export function cloneJsonValue(value) {
  if (value == null || typeof value !== 'object') {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

export function readFirstFieldValue(payload, fieldDef) {
  const candidatePaths = [fieldDef.path, ...(fieldDef.aliases || [])];
  for (const candidatePath of candidatePaths) {
    const value = getByPath(payload, candidatePath);
    if (value !== undefined) {
      return { found: true, value };
    }
  }

  return { found: false, value: undefined };
}
