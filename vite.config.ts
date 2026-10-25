import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

/** /live opens the app in live Discord mode (vercel.json does the same in production). */
const LIVE = '/app/?live=1';
const liveRedirect = (): Plugin => {
  const redirect = (req: { url?: string }, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: () => void }, next: () => void) => {
    if (req.url !== '/live' && req.url !== '/live/') return next();
    res.statusCode = 302;
    res.setHeader('Location', LIVE);
    res.end();
  };
  return { name: 'live-redirect', configureServer: (s) => void s.middlewares.use(redirect), configurePreviewServer: (s) => void s.middlewares.use(redirect) };
};

// Two pages: the marketing site at / and the live demo app at /app/ (/live opens it in live Discord mode).
export default defineConfig({
  plugins: [react(), liveRedirect()],
  build: {
    rollupOptions: {
      input: {
        landing: resolve(import.meta.dirname, 'index.html'),
        app: resolve(import.meta.dirname, 'app/index.html'),
      },
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
