import 'dotenv/config';
import express from 'express';
import { apiRouter } from './api/index.ts';

export function createExpressApp(): express.Application {
  const app = express();

  // Trust upstream reverse proxy (Vercel, AWS ALB, Nginx) for accurate req.ip rate limiting (H1)
  app.set('trust proxy', 1);

  // Security headers (M7)
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Body parser aligned with Vercel 4.5MB serverless payload ceiling (M6)
  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: true, limit: '4mb' }));

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

  // Global JSON error handler middleware (M4)
  // Ensures malformed JSON payloads and unexpected errors return JSON instead of default HTML
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400 && 'body' in err) {
      res.status(400).json({ error: 'Malformed JSON payload in request body.' });
      return;
    }
    const statusCode = typeof err.status === 'number' ? err.status : 500;
    res.status(statusCode).json({
      error: process.env.NODE_ENV === 'production' && statusCode === 500
        ? 'Internal server error'
        : err.message || 'An unexpected error occurred.',
    });
  });

  return app;
}
