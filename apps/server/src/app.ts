import express, { Express, Request, Response, NextFunction } from 'express';
import {
  RoutingControllersOptions,
  useContainer,
  createExpressServer,
} from 'routing-controllers';
import { Container } from 'typedi';
import { logger } from './utils/logger.js';
import { getConfig } from './config/config.js';
import { loadEnv } from './config/env.js';
import { testConnection } from './db/connection.js';
import { AuthController } from './controllers/v1/auth.controller.js';
import { UserController } from './controllers/v1/user.controller.js';
import { VaultController } from './controllers/v1/vault.controller.js';
import { DeviceController } from './controllers/v1/device.controller.js';
import { SyncController } from './controllers/v1/sync.controller.js';
import { SnapshotController } from './controllers/v1/snapshot.controller.js';
import { AuthHandlerMiddleware } from './middlewares/auth-handler.js';
import { RequestContextMiddleware } from './middlewares/request-context.js';
import { SchedulerService } from './services/scheduler.service.js';

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

  // Initialize SchedulerService (non-blocking - log errors but don't crash server)
  try {
    const schedulerService = Container.get(SchedulerService);
    logger.info('SchedulerService initialized', {
      tasks: schedulerService.getTaskStatuses().map((t: { taskName: string }) => t.taskName),
    });

    // Run cleanup tasks every hour
    setInterval(() => {
      schedulerService.runAllCleanupTasks().catch(err => {
        logger.error('Scheduled cleanup failed', { error: err instanceof Error ? err.message : String(err) });
      });
    }, 60 * 60 * 1000);
  } catch (err) {
    logger.error('SchedulerService initialization failed - background tasks will not run', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Set up TypeDI container for routing-controllers
  useContainer(container as unknown as Parameters<typeof useContainer>[0]);

  const options: RoutingControllersOptions = {
    controllers: [AuthController, UserController, VaultController, DeviceController, SyncController, SnapshotController], // Controllers will be registered here
    middlewares: [AuthHandlerMiddleware, RequestContextMiddleware],
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
        'Content-Type, Authorization, X-Requested-With, X-Request-Id, X-Device-Id'
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
