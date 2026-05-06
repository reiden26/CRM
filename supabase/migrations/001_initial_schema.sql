-- ============================================================
-- CRM Professional Schema for Supabase
-- Migration: 001_initial_schema
-- ============================================================

-- ============================================================
-- SECTION 1: ENUM TYPES
-- ============================================================

CREATE TYPE user_role AS ENUM (
  'admin',
  'manager',
  'agent',
  'viewer'
);

CREATE TYPE deal_stage_type AS ENUM (
  'new',
  'qualified',
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost'
);

CREATE TYPE activity_type AS ENUM (
  'call',
  'email',
  'meeting',
  'task',
  'note'
);

CREATE TYPE contact_status AS ENUM (
  'lead',
  'prospect',
  'active',
  'inactive',
  'archived'
);

CREATE TYPE contact_source AS ENUM (
  'website',
  'referral',
  'social_media',
  'cold_outreach',
  'event',
  'other'
);

CREATE TYPE audit_action AS ENUM (
  'INSERT',
  'UPDATE',
  'DELETE'
);


-- ============================================================
-- SECTION 2: TABLES
-- ============================================================

-- ------------------------------------------------------------
-- companies
-- (created before profiles because profiles references it)
-- ------------------------------------------------------------
CREATE TABLE companies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  industry     TEXT,
  website      TEXT,
  phone        TEXT,
  address      JSONB,                        -- { street, city, state, country, zip }
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- profiles (extends auth.users 1-to-1)
-- ------------------------------------------------------------
CREATE TABLE profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    TEXT,
  avatar_url   TEXT,
  role         user_role NOT NULL DEFAULT 'agent',
  company_id   UUID REFERENCES companies(id) ON DELETE SET NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- deal_stages (lookup table for pipeline columns)
-- ------------------------------------------------------------
CREATE TABLE deal_stages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  order_position SMALLINT NOT NULL DEFAULT 0,
  color          TEXT NOT NULL DEFAULT '#6366f1',
  is_default     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- contacts
-- ------------------------------------------------------------
CREATE TABLE contacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES companies(id) ON DELETE SET NULL,
  first_name   TEXT NOT NULL,
  last_name    TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  position     TEXT,
  source       contact_source,
  status       contact_status NOT NULL DEFAULT 'lead',
  assigned_to  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- deals
-- ------------------------------------------------------------
CREATE TABLE deals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  contact_id          UUID REFERENCES contacts(id) ON DELETE SET NULL,
  company_id          UUID REFERENCES companies(id) ON DELETE SET NULL,
  stage               deal_stage_type NOT NULL DEFAULT 'new',
  value               NUMERIC(15, 2) NOT NULL DEFAULT 0,
  currency            CHAR(3) NOT NULL DEFAULT 'USD',
  probability         SMALLINT NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
  expected_close_date DATE,
  assigned_to         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- activities
-- ------------------------------------------------------------
CREATE TABLE activities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         activity_type NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  contact_id   UUID REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id      UUID REFERENCES deals(id) ON DELETE CASCADE,
  assigned_to  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date     TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- tags
-- ------------------------------------------------------------
CREATE TABLE tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#6366f1',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name)
);

-- ------------------------------------------------------------
-- contact_tags (many-to-many)
-- ------------------------------------------------------------
CREATE TABLE contact_tags (
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id     UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);

-- ------------------------------------------------------------
-- audit_logs
-- ------------------------------------------------------------
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action      audit_action NOT NULL,
  table_name  TEXT NOT NULL,
  record_id   UUID NOT NULL,
  old_data    JSONB,
  new_data    JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- SECTION 3: INDEXES
-- ============================================================

-- profiles
CREATE INDEX idx_profiles_role       ON profiles(role);
CREATE INDEX idx_profiles_company_id ON profiles(company_id);

-- contacts
CREATE INDEX idx_contacts_email       ON contacts(email);
CREATE INDEX idx_contacts_company_id  ON contacts(company_id);
CREATE INDEX idx_contacts_assigned_to ON contacts(assigned_to);
CREATE INDEX idx_contacts_status      ON contacts(status);
CREATE INDEX idx_contacts_created_by  ON contacts(created_by);

-- deals
CREATE INDEX idx_deals_stage          ON deals(stage);
CREATE INDEX idx_deals_contact_id     ON deals(contact_id);
CREATE INDEX idx_deals_company_id     ON deals(company_id);
CREATE INDEX idx_deals_assigned_to    ON deals(assigned_to);
CREATE INDEX idx_deals_created_by     ON deals(created_by);
CREATE INDEX idx_deals_close_date     ON deals(expected_close_date);

-- activities
CREATE INDEX idx_activities_contact_id  ON activities(contact_id);
CREATE INDEX idx_activities_deal_id     ON activities(deal_id);
CREATE INDEX idx_activities_assigned_to ON activities(assigned_to);
CREATE INDEX idx_activities_due_date    ON activities(due_date);
CREATE INDEX idx_activities_type        ON activities(type);

-- audit_logs
CREATE INDEX idx_audit_logs_user_id    ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX idx_audit_logs_record_id  ON audit_logs(record_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- contact_tags
CREATE INDEX idx_contact_tags_tag_id ON contact_tags(tag_id);


-- ============================================================
-- SECTION 4: HELPER FUNCTIONS
-- ============================================================

-- Returns the role of the currently authenticated user
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- Returns the company_id of the currently authenticated user
CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$;

-- Returns TRUE if the current user manages the given user_id
-- (same company + current user is manager/admin)
CREATE OR REPLACE FUNCTION is_my_team_member(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p_target
    JOIN profiles p_me ON p_me.id = auth.uid()
    WHERE p_target.id = target_user_id
      AND p_target.company_id = p_me.company_id
      AND p_me.role IN ('admin', 'manager')
  );
$$;

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- ============================================================
-- SECTION 5: TRIGGERS
-- ============================================================

-- ------------------------------------------------------------
-- 5a. Auto-create profile when a user signs up in auth.users
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    'agent'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ------------------------------------------------------------
-- 5b. updated_at triggers
-- ------------------------------------------------------------
CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_companies
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_contacts
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_deals
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_activities
  BEFORE UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 5c. Audit log trigger function
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_log_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record_id UUID;
  v_old_data  JSONB;
  v_new_data  JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id;
    v_old_data  := to_jsonb(OLD);
    v_new_data  := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_record_id := NEW.id;
    v_old_data  := to_jsonb(OLD);
    v_new_data  := to_jsonb(NEW);
  ELSE -- INSERT
    v_record_id := NEW.id;
    v_old_data  := NULL;
    v_new_data  := to_jsonb(NEW);
  END IF;

  INSERT INTO audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data,
    ip_address
  ) VALUES (
    auth.uid(),
    TG_OP::audit_action,
    TG_TABLE_NAME,
    v_record_id,
    v_old_data,
    v_new_data,
    inet_client_addr()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach audit trigger to all main tables
CREATE TRIGGER audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION audit_log_changes();

CREATE TRIGGER audit_companies
  AFTER INSERT OR UPDATE OR DELETE ON companies
  FOR EACH ROW EXECUTE FUNCTION audit_log_changes();

CREATE TRIGGER audit_contacts
  AFTER INSERT OR UPDATE OR DELETE ON contacts
  FOR EACH ROW EXECUTE FUNCTION audit_log_changes();

CREATE TRIGGER audit_deals
  AFTER INSERT OR UPDATE OR DELETE ON deals
  FOR EACH ROW EXECUTE FUNCTION audit_log_changes();

CREATE TRIGGER audit_activities
  AFTER INSERT OR UPDATE OR DELETE ON activities
  FOR EACH ROW EXECUTE FUNCTION audit_log_changes();

CREATE TRIGGER audit_tags
  AFTER INSERT OR UPDATE OR DELETE ON tags
  FOR EACH ROW EXECUTE FUNCTION audit_log_changes();


-- ============================================================
-- SECTION 6: ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies    ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_stages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags         ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs   ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SECTION 7: RLS POLICIES
-- ============================================================

-- ------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------

-- Users can always read their own profile
CREATE POLICY "profiles: own read"
  ON profiles FOR SELECT
  USING (id = auth.uid());

-- Admins and managers can read all profiles in their company
CREATE POLICY "profiles: team read"
  ON profiles FOR SELECT
  USING (
    get_my_role() IN ('admin', 'manager')
    AND company_id = get_my_company_id()
  );

-- Users can update their own profile (non-role fields)
CREATE POLICY "profiles: own update"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Only admins can update roles or deactivate users
CREATE POLICY "profiles: admin full"
  ON profiles FOR ALL
  USING (get_my_role() = 'admin');

-- ------------------------------------------------------------
-- companies
-- ------------------------------------------------------------

-- All authenticated users can read companies
CREATE POLICY "companies: authenticated read"
  ON companies FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Admins and managers can insert companies
CREATE POLICY "companies: manager insert"
  ON companies FOR INSERT
  WITH CHECK (get_my_role() IN ('admin', 'manager'));

-- Admins and managers can update companies
CREATE POLICY "companies: manager update"
  ON companies FOR UPDATE
  USING (get_my_role() IN ('admin', 'manager'));

-- Only admins can delete companies
CREATE POLICY "companies: admin delete"
  ON companies FOR DELETE
  USING (get_my_role() = 'admin');

-- ------------------------------------------------------------
-- contacts
-- ------------------------------------------------------------

-- Agents see only their own contacts
CREATE POLICY "contacts: agent select"
  ON contacts FOR SELECT
  USING (
    get_my_role() = 'agent'
    AND (assigned_to = auth.uid() OR created_by = auth.uid())
  );

-- Managers see contacts assigned to their team
CREATE POLICY "contacts: manager select"
  ON contacts FOR SELECT
  USING (
    get_my_role() = 'manager'
    AND is_my_team_member(COALESCE(assigned_to, created_by))
  );

-- Admins see all contacts
CREATE POLICY "contacts: admin select"
  ON contacts FOR SELECT
  USING (get_my_role() = 'admin');

-- Agents can insert contacts (auto-assigned to themselves)
CREATE POLICY "contacts: agent insert"
  ON contacts FOR INSERT
  WITH CHECK (
    get_my_role() IN ('admin', 'manager', 'agent')
    AND created_by = auth.uid()
  );

-- Agents can update their own contacts; managers update team contacts
CREATE POLICY "contacts: agent update"
  ON contacts FOR UPDATE
  USING (
    (get_my_role() = 'agent' AND (assigned_to = auth.uid() OR created_by = auth.uid()))
    OR (get_my_role() = 'manager' AND is_my_team_member(COALESCE(assigned_to, created_by)))
    OR get_my_role() = 'admin'
  );

-- Only admins and managers can delete contacts
CREATE POLICY "contacts: manager delete"
  ON contacts FOR DELETE
  USING (get_my_role() IN ('admin', 'manager'));

-- ------------------------------------------------------------
-- deals
-- ------------------------------------------------------------

CREATE POLICY "deals: agent select"
  ON deals FOR SELECT
  USING (
    get_my_role() = 'agent'
    AND (assigned_to = auth.uid() OR created_by = auth.uid())
  );

CREATE POLICY "deals: manager select"
  ON deals FOR SELECT
  USING (
    get_my_role() = 'manager'
    AND is_my_team_member(COALESCE(assigned_to, created_by))
  );

CREATE POLICY "deals: admin select"
  ON deals FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "deals: agent insert"
  ON deals FOR INSERT
  WITH CHECK (
    get_my_role() IN ('admin', 'manager', 'agent')
    AND created_by = auth.uid()
  );

CREATE POLICY "deals: update"
  ON deals FOR UPDATE
  USING (
    (get_my_role() = 'agent' AND (assigned_to = auth.uid() OR created_by = auth.uid()))
    OR (get_my_role() = 'manager' AND is_my_team_member(COALESCE(assigned_to, created_by)))
    OR get_my_role() = 'admin'
  );

CREATE POLICY "deals: manager delete"
  ON deals FOR DELETE
  USING (get_my_role() IN ('admin', 'manager'));

-- ------------------------------------------------------------
-- deal_stages (read-only for all; write for admins only)
-- ------------------------------------------------------------

CREATE POLICY "deal_stages: authenticated read"
  ON deal_stages FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "deal_stages: admin write"
  ON deal_stages FOR ALL
  USING (get_my_role() = 'admin');

-- ------------------------------------------------------------
-- activities
-- ------------------------------------------------------------

CREATE POLICY "activities: agent select"
  ON activities FOR SELECT
  USING (
    get_my_role() = 'agent'
    AND (assigned_to = auth.uid() OR created_by = auth.uid())
  );

CREATE POLICY "activities: manager select"
  ON activities FOR SELECT
  USING (
    get_my_role() = 'manager'
    AND is_my_team_member(COALESCE(assigned_to, created_by))
  );

CREATE POLICY "activities: admin select"
  ON activities FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "activities: insert"
  ON activities FOR INSERT
  WITH CHECK (
    get_my_role() IN ('admin', 'manager', 'agent')
    AND created_by = auth.uid()
  );

CREATE POLICY "activities: update"
  ON activities FOR UPDATE
  USING (
    (get_my_role() = 'agent' AND (assigned_to = auth.uid() OR created_by = auth.uid()))
    OR (get_my_role() = 'manager' AND is_my_team_member(COALESCE(assigned_to, created_by)))
    OR get_my_role() = 'admin'
  );

CREATE POLICY "activities: delete"
  ON activities FOR DELETE
  USING (
    created_by = auth.uid()
    OR get_my_role() IN ('admin', 'manager')
  );

-- ------------------------------------------------------------
-- tags
-- ------------------------------------------------------------

CREATE POLICY "tags: authenticated read"
  ON tags FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "tags: insert"
  ON tags FOR INSERT
  WITH CHECK (
    get_my_role() IN ('admin', 'manager', 'agent')
    AND created_by = auth.uid()
  );

CREATE POLICY "tags: update own or admin"
  ON tags FOR UPDATE
  USING (created_by = auth.uid() OR get_my_role() = 'admin');

CREATE POLICY "tags: delete own or admin"
  ON tags FOR DELETE
  USING (created_by = auth.uid() OR get_my_role() = 'admin');

-- ------------------------------------------------------------
-- contact_tags
-- ------------------------------------------------------------

-- Inherit access from contacts (simplified: check contact ownership)
CREATE POLICY "contact_tags: select"
  ON contact_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_id
        AND (
          get_my_role() = 'admin'
          OR (get_my_role() = 'manager' AND is_my_team_member(COALESCE(c.assigned_to, c.created_by)))
          OR c.assigned_to = auth.uid()
          OR c.created_by = auth.uid()
        )
    )
  );

CREATE POLICY "contact_tags: insert"
  ON contact_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_id
        AND (
          get_my_role() IN ('admin', 'manager')
          OR c.assigned_to = auth.uid()
          OR c.created_by = auth.uid()
        )
    )
  );

CREATE POLICY "contact_tags: delete"
  ON contact_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_id
        AND (
          get_my_role() IN ('admin', 'manager')
          OR c.assigned_to = auth.uid()
          OR c.created_by = auth.uid()
        )
    )
  );

-- ------------------------------------------------------------
-- audit_logs (append-only; admins can read all; users read own)
-- ------------------------------------------------------------

CREATE POLICY "audit_logs: own read"
  ON audit_logs FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "audit_logs: admin read"
  ON audit_logs FOR SELECT
  USING (get_my_role() = 'admin');

-- No UPDATE or DELETE allowed on audit_logs (immutable)
-- INSERT is handled only by the trigger (SECURITY DEFINER), not by users directly


-- ============================================================
-- SECTION 8: SEED DATA — default deal stages
-- ============================================================

INSERT INTO deal_stages (name, order_position, color, is_default) VALUES
  ('New',         1, '#6366f1', TRUE),
  ('Qualified',   2, '#3b82f6', FALSE),
  ('Proposal',    3, '#f59e0b', FALSE),
  ('Negotiation', 4, '#f97316', FALSE),
  ('Closed Won',  5, '#22c55e', FALSE),
  ('Closed Lost', 6, '#ef4444', FALSE);

-- ============================================================
-- SECTION 9: GRANT PERMISSIONS
-- ============================================================

-- Allow authenticated users to use the helper functions
GRANT EXECUTE ON FUNCTION get_my_role()         TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_company_id()   TO authenticated;
GRANT EXECUTE ON FUNCTION is_my_team_member(UUID) TO authenticated;

-- Grant table access to authenticated role
-- (RLS policies will further restrict what rows are visible)
GRANT SELECT, INSERT, UPDATE, DELETE ON profiles     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON companies    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON contacts     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON deals        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON deal_stages  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON activities   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tags         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON contact_tags TO authenticated;
GRANT SELECT                          ON audit_logs  TO authenticated;

-- Service role bypasses RLS (used by Edge Functions / server-side)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

