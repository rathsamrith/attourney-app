import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { createOpenApiDocument, writeFrontendSpec } from './openapi.js';

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule));
  app.enableShutdownHooks();

  const spec = createOpenApiDocument(app);
  SwaggerModule.setup('api/docs', app, spec);
  if (process.env.NODE_ENV !== 'production') writeFrontendSpec(spec);

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
