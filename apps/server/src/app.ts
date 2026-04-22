import express, { Express, Request, Response, NextFunction } from 'express';
import {
  RoutingControllersOptions,
  useContainer,
  createExpressServer,
} from 'routing-controllers';
import { Container } from 'typedi';
import { getConfig } from './config/config.js';
import { loadEnv } from './config/env.js';
import { testConnection } from './db/connection.js';

export async function bootstrap(container: Container): Promise<Express> {
  // Load environment and validate
  loadEnv();

  // Set timezone from env (loadEnv already defaulted TZ to 'UTC' in schema)
  const config = getConfig();
  process.env.TZ = config.timezone;

  // Initialize DB connection and verify health
  const dbHealth = await testConnection();
  if (!dbHealth.ok) {
    throw new Error(`Database connection failed: ${dbHealth.error}`);
  }

  // Set up TypeDI container for routing-controllers
  useContainer(container as unknown as Parameters<typeof useContainer>[0]);

  const options: RoutingControllersOptions = {
    controllers: [], // Controllers will be registered here
    middlewares: [], // Middlewares will be registered here
    defaultErrorHandler: true,
    validation: false, // Enable when zod-validation-interceptor is ready
  };

  const app = createExpressServer(options);

  // CORS configuration
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && config.cors.origin.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', String(config.cors.credentials));
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With'
      );
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.end();
      return;
    }
    next();
  });

  // Health check endpoint
  app.get('/health', async (_req: Request, res: Response) => {
    const dbHealth = await testConnection();
    res.json({
      status: dbHealth.ok ? 'ok' : 'degraded',
      env: config.env,
      db: dbHealth,
    });
  });

  // Global error handler
  app.use(
    (
      err: Error & { httpCode?: number; details?: unknown },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const httpCode = err.httpCode || 500;
      const message = httpCode === 500 ? 'Internal Server Error' : err.message;

      res.status(httpCode).json({
        error: {
          message,
          ...(config.env !== 'production' && { details: err.details }),
        },
      });
    }
  );

  return app;
}
