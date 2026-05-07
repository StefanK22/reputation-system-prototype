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
  return fetchJson(`/subjects/${encodeURIComponent(party)}`);
}

export function getAllSubjects() {
  return fetchJson('/debug/subjects');
}

export function getInterfaceIds() {
  return fetchJson('/debug/interface-ids');
}

export function getSystemState() {
  return fetchJson('/debug/system-state');
}

export function getReputationConfig() {
  return fetchJson('/debug/reputation-config');
}
