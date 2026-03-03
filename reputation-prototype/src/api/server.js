import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { validateContractPayload } from '../contracts/validation.js';
import { issueReputationCredential } from '../engine/credentialIssuer.js';
import { listContractDefinitions } from '../shared/contracts/registry.js';

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, statusCode, payload, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, { 'content-type': contentType });
  res.end(payload);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

const staticFileMap = new Map([
  ['/', 'external-app.html'],
  ['/external-app', 'external-app.html'],
  ['/external-app/', 'external-app.html'],
  ['/external-app.css', 'external-app.css'],
  ['/external-app.js', 'external-app.js'],
]);

const staticContentType = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
};

async function tryServeStatic(pathname, res) {
  const fileName = staticFileMap.get(pathname);
  if (!fileName) {
    return false;
  }

  const ext = path.extname(fileName);
  const contentType = staticContentType[ext] || 'application/octet-stream';
  const filePath = path.join(publicDir, fileName);

  try {
    const content = await fs.readFile(filePath, 'utf8');
    sendText(res, 200, content, contentType);
  } catch {
    sendText(res, 500, 'Failed to load static file.');
  }

  return true;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const text = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(text);
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
        sendJson(res, 200, {
          status: 'ok',
          ledgerEnd: ledger.ledgerEnd(),
          engineCheckpoint: engine.getCheckpoint(),
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/schema/contracts') {
        sendJson(res, 200, listContractDefinitions());
        return;
      }

      if (req.method === 'GET' && pathname === '/config') {
        const at = url.searchParams.get('at') || new Date().toISOString();
        const activeConfig = store.getActiveConfiguration(at);
        if (!activeConfig) {
          sendJson(res, 404, { error: 'No active configuration' });
          return;
        }
        sendJson(res, 200, activeConfig);
        return;
      }

      if (req.method === 'GET' && pathname === '/config/all') {
        sendJson(res, 200, store.getAllConfigurations());
        return;
      }

      if (req.method === 'GET' && pathname === '/rankings') {
        const limit = Number(url.searchParams.get('limit') || 10);
        sendJson(res, 200, store.getRankings(limit));
        return;
      }

      if (req.method === 'GET' && pathname.startsWith('/reputation/')) {
        const party = decodeURIComponent(pathname.replace('/reputation/', ''));
        const subject = store.getSubject(party);
        if (!subject) {
          sendJson(res, 404, { error: `No reputation found for ${party}` });
          return;
        }
        sendJson(res, 200, subject);
        return;
      }

      if (req.method === 'GET' && pathname === '/events') {
        const from = Number(url.searchParams.get('from') || 0);
        sendJson(res, 200, ledger.streamFrom(from));
        return;
      }

      if (req.method === 'POST' && pathname === '/engine/process') {
        const result = engine.processNewEvents();
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

        const subject = store.getSubject(party);
        if (!subject) {
          sendJson(res, 404, { error: `No reputation found for ${party}` });
          return;
        }

        const activeConfig = store.getActiveConfiguration();
        if (!activeConfig) {
          sendJson(res, 404, { error: 'No active configuration' });
          return;
        }

        const disclosed = Array.isArray(body.disclosedComponents)
          ? body.disclosedComponents.map(String)
          : [];

        const credential = issueReputationCredential({
          subject,
          configuration: activeConfig,
          disclosedComponentIds: disclosed,
        });

        sendJson(res, 201, credential);
        return;
      }

      if (req.method === 'POST' && pathname.startsWith('/mock/contracts/')) {
        const templateId = decodeURIComponent(pathname.replace('/mock/contracts/', ''));
        const body = await readJsonBody(req);
        const validation = validateContractPayload(templateId, body);
        if (!validation.ok) {
          sendJson(res, 400, {
            error: 'Payload validation failed',
            details: validation.errors,
          });
          return;
        }

        const event = ledger.publish(templateId, body);
        const autoProcess = url.searchParams.get('autoProcess') !== 'false';
        const processResult = autoProcess ? engine.processNewEvents() : null;
        sendJson(res, 201, { event, processResult });
        return;
      }

      sendJson(res, 404, { error: 'Route not found' });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  });
}
