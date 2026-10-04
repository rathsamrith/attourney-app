-- Database backstops for the product rules (spec v0.1, R1 to R8) and data-dictionary invariants.
-- Services check these first and return a readable 409; these triggers and constraints hold
-- even if a service has a bug. Messages are prefixed "R<n>: " or "ATTEST: " so the API's
-- exception filter can turn them into the same 409 shape.

-- ---------- side columns that only allow the two parties ----------
ALTER TABLE "exhibits"     ADD CONSTRAINT "exhibits_side_party"     CHECK ("side" IN ('P', 'D'));
ALTER TABLE "caucus_rooms" ADD CONSTRAINT "caucus_rooms_side_party" CHECK ("side" IN ('P', 'D'));

-- ---------- R1: identity before oath ----------
-- At most three automated attempts; manual checks are the officer override.
ALTER TABLE "identity_checks" ADD CONSTRAINT "identity_checks_attempts"
  CHECK ("attempt_no" >= 1 AND ("method" = 'manual' OR "attempt_no" <= 3));

CREATE FUNCTION attest_r1_manual_check_by_officer() RETURNS trigger AS $$
BEGIN
  IF NEW."method" = 'manual' AND NOT EXISTS (
    SELECT 1 FROM "users" WHERE "id" = NEW."verified_by" AND "role" = 'officer'
  ) THEN
    RAISE EXCEPTION 'R1: Manual verification must be performed by a record officer.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "identity_checks_r1" BEFORE INSERT ON "identity_checks"
  FOR EACH ROW EXECUTE FUNCTION attest_r1_manual_check_by_officer();

CREATE FUNCTION attest_r1_oath_requires_verified() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "participants" WHERE "id" = NEW."participant_id" AND "verification" = 'verified'
  ) THEN
    RAISE EXCEPTION 'R1: Identity verification has not passed, so the oath cannot be administered.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "oaths_r1" BEFORE INSERT ON "oaths"
  FOR EACH ROW EXECUTE FUNCTION attest_r1_oath_requires_verified();

-- ---------- R3: a ruling needs a request, and is made once ----------
ALTER TABLE "continuances" ADD CONSTRAINT "continuances_ruling_fields"
  CHECK (("status" = 'requested') = ("ruled_by" IS NULL AND "ruled_at" IS NULL));

CREATE FUNCTION attest_r3_continuance_lifecycle() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW."status" <> 'requested' THEN
    RAISE EXCEPTION 'R3: A continuance can only be ruled on after it has been requested.' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" <> 'requested' THEN
    RAISE EXCEPTION 'R3: This continuance has already been ruled on.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "continuances_r3" BEFORE INSERT OR UPDATE ON "continuances"
  FOR EACH ROW EXECUTE FUNCTION attest_r3_continuance_lifecycle();

-- ---------- R4: no hash lock while the errata window is open ----------
ALTER TABLE "transcript_seals" ADD CONSTRAINT "transcript_seals_r4"
  CHECK ("locked_at" IS NULL OR "errata_closed_at" IS NOT NULL);

CREATE FUNCTION attest_seal_immutable_once_locked() RETURNS trigger AS $$
BEGIN
  IF OLD."locked_at" IS NOT NULL THEN
    RAISE EXCEPTION 'ATTEST: The transcript seal is locked and cannot change.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "transcript_seals_locked" BEFORE UPDATE ON "transcript_seals"
  FOR EACH ROW EXECUTE FUNCTION attest_seal_immutable_once_locked();

-- Transcript lines are read-only once the seal is locked.
CREATE FUNCTION attest_transcript_read_only_when_locked() RETURNS trigger AS $$
DECLARE sid uuid := COALESCE(NEW."session_id", OLD."session_id");
BEGIN
  IF EXISTS (SELECT 1 FROM "transcript_seals" WHERE "session_id" = sid AND "locked_at" IS NOT NULL) THEN
    RAISE EXCEPTION 'ATTEST: The transcript is sealed and cannot change.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "transcript_lines_locked" BEFORE INSERT OR UPDATE ON "transcript_lines"
  FOR EACH ROW EXECUTE FUNCTION attest_transcript_read_only_when_locked();

-- ---------- R5: no certified export without a locked transcript ----------
CREATE FUNCTION attest_r5_export_requires_lock() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "transcript_seals" WHERE "id" = NEW."seal_id" AND "locked_at" IS NOT NULL) THEN
    RAISE EXCEPTION 'R5: The transcript must be locked before a certified export.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "certified_exports_r5" BEFORE INSERT ON "certified_exports"
  FOR EACH ROW EXECUTE FUNCTION attest_r5_export_requires_lock();

-- ---------- R6: only adjudicators vote; a sealed ballot never changes ----------
CREATE FUNCTION attest_r6_vote_rules() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."sealed_at" IS NOT NULL THEN
    RAISE EXCEPTION 'R6: A sealed ballot cannot be changed.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "users" WHERE "id" = NEW."panelist_id" AND "role" = 'adj') THEN
    RAISE EXCEPTION 'R6: Only adjudicators can cast a vote.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "votes_r6" BEFORE INSERT OR UPDATE ON "votes"
  FOR EACH ROW EXECUTE FUNCTION attest_r6_vote_rules();

-- ---------- exhibit publication: admitted only, one at a time per session ----------
CREATE FUNCTION attest_publish_requires_admitted() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "exhibits" WHERE "id" = NEW."exhibit_id" AND "status" = 'admitted') THEN
    RAISE EXCEPTION 'ATTEST: Only admitted exhibits can be published.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "exhibit_publications_admitted" BEFORE INSERT ON "exhibit_publications"
  FOR EACH ROW EXECUTE FUNCTION attest_publish_requires_admitted();

CREATE UNIQUE INDEX "exhibit_publications_one_open" ON "exhibit_publications" ("session_id") WHERE "ended_at" IS NULL;

-- ---------- sessions: closing is irreversible ----------
CREATE FUNCTION attest_session_close_irreversible() RETURNS trigger AS $$
BEGIN
  IF OLD."record_state" = 'closed' THEN
    RAISE EXCEPTION 'ATTEST: This session is closed. Closing cannot be undone.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "sessions_closed" BEFORE UPDATE ON "sessions"
  FOR EACH ROW EXECUTE FUNCTION attest_session_close_irreversible();

-- ---------- R8 and R2: append-only logs ----------
CREATE FUNCTION attest_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'R8: % is append-only.', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "audit_events_append_only" BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION attest_append_only();
CREATE TRIGGER "presence_events_append_only" BEFORE UPDATE OR DELETE ON "presence_events"
  FOR EACH ROW EXECUTE FUNCTION attest_append_only();

-- ---------- no hard deletes anywhere (spec 2.1: corrections are new rows) ----------
CREATE FUNCTION attest_no_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ATTEST: Records in % cannot be deleted.', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END $$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'matters', 'sessions', 'participants', 'identity_checks', 'oaths', 'objections',
    'continuances', 'caucus_rooms', 'exhibits', 'exhibit_publications', 'transcript_lines',
    'errata', 'transcript_seals', 'certified_exports', 'votes'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION attest_no_delete()', t || '_no_delete', t);
  END LOOP;
END $$;

-- In production the API connects as a role without UPDATE/DELETE on audit_events,
-- so the triggers above are a second line, not the only one:
--   REVOKE UPDATE, DELETE, TRUNCATE ON "audit_events" FROM attest_api;
