// Development seed. Users match the Keycloak dev realm (infra/keycloak/attest-realm.json).
// Run with: npx prisma db seed
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PrismaClient, type SessionRole, type Side, type UserRole } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const USERS: { email: string; name: string; role: UserRole; side: Side; sessionRole: SessionRole }[] = [
  { email: 'ruth.okafor@attest.local', name: 'Hon. Ruth Okafor', role: 'adj', side: 'T', sessionRole: 'presiding' },
  { email: 'wei.chen@attest.local', name: 'Hon. Wei Chen', role: 'adj', side: 'T', sessionRole: 'panelist' },
  { email: 'h.albrecht@attest.local', name: 'Hon. Hanna Albrecht', role: 'adj', side: 'T', sessionRole: 'panelist' },
  { email: 'maya.lindqvist@attest.local', name: 'Maya Lindqvist', role: 'counsel', side: 'P', sessionRole: 'counsel' },
  { email: 'daniel.osei@attest.local', name: 'Daniel Osei', role: 'counsel', side: 'D', sessionRole: 'counsel' },
  { email: 'sokha.prum@attest.local', name: 'Sokha Prum', role: 'officer', side: 'T', sessionRole: 'officer' },
  { email: 'jordan.reyes@attest.local', name: 'Jordan Reyes', role: 'witness', side: 'P', sessionRole: 'witness' },
  // Court reporter: staff account (officer role) who plays the reporter in sessions.
  { email: 'dara.kim@attest.local', name: 'Dara Kim', role: 'officer', side: 'T', sessionRole: 'reporter' },
];

/** A one-page PDF with a title line, so seed exhibits open in the viewer. */
function samplePdf(title: string): Buffer {
  const text = title.replace(/[()\\]/g, '');
  const content = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/** Writes a sample PDF into local storage and returns its file reference. */
function storeSample(name: string, title: string): string {
  const dir = resolve(process.env.STORAGE_DIR ?? './storage', 'seed');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), samplePdf(title));
  return `local:seed/${name}`;
}

async function main() {
  // Users are upserted every run, so new dev accounts reach existing databases.
  const users = await Promise.all(
    USERS.map(({ sessionRole: _, ...u }) =>
      prisma.user.upsert({
        where: { email: u.email },
        update: {},
        create: { ...u, authMethod: 'password_mfa', mfaEnrolled: true },
      }),
    ),
  );

  const existing = await prisma.matter.findUnique({
    where: { docketNo: 'ARB-2026-0412' },
    include: { sessions: { where: { dayNo: 1 } } },
  });
  if (existing) {
    const { count } = await prisma.participant.createMany({
      data: USERS.map((u, i) => ({ sessionId: existing.sessions[0].id, userId: users[i].id, sessionRole: u.sessionRole })),
      skipDuplicates: true,
    });
    console.log(`Seed data already present; added ${count} missing participant(s).`);
    return;
  }

  const matter = await prisma.matter.create({
    data: {
      caption: 'Halvorsen Shipping AS v. Meridian Marine Ltd.',
      docketNo: 'ARB-2026-0412',
      forum: 'arbitration',
    },
  });

  const startsAt = new Date();
  startsAt.setUTCHours(13, 0, 0, 0);
  const session = await prisma.session.create({
    data: { matterId: matter.id, dayNo: 1, startsAt },
  });

  await prisma.participant.createMany({
    data: USERS.map((u, i) => ({ sessionId: session.id, userId: users[i].id, sessionRole: u.sessionRole })),
  });

  // One private (tagged) exhibit per side, so the R7 projection has something to hide.
  // Tagged exhibits carry a private label; official labels are assigned when offered.
  await prisma.exhibit.createMany({
    data: [
      { matterId: matter.id, label: 'P-T-seed01', title: 'Charter party, 12 March 2025', pages: 1, side: 'P', status: 'tagged', fileRef: storeSample('p-charter.pdf', 'Charter party, 12 March 2025') },
      { matterId: matter.id, label: 'P-001', title: 'Survey report, MV Nordlys', pages: 1, side: 'P', status: 'offered', fileRef: storeSample('p-survey.pdf', 'Survey report, MV Nordlys'), offeredAt: new Date() },
      { matterId: matter.id, label: 'D-T-seed01', title: 'Port state inspection log', pages: 1, side: 'D', status: 'tagged', fileRef: storeSample('d-inspection.pdf', 'Port state inspection log') },
      { matterId: matter.id, label: 'D-001', title: 'Bunker delivery notes', pages: 1, side: 'D', status: 'admitted', fileRef: storeSample('d-bunker.pdf', 'Bunker delivery notes'), offeredAt: new Date() },
    ],
  });

  console.log(`Seeded ${users.length} users, matter ${matter.docketNo}, session ${session.id}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
