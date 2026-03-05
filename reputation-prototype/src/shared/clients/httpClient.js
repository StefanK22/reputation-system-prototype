function trimTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function createBaseUrl(value) {
  return trimTrailingSlash(String(value || ''));
}

export async function requestJson(baseUrl, pathname, options = {}) {
  const response = await fetch(`${createBaseUrl(baseUrl)}${pathname}`, options);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
  }

  const text = await response.text();
  if (!text) {
    return {};
  }
  return JSON.parse(text);
}
