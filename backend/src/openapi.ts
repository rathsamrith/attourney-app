import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('Attest API').setVersion('0.1').addBearerAuth().addSecurityRequirements('bearer').build(),
    // SessionsController.setRecordState -> "sessionsSetRecordState" in the generated client.
    {
      operationIdFactory: (controller, method) =>
        controller.replace(/Controller$/, '').replace(/^./, (c) => c.toLowerCase()) + method[0].toUpperCase() + method.slice(1),
    },
  );
}

/** The frontend generates its typed client from this file (npm run gen:api in frontend/). */
export function writeFrontendSpec(spec: OpenAPIObject): string | null {
  const frontendDir = resolve(process.cwd(), '../frontend');
  if (!existsSync(frontendDir)) return null;
  const path = resolve(frontendDir, 'openapi.json');
  writeFileSync(path, JSON.stringify(spec, null, 2));
  return path;
}
