const BASE = '/api';

async function fetchJson(pathname, options = {}) {
  const res  = await fetch(BASE + pathname, options);
  const text = await res.text();
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

export function getRankings(limit = 10) {
  return fetchJson(`/rankings?limit=${limit}`);
}

export function getSubject(party) {
  return fetchJson(`/reputation/${encodeURIComponent(party)}`);
}

export function getConfig(at) {
  return fetchJson(at ? `/config?at=${encodeURIComponent(at)}` : '/config');
}

export function requestVC(party, disclosedComponents = []) {
  return fetchJson('/vc/request', {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({ party, disclosedComponents }),
  });
}
