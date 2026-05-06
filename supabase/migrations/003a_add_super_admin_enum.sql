-- ============================================================
-- Migration 003a — MUST run BEFORE 003b
-- Adds super_admin to the user_role ENUM.
-- This must be a separate transaction from the functions/policies
-- that USE the new enum value.
-- ============================================================

-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
-- In Supabase SQL Editor, each "Run" is a separate transaction, so
-- running this file first and 003b second is the correct approach.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin' BEFORE 'admin';

-- Verify it was added
SELECT enumlabel FROM pg_enum
WHERE enumtypid = 'user_role'::regtype
ORDER BY enumsortorder;
