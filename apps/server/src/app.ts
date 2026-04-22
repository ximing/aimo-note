import express, { Express } from 'express';
import { RoutingControllersOptions, useContainer, createExpressServer } from 'routing-controllers';
import { Container } from 'typedi';

export async function bootstrap(container: Container): Promise<Express> {
  // Set up TypeDI container for routing-controllers
  useContainer(container);

  const options: RoutingControllersOptions = {
    controllers: [], // Controllers will be registered here
    middlewares: [], // Middlewares will be registered here
    defaultErrorHandler: true,
    validation: false, // Enable when zod-validation-interceptor is ready
  };

  const app = createExpressServer(options);

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
