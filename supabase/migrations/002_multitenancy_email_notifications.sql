-- ============================================================
-- CRM Migration: 002_multitenancy_email_notifications
-- Adds: multi-tenancy, email system, push/in-app notifications
-- Depends on: 001_initial_schema
-- ============================================================

-- ============================================================
-- SECTION 1: TENANTS TABLE
-- ============================================================

CREATE TYPE tenant_plan AS ENUM ('free', 'pro', 'enterprise');

CREATE TABLE tenants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  plan       tenant_plan NOT NULL DEFAULT 'free',
  max_users  SMALLINT NOT NULL DEFAULT 5,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  settings   JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at_tenants
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- SECTION 2: ADD tenant_id TO EXISTING TABLES
-- ============================================================

-- profiles
ALTER TABLE profiles
  ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- companies
ALTER TABLE companies
  ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- contacts
ALTER TABLE contacts
  ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- deals
ALTER TABLE deals
  ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- activities
ALTER TABLE activities
  ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- tags
ALTER TABLE tags
  ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- deal_stages
ALTER TABLE deal_stages
  ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- ============================================================
-- SECTION 3: COMPOSITE INDEXES (tenant_id, id)
-- ============================================================

CREATE INDEX idx_tenants_slug          ON tenants(slug);
CREATE INDEX idx_tenants_is_active     ON tenants(is_active);

CREATE INDEX idx_profiles_tenant       ON profiles(tenant_id, id);
CREATE INDEX idx_companies_tenant      ON companies(tenant_id, id);
CREATE INDEX idx_contacts_tenant       ON contacts(tenant_id, id);
CREATE INDEX idx_deals_tenant          ON deals(tenant_id, id);
CREATE INDEX idx_activities_tenant     ON activities(tenant_id, id);
CREATE INDEX idx_tags_tenant           ON tags(tenant_id, id);
CREATE INDEX idx_deal_stages_tenant    ON deal_stages(tenant_id, id);


-- ============================================================
-- SECTION 4: HELPER FUNCTION — get_user_tenant()
-- ============================================================

-- Returns the tenant_id of the currently authenticated user.
-- Used in every RLS policy to enforce tenant isolation.
CREATE OR REPLACE FUNCTION get_user_tenant()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION get_user_tenant() TO authenticated;

-- ============================================================
-- SECTION 5: UPDATE EXISTING RLS POLICIES (add tenant isolation)
-- ============================================================
-- Strategy: drop each policy and recreate it with the
-- additional condition: tenant_id = get_user_tenant()
-- ============================================================

-- ------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "profiles: own read"   ON profiles;
DROP POLICY IF EXISTS "profiles: team read"  ON profiles;
DROP POLICY IF EXISTS "profiles: own update" ON profiles;
DROP POLICY IF EXISTS "profiles: admin full" ON profiles;

CREATE POLICY "profiles: own read"
  ON profiles FOR SELECT
  USING (
    id = auth.uid()
    AND tenant_id = get_user_tenant()
  );

CREATE POLICY "profiles: team read"
  ON profiles FOR SELECT
  USING (
    get_my_role() IN ('admin', 'manager')
    AND tenant_id = get_user_tenant()
    AND company_id = get_my_company_id()
  );

CREATE POLICY "profiles: own update"
  ON profiles FOR UPDATE
  USING (id = auth.uid() AND tenant_id = get_user_tenant())
  WITH CHECK (id = auth.uid() AND tenant_id = get_user_tenant());

CREATE POLICY "profiles: admin full"
  ON profiles FOR ALL
  USING (
    get_my_role() = 'admin'
    AND tenant_id = get_user_tenant()
  );

-- ------------------------------------------------------------
-- companies
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "companies: authenticated read" ON companies;
DROP POLICY IF EXISTS "companies: manager insert"     ON companies;
DROP POLICY IF EXISTS "companies: manager update"     ON companies;
DROP POLICY IF EXISTS "companies: admin delete"       ON companies;

CREATE POLICY "companies: authenticated read"
  ON companies FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND tenant_id = get_user_tenant()
  );

CREATE POLICY "companies: manager insert"
  ON companies FOR INSERT
  WITH CHECK (
    get_my_role() IN ('admin', 'manager')
    AND tenant_id = get_user_tenant()
  );

CREATE POLICY "companies: manager update"
  ON companies FOR UPDATE
  USING (
    get_my_role() IN ('admin', 'manager')
    AND tenant_id = get_user_tenant()
  );

CREATE POLICY "companies: admin delete"
  ON companies FOR DELETE
  USING (
    get_my_role() = 'admin'
    AND tenant_id = get_user_tenant()
  );

-- ------------------------------------------------------------
-- contacts
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "contacts: agent select"   ON contacts;
DROP POLICY IF EXISTS "contacts: manager select" ON contacts;
DROP POLICY IF EXISTS "contacts: admin select"   ON contacts;
DROP POLICY IF EXISTS "contacts: agent insert"   ON contacts;
DROP POLICY IF EXISTS "contacts: agent update"   ON contacts;
DROP POLICY IF EXISTS "contacts: manager delete" ON contacts;

CREATE POLICY "contacts: agent select"
  ON contacts FOR SELECT
  USING (
    tenant_id = get_user_tenant()
    AND get_my_role() = 'agent'
    AND (assigned_to = auth.uid() OR created_by = auth.uid())
  );

CREATE POLICY "contacts: manager select"
  ON contacts FOR SELECT
  USING (
    tenant_id = get_user_tenant()
    AND get_my_role() = 'manager'
    AND is_my_team_member(COALESCE(assigned_to, created_by))
  );

CREATE POLICY "contacts: admin select"
  ON contacts FOR SELECT
  USING (
    tenant_id = get_user_tenant()
    AND get_my_role() = 'admin'
  );

CREATE POLICY "contacts: agent insert"
  ON contacts FOR INSERT
  WITH CHECK (
    tenant_id = get_user_tenant()
    AND get_my_role() IN ('admin', 'manager', 'agent')
    AND created_by = auth.uid()
  );

CREATE POLICY "contacts: agent update"
  ON contacts FOR UPDATE
  USING (
    tenant_id = get_user_tenant()
    AND (
      (get_my_role() = 'agent' AND (assigned_to = auth.uid() OR created_by = auth.uid()))
      OR (get_my_role() = 'manager' AND is_my_team_member(COALESCE(assigned_to, created_by)))
      OR get_my_role() = 'admin'
    )
  );

CREATE POLICY "contacts: manager delete"
  ON contacts FOR DELETE
  USING (
    tenant_id = get_user_tenant()
    AND get_my_role() IN ('admin', 'manager')
  );

-- ------------------------------------------------------------
-- deals
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "deals: agent select"   ON deals;
DROP POLICY IF EXISTS "deals: manager select" ON deals;
DROP POLICY IF EXISTS "deals: admin select"   ON deals;
DROP POLICY IF EXISTS "deals: agent insert"   ON deals;
DROP POLICY IF EXISTS "deals: update"         ON deals;
DROP POLICY IF EXISTS "deals: manager delete" ON deals;

CREATE POLICY "deals: agent select"
  ON deals FOR SELECT
  USING (
    tenant_id = get_user_tenant()
    AND get_my_role() = 'agent'
    AND (assigned_to = auth.uid() OR created_by = auth.uid())
  );

CREATE POLICY "deals: manager select"
  ON deals FOR SELECT
  USING (
    tenant_id = get_user_tenant()
    AND get_my_role() = 'manager'
    AND is_my_team_member(COALESCE(assigned_to, created_by))
  );

CREATE POLICY "deals: admin select"
  ON deals FOR SELECT
  USING (
    tenant_id = get_user_tenant()
    AND get_my_role() = 'admin'
  );

CREATE POLICY "deals: agent insert"
  ON deals FOR INSERT
  WITH CHECK (
    tenant_id = get_user_tenant()
    AND get_my_role() IN ('admin', 'manager', 'agent')
    AND created_by = auth.uid()
  );

CREATE POLICY "deals: update"
  ON deals FOR UPDATE
  USING (
    tenant_id = get_user_tenant()
    AND (
      (get_my_role() = 'agent' AND (assigned_to = auth.uid() OR created_by = auth.uid()))
      OR (get_my_role() = 'manager' AND is_my_team_member(COALESCE(assigned_to, created_by)))
      OR get_my_role() = 'admin'
    )
  );

CREATE POLICY "deals: manager delete"
  ON deals FOR DELETE
  USING (
    tenant_id = get_user_tenant()
    AND get_my_role() IN ('admin', 'manager')
  );

-- ------------------------------------------------------------
-- deal_stages
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "deal_stages: authenticated read" ON deal_stages;
DROP POLICY IF EXISTS "deal_stages: admin write"        ON deal_stages;

CREATE POLICY "deal_stages: authenticated read"
  ON deal_stages FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (tenant_id = get_user_tenant() OR tenant_id IS NULL)
  );

CREATE POLICY "deal_stages: admin write"
  ON deal_stages FOR ALL
  USING (
    get_my_role() = 'admin'
    AND tenant_id = get_user_tenant()
  );

-- ------------------------------------------------------------
-- activities
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "activities: agent select"   ON activities;
DROP POLICY IF EXISTS "activities: manager select" ON activities;
DROP POLICY IF EXISTS "activities: admin select"   ON activities;
DROP POLICY IF EXISTS "activities: insert"         ON activities;
DROP POLICY IF EXISTS "activities: update"         ON activities;
DROP POLICY IF EXISTS "activities: delete"         ON activities;

CREATE POLICY "activities: agent select"
  ON activities FOR SELECT
  USING (
    tenant_id = get_user_tenant()
    AND get_my_role() = 'agent'
    AND (assigned_to = auth.uid() OR created_by = auth.uid())
  );

CREATE POLICY "activities: manager select"
  ON activities FOR SELECT
  USING (
    tenant_id = get_user_tenant()
    AND get_my_role() = 'manager'
    AND is_my_team_member(COALESCE(assigned_to, created_by))
  );

CREATE POLICY "activities: admin select"
  ON activities FOR SELECT
  USING (
    tenant_id = get_user_tenant()
    AND get_my_role() = 'admin'
  );

CREATE POLICY "activities: insert"
  ON activities FOR INSERT
  WITH CHECK (
    tenant_id = get_user_tenant()
    AND get_my_role() IN ('admin', 'manager', 'agent')
    AND created_by = auth.uid()
  );

CREATE POLICY "activities: update"
  ON activities FOR UPDATE
  USING (
    tenant_id = get_user_tenant()
    AND (
      (get_my_role() = 'agent' AND (assigned_to = auth.uid() OR created_by = auth.uid()))
      OR (get_my_role() = 'manager' AND is_my_team_member(COALESCE(assigned_to, created_by)))
      OR get_my_role() = 'admin'
    )
  );

CREATE POLICY "activities: delete"
  ON activities FOR DELETE
  USING (
    tenant_id = get_user_tenant()
    AND (
      created_by = auth.uid()
      OR get_my_role() IN ('admin', 'manager')
    )
  );

-- ------------------------------------------------------------
-- tags
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "tags: authenticated read"  ON tags;
DROP POLICY IF EXISTS "tags: insert"              ON tags;
DROP POLICY IF EXISTS "tags: update own or admin" ON tags;
DROP POLICY IF EXISTS "tags: delete own or admin" ON tags;

CREATE POLICY "tags: authenticated read"
  ON tags FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND tenant_id = get_user_tenant()
  );

CREATE POLICY "tags: insert"
  ON tags FOR INSERT
  WITH CHECK (
    tenant_id = get_user_tenant()
    AND get_my_role() IN ('admin', 'manager', 'agent')
    AND created_by = auth.uid()
  );

CREATE POLICY "tags: update own or admin"
  ON tags FOR UPDATE
  USING (
    tenant_id = get_user_tenant()
    AND (created_by = auth.uid() OR get_my_role() = 'admin')
  );

CREATE POLICY "tags: delete own or admin"
  ON tags FOR DELETE
  USING (
    tenant_id = get_user_tenant()
    AND (created_by = auth.uid() OR get_my_role() = 'admin')
  );

-- ------------------------------------------------------------
-- audit_logs — add tenant_id column + update policies
-- ------------------------------------------------------------
ALTER TABLE audit_logs
  ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);

DROP POLICY IF EXISTS "audit_logs: own read"   ON audit_logs;
DROP POLICY IF EXISTS "audit_logs: admin read" ON audit_logs;

CREATE POLICY "audit_logs: own read"
  ON audit_logs FOR SELECT
  USING (
    user_id = auth.uid()
    AND tenant_id = get_user_tenant()
  );

CREATE POLICY "audit_logs: admin read"
  ON audit_logs FOR SELECT
  USING (
    get_my_role() = 'admin'
    AND tenant_id = get_user_tenant()
  );

-- Update audit trigger to capture tenant_id
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
  v_tenant_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id;
    v_old_data  := to_jsonb(OLD);
    v_new_data  := NULL;
    v_tenant_id := CASE WHEN TG_TABLE_NAME != 'tenants'
                        THEN (OLD::JSONB->>'tenant_id')::UUID
                        ELSE OLD.id END;
  ELSIF TG_OP = 'UPDATE' THEN
    v_record_id := NEW.id;
    v_old_data  := to_jsonb(OLD);
    v_new_data  := to_jsonb(NEW);
    v_tenant_id := CASE WHEN TG_TABLE_NAME != 'tenants'
                        THEN (NEW::JSONB->>'tenant_id')::UUID
                        ELSE NEW.id END;
  ELSE
    v_record_id := NEW.id;
    v_old_data  := NULL;
    v_new_data  := to_jsonb(NEW);
    v_tenant_id := CASE WHEN TG_TABLE_NAME != 'tenants'
                        THEN (NEW::JSONB->>'tenant_id')::UUID
                        ELSE NEW.id END;
  END IF;

  INSERT INTO audit_logs (
    tenant_id,
    user_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data,
    ip_address
  ) VALUES (
    v_tenant_id,
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


-- ============================================================
-- SECTION 6: TENANT AUTO-ADMIN TRIGGER
-- When a new tenant is created, the creating user is promoted
-- to admin and linked to that tenant.
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Link the creating user to this tenant as admin
  -- (auth.uid() is the user who called the INSERT)
  UPDATE profiles
  SET
    tenant_id = NEW.id,
    role      = 'admin',
    updated_at = NOW()
  WHERE id = auth.uid();

  -- Seed tenant-specific deal stages (copy from global defaults)
  INSERT INTO deal_stages (tenant_id, name, order_position, color, is_default)
  SELECT NEW.id, name, order_position, color, is_default
  FROM   deal_stages
  WHERE  tenant_id IS NULL;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_tenant_created
  AFTER INSERT ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_tenant();

-- Audit tenants table too
CREATE TRIGGER audit_tenants
  AFTER INSERT OR UPDATE OR DELETE ON tenants
  FOR EACH ROW EXECUTE FUNCTION audit_log_changes();


-- ============================================================
-- SECTION 7: EMAIL SYSTEM TABLES
-- ============================================================

CREATE TYPE email_template_type AS ENUM (
  'welcome',
  'deal_won',
  'task_reminder',
  'contact_assigned',
  'password_reset',
  'custom'
);

CREATE TYPE email_status AS ENUM (
  'pending',
  'sent',
  'failed',
  'bounced'
);

-- ------------------------------------------------------------
-- email_templates
-- ------------------------------------------------------------
CREATE TABLE email_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  subject    TEXT NOT NULL,
  html_body  TEXT NOT NULL,
  variables  JSONB NOT NULL DEFAULT '[]',  -- e.g. ["contact_name","deal_value"]
  type       email_template_type NOT NULL DEFAULT 'custom',
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE TRIGGER set_updated_at_email_templates
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- email_logs
-- ------------------------------------------------------------
CREATE TABLE email_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  to_email      TEXT NOT NULL,
  subject       TEXT NOT NULL,
  template_id   UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  status        email_status NOT NULL DEFAULT 'pending',
  sent_at       TIMESTAMPTZ,
  error_message TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- email_queue
-- ------------------------------------------------------------
CREATE TABLE email_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  to_email     TEXT NOT NULL,
  template_id  UUID NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  variables    JSONB NOT NULL DEFAULT '{}',
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  attempts     SMALLINT NOT NULL DEFAULT 0,
  max_attempts SMALLINT NOT NULL DEFAULT 3,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for email tables
CREATE INDEX idx_email_templates_tenant    ON email_templates(tenant_id, id);
CREATE INDEX idx_email_templates_type      ON email_templates(tenant_id, type);
CREATE INDEX idx_email_logs_tenant         ON email_logs(tenant_id, id);
CREATE INDEX idx_email_logs_status         ON email_logs(tenant_id, status);
CREATE INDEX idx_email_logs_to_email       ON email_logs(tenant_id, to_email);
CREATE INDEX idx_email_queue_tenant        ON email_queue(tenant_id, id);
CREATE INDEX idx_email_queue_scheduled     ON email_queue(scheduled_at)
  WHERE processed_at IS NULL;
CREATE INDEX idx_email_queue_pending       ON email_queue(tenant_id, attempts)
  WHERE processed_at IS NULL;


-- ============================================================
-- SECTION 8: NOTIFICATIONS & PUSH TABLES
-- ============================================================

CREATE TYPE notification_type AS ENUM (
  'info',
  'success',
  'warning',
  'danger'
);

-- ------------------------------------------------------------
-- notifications (in-app)
-- ------------------------------------------------------------
CREATE TABLE notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  body          TEXT,
  type          notification_type NOT NULL DEFAULT 'info',
  resource_type TEXT,   -- e.g. 'deal', 'contact', 'task'
  resource_id   UUID,   -- FK to the related record (polymorphic)
  is_read       BOOLEAN NOT NULL DEFAULT FALSE,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- push_subscriptions (Web Push / PWA)
-- ------------------------------------------------------------
CREATE TABLE push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

-- ------------------------------------------------------------
-- notification_preferences
-- ------------------------------------------------------------
CREATE TABLE notification_preferences (
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email_on_deal_assigned BOOLEAN NOT NULL DEFAULT TRUE,
  email_on_task_due      BOOLEAN NOT NULL DEFAULT TRUE,
  email_on_mention       BOOLEAN NOT NULL DEFAULT TRUE,
  push_on_deal_assigned  BOOLEAN NOT NULL DEFAULT TRUE,
  push_on_task_due       BOOLEAN NOT NULL DEFAULT TRUE,
  push_on_mention        BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tenant_id)
);

CREATE TRIGGER set_updated_at_notification_preferences
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes for notification tables
CREATE INDEX idx_notifications_tenant      ON notifications(tenant_id, id);
CREATE INDEX idx_notifications_user_read   ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_resource    ON notifications(tenant_id, resource_type, resource_id);
CREATE INDEX idx_push_subscriptions_user   ON push_subscriptions(user_id, tenant_id);
CREATE INDEX idx_notif_prefs_tenant        ON notification_preferences(tenant_id);


-- ============================================================
-- SECTION 9: RLS FOR NEW TABLES
-- ============================================================

ALTER TABLE tenants                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_queue               ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences  ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- tenants
-- ------------------------------------------------------------

-- Users can read their own tenant
CREATE POLICY "tenants: member read"
  ON tenants FOR SELECT
  USING (id = get_user_tenant());

-- Only admins can update tenant settings
CREATE POLICY "tenants: admin update"
  ON tenants FOR UPDATE
  USING (
    get_my_role() = 'admin'
    AND id = get_user_tenant()
  );

-- Any authenticated user can create a tenant (onboarding flow)
-- The trigger will link them as admin automatically
CREATE POLICY "tenants: authenticated insert"
  ON tenants FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Only super-admins (service_role) can delete tenants
-- No DELETE policy for authenticated users

-- ------------------------------------------------------------
-- email_templates
-- ------------------------------------------------------------

CREATE POLICY "email_templates: tenant read"
  ON email_templates FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND tenant_id = get_user_tenant()
  );

CREATE POLICY "email_templates: manager write"
  ON email_templates FOR INSERT
  WITH CHECK (
    tenant_id = get_user_tenant()
    AND get_my_role() IN ('admin', 'manager')
    AND created_by = auth.uid()
  );

CREATE POLICY "email_templates: manager update"
  ON email_templates FOR UPDATE
  USING (
    tenant_id = get_user_tenant()
    AND get_my_role() IN ('admin', 'manager')
  );

CREATE POLICY "email_templates: admin delete"
  ON email_templates FOR DELETE
  USING (
    tenant_id = get_user_tenant()
    AND get_my_role() = 'admin'
  );

-- ------------------------------------------------------------
-- email_logs (read-only for users; written by service/triggers)
-- ------------------------------------------------------------

CREATE POLICY "email_logs: admin read"
  ON email_logs FOR SELECT
  USING (
    tenant_id = get_user_tenant()
    AND get_my_role() IN ('admin', 'manager')
  );

-- INSERT/UPDATE handled by Edge Functions via service_role only

-- ------------------------------------------------------------
-- email_queue (managed by Edge Functions via service_role)
-- ------------------------------------------------------------

CREATE POLICY "email_queue: admin read"
  ON email_queue FOR SELECT
  USING (
    tenant_id = get_user_tenant()
    AND get_my_role() = 'admin'
  );

CREATE POLICY "email_queue: authenticated insert"
  ON email_queue FOR INSERT
  WITH CHECK (
    tenant_id = get_user_tenant()
    AND auth.uid() IS NOT NULL
  );

-- ------------------------------------------------------------
-- notifications
-- ------------------------------------------------------------

-- Users only see their own notifications
CREATE POLICY "notifications: own read"
  ON notifications FOR SELECT
  USING (
    user_id = auth.uid()
    AND tenant_id = get_user_tenant()
  );

-- Admins can read all notifications in their tenant
CREATE POLICY "notifications: admin read"
  ON notifications FOR SELECT
  USING (
    tenant_id = get_user_tenant()
    AND get_my_role() = 'admin'
  );

-- Notifications are created by the system (service_role) or admins
CREATE POLICY "notifications: admin insert"
  ON notifications FOR INSERT
  WITH CHECK (
    tenant_id = get_user_tenant()
    AND get_my_role() IN ('admin', 'manager')
  );

-- Users can mark their own notifications as read
CREATE POLICY "notifications: own update"
  ON notifications FOR UPDATE
  USING (
    user_id = auth.uid()
    AND tenant_id = get_user_tenant()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id = get_user_tenant()
  );

-- Users can delete their own notifications
CREATE POLICY "notifications: own delete"
  ON notifications FOR DELETE
  USING (
    user_id = auth.uid()
    AND tenant_id = get_user_tenant()
  );

-- ------------------------------------------------------------
-- push_subscriptions
-- ------------------------------------------------------------

CREATE POLICY "push_subscriptions: own read"
  ON push_subscriptions FOR SELECT
  USING (
    user_id = auth.uid()
    AND tenant_id = get_user_tenant()
  );

CREATE POLICY "push_subscriptions: own insert"
  ON push_subscriptions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id = get_user_tenant()
  );

CREATE POLICY "push_subscriptions: own delete"
  ON push_subscriptions FOR DELETE
  USING (
    user_id = auth.uid()
    AND tenant_id = get_user_tenant()
  );

-- ------------------------------------------------------------
-- notification_preferences
-- ------------------------------------------------------------

CREATE POLICY "notif_prefs: own read"
  ON notification_preferences FOR SELECT
  USING (
    user_id = auth.uid()
    AND tenant_id = get_user_tenant()
  );

CREATE POLICY "notif_prefs: own upsert"
  ON notification_preferences FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id = get_user_tenant()
  );

CREATE POLICY "notif_prefs: own update"
  ON notification_preferences FOR UPDATE
  USING (
    user_id = auth.uid()
    AND tenant_id = get_user_tenant()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id = get_user_tenant()
  );


-- ============================================================
-- SECTION 10: VIEW — notifications_unread_count
-- ============================================================

CREATE OR REPLACE VIEW notifications_unread_count
WITH (security_invoker = TRUE)   -- respects RLS of the caller
AS
SELECT
  user_id,
  tenant_id,
  COUNT(*)                                          AS total_unread,
  COUNT(*) FILTER (WHERE type = 'danger')           AS danger_count,
  COUNT(*) FILTER (WHERE type = 'warning')          AS warning_count,
  MAX(created_at)                                   AS latest_at
FROM notifications
WHERE is_read = FALSE
GROUP BY user_id, tenant_id;

-- Grant access to authenticated users
GRANT SELECT ON notifications_unread_count TO authenticated;

-- ============================================================
-- SECTION 11: FUNCTION — mark_notifications_read()
-- ============================================================

CREATE OR REPLACE FUNCTION mark_notifications_read(
  p_user_id         UUID,
  p_notification_ids UUID[]
)
RETURNS INTEGER          -- number of rows updated
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  -- Security: callers can only mark their own notifications
  IF p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Permission denied: cannot mark notifications for another user';
  END IF;

  UPDATE notifications
  SET
    is_read = TRUE,
    read_at = NOW()
  WHERE
    user_id   = p_user_id
    AND tenant_id = get_user_tenant()
    AND is_read   = FALSE
    AND (
      p_notification_ids IS NULL          -- NULL means mark ALL unread
      OR id = ANY(p_notification_ids)
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_notifications_read(UUID, UUID[]) TO authenticated;

-- ============================================================
-- SECTION 12: GRANTS FOR NEW TABLES
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON tenants                  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON email_templates          TO authenticated;
GRANT SELECT                          ON email_logs              TO authenticated;
GRANT SELECT, INSERT                  ON email_queue             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_preferences TO authenticated;

-- Service role full access
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

