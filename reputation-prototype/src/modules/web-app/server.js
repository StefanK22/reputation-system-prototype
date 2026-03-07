import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { validate } from '../../shared/contracts/validation.js';
import { listDefinitions } from '../../config/contracts.js';
import { readJsonBody, sendJson, sendText } from '../../shared/runtime/http.js';

function issueCredential({ subject, config, disclosed = [] }) {
  const includeAll = disclosed.length === 0;

  const components = Object.fromEntries(
    Object.entries(subject.components)
      .filter(([id]) => includeAll || disclosed.includes(id))
      .map(([id, comp]) => [
        id,
        {
          value: comp.value,
          interactionCount: comp.interactionCount,
        },
      ])
  );

  return {
    id: `vc:reputation:${subject.party}:${Date.now()}`,
    type: ['VerifiableCredential', 'ReputationCredential'],
    issuer: config.operator,
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: subject.party,
      roleId: subject.roleId,
      overallScore: subject.overallScore,
      components,
      configId: config.configId,
      configVersion: config.version,
    },
    proof: {
      type: 'MockProof',
      purpose: 'prototype-only',
    },
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, 'public');
const appEntryRoutes = new Set(['/', '/external-app', '/external-app/']);

const staticContentType = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
};
const staticExtensions = new Set(Object.keys(staticContentType));

function resolveStaticFileName(pathname) {
  if (appEntryRoutes.has(pathname)) {
    return 'external-app.html';
  }

  const normalized = path.posix.normalize(pathname);
  if (!normalized.startsWith('/') || normalized.includes('..')) {
    return null;
  }

  const fileName = normalized.slice(1);
  if (!fileName) {
    return null;
  }

  const ext = path.extname(fileName);
  if (!staticExtensions.has(ext)) {
    return null;
  }

  return fileName;
}

async function tryServeStatic(pathname, res) {
  const fileName = resolveStaticFileName(pathname);
  if (!fileName) {
    return false;
  }

  const ext = path.extname(fileName);
  const contentType = staticContentType[ext] || 'application/octet-stream';
  const filePath = path.resolve(publicDir, fileName);
  if (!filePath.startsWith(`${publicDir}${path.sep}`)) {
    return false;
  }

  try {
    const content = await fs.readFile(filePath, 'utf8');
    sendText(res, 200, content, contentType);
  } catch {
    sendText(res, 500, 'Failed to load static file.');
  }

  return true;
}

export function createApiServer({ ledger, store, engine }) {
  return http.createServer(async (req, res) => {
    try {
      if (!req.url || !req.method) {
        sendJson(res, 400, { error: 'Invalid request' });
        return;
      }

      const url = new URL(req.url, 'http://localhost');
      const pathname = url.pathname;

      if (req.method === 'GET') {
        const served = await tryServeStatic(pathname, res);
        if (served) {
          return;
        }
      }

      if (req.method === 'GET' && pathname === '/health') {
        const ledgerEnd = await ledger.ledgerEnd();
        const engineCheckpoint = await engine.getCheckpoint();
        sendJson(res, 200, {
          status: 'ok',
          ledgerEnd,
          engineCheckpoint,
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/schema/contracts') {
        sendJson(res, 200, listDefinitions());
        return;
      }

      if (req.method === 'GET' && pathname === '/config') {
        const at = url.searchParams.get('at') || new Date().toISOString();
        const activeConfig = await store.getActiveConfiguration(at);
        if (!activeConfig) {
          sendJson(res, 404, { error: 'No active configuration' });
          return;
        }
        sendJson(res, 200, activeConfig);
        return;
      }

      if (req.method === 'GET' && pathname === '/config/all') {
        sendJson(res, 200, await store.getAllConfigurations());
        return;
      }

      if (req.method === 'GET' && pathname === '/rankings') {
        const limit = Number(url.searchParams.get('limit') || 10);
        sendJson(res, 200, await store.getRankings(limit));
        return;
      }

      if (req.method === 'GET' && pathname.startsWith('/reputation/')) {
        const party = decodeURIComponent(pathname.replace('/reputation/', ''));
        const subject = await store.getSubject(party);
        if (!subject) {
          sendJson(res, 404, { error: `No reputation found for ${party}` });
          return;
        }
        sendJson(res, 200, subject);
        return;
      }

      if (req.method === 'GET' && pathname === '/events') {
        const from = Number(url.searchParams.get('from') || 0);
        sendJson(res, 200, await ledger.streamFrom(from));
        return;
      }

      if (req.method === 'POST' && pathname === '/engine/process') {
        const result = await engine.processNewEvents();
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'POST' && pathname === '/vc/request') {
        const body = await readJsonBody(req);
        const party = String(body.party || '');
        if (!party) {
          sendJson(res, 400, { error: 'Missing required field: party' });
          return;
        }

        const subject = await store.getSubject(party);
        if (!subject) {
          sendJson(res, 404, { error: `No reputation found for ${party}` });
          return;
        }

        const activeConfig = await store.getActiveConfiguration();
        if (!activeConfig) {
          sendJson(res, 404, { error: 'No active configuration' });
          return;
        }

        const disclosed = Array.isArray(body.disclosedComponents)
          ? body.disclosedComponents.map(String)
          : [];

        const credential = issueCredential({
          subject,
          config: activeConfig,
          disclosed,
        });

        sendJson(res, 201, credential);
        return;
      }

      if (req.method === 'POST' && pathname.startsWith('/mock/contracts/')) {
        const templateId = decodeURIComponent(pathname.replace('/mock/contracts/', ''));
        const body = await readJsonBody(req);
        const validation = validate(templateId, body);
        if (!validation.ok) {
          sendJson(res, 400, {
            error: 'Payload validation failed',
            details: validation.errors,
          });
          return;
        }

        const event = await ledger.publish(templateId, body);
        const autoProcess = url.searchParams.get('autoProcess') !== 'false';
        const processResult = autoProcess ? await engine.processNewEvents() : null;
        sendJson(res, 201, { event, processResult });
        return;
      }

      sendJson(res, 404, { error: 'Route not found' });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  });
}
