// Writes frontend/openapi.json without serving HTTP: `npm run openapi`.
// Runs from the compiled build because Nest needs the decorator metadata tsc emits.
// The app is created but never initialized, so no database or Redis connection is made.
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { createOpenApiDocument, writeFrontendSpec } from './openapi.js';

const app = configureApp(await NestFactory.create(AppModule, { logger: ['error'], abortOnError: false }));
const path = writeFrontendSpec(createOpenApiDocument(app));
console.log(path ? `Wrote ${path}` : 'frontend/ not found; nothing written.');
// Skip app.close(): it would run shutdown hooks for connections that were never opened.
process.exit(0);
