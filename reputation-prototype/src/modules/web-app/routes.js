import http from 'node:http';
import fs   from 'node:fs/promises';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { listContracts, validate } from '../../contracts.js';
import { sendJson, sendText, readBody, fetchJson } from '../../shared/http.js';

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'public');
const MIME   = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8' };

async function serveStatic(pathname, res) {
  const name = pathname === '/' ? 'index.html' : pathname.slice(1);
  const ext  = path.extname(name);
  if (!MIME[ext] || name.includes('..') || name.includes('/')) return false;
  try {
    sendText(res, 200, await fs.readFile(path.join(PUBLIC, name), 'utf8'), MIME[ext]);
    return true;
  } catch { return false; }
}

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

export function createServer({ db, ledger, engineUrl }) {
  return http.createServer(async (req, res) => {
    try {
      const url      = new URL(req.url, 'http://localhost');
      const { pathname } = url;

      if (req.method === 'GET' && await serveStatic(pathname, res)) return;

      if (req.method === 'GET' && pathname === '/health') {
        const [end, cp] = await Promise.all([ledger.ledgerEnd(), fetchJson(engineUrl, '/checkpoint').catch(() => ({ checkpoint: '?' }))]);
        return sendJson(res, 200, { status: 'ok', ledgerEnd: end, checkpoint: cp.checkpoint });
      }

      if (req.method === 'GET' && pathname === '/schema/contracts')
        return sendJson(res, 200, listContracts());

      if (req.method === 'GET' && pathname === '/config') {
        const at     = url.searchParams.get('at') || new Date().toISOString();
        const config = await db.getActiveConfig(at);
        return config ? sendJson(res, 200, config) : sendJson(res, 404, { error: 'No active config' });
      }

      if (req.method === 'GET' && pathname === '/config/all')
        return sendJson(res, 200, await db.getAllConfigs());

      if (req.method === 'GET' && pathname === '/subjects')
        return sendJson(res, 200, await db.getAllSubjects());

      if (req.method === 'GET' && pathname === '/rankings') {
        const limit = Number(url.searchParams.get('limit') || 10);
        return sendJson(res, 200, await db.getRankings(limit));
      }

      if (req.method === 'GET' && pathname.startsWith('/reputation/')) {
        const party   = decodeURIComponent(pathname.slice('/reputation/'.length));
        const subject = await db.getSubject(party);
        return subject ? sendJson(res, 200, subject) : sendJson(res, 404, { error: `Not found: ${party}` });
      }

      if (req.method === 'GET' && pathname === '/events') {
        const from = Number(url.searchParams.get('from') || 0);
        return sendJson(res, 200, await ledger.streamFrom(from));
      }

      if (req.method === 'POST' && pathname === '/engine/process') {
        const result = await fetchJson(engineUrl, '/process', { method: 'POST', headers: { 'content-type': 'application/json' } });
        return sendJson(res, 200, result);
      }

      if (req.method === 'POST' && pathname === '/vc/request') {
        const { party, disclosedComponents = [] } = await readBody(req);
        if (!party) return sendJson(res, 400, { error: 'Missing field: party' });
        const [subject, config] = await Promise.all([db.getSubject(String(party)), db.getActiveConfig()]);
        if (!subject) return sendJson(res, 404, { error: `No reputation for ${party}` });
        if (!config)  return sendJson(res, 404, { error: 'No active config' });
        return sendJson(res, 201, issueVC({ subject, config, disclosed: disclosedComponents.map(String) }));
      }

      if (req.method === 'POST' && pathname.startsWith('/mock/contracts/')) {
        const templateId     = decodeURIComponent(pathname.slice('/mock/contracts/'.length));
        const body           = await readBody(req);
        const { ok, errors } = validate(templateId, body);
        if (!ok) return sendJson(res, 400, { error: 'Validation failed', details: errors });

        const event = await ledger.create(templateId, body);
        const autoProcess = url.searchParams.get('autoProcess') !== 'false';
        const processResult = autoProcess
          ? await fetchJson(engineUrl, '/process', { method: 'POST', headers: { 'content-type': 'application/json' } })
          : null;
        return sendJson(res, 201, { event, processResult });
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (e) {
      sendJson(res, 500, { error: e.message });
    }
  });
}