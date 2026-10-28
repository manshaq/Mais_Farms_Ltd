import 'dotenv/config';
import { createServer as createViteServer } from 'vite';
import path from 'node:path';
import express from 'express';
import { createExpressApp } from './server/app.ts';

async function startServer() {
  const app = createExpressApp();
  let viteServer: any = null;

  // Vite middleware in development or static file serving in production
  if (process.env.NODE_ENV !== 'production') {
    viteServer = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(viteServer.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`MAIS LTD Server listening on http://0.0.0.0:${PORT}`);
  });

  // Graceful shutdown handling (SIGTERM / SIGINT)
  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}. Gracefully shutting down MAIS LTD server...`);
    server.close(async () => {
      if (viteServer) {
        await viteServer.close();
      }
      console.log('MAIS LTD HTTP server closed cleanly.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();
