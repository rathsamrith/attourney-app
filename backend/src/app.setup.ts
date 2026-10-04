import { INestApplication, ValidationPipe } from '@nestjs/common';

/** HTTP setup shared by main.ts and the e2e tests, so tests run the real configuration. */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableCors({ origin: process.env.WEB_ORIGIN, credentials: true });
  return app;
}
