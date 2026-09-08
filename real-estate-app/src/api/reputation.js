const BASE = '/api';

async function fetchJson(pathname, options = {}) {
  const text = await fetchText(pathname, options);
  return text ? JSON.parse(text) : {};
}

async function fetchText(pathname, options = {}) {
  const res  = await fetch(BASE + pathname, options);
  const text = await res.text();
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return text;
}

export function getRankings() {
  return fetchJson(`/rankings`);
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

export function getReputationConfig() {
  return fetchJson('/debug/reputation-config');
}

export function getTiers() {
  return fetchJson('/tiers');
}

export function issueVc(party) {
  return fetchText(`/vc/issue/${encodeURIComponent(party)}`);
}

export function verifyVc({ party, tier, issuanceDate, jws }) {
  const params = new URLSearchParams({ party, tier, issuanceDate, jws });
  return fetchJson(`/vc/verify?${params.toString()}`);
}
