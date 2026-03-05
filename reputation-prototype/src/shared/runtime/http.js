export function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload, null, 2));
}

export function sendText(res, statusCode, payload, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, { 'content-type': contentType });
  res.end(payload);
}

export async function readJsonBody(req, options = {}) {
  const { emptyFallback = {} } = options;
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return emptyFallback;
  }

  const text = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(text);
}
