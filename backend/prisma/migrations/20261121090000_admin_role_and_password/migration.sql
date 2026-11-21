-- Add the admin role and a password hash for password-based admin sign-in.
ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'admin';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;
