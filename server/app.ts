import 'dotenv/config';
import express from 'express';
import { apiRouter } from './api/index.ts';

export function createExpressApp(): express.Application {
  const app = express();

  // Basic security and parsing middleware
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Liveness / readiness health probe for container & serverless orchestration
  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      system: 'MAIS LTD Livestock Management System',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // Mount modular authenticated API routes (/api/*)
  app.use('/api', apiRouter);

  return app;
}
