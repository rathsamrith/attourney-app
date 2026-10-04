import { execSync } from 'node:child_process';
import pg from 'pg';

/** Creates the e2e database if needed, then brings it to the latest migration and seed. */
export default async function setup() {
  const url = new URL(process.env.E2E_DATABASE_URL!);
  const dbName = url.pathname.slice(1);

  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (!exists.rowCount) await client.query(`CREATE DATABASE "${dbName}"`);
  await client.end();

  const env = { ...process.env, DATABASE_URL: url.toString() };
  execSync('npx prisma migrate deploy', { env, stdio: 'ignore' });
  execSync('npx prisma db seed', { env, stdio: 'ignore' });
}
