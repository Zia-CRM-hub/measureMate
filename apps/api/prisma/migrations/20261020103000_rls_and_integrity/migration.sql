-- Row-Level Security, immutability triggers, check constraints and search indexes.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION app_tenant() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION app_user() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION app_platform() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('app.platform', true), '') = 'on' $$;

-- Standard tenant isolation on every tenant-owned table ("tenantId" column).
DO $$
DECLARE t text;
DECLARE tables text[] := ARRAY[
 'tenant_settings','subscriptions','branches','employees','sequences','usage_counters','idempotency_keys',
 'audit_events','customers','customer_contacts','households','household_members','customer_consents','tags',
 'customer_tags','saved_filters','measurement_templates','measurement_template_sections',
 'measurement_template_fields','measurement_profiles','measurement_revisions','measurement_values',
 'style_preferences','orders','order_items','order_status_history','production_stages','order_item_assignments',
 'trials','alterations','quality_checks','appointments','price_lists','price_list_items','quotations','invoices',
 'invoice_items','payments','payment_allocations','refunds','credit_notes','suppliers','inventory_items',
 'inventory_transactions','notification_templates','notification_jobs','notification_logs','attachments','comments'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (app_platform() OR "tenantId" = app_tenant())
      WITH CHECK (app_platform() OR "tenantId" = app_tenant())$p$, t);
  END LOOP;
END $$;

-- Memberships: visible within the active tenant, and a user can always see their own memberships.
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_memberships
  USING (app_platform() OR "tenantId" = app_tenant() OR "userId" = app_user())
  WITH CHECK (app_platform() OR "tenantId" = app_tenant());

-- Tenants: the active tenant, or any tenant the current user belongs to.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenants
  USING (app_platform() OR id = app_tenant()
         OR id IN (SELECT "tenantId" FROM tenant_memberships WHERE "userId" = app_user()))
  WITH CHECK (app_platform() OR id = app_tenant());

-- Append-only / immutable tables. Tenant purge (deletion workflow) sets app.purge = 'on'.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('app.purge', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% is append-only: rows cannot be deleted', TG_TABLE_NAME USING ERRCODE = 'P0001';
  END IF;
  -- UPDATE: only columns listed in trigger args may change
  IF (to_jsonb(NEW) - TG_ARGV) IS DISTINCT FROM (to_jsonb(OLD) - TG_ARGV) THEN
    RAISE EXCEPTION '% is append-only: rows cannot be modified', TG_TABLE_NAME USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['measurement_revisions','measurement_values','style_preferences','payment_allocations',
      'refunds','credit_notes','inventory_transactions','audit_events','order_status_history','invoice_items']
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION forbid_mutation()',
      t || '_immutable', t);
  END LOOP;
END $$;
-- Payments: only reconciliation stamp may change. Invoices: only void fields may change.
CREATE TRIGGER payments_immutable BEFORE UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation('reconciledAt');
CREATE TRIGGER invoices_immutable BEFORE UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation('status','voidedAt','voidReason','voidedBy');

-- Check constraints
ALTER TABLE payments ADD CONSTRAINT payments_amount_positive CHECK (amount > 0);
ALTER TABLE refunds ADD CONSTRAINT refunds_amount_positive CHECK (amount > 0);
ALTER TABLE payment_allocations ADD CONSTRAINT alloc_amount_positive CHECK (amount > 0);
ALTER TABLE order_items ADD CONSTRAINT order_items_qty_positive CHECK (quantity > 0 AND "deliveredQty" <= quantity);
ALTER TABLE order_items ADD CONSTRAINT order_items_money_nonneg CHECK ("unitPrice" >= 0 AND discount >= 0);
ALTER TABLE orders ADD CONSTRAINT orders_money_nonneg CHECK (total >= 0 AND "paidAmount" >= 0);
ALTER TABLE appointments ADD CONSTRAINT appt_time_order CHECK ("endsAt" > "startsAt");
ALTER TABLE measurement_values ADD CONSTRAINT mv_positive CHECK ("valueMm" >= 0);
ALTER TABLE credit_notes ADD CONSTRAINT cn_amount_positive CHECK (amount > 0);

-- Search indexes
CREATE INDEX customers_search_trgm ON customers USING gin ("searchText" gin_trgm_ops);
CREATE INDEX customers_name_trgm ON customers USING gin ("fullName" gin_trgm_ops);
CREATE INDEX members_name_trgm ON household_members USING gin ("fullName" gin_trgm_ops);

-- Privileges for the non-superuser application role (RLS does not apply to superusers).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mm_app') THEN
    GRANT USAGE ON SCHEMA public TO mm_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mm_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mm_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mm_app;
  END IF;
END $$;
