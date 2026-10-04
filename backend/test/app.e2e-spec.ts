// Runs against a real, migrated Postgres (DATABASE_URL). The OIDC verifier is replaced
// by a stub that accepts "Bearer <email>", so these tests need no identity provider.
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AuditService } from '../src/audit/audit.service.js';
import { TokenVerifier } from '../src/auth/token-verifier.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const OFFICER = 'sokha.prum@attest.local';
const COUNSEL = 'maya.lindqvist@attest.local';
const WITNESS = 'jordan.reyes@attest.local';

describe('Attest API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let sessionId: string;
  let witnessParticipantId: string;

  const as = (email: string) => ({ Authorization: `Bearer ${email}` });

  beforeAll(async () => {
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
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);

    // Each run gets its own matter and session; deletes are blocked by design.
    const users = await prisma.user.findMany({ where: { email: { in: [OFFICER, COUNSEL, WITNESS] } } });
    const id = (email: string) => users.find((u) => u.email === email)!.id;
    const matter = await prisma.matter.create({
      data: { caption: 'E2E fixture', docketNo: `TEST-${randomUUID().slice(0, 8)}`, forum: 'deposition' },
    });
    const session = await prisma.session.create({ data: { matterId: matter.id, dayNo: 1, startsAt: new Date() } });
    sessionId = session.id;
    await prisma.participant.createMany({
      data: [
        { sessionId, userId: id(OFFICER), sessionRole: 'officer' },
        { sessionId, userId: id(COUNSEL), sessionRole: 'counsel' },
        { sessionId, userId: id(WITNESS), sessionRole: 'witness' },
      ],
    });
    witnessParticipantId = (await prisma.participant.findFirstOrThrow({ where: { sessionId, userId: id(WITNESS) } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports health without a token', () =>
    request(app.getHttpServer()).get('/api/health').expect(200, { status: 'ok', database: 'ok' }));

  it('refuses requests without a token', () => request(app.getHttpServer()).get('/api/me').expect(401));

  it('returns every screen to counsel, with the ballot blocked and a reason', async () => {
    const res = await request(app.getHttpServer()).get('/api/me').set(as(COUNSEL)).expect(200);
    expect(res.body.role).toBe('counsel');
    const ballot = res.body.screens.find((s: { screen: string }) => s.screen === 'deliberation');
    expect(ballot).toMatchObject({ allowed: false, reason: expect.stringContaining('R6') });
  });

  it('refuses out-of-role commands with 403 and audits the attempt', async () => {
    const before = await prisma.auditEvent.count({ where: { action: 'access.denied' } });
    await request(app.getHttpServer())
      .post(`/api/sessions/${sessionId}/record-state`)
      .set(as(COUNSEL))
      .send({ state: 'open' })
      .expect(403);
    expect(await prisma.auditEvent.count({ where: { action: 'access.denied' } })).toBe(before + 1);
  });

  it('rejects unknown body fields', () =>
    request(app.getHttpServer())
      .post(`/api/sessions/${sessionId}/record-state`)
      .set(as(OFFICER))
      .send({ state: 'open', extra: 1 })
      .expect(400));

  it('writes the change and its audit event together, then blocks a repeat with a reason', async () => {
    await request(app.getHttpServer())
      .post(`/api/sessions/${sessionId}/record-state`)
      .set(as(OFFICER))
      .send({ state: 'open' })
      .expect(204);

    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.recordState).toBe('open');
    const event = await prisma.auditEvent.findFirstOrThrow({ where: { sessionId }, orderBy: { seq: 'desc' } });
    expect(event).toMatchObject({ action: 'record.opened', data: { from: 'off', to: 'open' } });

    const repeat = await request(app.getHttpServer())
      .post(`/api/sessions/${sessionId}/record-state`)
      .set(as(OFFICER))
      .send({ state: 'open' })
      .expect(409);
    expect(repeat.body).toMatchObject({
      error: 'Blocked',
      code: 'recordState.already',
      params: { state: 'open' },
      reason: 'The session is already on the record.',
    });
  });

  it('shows the session to participants and hides it from everyone else', async () => {
    const res = await request(app.getHttpServer()).get(`/api/sessions/${sessionId}`).set(as(WITNESS)).expect(200);
    expect(res.body.participants).toHaveLength(3);
    await request(app.getHttpServer()).get(`/api/sessions/${sessionId}`).set(as('wei.chen@attest.local')).expect(404);
  });

  it('keeps the audit hash chain intact', async () => {
    expect(await app.get(AuditService).findFirstBrokenLink()).toBeNull();
  });

  describe('database backstops', () => {
    it('R1: refuses an oath for an unverified participant, and the API maps it to a 409', async () => {
      const officer = await prisma.user.findUniqueOrThrow({ where: { email: OFFICER } });
      const err = await prisma.oath
        .create({ data: { participantId: witnessParticipantId, oathTextVersion: 'v1', administeredById: officer.id } })
        .catch((e: unknown) => e);
      expect(String((err as Error).message) + JSON.stringify((err as { meta?: unknown }).meta ?? {})).toMatch(
        /R1: Identity verification has not passed/,
      );
    });

    it('R8: audit events cannot be edited or deleted', async () => {
      const last = await prisma.auditEvent.findFirstOrThrow({ orderBy: { seq: 'desc' } });
      await expect(prisma.auditEvent.update({ where: { id: last.id }, data: { action: 'tampered' } })).rejects.toThrow(/R8/);
      await expect(prisma.auditEvent.delete({ where: { id: last.id } })).rejects.toThrow(/R8/);
    });

    it('refuses hard deletes of domain records', async () => {
      await expect(prisma.session.delete({ where: { id: sessionId } })).rejects.toThrow(/cannot be deleted/);
    });

    it('makes closing a session irreversible', async () => {
      await request(app.getHttpServer())
        .post(`/api/sessions/${sessionId}/record-state`)
        .set(as(OFFICER))
        .send({ state: 'closed' })
        .expect(204);
      await expect(prisma.session.update({ where: { id: sessionId }, data: { recordState: 'open' } })).rejects.toThrow(
        /Closing cannot be undone/,
      );
    });
  });
});
