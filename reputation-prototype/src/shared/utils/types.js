/**
 * Domain-specific type conversions
 * Only handles conversions that require special domain logic
 * For basic type checking, use native JS operators instead
 */

/**
 * Convert value to object with fallback
 * Handles null/undefined safely
 */
export function toObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * Convert value to ISO date string with validation
 * Returns the given fallback if value is invalid ISO date
 */
export function toIsoString(value, fallback) {
  const def = fallback || new Date().toISOString();
  if (typeof value !== 'string') return def;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? def : date.toISOString();
}

/**
 * Convert to number map from multiple input types
 * Handles: Map, Array of [key, value] pairs, or plain object
 * Useful for flexible configuration input
 */
export function toNumberMap(value) {
  if (value instanceof Map) {
    return Object.fromEntries(
      [...value.entries()].map(([k, v]) => [String(k), Number(v) || 0])
    );
  }

  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .filter((entry) => Array.isArray(entry) && entry.length === 2)
        .map(([k, v]) => [String(k), Number(v) || 0])
    );
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, Number(v) || 0])
    );
  }

  return {};
}

/**
 * Smart type coercion with fallback
 * Centralizes type conversion logic for schema normalization
 */
export function coerce(value, type, defaultValue) {
  switch (type) {
    case 'string':
      return typeof value === 'string' ? value : String(defaultValue ?? '');
    case 'number':
      const n = Number(value);
      return Number.isFinite(n) ? n : Number(defaultValue ?? 0);
    case 'boolean':
      return typeof value === 'boolean' ? value : Boolean(defaultValue ?? false);
    case 'isoDate':
      return toIsoString(value, defaultValue);
    case 'array':
      return Array.isArray(value) ? value : [];
    case 'object':
      return toObject(value);
    case 'numberMap':
      return toNumberMap(value);
    default:
      return value ?? defaultValue;
  }
}

/**
 * Check if value matches expected type string
 * Used for validation against field type definitions
 */
export function matches(value, type) {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'isoDate':
      if (typeof value !== 'string') return false;
      return !Number.isNaN(new Date(value).getTime());
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

