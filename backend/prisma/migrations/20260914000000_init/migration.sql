-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'MANAGER', 'HR');

-- CreateEnum
CREATE TYPE "TimeEntryType" AS ENUM ('CLOCK_IN', 'BREAK_START', 'BREAK_END', 'CLOCK_OUT');

-- CreateEnum
CREATE TYPE "EntrySource" AS ENUM ('WEB', 'MANUAL', 'CORRECTION', 'IMPORT');

-- CreateEnum
CREATE TYPE "CorrectionType" AS ENUM ('ADD', 'REMOVE', 'MODIFY');

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClosingStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "baseTimezone" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "expectedDailyMinutes" INTEGER NOT NULL DEFAULT 480,
    "managerId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "TimeEntryType" NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "utcOffsetMinutes" INTEGER NOT NULL,
    "workDate" DATE NOT NULL,
    "source" "EntrySource" NOT NULL DEFAULT 'WEB',
    "note" TEXT,
    "registeredById" UUID NOT NULL,
    "originCorrectionId" UUID,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedByCorrectionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrectionRequest" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "type" "CorrectionType" NOT NULL,
    "targetEntryId" UUID,
    "proposedType" "TimeEntryType",
    "proposedOccurredAt" TIMESTAMPTZ(3),
    "proposedTimezone" TEXT,
    "proposedCountry" CHAR(2),
    "workDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorrectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyClosing" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "ClosingStatus" NOT NULL DEFAULT 'OPEN',
    "workedMinutes" INTEGER,
    "expectedMinutes" INTEGER,
    "balanceMinutes" INTEGER,
    "closedById" UUID,
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MonthlyClosing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_managerId_idx" ON "User"("managerId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "TimeEntry_originCorrectionId_key" ON "TimeEntry"("originCorrectionId");

-- CreateIndex
CREATE INDEX "TimeEntry_userId_workDate_idx" ON "TimeEntry"("userId", "workDate");

-- CreateIndex
CREATE INDEX "TimeEntry_userId_occurredAt_idx" ON "TimeEntry"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "TimeEntry_workDate_idx" ON "TimeEntry"("workDate");

-- CreateIndex
CREATE INDEX "CorrectionRequest_userId_workDate_idx" ON "CorrectionRequest"("userId", "workDate");

-- CreateIndex
CREATE INDEX "CorrectionRequest_status_idx" ON "CorrectionRequest"("status");

-- CreateIndex
CREATE INDEX "MonthlyClosing_year_month_status_idx" ON "MonthlyClosing"("year", "month", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyClosing_userId_year_month_key" ON "MonthlyClosing"("userId", "year", "month");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_originCorrectionId_fkey" FOREIGN KEY ("originCorrectionId") REFERENCES "CorrectionRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_revokedByCorrectionId_fkey" FOREIGN KEY ("revokedByCorrectionId") REFERENCES "CorrectionRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyClosing" ADD CONSTRAINT "MonthlyClosing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyClosing" ADD CONSTRAINT "MonthlyClosing_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
