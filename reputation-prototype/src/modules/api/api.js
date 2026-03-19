import { sendJson, readBody } from '../../shared/http.js';

function issueVC({ subject, config, disclosed = [] }) {
  const all        = disclosed.length === 0;
  const components = Object.fromEntries(
    Object.entries(subject.components)
      .filter(([id]) => all || disclosed.includes(id))
      .map(([id, c]) => [id, { value: c.value, interactionCount: c.interactionCount }])
  );
  return {
    id:   `vc:reputation:${subject.party}:${Date.now()}`,
    type: ['VerifiableCredential', 'ReputationCredential'],
    issuer:       config.operator,
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: subject.party, roleId: subject.roleId, overallScore: subject.overallScore,
      components, configId: config.configId, configVersion: config.version,
    },
    proof: { type: 'MockProof', purpose: 'prototype-only' },
  };
}

export async function handleApi(req, res, { url, db }) {
  const { pathname } = url;

  if (req.method === 'GET' && pathname === '/config') {
    const at     = url.searchParams.get('at') || new Date().toISOString();
    const config = await db.getActiveConfig(at);
    return config ? sendJson(res, 200, config) : sendJson(res, 404, { error: 'No active config' });
  }

  if (req.method === 'GET' && pathname === '/rankings') {
    const limit = Number(url.searchParams.get('limit') || 10);
    return sendJson(res, 200, await db.getRankings(limit));
  }

  if (req.method === 'GET' && pathname.startsWith('/reputation/')) {
    const party   = decodeURIComponent(pathname.slice('/reputation/'.length));
    const subject = await db.getSubject(party);
    return subject ? sendJson(res, 200, subject) : sendJson(res, 404, { error: `Not found: ${party}` });
  }

  if (req.method === 'POST' && pathname === '/vc/request') {
    const { party, disclosedComponents = [] } = await readBody(req);
    if (!party) return sendJson(res, 400, { error: 'Missing field: party' });
    const [subject, config] = await Promise.all([db.getSubject(String(party)), db.getActiveConfig()]);
    if (!subject) return sendJson(res, 404, { error: `No reputation for ${party}` });
    if (!config)  return sendJson(res, 404, { error: 'No active config' });
    return sendJson(res, 201, issueVC({ subject, config, disclosed: disclosedComponents.map(String) }));
  }

  return false;
}
