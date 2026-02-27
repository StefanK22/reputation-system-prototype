export function getByPath(source, path, fallback = undefined) {
  if (!path) {
    return fallback;
  }

  const keys = path.split('.');
  let cursor = source;

  for (const key of keys) {
    if (cursor == null || typeof cursor !== 'object' || !(key in cursor)) {
      return fallback;
    }
    cursor = cursor[key];
  }

  return cursor;
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function asIsoString(value, fallback = new Date().toISOString()) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toISOString();
}

export function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function asBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

export function asNumberMap(value) {
  if (value instanceof Map) {
    return Object.fromEntries(
      [...value.entries()].map(([k, v]) => [String(k), asNumber(v, 0)])
    );
  }

  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .filter((entry) => Array.isArray(entry) && entry.length === 2)
        .map(([k, v]) => [String(k), asNumber(v, 0)])
    );
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, asNumber(v, 0)])
    );
  }

  return {};
}
