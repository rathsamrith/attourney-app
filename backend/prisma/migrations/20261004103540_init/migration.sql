-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('adj', 'counsel', 'officer', 'witness');

-- CreateEnum
CREATE TYPE "side" AS ENUM ('P', 'D', 'T');

-- CreateEnum
CREATE TYPE "auth_method" AS ENUM ('password_mfa', 'smart_card');

-- CreateEnum
CREATE TYPE "forum" AS ENUM ('deposition', 'arbitration', 'regulatory');

-- CreateEnum
CREATE TYPE "record_state" AS ENUM ('off', 'open', 'recess', 'closed');

-- CreateEnum
CREATE TYPE "session_role" AS ENUM ('presiding', 'panelist', 'counsel', 'witness', 'officer', 'reporter');

-- CreateEnum
CREATE TYPE "verification" AS ENUM ('pending', 'verified', 'failed');

-- CreateEnum
CREATE TYPE "presence" AS ENUM ('lobby', 'present', 'sidebar', 'caucus', 'absent');

-- CreateEnum
CREATE TYPE "identity_method" AS ENUM ('biometric', 'certificate', 'manual');

-- CreateEnum
CREATE TYPE "check_result" AS ENUM ('pass', 'fail');

-- CreateEnum
CREATE TYPE "objection_ruling" AS ENUM ('pending', 'sustained', 'overruled');

-- CreateEnum
CREATE TYPE "continuance_status" AS ENUM ('requested', 'granted', 'denied');

-- CreateEnum
CREATE TYPE "exhibit_status" AS ENUM ('tagged', 'offered', 'admitted', 'excluded');

-- CreateEnum
CREATE TYPE "line_kind" AS ENUM ('q', 'a', 'colloquy', 'procedural');

-- CreateEnum
CREATE TYPE "erratum_kind" AS ENUM ('transcription', 'substantive');

-- CreateEnum
CREATE TYPE "erratum_status" AS ENUM ('pending', 'accepted', 'rejected');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "side" "side" NOT NULL,
    "auth_method" "auth_method" NOT NULL,
    "mfa_enrolled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivated_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "caption" TEXT NOT NULL,
    "docket_no" TEXT NOT NULL,
    "forum" "forum" NOT NULL,
    "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "matter_id" UUID NOT NULL,
    "day_no" INTEGER NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "record_state" "record_state" NOT NULL DEFAULT 'off',
    "closed_at" TIMESTAMPTZ,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_role" "session_role" NOT NULL,
    "verification" "verification" NOT NULL DEFAULT 'pending',
    "presence" "presence" NOT NULL DEFAULT 'lobby',
    "sworn" BOOLEAN NOT NULL DEFAULT false,
    "sworn_seconds" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_checks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "participant_id" UUID NOT NULL,
    "method" "identity_method" NOT NULL,
    "result" "check_result" NOT NULL,
    "score" DECIMAL(4,3),
    "attempt_no" INTEGER NOT NULL,
    "evidence_ref" TEXT,
    "verified_by" UUID,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oaths" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "participant_id" UUID NOT NULL,
    "oath_text_version" TEXT NOT NULL,
    "administered_by" UUID NOT NULL,
    "affirmed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oaths_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presence_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "participant_id" UUID NOT NULL,
    "state" "presence" NOT NULL,
    "caucus_room_id" UUID,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "presence_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "raised_by" UUID NOT NULL,
    "grounds" TEXT NOT NULL,
    "transcript_line_id" UUID,
    "ruling" "objection_ruling" NOT NULL DEFAULT 'pending',
    "ruled_by" UUID,
    "ruled_at" TIMESTAMPTZ,

    CONSTRAINT "objections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "continuances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "proposed_resume_at" TIMESTAMPTZ,
    "status" "continuance_status" NOT NULL DEFAULT 'requested',
    "ruled_by" UUID,
    "ruled_at" TIMESTAMPTZ,

    CONSTRAINT "continuances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caucus_rooms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "side" "side" NOT NULL,
    "opened_by" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ,

    CONSTRAINT "caucus_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcript_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "speaker_id" UUID,
    "kind" "line_kind" NOT NULL,
    "text" TEXT NOT NULL,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcript_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exhibits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "matter_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pages" INTEGER NOT NULL,
    "side" "side" NOT NULL,
    "status" "exhibit_status" NOT NULL DEFAULT 'tagged',
    "file_ref" TEXT NOT NULL,
    "offered_at" TIMESTAMPTZ,
    "ruled_by" UUID,
    "ruled_at" TIMESTAMPTZ,

    CONSTRAINT "exhibits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exhibit_publications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exhibit_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "published_by" UUID NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ,

    CONSTRAINT "exhibit_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "panelist_id" UUID NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "sealed_at" TIMESTAMPTZ,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "errata" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "transcript_line_id" UUID NOT NULL,
    "original" TEXT NOT NULL,
    "corrected" TEXT NOT NULL,
    "filed_by" UUID NOT NULL,
    "kind" "erratum_kind" NOT NULL,
    "status" "erratum_status" NOT NULL DEFAULT 'pending',
    "decided_by" UUID,

    CONSTRAINT "errata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcript_seals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "errata_closed_at" TIMESTAMPTZ,
    "digest_sha256" TEXT,
    "signature" BYTEA,
    "tsa_token" BYTEA,
    "locked_by" UUID,
    "locked_at" TIMESTAMPTZ,

    CONSTRAINT "transcript_seals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certified_exports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "seal_id" UUID NOT NULL,
    "file_ref" TEXT NOT NULL,
    "manifest_sha256" TEXT NOT NULL,
    "exported_by" UUID NOT NULL,
    "exported_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certified_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "seq" BIGSERIAL NOT NULL,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matter_id" UUID,
    "session_id" UUID,
    "actor_id" UUID,
    "entity" TEXT NOT NULL,
    "entity_id" UUID,
    "action" TEXT NOT NULL,
    "visibility_side" "side",
    "data" JSONB,
    "prev_hash" TEXT,
    "hash" TEXT NOT NULL,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "matters_docket_no_key" ON "matters"("docket_no");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_matter_id_day_no_key" ON "sessions"("matter_id", "day_no");

-- CreateIndex
CREATE UNIQUE INDEX "participants_session_id_user_id_key" ON "participants"("session_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "identity_checks_participant_id_attempt_no_key" ON "identity_checks"("participant_id", "attempt_no");

-- CreateIndex
CREATE INDEX "presence_events_participant_id_at_idx" ON "presence_events"("participant_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "transcript_lines_session_id_seq_key" ON "transcript_lines"("session_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "exhibits_matter_id_label_key" ON "exhibits"("matter_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "votes_session_id_panelist_id_key" ON "votes"("session_id", "panelist_id");

-- CreateIndex
CREATE UNIQUE INDEX "transcript_seals_session_id_key" ON "transcript_seals"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_seq_key" ON "audit_events"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_hash_key" ON "audit_events"("hash");

-- CreateIndex
CREATE INDEX "audit_events_session_id_seq_idx" ON "audit_events"("session_id", "seq");

-- CreateIndex
CREATE INDEX "audit_events_matter_id_seq_idx" ON "audit_events"("matter_id", "seq");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "matters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_checks" ADD CONSTRAINT "identity_checks_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_checks" ADD CONSTRAINT "identity_checks_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oaths" ADD CONSTRAINT "oaths_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oaths" ADD CONSTRAINT "oaths_administered_by_fkey" FOREIGN KEY ("administered_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presence_events" ADD CONSTRAINT "presence_events_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presence_events" ADD CONSTRAINT "presence_events_caucus_room_id_fkey" FOREIGN KEY ("caucus_room_id") REFERENCES "caucus_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objections" ADD CONSTRAINT "objections_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objections" ADD CONSTRAINT "objections_raised_by_fkey" FOREIGN KEY ("raised_by") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objections" ADD CONSTRAINT "objections_transcript_line_id_fkey" FOREIGN KEY ("transcript_line_id") REFERENCES "transcript_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objections" ADD CONSTRAINT "objections_ruled_by_fkey" FOREIGN KEY ("ruled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "continuances" ADD CONSTRAINT "continuances_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "continuances" ADD CONSTRAINT "continuances_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "continuances" ADD CONSTRAINT "continuances_ruled_by_fkey" FOREIGN KEY ("ruled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caucus_rooms" ADD CONSTRAINT "caucus_rooms_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caucus_rooms" ADD CONSTRAINT "caucus_rooms_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_lines" ADD CONSTRAINT "transcript_lines_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_lines" ADD CONSTRAINT "transcript_lines_speaker_id_fkey" FOREIGN KEY ("speaker_id") REFERENCES "participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibits" ADD CONSTRAINT "exhibits_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "matters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibits" ADD CONSTRAINT "exhibits_ruled_by_fkey" FOREIGN KEY ("ruled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibit_publications" ADD CONSTRAINT "exhibit_publications_exhibit_id_fkey" FOREIGN KEY ("exhibit_id") REFERENCES "exhibits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibit_publications" ADD CONSTRAINT "exhibit_publications_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibit_publications" ADD CONSTRAINT "exhibit_publications_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_panelist_id_fkey" FOREIGN KEY ("panelist_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "errata" ADD CONSTRAINT "errata_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "errata" ADD CONSTRAINT "errata_transcript_line_id_fkey" FOREIGN KEY ("transcript_line_id") REFERENCES "transcript_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "errata" ADD CONSTRAINT "errata_filed_by_fkey" FOREIGN KEY ("filed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "errata" ADD CONSTRAINT "errata_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_seals" ADD CONSTRAINT "transcript_seals_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_seals" ADD CONSTRAINT "transcript_seals_locked_by_fkey" FOREIGN KEY ("locked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certified_exports" ADD CONSTRAINT "certified_exports_seal_id_fkey" FOREIGN KEY ("seal_id") REFERENCES "transcript_seals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certified_exports" ADD CONSTRAINT "certified_exports_exported_by_fkey" FOREIGN KEY ("exported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
