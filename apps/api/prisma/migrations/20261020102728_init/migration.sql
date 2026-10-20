-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT,
    "oidcSubject" TEXT,
    "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "activeTenantId" UUID,
    "activeBranchId" UUID,
    "impersonatorId" UUID,
    "impersonationReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceMonthly" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_features" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "intValue" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "plan_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "key" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "roles" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleKey" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleKey","permissionKey")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "platform_announcements" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "deletionRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_settings" (
    "tenantId" UUID NOT NULL,
    "legalName" TEXT,
    "logoKey" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "taxLabel" TEXT NOT NULL DEFAULT 'GST',
    "taxId" TEXT,
    "taxInclusive" BOOLEAN NOT NULL DEFAULT false,
    "defaultTaxPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "measurementUnit" TEXT NOT NULL DEFAULT 'in',
    "dateFormat" TEXT NOT NULL DEFAULT 'dd/MM/yyyy',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "invoicePrefix" TEXT NOT NULL DEFAULT 'INV-',
    "orderPrefix" TEXT NOT NULL DEFAULT 'ORD-',
    "customerPrefix" TEXT NOT NULL DEFAULT 'C-',
    "quotationPrefix" TEXT NOT NULL DEFAULT 'QUO-',
    "receiptPrefix" TEXT NOT NULL DEFAULT 'RCT-',
    "creditNotePrefix" TEXT NOT NULL DEFAULT 'CN-',
    "workingHours" JSONB,
    "notificationSettings" JSONB,
    "brandColor" TEXT NOT NULL DEFAULT '#0f766e',
    "retentionDays" INTEGER NOT NULL DEFAULT 2555,
    "portalShowMeasurements" BOOLEAN NOT NULL DEFAULT false,
    "portalQuoteApproval" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "tenantId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TRIALING',
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "providerRef" TEXT,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "tenant_memberships" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleKey" TEXT NOT NULL,
    "branchIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "customerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT,
    "branchIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequences" (
    "tenantId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sequences_pkey" PRIMARY KEY ("tenantId","key")
);

-- CreateTable
CREATE TABLE "usage_counters" (
    "tenantId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("tenantId","key")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "tenantId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "response" JSONB,
    "statusCode" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("tenantId","key","endpoint")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "actorId" UUID,
    "impersonatorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "correlationId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "customerNumber" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "preferredName" TEXT,
    "mobile" TEXT,
    "alternateMobile" TEXT,
    "email" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "landmark" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "preferredLanguage" TEXT,
    "dateOfBirth" DATE,
    "anniversary" DATE,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "acquisitionSource" TEXT,
    "preferredBranchId" UUID,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "mergedIntoId" UUID,
    "firstVisitAt" TIMESTAMP(3),
    "lastVisitAt" TIMESTAMP(3),
    "searchText" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" UUID,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_contacts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "customer_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "households" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "primaryCustomerId" UUID NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_members" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "relationship" TEXT NOT NULL DEFAULT 'SELF',
    "dateOfBirth" DATE,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_consents" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "capturedBy" UUID,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_tags" (
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "customer_tags_pkey" PRIMARY KEY ("customerId","tagId")
);

-- CreateTable
CREATE TABLE "saved_filters" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "entity" TEXT NOT NULL DEFAULT 'customer',
    "query" JSONB NOT NULL,

    CONSTRAINT "saved_filters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_templates" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "measurement_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_template_sections" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "measurement_template_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_template_fields" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "sectionId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "helpText" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "minWarnMm" DECIMAL(10,3),
    "maxWarnMm" DECIMAL(10,3),
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "measurement_template_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_profiles" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "currentRevisionNo" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "measurement_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_revisions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "enteredUnit" TEXT NOT NULL,
    "changeReason" TEXT,
    "changedFields" JSONB NOT NULL,
    "postureNotes" TEXT,
    "fitNotes" TEXT,
    "warnings" JSONB,
    "warningOverrideReason" TEXT,
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "restoredFromRevisionNo" INTEGER,
    "changedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "measurement_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_values" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "valueMm" DECIMAL(10,3) NOT NULL,
    "enteredValue" DECIMAL(10,3) NOT NULL,
    "enteredUnit" TEXT NOT NULL,

    CONSTRAINT "measurement_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_preferences" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "style_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'STITCHING',
    "customerId" UUID NOT NULL,
    "wearerId" UUID,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "source" TEXT,
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trialDate" TIMESTAMP(3),
    "deliveryDate" TIMESTAMP(3),
    "notes" TEXT,
    "terms" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "rounding" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "deliveryStatus" TEXT NOT NULL DEFAULT 'NOT_DELIVERED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" UUID,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "wearerId" UUID,
    "garmentType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "measurementRevisionId" UUID,
    "styleOptions" JSONB,
    "fabricSource" TEXT,
    "fabricDetails" TEXT,
    "designReference" TEXT,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "assignedToId" UUID,
    "stage" TEXT NOT NULL DEFAULT 'DRAFT',
    "trialStatus" TEXT NOT NULL DEFAULT 'NONE',
    "alterationStatus" TEXT NOT NULL DEFAULT 'NONE',
    "completedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "deliveredQty" INTEGER NOT NULL DEFAULT 0,
    "reworkCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "itemId" UUID,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "note" TEXT,
    "changedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_stages" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "production_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_assignments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "stage" TEXT,
    "assignedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trials" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "observations" TEXT,
    "fitIssues" TEXT,
    "customerFeedback" TEXT,
    "customerApproved" BOOLEAN,
    "completedAt" TIMESTAMP(3),
    "createdBy" UUID,

    CONSTRAINT "trials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alterations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "assignedToId" UUID,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "beforeNotes" TEXT,
    "afterNotes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alterations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_checks" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "checklist" JSONB NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "notes" TEXT,
    "checkedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quality_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "orderId" UUID,
    "employeeId" UUID,
    "type" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "customerConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_lists" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "branchId" UUID,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "priceListId" UUID NOT NULL,
    "garmentType" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'STITCHING',
    "price" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "price_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "total" DECIMAL(14,2) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'TAX_INVOICE',
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL,
    "tax" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "taxLabel" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedBy" UUID,
    "createdBy" UUID,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL,
    "taxPercent" DECIMAL(7,4) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reference" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'PAYMENT',
    "note" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedBy" UUID,
    "reconciledAt" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "refundedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "taxId" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "variant" TEXT,
    "supplierId" UUID,
    "purchaseCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sellingPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reorderLevel" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,2),
    "orderItemId" UUID,
    "reference" TEXT,
    "note" TEXT,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'TRANSACTIONAL',

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_jobs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "customerId" UUID,
    "templateKey" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "outcome" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT true,
    "authorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_oidcSubject_key" ON "users"("oidcSubject");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "plans_key_key" ON "plans"("key");

-- CreateIndex
CREATE UNIQUE INDEX "plan_features_planId_key_key" ON "plan_features"("planId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenant_memberships_userId_idx" ON "tenant_memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_memberships_tenantId_userId_key" ON "tenant_memberships"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenantId_code_key" ON "branches"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenantId_userId_key" ON "employees"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "audit_events_tenantId_createdAt_idx" ON "audit_events"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_tenantId_entityType_entityId_idx" ON "audit_events"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "customers_tenantId_mobile_idx" ON "customers"("tenantId", "mobile");

-- CreateIndex
CREATE INDEX "customers_tenantId_email_idx" ON "customers"("tenantId", "email");

-- CreateIndex
CREATE INDEX "customers_tenantId_status_idx" ON "customers"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenantId_customerNumber_key" ON "customers"("tenantId", "customerNumber");

-- CreateIndex
CREATE INDEX "customer_contacts_tenantId_type_value_idx" ON "customer_contacts"("tenantId", "type", "value");

-- CreateIndex
CREATE UNIQUE INDEX "customer_contacts_customerId_type_value_key" ON "customer_contacts"("customerId", "type", "value");

-- CreateIndex
CREATE UNIQUE INDEX "households_tenantId_primaryCustomerId_key" ON "households"("tenantId", "primaryCustomerId");

-- CreateIndex
CREATE INDEX "household_members_tenantId_customerId_idx" ON "household_members"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "customer_consents_tenantId_customerId_idx" ON "customer_consents"("tenantId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "tags_tenantId_name_key" ON "tags"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_templates_tenantId_name_key" ON "measurement_templates"("tenantId", "name");

-- CreateIndex
CREATE INDEX "measurement_profiles_tenantId_memberId_idx" ON "measurement_profiles"("tenantId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_revisions_profileId_revisionNo_key" ON "measurement_revisions"("profileId", "revisionNo");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_values_revisionId_fieldKey_key" ON "measurement_values"("revisionId", "fieldKey");

-- CreateIndex
CREATE INDEX "orders_tenantId_status_idx" ON "orders"("tenantId", "status");

-- CreateIndex
CREATE INDEX "orders_tenantId_customerId_idx" ON "orders"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "orders_tenantId_branchId_deliveryDate_idx" ON "orders"("tenantId", "branchId", "deliveryDate");

-- CreateIndex
CREATE UNIQUE INDEX "orders_tenantId_orderNumber_key" ON "orders"("tenantId", "orderNumber");

-- CreateIndex
CREATE INDEX "order_items_tenantId_orderId_idx" ON "order_items"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "order_items_tenantId_stage_idx" ON "order_items"("tenantId", "stage");

-- CreateIndex
CREATE INDEX "order_status_history_tenantId_orderId_idx" ON "order_status_history"("tenantId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "production_stages_tenantId_key_key" ON "production_stages"("tenantId", "key");

-- CreateIndex
CREATE INDEX "order_item_assignments_tenantId_userId_idx" ON "order_item_assignments"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "trials_tenantId_scheduledAt_idx" ON "trials"("tenantId", "scheduledAt");

-- CreateIndex
CREATE INDEX "alterations_tenantId_status_dueDate_idx" ON "alterations"("tenantId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "appointments_tenantId_startsAt_idx" ON "appointments"("tenantId", "startsAt");

-- CreateIndex
CREATE INDEX "appointments_tenantId_employeeId_startsAt_idx" ON "appointments"("tenantId", "employeeId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_items_priceListId_garmentType_kind_key" ON "price_list_items"("priceListId", "garmentType", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_tenantId_number_key" ON "quotations"("tenantId", "number");

-- CreateIndex
CREATE INDEX "invoices_tenantId_orderId_idx" ON "invoices"("tenantId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenantId_number_key" ON "invoices"("tenantId", "number");

-- CreateIndex
CREATE INDEX "payments_tenantId_receivedAt_idx" ON "payments"("tenantId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenantId_receiptNumber_key" ON "payments"("tenantId", "receiptNumber");

-- CreateIndex
CREATE INDEX "payment_allocations_tenantId_orderId_idx" ON "payment_allocations"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "refunds_tenantId_orderId_idx" ON "refunds"("tenantId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_tenantId_number_key" ON "credit_notes"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_tenantId_sku_key" ON "inventory_items"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "inventory_transactions_tenantId_itemId_branchId_idx" ON "inventory_transactions"("tenantId", "itemId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_tenantId_key_channel_key" ON "notification_templates"("tenantId", "key", "channel");

-- CreateIndex
CREATE INDEX "notification_jobs_tenantId_status_scheduledFor_idx" ON "notification_jobs"("tenantId", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX "attachments_tenantId_entityType_entityId_idx" ON "attachments"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "comments_tenantId_entityType_entityId_idx" ON "comments"("tenantId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleKey_fkey" FOREIGN KEY ("roleKey") REFERENCES "roles"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "permissions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_roleKey_fkey" FOREIGN KEY ("roleKey") REFERENCES "roles"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_consents" ADD CONSTRAINT "customer_consents_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_tags" ADD CONSTRAINT "customer_tags_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_tags" ADD CONSTRAINT "customer_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_template_sections" ADD CONSTRAINT "measurement_template_sections_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "measurement_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_template_fields" ADD CONSTRAINT "measurement_template_fields_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "measurement_template_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_profiles" ADD CONSTRAINT "measurement_profiles_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "household_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_revisions" ADD CONSTRAINT "measurement_revisions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "measurement_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_values" ADD CONSTRAINT "measurement_values_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "measurement_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_preferences" ADD CONSTRAINT "style_preferences_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "measurement_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_assignments" ADD CONSTRAINT "order_item_assignments_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trials" ADD CONSTRAINT "trials_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alterations" ADD CONSTRAINT "alterations_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_checks" ADD CONSTRAINT "quality_checks_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "notification_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
