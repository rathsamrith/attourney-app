// End-to-end walk through every epic, in the order a hearing happens.
// Runs against the e2e database and Redis; each run gets its own matter and session.
import type { INestApplication } from '@nestjs/common';
import { strFromU8, unzipSync } from 'fflate';
import type { App } from 'supertest/types.js';
import { RecordService } from '../src/record/record.service.js';
import { sha256Hex } from '../src/record/canonical.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { api, createHearing, createTestApp, type CastMember } from './helpers.js';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<< /Type /Page >>endobj\n2 0 obj<< /Type /Page >>endobj\n%%EOF\n', 'latin1');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Attest features (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let as: ReturnType<typeof api>['as'];
  let h: Awaited<ReturnType<typeof createHearing>>;
  let sid: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const client = api(app);
    as = (member) => client.as(member);
    h = await createHearing(prisma);
    sid = h.session.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  const checkIn = async (m: CastMember) => {
    await as(m).post(`/sessions/${sid}/checkin/identity`, { method: 'biometric', evidence: 'data:image/png;base64,ok' }).expect(200);
    await as(m).post(`/sessions/${sid}/checkin/oath`).expect(204);
    if (m !== 'officer') await as('officer').post(`/participants/${h.participantId(m)}/admit`).expect(204);
  };

  describe('E1 check-in (R1)', () => {
    it('admits the record officer on their own oath', async () => {
      await checkIn('officer');
      const s = await as('officer').get(`/sessions/${sid}/checkin`).expect(200);
      expect(s.body).toMatchObject({ verification: 'verified', oathAffirmed: true, admitted: true, presence: 'present' });
    });

    it('blocks the oath after a failed identity check, and caps automated attempts at three', async () => {
      const fail = () => as('witness').post(`/sessions/${sid}/checkin/identity`, { method: 'biometric', evidence: 'fail' });
      const first = await fail().expect(200);
      expect(first.body).toMatchObject({ passed: false, attemptsLeft: 2 });

      const oath = await as('witness').post(`/sessions/${sid}/checkin/oath`).expect(409);
      expect(oath.body).toMatchObject({ rule: 'R1', code: 'checkin.notVerified' });

      await fail().expect(200);
      await fail().expect(200);
      const fourth = await fail().expect(409);
      expect(fourth.body).toMatchObject({ rule: 'R1', code: 'checkin.attemptsExhausted' });

      const queue = await as('officer').get(`/sessions/${sid}/checkin/queue`).expect(200);
      expect(queue.body.manualVerification.map((q: { participantId: string }) => q.participantId)).toContain(h.participantId('witness'));
    });

    it('lets only the record officer clear a failed check, after which the oath and admission work', async () => {
      await as('counselP').post(`/participants/${h.participantId('witness')}/manual-verification`, { documentChecked: 'Passport N1234567' }).expect(403);
      await as('officer').post(`/participants/${h.participantId('witness')}/admit`).expect(409);
      await as('officer').post(`/participants/${h.participantId('witness')}/manual-verification`, { documentChecked: 'Passport N1234567' }).expect(204);
      await as('officer').post(`/participants/${h.participantId('witness')}/admit`).expect(409); // no oath yet
      await as('witness').post(`/sessions/${sid}/checkin/oath`).expect(204);
      await as('officer').post(`/participants/${h.participantId('witness')}/admit`).expect(204);
    });

    it('accepts certificate login and checks everyone else in', async () => {
      const cert = await as('counselD')
        .post(`/sessions/${sid}/checkin/identity`, { method: 'certificate', evidence: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----' })
        .expect(200);
      expect(cert.body.passed).toBe(true);
      await as('counselD').post(`/sessions/${sid}/checkin/oath`).expect(204);
      await as('officer').post(`/participants/${h.participantId('counselD')}/admit`).expect(204);
      for (const m of ['presiding', 'panelist1', 'panelist2', 'counselP', 'reporter'] as const) await checkIn(m);
    });

    it('records sign-in in the audit trail', async () => {
      await as('counselP').post('/auth/signed-in').expect(204);
      expect(await prisma.auditEvent.count({ where: { action: 'auth.signed_in', actorId: h.userId('counselP') } })).toBeGreaterThan(0);
    });
  });

  describe('E2 live proceeding', () => {
    it('accrues sworn time only on the record (R2)', async () => {
      await as('officer').post(`/sessions/${sid}/record-state`, { state: 'open' }).expect(204);
      await sleep(1200);
      const s = await as('witness').get(`/sessions/${sid}`).expect(200);
      const witness = s.body.participants.find((p: { id: string }) => p.id === h.participantId('witness'));
      expect(witness.swornSeconds).toBeGreaterThanOrEqual(1);
    });

    it('transcribes on the record and versions corrections in the audit trail', async () => {
      await as('reporter').post(`/sessions/${sid}/transcript`, { kind: 'q', speakerId: h.participantId('counselP'), text: 'Where were you on 12 March?' }).expect(204);
      await as('reporter').post(`/sessions/${sid}/transcript`, { kind: 'a', speakerId: h.participantId('witness'), text: 'In Oslo.' }).expect(204);
      await as('witness').post(`/sessions/${sid}/transcript`, { kind: 'a', text: 'x' }).expect(403);
      const lines = await as('counselD').get(`/sessions/${sid}/transcript`).expect(200);
      expect(lines.body.map((l: { seq: number }) => l.seq)).toEqual([1, 2]);
      await as('reporter').patch(`/transcript-lines/${lines.body[1].id}`, { text: 'In Oslo, Norway.' }).expect(204);
      const version = await prisma.auditEvent.findFirstOrThrow({ where: { sessionId: sid, action: 'transcript.line_corrected' } });
      expect(version.data).toMatchObject({ before: 'In Oslo.', after: 'In Oslo, Norway.' });
    });

    it('lets counsel object and only the presiding adjudicator rule', async () => {
      const line = (await as('counselD').get(`/sessions/${sid}/transcript`)).body[0];
      await as('counselD').post(`/sessions/${sid}/objections`, { grounds: 'leading', transcriptLineId: line.id }).expect(204);
      const [objection] = (await as('presiding').get(`/sessions/${sid}/objections`)).body;
      expect(objection).toMatchObject({ grounds: 'leading', ruling: 'pending', lineSeq: 1 });
      await as('panelist1').post(`/objections/${objection.id}/ruling`, { ruling: 'sustained' }).expect(403);
      await as('presiding').post(`/objections/${objection.id}/ruling`, { ruling: 'overruled' }).expect(204);
      const again = await as('presiding').post(`/objections/${objection.id}/ruling`, { ruling: 'sustained' }).expect(409);
      expect(again.body.code).toBe('objection.alreadyRuled');
    });

    it('keeps caucus rooms to one side and stops sworn time there', async () => {
      await as('counselP').post(`/sessions/${sid}/caucus`).expect(204);
      const [room] = (await as('counselP').get(`/sessions/${sid}/caucus`)).body;
      expect((await as('counselD').get(`/sessions/${sid}/caucus`)).body).toEqual([]);
      await as('counselD').post(`/caucus/${room.id}/join`).expect(404);
      await as('counselP').post(`/caucus/${room.id}/join`).expect(204);
      expect((await as('counselP').get(`/sessions/${sid}/caucus`)).body[0].iAmIn).toBe(true);
      const blocked = await as('officer').post(`/participants/${h.participantId('counselP')}/presence`, { state: 'absent' }).expect(409);
      expect(blocked.body.code).toBe('presence.inCaucus');
      await as('counselP').post(`/caucus/${room.id}/close`).expect(204);
      const s = await as('counselP').get(`/sessions/${sid}`);
      expect(s.body.participants.find((p: { id: string }) => p.id === h.participantId('counselP')).presence).toBe('present');
    });

    it('issues video tokens only to people allowed in the room', async () => {
      const t = await as('witness').post(`/sessions/${sid}/media-token`, { room: 'hearing' }).expect(200);
      expect(t.body.roomName).toBe(`hearing-${sid}`);
      expect(t.body.token.split('.')).toHaveLength(3);
      await as('counselP').post(`/sessions/${sid}/caucus`).expect(204);
      const [room] = (await as('counselP').get(`/sessions/${sid}/caucus`)).body;
      await as('counselP').post(`/sessions/${sid}/media-token`, { room: room.id }).expect(409); // not joined yet
      await as('counselD').post(`/sessions/${sid}/media-token`, { room: room.id }).expect(404);
      await as('counselP').post(`/caucus/${room.id}/close`).expect(204);
    });

    it('rules on a continuance only once it is requested, and a grant recesses (R3)', async () => {
      await as('counselP').post(`/sessions/${sid}/continuances`, { reason: 'Expert unavailable until next week.' }).expect(204);
      const dup = await as('counselD').post(`/sessions/${sid}/continuances`, { reason: 'Same.' }).expect(409);
      expect(dup.body.code).toBe('continuance.pendingExists');
      const [c] = (await as('presiding').get(`/sessions/${sid}/continuances`)).body;
      await as('presiding').post(`/continuances/${c.id}/ruling`, { status: 'granted' }).expect(204);
      expect((await as('witness').get(`/sessions/${sid}`)).body.recordState).toBe('recess');
      const again = await as('presiding').post(`/continuances/${c.id}/ruling`, { status: 'denied' }).expect(409);
      expect(again.body).toMatchObject({ rule: 'R3', code: 'continuance.alreadyRuled' });
      await as('officer').post(`/sessions/${sid}/record-state`, { state: 'open' }).expect(204);
    });
  });

  describe('E3 exhibits (R7)', () => {
    let exhibitId: string;

    it('hides tagged exhibits from everyone but the owning side, including in the audit trail', async () => {
      await as('counselP').upload('/exhibits').field('sessionId', sid).field('title', 'Charter party').attach('file', PDF, 'charter.pdf').expect(204);
      const mine = (await as('counselP').get(`/sessions/${sid}/exhibits`)).body;
      const tagged = mine.find((e: { title: string }) => e.title === 'Charter party');
      expect(tagged).toMatchObject({ status: 'tagged', pages: 2, mine: true });
      expect(tagged.label).toMatch(/^P-T-/);
      exhibitId = tagged.id;

      for (const m of ['counselD', 'presiding', 'officer'] as const) {
        const list = (await as(m).get(`/sessions/${sid}/exhibits`)).body;
        expect(list.find((e: { id: string }) => e.id === exhibitId)).toBeUndefined();
        await as(m).get(`/exhibits/${exhibitId}/file`).expect(404);
      }
      const auditD = (await as('counselD').get(`/audit?sessionId=${sid}`)).body;
      expect(auditD.find((e: { action: string }) => e.action === 'exhibit.tagged')).toBeUndefined();
      const auditP = (await as('counselP').get(`/audit?sessionId=${sid}`)).body;
      expect(auditP.find((e: { action: string }) => e.action === 'exhibit.tagged')).toBeDefined();
    });

    it('assigns the official label on offer and discloses it to all', async () => {
      await as('counselD').post(`/exhibits/${exhibitId}/offer`, { sessionId: sid }).expect(404);
      await as('counselP').post(`/exhibits/${exhibitId}/offer`, { sessionId: sid }).expect(204);
      const seen = (await as('counselD').get(`/sessions/${sid}/exhibits`)).body.find((e: { id: string }) => e.id === exhibitId);
      expect(seen).toMatchObject({ label: 'P-001', status: 'offered', mine: false });
      await as('counselD').get(`/exhibits/${exhibitId}/file`).expect(200);
    });

    it('publishes only admitted exhibits, ruled on by the presiding adjudicator', async () => {
      const early = await as('counselP').post(`/exhibits/${exhibitId}/publish`, { sessionId: sid }).expect(409);
      expect(early.body.code).toBe('exhibit.notAdmitted');
      await as('panelist1').post(`/exhibits/${exhibitId}/ruling`, { sessionId: sid, ruling: 'admitted' }).expect(403);
      await as('presiding').post(`/exhibits/${exhibitId}/ruling`, { sessionId: sid, ruling: 'admitted' }).expect(204);
      await as('counselP').post(`/exhibits/${exhibitId}/publish`, { sessionId: sid }).expect(204);
      const pub = (await as('witness').get(`/sessions/${sid}/publication`)).body;
      expect(pub.current).toMatchObject({ exhibitId, label: 'P-001' });
      await as('witness').post(`/sessions/${sid}/publication/end`).expect(403);
      await as('presiding').post(`/sessions/${sid}/publication/end`).expect(204);
    });
  });

  describe('E4 deliberation (R6)', () => {
    it('keeps every vote hidden until the whole panel has sealed, then reveals at once', async () => {
      await as('counselP').post(`/sessions/${sid}/ballot`, { choice: 'for_plaintiff' }).expect(403);
      await as('presiding').post(`/sessions/${sid}/ballot`, { choice: 'for_defense' }).expect(204);
      await as('presiding').post(`/sessions/${sid}/ballot`, { choice: 'for_plaintiff' }).expect(204);
      expect((await as('presiding').get(`/sessions/${sid}/deliberation`)).body).toMatchObject({ myStatus: 'draft', myDraftChoice: 'for_plaintiff' });
      await as('presiding').post(`/sessions/${sid}/ballot/seal`).expect(204);
      expect((await as('presiding').get(`/sessions/${sid}/deliberation`)).body).toMatchObject({ myStatus: 'sealed', myDraftChoice: null, revealed: null });
      const change = await as('presiding').post(`/sessions/${sid}/ballot`, { choice: 'for_defense' }).expect(409);
      expect(change.body.rule).toBe('R6');

      await as('panelist1').post(`/sessions/${sid}/ballot`, { choice: 'for_plaintiff' }).expect(204);
      await as('panelist1').post(`/sessions/${sid}/ballot/seal`).expect(204);
      const progress = (await as('counselD').get(`/sessions/${sid}/deliberation`)).body;
      expect(progress).toMatchObject({ panelSize: 3, sealedCount: 2, revealed: null });

      await as('panelist2').post(`/sessions/${sid}/ballot`, { choice: 'for_defense' }).expect(204);
      await as('panelist2').post(`/sessions/${sid}/ballot/seal`).expect(204);
      const reveal = (await as('counselD').get(`/sessions/${sid}/deliberation`)).body.revealed;
      expect(reveal.outcome).toBe('for_plaintiff');
      expect(reveal.votes).toHaveLength(3);
      const audit = await prisma.auditEvent.findMany({ where: { sessionId: sid, entity: 'ballot' } });
      expect(JSON.stringify(audit.map((a) => a.data))).not.toMatch(/for_plaintiff|for_defense/);
    });
  });

  describe('E5 record integrity (R4, R5)', () => {
    it('opens the errata window when the session closes', async () => {
      await as('officer').post(`/sessions/${sid}/record-state`, { state: 'closed' }).expect(204);
      const r = (await as('officer').get(`/sessions/${sid}/record`)).body;
      expect(r).toMatchObject({ sessionClosed: true, seal: { errataWindowOpen: true, lockedAt: null } });
      const late = await as('reporter').post(`/sessions/${sid}/transcript`, { kind: 'procedural', text: 'x' }).expect(409);
      expect(late.body.code).toBe('transcript.closed');
    });

    it('refuses to lock while the errata window is open, or to export before locking', async () => {
      const lock = await as('officer').post(`/sessions/${sid}/seal/lock`).expect(409);
      expect(lock.body).toMatchObject({ rule: 'R4', code: 'seal.windowOpen' });
      const exp = await as('officer').post(`/sessions/${sid}/exports`).expect(409);
      expect(exp.body).toMatchObject({ rule: 'R5', code: 'export.notLocked' });
    });

    it('blocks an early close while errata are undecided', async () => {
      const line = (await as('witness').get(`/sessions/${sid}/transcript`)).body[1];
      await as('witness').post(`/sessions/${sid}/errata`, { transcriptLineId: line.id, corrected: 'In Bergen, Norway.', kind: 'substantive' }).expect(204);
      const close = await as('officer').post(`/sessions/${sid}/errata/close`).expect(409);
      expect(close.body).toMatchObject({ rule: 'R4', code: 'errata.undecided' });
      const [erratum] = (await as('officer').get(`/sessions/${sid}/record`)).body.errata;
      expect(erratum).toMatchObject({ lineSeq: 2, original: 'In Oslo, Norway.', status: 'pending' });
      await as('officer').post(`/errata/${erratum.id}/decision`, { status: 'accepted' }).expect(204);
      await as('officer').post(`/sessions/${sid}/errata/close`).expect(204);
    });

    it('locks with a digest that matches the transcript and a valid signature', async () => {
      await as('officer').post(`/sessions/${sid}/seal/lock`).expect(204);
      const seal = (await as('witness').get(`/sessions/${sid}/record`)).body.seal;
      expect(seal.digestSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(await app.get(RecordService).verify(sid)).toEqual({ digestMatches: true, signatureValid: true });
      const line = await prisma.transcriptLine.findFirstOrThrow({ where: { sessionId: sid } });
      await expect(prisma.transcriptLine.update({ where: { id: line.id }, data: { text: 'tampered' } })).rejects.toThrow(/sealed/);
    });

    it('exports a bundle whose manifest and files verify against the seal', async () => {
      await as('officer').post(`/sessions/${sid}/exports`).expect(204);
      const r = (await as('officer').get(`/sessions/${sid}/record`)).body;
      const res = await as('counselP')
        .get(`/exports/${r.exports[0].id}/file`)
        .buffer(true)
        .parse((response, cb) => {
          const chunks: Buffer[] = [];
          response.on('data', (c: Buffer) => chunks.push(c));
          response.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      const files = unzipSync(new Uint8Array(res.body as Buffer));
      const manifest = JSON.parse(strFromU8(files['manifest.json']));
      expect(manifest.transcriptDigestSha256).toBe(r.seal.digestSha256);
      expect(sha256Hex(Buffer.from(files['transcript.canonical.jsonl']))).toBe(r.seal.digestSha256);
      for (const [name, hash] of Object.entries(manifest.files)) expect(sha256Hex(Buffer.from(files[name]))).toBe(hash);
      expect(strFromU8(files['transcript.txt'])).toContain('In Bergen, Norway.');
      expect(sha256Hex(Buffer.from(files['manifest.json']))).toBe(r.exports[0].manifestSha256);
    });
  });

  describe('E6 docket and E7 notifications', () => {
    it('shows the officer the week with sealing status, and refuses counsel', async () => {
      const week = (await as('officer').get(`/docket?weekOf=${new Date().toISOString().slice(0, 10)}`).expect(200)).body;
      const all = week.days.flatMap((d: { sessions: { id: string; sealStatus: string }[] }) => d.sessions);
      expect(all.find((s: { id: string }) => s.id === sid)?.sealStatus).toBe('exported');
      await as('counselP').get('/docket').expect(403);
    });

    it('states numerator, denominator and period for every metric', async () => {
      const metrics = (await as('officer').get('/docket/metrics').expect(200)).body;
      expect(metrics.map((m: { key: string }) => m.key)).toEqual([
        'verificationPassRate',
        'objectionsPerSession',
        'continuanceGrantRate',
        'meanHoursToHashLock',
      ]);
      for (const m of metrics) expect(m).toEqual(expect.objectContaining({ numerator: expect.any(Number), denominator: expect.any(Number), periodFrom: expect.any(String) }));
    });

    it('notifies by role', async () => {
      const officer = (await as('officer').get(`/sessions/${sid}/notifications`)).body.map((n: { action: string }) => n.action);
      expect(officer).toContain('erratum.filed');
      const witness = (await as('witness').get(`/sessions/${sid}/notifications`)).body.map((n: { action: string }) => n.action);
      expect(witness).not.toContain('erratum.filed');
      expect(witness).toContain('ballot.revealed');
      expect(witness).toContain('participant.admitted');
    });

    it('leaves the audit chain intact after the whole hearing', async () => {
      const { AuditService } = await import('../src/audit/audit.service.js');
      expect(await app.get(AuditService).findFirstBrokenLink()).toBeNull();
    });
  });
});
