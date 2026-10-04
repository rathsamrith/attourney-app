/*
  Warnings:

  - Added the required column `errata_deadline` to the `transcript_seals` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "transcript_seals" ADD COLUMN     "errata_deadline" TIMESTAMPTZ NOT NULL;
