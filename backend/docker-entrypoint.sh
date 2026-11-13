#!/bin/sh
# Startup for the Attest API container: apply migrations, seed once, then run.
set -eu

echo "[attest] applying database migrations..."
i=1
until npx prisma migrate deploy; do
  if [ "$i" -ge 30 ]; then
    echo "[attest] migrations still failing after 30 tries, giving up." >&2
    exit 1
  fi
  echo "[attest] database not ready, retrying migrate ($i/30)..."
  i=$((i + 1))
  sleep 2
done

# Seed only when the matter table is empty. Users are upserted, but the demo
# matter/session are plain creates, so seeding twice would duplicate them.
NEEDS_SEED=$(node -e "import('pg').then(async ({default: pg}) => { const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); try { await c.connect(); const r = await c.query('select count(*)::int as n from matters'); process.stdout.write(r.rows[0].n === 0 ? 'yes' : 'no'); } catch (e) { process.stdout.write('yes'); } finally { try { await c.end(); } catch (e) {} } })")

if [ "$NEEDS_SEED" = "yes" ]; then
  echo "[attest] seeding database (dev users, one matter, one session)..."
  npx prisma db seed
else
  echo "[attest] database already seeded, skipping seed."
fi

echo "[attest] starting API on port ${PORT:-3000} (docs at /api/docs)"
exec node dist/main
