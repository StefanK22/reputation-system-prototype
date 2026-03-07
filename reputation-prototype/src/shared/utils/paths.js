/**
 * Object path utilities
 * Navigate and manipulate nested object structures
 */

export function getByPath(source, path, fallback = undefined) {
  if (!path) return fallback;

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

export function getFirstMatch(source, paths = []) {
  for (const path of paths) {
    const value = getByPath(source, path);
    if (value !== undefined) {
      return { found: true, value, path };
    }
  }
  return { found: false, value: undefined, path: undefined };
}
