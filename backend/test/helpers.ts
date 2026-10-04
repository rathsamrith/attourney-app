import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { SessionRole } from '../src/generated/prisma/client.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { TokenVerifier } from '../src/auth/token-verifier.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/** Seeded users (prisma/seed.ts) and the part each plays in test sessions. */
export const CAST = {
  presiding: 'ruth.okafor@attest.local',
  panelist1: 'wei.chen@attest.local',
  panelist2: 'h.albrecht@attest.local',
  counselP: 'maya.lindqvist@attest.local',
  counselD: 'daniel.osei@attest.local',
  officer: 'sokha.prum@attest.local',
  witness: 'jordan.reyes@attest.local',
  reporter: 'dara.kim@attest.local',
} as const;
export type CastMember = keyof typeof CAST;

const SESSION_ROLE: Record<CastMember, SessionRole> = {
  presiding: 'presiding',
  panelist1: 'panelist',
  panelist2: 'panelist',
  counselP: 'counsel',
  counselD: 'counsel',
  officer: 'officer',
  witness: 'witness',
  reporter: 'reporter',
};

/** The app with the real configuration, except tokens: "Bearer <email>" signs in as that user. */
export async function createTestApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TokenVerifier)
    .useFactory({
      inject: [PrismaService],
      factory: (db: PrismaService) => ({
        async verify(token?: string) {
          const user = token ? await db.user.findUnique({ where: { email: token } }) : null;
          if (!user) throw new UnauthorizedException('Sign in to continue.');
          return { id: user.id, email: user.email, name: user.name, role: user.role, side: user.side };
        },
      }),
    })
    .compile();
  const app: INestApplication<App> = configureApp(moduleRef.createNestApplication());
  await app.init();
  return app;
}

/** A fresh matter and day-1 session with the whole cast as participants. */
export async function createHearing(prisma: PrismaService) {
  const users = await prisma.user.findMany({ where: { email: { in: Object.values(CAST) } } });
  const userId = (m: CastMember) => users.find((u) => u.email === CAST[m])!.id;
  const matter = await prisma.matter.create({
    data: { caption: 'Feature fixture', docketNo: `FEAT-${randomUUID().slice(0, 8)}`, forum: 'arbitration' },
  });
  const session = await prisma.session.create({ data: { matterId: matter.id, dayNo: 1, startsAt: new Date() } });
  await prisma.participant.createMany({
    data: (Object.keys(CAST) as CastMember[]).map((m) => ({ sessionId: session.id, userId: userId(m), sessionRole: SESSION_ROLE[m] })),
  });
  const participants = await prisma.participant.findMany({ where: { sessionId: session.id } });
  const participantId = (m: CastMember) => participants.find((p) => p.userId === userId(m))!.id;
  return { matter, session, userId, participantId };
}

/** Shorthand for authenticated requests: api(app).as('officer').post(...). */
export function api(app: INestApplication<App>) {
  return {
    as(member: CastMember) {
      const auth = { Authorization: `Bearer ${CAST[member]}` };
      const server = app.getHttpServer();
      return {
        get: (url: string) => request(server).get(`/api${url}`).set(auth),
        post: (url: string, body?: object) => request(server).post(`/api${url}`).set(auth).send(body ?? {}),
        patch: (url: string, body?: object) => request(server).patch(`/api${url}`).set(auth).send(body ?? {}),
        upload: (url: string) => request(server).post(`/api${url}`).set(auth),
      };
    },
  };
}
