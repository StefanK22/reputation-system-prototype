export async function requestJson(baseUrl, pathname, options = {}) {
  const url = new URL(pathname, String(baseUrl || '').replace(/\/$/, ''));
  const response = await fetch(url.toString(), options);

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
