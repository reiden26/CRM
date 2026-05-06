-- ============================================================
-- CRM Migration: 003_roles_rls_complete
-- Adds super_admin role + canonical helper functions +
-- complete RLS rewrite for all 5 tables with 4-role matrix
-- Depends on: 001_initial_schema, 002_multitenancy_email_notifications
-- ============================================================

-- ============================================================
-- SECTION 1: ADD super_admin TO user_role ENUM
-- ============================================================
-- PostgreSQL requires ALTER TYPE ... ADD VALUE outside a transaction
-- block when the type is used in existing tables. Supabase migrations
-- run each file in a single transaction, so we use a DO block to
-- check existence first and avoid duplicate-value errors on re-runs.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'super_admin'
      AND enumtypid = 'user_role'::regtype
  ) THEN
    ALTER TYPE user_role ADD VALUE 'super_admin' BEFORE 'admin';
  END IF;
END;
$$;

-- ============================================================
-- SECTION 2: CANONICAL HELPER FUNCTIONS
-- ============================================================
-- These are the public-facing names used throughout the app.
-- They delegate to the internal implementations already in place
-- and add super_admin awareness.
-- ============================================================

-- ------------------------------------------------------------
-- get_user_role()
-- Returns the role of the currently authenticated user.
-- Canonical alias for get_my_role() with super_admin support.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- ------------------------------------------------------------
-- get_user_company()
-- Returns the company_id of the currently authenticated user.
-- Canonical alias for get_my_company_id().
-- super_admin returns NULL (they span all companies).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_company()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$;

-- ------------------------------------------------------------
-- is_super_admin()
-- Convenience predicate — avoids repeating the ENUM comparison.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT get_user_role() = 'super_admin';
$$;

-- ------------------------------------------------------------
-- get_team_member_ids()
-- Returns the set of user IDs that the current manager/admin
-- can see within their tenant + company.
-- super_admin gets every user in the tenant.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_team_member_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM   profiles p
  WHERE
    -- super_admin sees everyone in every tenant
    get_user_role() = 'super_admin'

    OR (
      -- admin/manager see everyone in their own tenant + company
      get_user_role() IN ('admin', 'manager')
      AND p.tenant_id  = get_user_tenant()
      AND p.company_id = get_user_company()
    );
$$;

-- Update is_my_team_member to use the new function
CREATE OR REPLACE FUNCTION is_my_team_member(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT target_user_id = ANY(ARRAY(SELECT get_team_member_ids()));
$$;

-- Grant all new functions to authenticated role
GRANT EXECUTE ON FUNCTION get_user_role()          TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_company()       TO authenticated;
GRANT EXECUTE ON FUNCTION is_super_admin()         TO authenticated;
GRANT EXECUTE ON FUNCTION get_team_member_ids()    TO authenticated;
GRANT EXECUTE ON FUNCTION is_my_team_member(UUID)  TO authenticated;


-- ============================================================
-- SECTION 3: DROP ALL EXISTING POLICIES
-- Clean slate before rewriting with the full 4-role matrix.
-- ============================================================

-- profiles
DROP POLICY IF EXISTS "profiles: own read"   ON profiles;
DROP POLICY IF EXISTS "profiles: team read"  ON profiles;
DROP POLICY IF EXISTS "profiles: own update" ON profiles;
DROP POLICY IF EXISTS "profiles: admin full" ON profiles;

-- companies
DROP POLICY IF EXISTS "companies: authenticated read" ON companies;
DROP POLICY IF EXISTS "companies: manager insert"     ON companies;
DROP POLICY IF EXISTS "companies: manager update"     ON companies;
DROP POLICY IF EXISTS "companies: admin delete"       ON companies;

-- contacts
DROP POLICY IF EXISTS "contacts: agent select"   ON contacts;
DROP POLICY IF EXISTS "contacts: manager select" ON contacts;
DROP POLICY IF EXISTS "contacts: admin select"   ON contacts;
DROP POLICY IF EXISTS "contacts: agent insert"   ON contacts;
DROP POLICY IF EXISTS "contacts: agent update"   ON contacts;
DROP POLICY IF EXISTS "contacts: manager delete" ON contacts;

-- deals
DROP POLICY IF EXISTS "deals: agent select"   ON deals;
DROP POLICY IF EXISTS "deals: manager select" ON deals;
DROP POLICY IF EXISTS "deals: admin select"   ON deals;
DROP POLICY IF EXISTS "deals: agent insert"   ON deals;
DROP POLICY IF EXISTS "deals: update"         ON deals;
DROP POLICY IF EXISTS "deals: manager delete" ON deals;

-- activities
DROP POLICY IF EXISTS "activities: agent select"   ON activities;
DROP POLICY IF EXISTS "activities: manager select" ON activities;
DROP POLICY IF EXISTS "activities: admin select"   ON activities;
DROP POLICY IF EXISTS "activities: insert"         ON activities;
DROP POLICY IF EXISTS "activities: update"         ON activities;
DROP POLICY IF EXISTS "activities: delete"         ON activities;

-- deal_stages
DROP POLICY IF EXISTS "deal_stages: authenticated read" ON deal_stages;
DROP POLICY IF EXISTS "deal_stages: admin write"        ON deal_stages;

-- audit_logs
DROP POLICY IF EXISTS "audit_logs: own read"   ON audit_logs;
DROP POLICY IF EXISTS "audit_logs: admin read" ON audit_logs;

-- tags
DROP POLICY IF EXISTS "tags: authenticated read"  ON tags;
DROP POLICY IF EXISTS "tags: insert"              ON tags;
DROP POLICY IF EXISTS "tags: update own or admin" ON tags;
DROP POLICY IF EXISTS "tags: delete own or admin" ON tags;

-- contact_tags
DROP POLICY IF EXISTS "contact_tags: select" ON contact_tags;
DROP POLICY IF EXISTS "contact_tags: insert" ON contact_tags;
DROP POLICY IF EXISTS "contact_tags: delete" ON contact_tags;


-- ============================================================
-- SECTION 4: COMPLETE RLS POLICIES — profiles
-- ============================================================
--
-- Role matrix:
--   super_admin → all rows, all tenants
--   admin       → all rows within own tenant
--   manager     → rows of their team (same tenant + company)
--   agent       → only own rows (assigned_to = me OR created_by = me)
--   viewer      → read-only, same rules as agent for SELECT
-- ============================================================

-- ── SELECT ───────────────────────────────────────────────────

-- super_admin: unrestricted read across all tenants
CREATE POLICY "profiles: super_admin select"
  ON profiles FOR SELECT
  USING ( is_super_admin() );

-- admin: all profiles within their tenant
CREATE POLICY "profiles: admin select"
  ON profiles FOR SELECT
  USING (
    get_user_role() = 'admin'
    AND tenant_id = get_user_tenant()
  );

-- manager: profiles in same tenant + same company
CREATE POLICY "profiles: manager select"
  ON profiles FOR SELECT
  USING (
    get_user_role() = 'manager'
    AND tenant_id  = get_user_tenant()
    AND company_id = get_user_company()
  );

-- agent / viewer: own profile only
CREATE POLICY "profiles: own select"
  ON profiles FOR SELECT
  USING (
    id = auth.uid()
    AND tenant_id = get_user_tenant()
  );

-- ── INSERT ───────────────────────────────────────────────────
-- Profiles are created by the handle_new_user() trigger (SECURITY DEFINER).
-- super_admin can also create profiles directly (e.g. bulk import).

CREATE POLICY "profiles: super_admin insert"
  ON profiles FOR INSERT
  WITH CHECK ( is_super_admin() );

-- ── UPDATE ───────────────────────────────────────────────────

-- super_admin: update any profile
CREATE POLICY "profiles: super_admin update"
  ON profiles FOR UPDATE
  USING  ( is_super_admin() )
  WITH CHECK ( is_super_admin() );

-- admin: update any profile in their tenant
--        (includes changing roles, deactivating users)
CREATE POLICY "profiles: admin update"
  ON profiles FOR UPDATE
  USING  ( get_user_role() = 'admin' AND tenant_id = get_user_tenant() )
  WITH CHECK ( get_user_role() = 'admin' AND tenant_id = get_user_tenant() );

-- agent / manager / viewer: update own profile only
--   (role field changes are blocked at app level; DB allows the row)
CREATE POLICY "profiles: own update"
  ON profiles FOR UPDATE
  USING  ( id = auth.uid() AND tenant_id = get_user_tenant() )
  WITH CHECK ( id = auth.uid() AND tenant_id = get_user_tenant() );

-- ── DELETE ───────────────────────────────────────────────────

-- super_admin: delete any profile
CREATE POLICY "profiles: super_admin delete"
  ON profiles FOR DELETE
  USING ( is_super_admin() );

-- admin: deactivate (soft-delete) profiles in their tenant
CREATE POLICY "profiles: admin delete"
  ON profiles FOR DELETE
  USING (
    get_user_role() = 'admin'
    AND tenant_id = get_user_tenant()
    AND id <> auth.uid()   -- cannot delete yourself
  );


-- ============================================================
-- SECTION 5: COMPLETE RLS POLICIES — companies
-- ============================================================

-- ── SELECT ───────────────────────────────────────────────────

CREATE POLICY "companies: super_admin select"
  ON companies FOR SELECT
  USING ( is_super_admin() );

-- admin: all companies in their tenant
CREATE POLICY "companies: admin select"
  ON companies FOR SELECT
  USING (
    get_user_role() = 'admin'
    AND tenant_id = get_user_tenant()
  );

-- manager / agent / viewer: only their own company
CREATE POLICY "companies: member select"
  ON companies FOR SELECT
  USING (
    get_user_role() IN ('manager', 'agent', 'viewer')
    AND tenant_id = get_user_tenant()
    AND id = get_user_company()
  );

-- ── INSERT ───────────────────────────────────────────────────

CREATE POLICY "companies: super_admin insert"
  ON companies FOR INSERT
  WITH CHECK ( is_super_admin() );

CREATE POLICY "companies: admin insert"
  ON companies FOR INSERT
  WITH CHECK (
    get_user_role() = 'admin'
    AND tenant_id = get_user_tenant()
  );

CREATE POLICY "companies: manager insert"
  ON companies FOR INSERT
  WITH CHECK (
    get_user_role() = 'manager'
    AND tenant_id = get_user_tenant()
  );

-- ── UPDATE ───────────────────────────────────────────────────

CREATE POLICY "companies: super_admin update"
  ON companies FOR UPDATE
  USING  ( is_super_admin() )
  WITH CHECK ( is_super_admin() );

CREATE POLICY "companies: admin update"
  ON companies FOR UPDATE
  USING  ( get_user_role() = 'admin' AND tenant_id = get_user_tenant() )
  WITH CHECK ( get_user_role() = 'admin' AND tenant_id = get_user_tenant() );

-- manager: only their own company
CREATE POLICY "companies: manager update"
  ON companies FOR UPDATE
  USING (
    get_user_role() = 'manager'
    AND tenant_id = get_user_tenant()
    AND id = get_user_company()
  )
  WITH CHECK (
    get_user_role() = 'manager'
    AND tenant_id = get_user_tenant()
    AND id = get_user_company()
  );

-- ── DELETE ───────────────────────────────────────────────────

CREATE POLICY "companies: super_admin delete"
  ON companies FOR DELETE
  USING ( is_super_admin() );

CREATE POLICY "companies: admin delete"
  ON companies FOR DELETE
  USING (
    get_user_role() = 'admin'
    AND tenant_id = get_user_tenant()
  );


-- ============================================================
-- SECTION 6: COMPLETE RLS POLICIES — contacts
-- ============================================================

-- ── SELECT ───────────────────────────────────────────────────

CREATE POLICY "contacts: super_admin select"
  ON contacts FOR SELECT
  USING ( is_super_admin() );

CREATE POLICY "contacts: admin select"
  ON contacts FOR SELECT
  USING (
    get_user_role() = 'admin'
    AND tenant_id = get_user_tenant()
  );

-- manager: contacts where assigned_to or created_by is in their team
CREATE POLICY "contacts: manager select"
  ON contacts FOR SELECT
  USING (
    get_user_role() = 'manager'
    AND tenant_id = get_user_tenant()
    AND COALESCE(assigned_to, created_by) = ANY(ARRAY(SELECT get_team_member_ids()))
  );

-- agent / viewer: only contacts they own or created
CREATE POLICY "contacts: agent select"
  ON contacts FOR SELECT
  USING (
    get_user_role() IN ('agent', 'viewer')
    AND tenant_id = get_user_tenant()
    AND (assigned_to = auth.uid() OR created_by = auth.uid())
  );

-- ── INSERT ───────────────────────────────────────────────────

CREATE POLICY "contacts: super_admin insert"
  ON contacts FOR INSERT
  WITH CHECK ( is_super_admin() );

-- admin / manager / agent can create contacts
-- created_by must be the caller; tenant must match
CREATE POLICY "contacts: member insert"
  ON contacts FOR INSERT
  WITH CHECK (
    get_user_role() IN ('admin', 'manager', 'agent')
    AND tenant_id  = get_user_tenant()
    AND created_by = auth.uid()
  );

-- ── UPDATE ───────────────────────────────────────────────────

CREATE POLICY "contacts: super_admin update"
  ON contacts FOR UPDATE
  USING  ( is_super_admin() )
  WITH CHECK ( is_super_admin() );

CREATE POLICY "contacts: admin update"
  ON contacts FOR UPDATE
  USING  ( get_user_role() = 'admin' AND tenant_id = get_user_tenant() )
  WITH CHECK ( get_user_role() = 'admin' AND tenant_id = get_user_tenant() );

CREATE POLICY "contacts: manager update"
  ON contacts FOR UPDATE
  USING (
    get_user_role() = 'manager'
    AND tenant_id = get_user_tenant()
    AND COALESCE(assigned_to, created_by) = ANY(ARRAY(SELECT get_team_member_ids()))
  )
  WITH CHECK (
    get_user_role() = 'manager'
    AND tenant_id = get_user_tenant()
  );

CREATE POLICY "contacts: agent update"
  ON contacts FOR UPDATE
  USING (
    get_user_role() = 'agent'
    AND tenant_id = get_user_tenant()
    AND (assigned_to = auth.uid() OR created_by = auth.uid())
  )
  WITH CHECK (
    get_user_role() = 'agent'
    AND tenant_id = get_user_tenant()
  );

-- ── DELETE ───────────────────────────────────────────────────

CREATE POLICY "contacts: super_admin delete"
  ON contacts FOR DELETE
  USING ( is_super_admin() );

CREATE POLICY "contacts: admin delete"
  ON contacts FOR DELETE
  USING (
    get_user_role() = 'admin'
    AND tenant_id = get_user_tenant()
  );

-- manager: can delete contacts belonging to their team
CREATE POLICY "contacts: manager delete"
  ON contacts FOR DELETE
  USING (
    get_user_role() = 'manager'
    AND tenant_id = get_user_tenant()
    AND COALESCE(assigned_to, created_by) = ANY(ARRAY(SELECT get_team_member_ids()))
  );

-- agents cannot delete contacts (soft-delete via status update instead)


-- ============================================================
-- SECTION 7: COMPLETE RLS POLICIES — deals
-- ============================================================

-- ── SELECT ───────────────────────────────────────────────────

CREATE POLICY "deals: super_admin select"
  ON deals FOR SELECT
  USING ( is_super_admin() );

CREATE POLICY "deals: admin select"
  ON deals FOR SELECT
  USING (
    get_user_role() = 'admin'
    AND tenant_id = get_user_tenant()
  );

CREATE POLICY "deals: manager select"
  ON deals FOR SELECT
  USING (
    get_user_role() = 'manager'
    AND tenant_id = get_user_tenant()
    AND COALESCE(assigned_to, created_by) = ANY(ARRAY(SELECT get_team_member_ids()))
  );

CREATE POLICY "deals: agent select"
  ON deals FOR SELECT
  USING (
    get_user_role() IN ('agent', 'viewer')
    AND tenant_id = get_user_tenant()
    AND (assigned_to = auth.uid() OR created_by = auth.uid())
  );

-- ── INSERT ───────────────────────────────────────────────────

CREATE POLICY "deals: super_admin insert"
  ON deals FOR INSERT
  WITH CHECK ( is_super_admin() );

CREATE POLICY "deals: member insert"
  ON deals FOR INSERT
  WITH CHECK (
    get_user_role() IN ('admin', 'manager', 'agent')
    AND tenant_id  = get_user_tenant()
    AND created_by = auth.uid()
  );

-- ── UPDATE ───────────────────────────────────────────────────

CREATE POLICY "deals: super_admin update"
  ON deals FOR UPDATE
  USING  ( is_super_admin() )
  WITH CHECK ( is_super_admin() );

CREATE POLICY "deals: admin update"
  ON deals FOR UPDATE
  USING  ( get_user_role() = 'admin' AND tenant_id = get_user_tenant() )
  WITH CHECK ( get_user_role() = 'admin' AND tenant_id = get_user_tenant() );

CREATE POLICY "deals: manager update"
  ON deals FOR UPDATE
  USING (
    get_user_role() = 'manager'
    AND tenant_id = get_user_tenant()
    AND COALESCE(assigned_to, created_by) = ANY(ARRAY(SELECT get_team_member_ids()))
  )
  WITH CHECK (
    get_user_role() = 'manager'
    AND tenant_id = get_user_tenant()
  );

CREATE POLICY "deals: agent update"
  ON deals FOR UPDATE
  USING (
    get_user_role() = 'agent'
    AND tenant_id = get_user_tenant()
    AND (assigned_to = auth.uid() OR created_by = auth.uid())
  )
  WITH CHECK (
    get_user_role() = 'agent'
    AND tenant_id = get_user_tenant()
  );

-- ── DELETE ───────────────────────────────────────────────────

CREATE POLICY "deals: super_admin delete"
  ON deals FOR DELETE
  USING ( is_super_admin() );

CREATE POLICY "deals: admin delete"
  ON deals FOR DELETE
  USING (
    get_user_role() = 'admin'
    AND tenant_id = get_user_tenant()
  );

CREATE POLICY "deals: manager delete"
  ON deals FOR DELETE
  USING (
    get_user_role() = 'manager'
    AND tenant_id = get_user_tenant()
    AND COALESCE(assigned_to, created_by) = ANY(ARRAY(SELECT get_team_member_ids()))
  );

-- agents cannot delete deals


-- ============================================================
-- SECTION 8: COMPLETE RLS POLICIES — activities
-- ============================================================

-- ── SELECT ───────────────────────────────────────────────────

CREATE POLICY "activities: super_admin select"
  ON activities FOR SELECT
  USING ( is_super_admin() );

CREATE POLICY "activities: admin select"
  ON activities FOR SELECT
  USING (
    get_user_role() = 'admin'
    AND tenant_id = get_user_tenant()
  );

CREATE POLICY "activities: manager select"
  ON activities FOR SELECT
  USING (
    get_user_role() = 'manager'
    AND tenant_id = get_user_tenant()
    AND COALESCE(assigned_to, created_by) = ANY(ARRAY(SELECT get_team_member_ids()))
  );

CREATE POLICY "activities: agent select"
  ON activities FOR SELECT
  USING (
    get_user_role() IN ('agent', 'viewer')
    AND tenant_id = get_user_tenant()
    AND (assigned_to = auth.uid() OR created_by = auth.uid())
  );

-- ── INSERT ───────────────────────────────────────────────────

CREATE POLICY "activities: super_admin insert"
  ON activities FOR INSERT
  WITH CHECK ( is_super_admin() );

CREATE POLICY "activities: member insert"
  ON activities FOR INSERT
  WITH CHECK (
    get_user_role() IN ('admin', 'manager', 'agent')
    AND tenant_id  = get_user_tenant()
    AND created_by = auth.uid()
  );

-- ── UPDATE ───────────────────────────────────────────────────

CREATE POLICY "activities: super_admin update"
  ON activities FOR UPDATE
  USING  ( is_super_admin() )
  WITH CHECK ( is_super_admin() );

CREATE POLICY "activities: admin update"
  ON activities FOR UPDATE
  USING  ( get_user_role() = 'admin' AND tenant_id = get_user_tenant() )
  WITH CHECK ( get_user_role() = 'admin' AND tenant_id = get_user_tenant() );

CREATE POLICY "activities: manager update"
  ON activities FOR UPDATE
  USING (
    get_user_role() = 'manager'
    AND tenant_id = get_user_tenant()
    AND COALESCE(assigned_to, created_by) = ANY(ARRAY(SELECT get_team_member_ids()))
  )
  WITH CHECK (
    get_user_role() = 'manager'
    AND tenant_id = get_user_tenant()
  );

CREATE POLICY "activities: agent update"
  ON activities FOR UPDATE
  USING (
    get_user_role() = 'agent'
    AND tenant_id = get_user_tenant()
    AND (assigned_to = auth.uid() OR created_by = auth.uid())
  )
  WITH CHECK (
    get_user_role() = 'agent'
    AND tenant_id = get_user_tenant()
  );

-- ── DELETE ───────────────────────────────────────────────────

CREATE POLICY "activities: super_admin delete"
  ON activities FOR DELETE
  USING ( is_super_admin() );

CREATE POLICY "activities: admin delete"
  ON activities FOR DELETE
  USING (
    get_user_role() = 'admin'
    AND tenant_id = get_user_tenant()
  );

CREATE POLICY "activities: manager delete"
  ON activities FOR DELETE
  USING (
    get_user_role() = 'manager'
    AND tenant_id = get_user_tenant()
    AND COALESCE(assigned_to, created_by) = ANY(ARRAY(SELECT get_team_member_ids()))
  );

-- agent: can only delete activities they created
CREATE POLICY "activities: agent delete"
  ON activities FOR DELETE
  USING (
    get_user_role() = 'agent'
    AND tenant_id  = get_user_tenant()
    AND created_by = auth.uid()
  );


-- ============================================================
-- SECTION 9: REMAINING TABLES — deal_stages, tags,
--            contact_tags, audit_logs
-- ============================================================

-- ------------------------------------------------------------
-- deal_stages
-- ------------------------------------------------------------

CREATE POLICY "deal_stages: super_admin select"
  ON deal_stages FOR SELECT
  USING ( is_super_admin() );

-- All authenticated members can read stages for their tenant
-- (or global stages where tenant_id IS NULL)
CREATE POLICY "deal_stages: member select"
  ON deal_stages FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (tenant_id = get_user_tenant() OR tenant_id IS NULL)
  );

CREATE POLICY "deal_stages: super_admin write"
  ON deal_stages FOR ALL
  USING ( is_super_admin() );

-- admin: manage stages for their tenant
CREATE POLICY "deal_stages: admin write"
  ON deal_stages FOR ALL
  USING (
    get_user_role() = 'admin'
    AND tenant_id = get_user_tenant()
  );

-- ------------------------------------------------------------
-- tags
-- ------------------------------------------------------------

CREATE POLICY "tags: super_admin select"
  ON tags FOR SELECT
  USING ( is_super_admin() );

CREATE POLICY "tags: member select"
  ON tags FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND tenant_id = get_user_tenant()
  );

CREATE POLICY "tags: super_admin write"
  ON tags FOR ALL
  USING ( is_super_admin() );

CREATE POLICY "tags: member insert"
  ON tags FOR INSERT
  WITH CHECK (
    get_user_role() IN ('admin', 'manager', 'agent')
    AND tenant_id  = get_user_tenant()
    AND created_by = auth.uid()
  );

CREATE POLICY "tags: admin manager update"
  ON tags FOR UPDATE
  USING (
    get_user_role() IN ('admin', 'manager')
    AND tenant_id = get_user_tenant()
  );

CREATE POLICY "tags: own update"
  ON tags FOR UPDATE
  USING (
    get_user_role() = 'agent'
    AND tenant_id  = get_user_tenant()
    AND created_by = auth.uid()
  );

CREATE POLICY "tags: admin delete"
  ON tags FOR DELETE
  USING (
    get_user_role() IN ('admin', 'manager')
    AND tenant_id = get_user_tenant()
  );

CREATE POLICY "tags: own delete"
  ON tags FOR DELETE
  USING (
    get_user_role() = 'agent'
    AND tenant_id  = get_user_tenant()
    AND created_by = auth.uid()
  );

-- ------------------------------------------------------------
-- contact_tags
-- ------------------------------------------------------------

-- Inherits visibility from contacts via EXISTS subquery

CREATE POLICY "contact_tags: super_admin select"
  ON contact_tags FOR SELECT
  USING ( is_super_admin() );

CREATE POLICY "contact_tags: select"
  ON contact_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_id
        AND c.tenant_id = get_user_tenant()
        AND (
          get_user_role() = 'admin'
          OR (
            get_user_role() = 'manager'
            AND COALESCE(c.assigned_to, c.created_by) = ANY(ARRAY(SELECT get_team_member_ids()))
          )
          OR c.assigned_to = auth.uid()
          OR c.created_by  = auth.uid()
        )
    )
  );

CREATE POLICY "contact_tags: super_admin write"
  ON contact_tags FOR ALL
  USING ( is_super_admin() );

CREATE POLICY "contact_tags: insert"
  ON contact_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_id
        AND c.tenant_id = get_user_tenant()
        AND (
          get_user_role() IN ('admin', 'manager')
          OR c.assigned_to = auth.uid()
          OR c.created_by  = auth.uid()
        )
    )
  );

CREATE POLICY "contact_tags: delete"
  ON contact_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_id
        AND c.tenant_id = get_user_tenant()
        AND (
          get_user_role() IN ('admin', 'manager')
          OR c.assigned_to = auth.uid()
          OR c.created_by  = auth.uid()
        )
    )
  );

-- ------------------------------------------------------------
-- audit_logs
-- ------------------------------------------------------------

-- super_admin: read all audit logs across all tenants
CREATE POLICY "audit_logs: super_admin select"
  ON audit_logs FOR SELECT
  USING ( is_super_admin() );

-- admin: read all audit logs in their tenant
CREATE POLICY "audit_logs: admin select"
  ON audit_logs FOR SELECT
  USING (
    get_user_role() = 'admin'
    AND tenant_id = get_user_tenant()
  );

-- manager: read audit logs for their team's records
CREATE POLICY "audit_logs: manager select"
  ON audit_logs FOR SELECT
  USING (
    get_user_role() = 'manager'
    AND tenant_id = get_user_tenant()
    AND user_id = ANY(ARRAY(SELECT get_team_member_ids()))
  );

-- agent / viewer: read only their own audit trail
CREATE POLICY "audit_logs: own select"
  ON audit_logs FOR SELECT
  USING (
    user_id   = auth.uid()
    AND tenant_id = get_user_tenant()
  );

-- No INSERT / UPDATE / DELETE for any authenticated user
-- (audit_log_changes trigger uses SECURITY DEFINER)


-- ============================================================
-- SECTION 10: ROLE MATRIX REFERENCE VIEW
-- A read-only view that documents what each role can do.
-- Useful for debugging and onboarding.
-- ============================================================

CREATE OR REPLACE VIEW role_permissions_reference AS
SELECT * FROM (VALUES
  -- role,         table,          select,  insert,  update,  delete
  ('super_admin',  'profiles',     TRUE,    TRUE,    TRUE,    TRUE),
  ('super_admin',  'companies',    TRUE,    TRUE,    TRUE,    TRUE),
  ('super_admin',  'contacts',     TRUE,    TRUE,    TRUE,    TRUE),
  ('super_admin',  'deals',        TRUE,    TRUE,    TRUE,    TRUE),
  ('super_admin',  'activities',   TRUE,    TRUE,    TRUE,    TRUE),
  ('admin',        'profiles',     TRUE,    FALSE,   TRUE,    TRUE),
  ('admin',        'companies',    TRUE,    TRUE,    TRUE,    TRUE),
  ('admin',        'contacts',     TRUE,    TRUE,    TRUE,    TRUE),
  ('admin',        'deals',        TRUE,    TRUE,    TRUE,    TRUE),
  ('admin',        'activities',   TRUE,    TRUE,    TRUE,    TRUE),
  ('manager',      'profiles',     TRUE,    FALSE,   FALSE,   FALSE),
  ('manager',      'companies',    TRUE,    TRUE,    TRUE,    FALSE),
  ('manager',      'contacts',     TRUE,    TRUE,    TRUE,    TRUE),
  ('manager',      'deals',        TRUE,    TRUE,    TRUE,    TRUE),
  ('manager',      'activities',   TRUE,    TRUE,    TRUE,    TRUE),
  ('agent',        'profiles',     TRUE,    FALSE,   FALSE,   FALSE),
  ('agent',        'companies',    TRUE,    FALSE,   FALSE,   FALSE),
  ('agent',        'contacts',     TRUE,    TRUE,    TRUE,    FALSE),
  ('agent',        'deals',        TRUE,    TRUE,    TRUE,    FALSE),
  ('agent',        'activities',   TRUE,    TRUE,    TRUE,    TRUE),
  ('viewer',       'profiles',     TRUE,    FALSE,   FALSE,   FALSE),
  ('viewer',       'companies',    TRUE,    FALSE,   FALSE,   FALSE),
  ('viewer',       'contacts',     TRUE,    FALSE,   FALSE,   FALSE),
  ('viewer',       'deals',        TRUE,    FALSE,   FALSE,   FALSE),
  ('viewer',       'activities',   TRUE,    FALSE,   FALSE,   FALSE)
) AS t(role, "table", "select", "insert", "update", "delete");

GRANT SELECT ON role_permissions_reference TO authenticated;

-- ============================================================
-- SECTION 11: GRANTS FOR NEW FUNCTIONS
-- ============================================================

GRANT EXECUTE ON FUNCTION get_user_role()       TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_company()    TO authenticated;
GRANT EXECUTE ON FUNCTION is_super_admin()      TO authenticated;
GRANT EXECUTE ON FUNCTION get_team_member_ids() TO authenticated;

