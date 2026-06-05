CREATE TABLE "Employee" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "position" TEXT NOT NULL,
  "crew" TEXT NOT NULL,
  "homeBase" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Customer" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contact" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Site" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Course" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "renewalMonths" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Completion" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "completedOn" DATE NOT NULL,
  "expiresOn" DATE NOT NULL,
  "recordedBySubject" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voidedAt" TIMESTAMP(3),
  "voidedBySubject" TEXT,
  "voidReason" TEXT,
  CONSTRAINT "Completion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "actorSubject" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Customer_name_key" ON "Customer"("name");
CREATE INDEX "Employee_active_name_idx" ON "Employee"("active", "name");
CREATE INDEX "Customer_active_name_idx" ON "Customer"("active", "name");
CREATE UNIQUE INDEX "Site_customerId_name_key" ON "Site"("customerId", "name");
CREATE INDEX "Site_active_name_idx" ON "Site"("active", "name");
CREATE UNIQUE INDEX "Course_siteId_code_key" ON "Course"("siteId", "code");
CREATE INDEX "Course_siteId_active_idx" ON "Course"("siteId", "active");
CREATE INDEX "Completion_employeeId_courseId_completedOn_idx"
  ON "Completion"("employeeId", "courseId", "completedOn");
CREATE INDEX "Completion_courseId_voidedAt_idx" ON "Completion"("courseId", "voidedAt");
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx"
  ON "AuditEvent"("entityType", "entityId", "createdAt");
CREATE INDEX "AuditEvent_actorSubject_createdAt_idx"
  ON "AuditEvent"("actorSubject", "createdAt");

ALTER TABLE "Site"
  ADD CONSTRAINT "Site_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Course"
  ADD CONSTRAINT "Course_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Completion"
  ADD CONSTRAINT "Completion_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Completion"
  ADD CONSTRAINT "Completion_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
