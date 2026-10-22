-- CreateTable
CREATE TABLE "tenant_entitlement_overrides" (
    "tenantId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "intValue" INTEGER,
    "enabled" BOOLEAN,
    "note" TEXT,
    "setBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_entitlement_overrides_pkey" PRIMARY KEY ("tenantId","key")
);

-- Row-Level Security: tenant-scoped like every other tenant table (platform staff use app.platform).
ALTER TABLE tenant_entitlement_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_entitlement_overrides FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_entitlement_overrides
  USING (app_platform() OR "tenantId" = app_tenant())
  WITH CHECK (app_platform() OR "tenantId" = app_tenant());
