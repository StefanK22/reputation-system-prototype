import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_URL    = process.env.API_URL        ?? 'http://localhost:8080';
const LEDGER_URL = process.env.CANTON_API_URL ?? 'http://localhost:7575';

const proxy = {
  '/api':    { target: API_URL,    rewrite: (p) => p.replace(/^\/api/, '')    },
  '/ledger': { target: LEDGER_URL, rewrite: (p) => p.replace(/^\/ledger/, '') },
};

export default defineConfig({
  plugins: [react()],
  server:  { proxy },
  preview: { host: true, port: 3000, proxy },
});
