import http from 'node:http';
import { URL } from 'node:url';
import { handleApi } from './api.js';
import { DB }        from '../../shared/db.js';
import { sendJson }  from '../../shared/http.js';
import { createPort, runService } from '../../shared/lifecycle.js';

class ApiService {
  constructor({ port, databaseUrl }) {
    this.port = port;
    this.db   = new DB({ connectionString: databaseUrl });

    this.server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        const ctx = { url, db: this.db };
        if (await handleApi(req, res, ctx) !== false) return;
        sendJson(res, 404, { error: 'Not found' });
      } catch (e) {
        sendJson(res, 500, { error: e.message });
      }
    });
  }

  async start() {
    await this.db.ensureReady();
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(this.port, resolve); });
    console.log(`API on :${this.port}  →  http://localhost:${this.port}`);
  }

  async stop(signal = 'SIGTERM') {
    console.log(`Stopping API (${signal})`);
    await new Promise((r) => this.server.close(r));
    await this.db.close();
  }
}

runService({
  createConfig: (env) => ({
    port:        createPort(env.PORT, 8080),
    databaseUrl: env.DATABASE_URL
  }),
  createService: (config) => new ApiService(config),
});
