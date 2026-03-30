import fs   from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMPLATES, TEMPLATE_IDS, validate } from '../../contracts.js';
import { sendJson, sendText, readBody } from '../../shared/http.js';

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

export async function handleConsole(req, res, { url, db, ledger, apiUrl }) {
  const { pathname } = url;

  if (req.method === 'GET' && await serveStatic(pathname, res)) return true;

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
    const body     = await readBody(req);
    const upstream = await fetch(`${apiUrl}/vc/request`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, { 'content-type': 'application/json' });
    res.end(text);
    return true;
  }

  if (req.method === 'GET' && pathname === '/config/all')
    return sendJson(res, 200, await db.getAllConfigs());

  if (req.method === 'GET' && pathname === '/subjects')
    return sendJson(res, 200, await db.getAllSubjects());

  if (req.method === 'GET' && pathname === '/events') {
    const from = Number(url.searchParams.get('from') || 0);
    return sendJson(res, 200, await ledger.streamFrom(from, { wait: false }));
  }

  if (req.method === 'POST' && pathname.startsWith('/mock/contracts/')) {
    const templateId     = decodeURIComponent(pathname.slice('/mock/contracts/'.length));
    const body           = await readBody(req);
    const { ok, errors } = validate(templateId, body);
    if (!ok) return sendJson(res, 400, { error: 'Validation failed', details: errors });

    const fullId = TEMPLATE_IDS[templateId];
    if (!fullId) return sendJson(res, 400, { error: `Unknown template: ${templateId}` });

    const event = await ledger.create(fullId, body);
    return sendJson(res, 201, { event });
  }

  return false;
}