-- CreateTable
CREATE TABLE "PendingRoutingTrace" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trace" JSONB NOT NULL,
    "formResponseId" INTEGER,
    "queuedFormResponseId" TEXT,

    CONSTRAINT "PendingRoutingTrace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingTrace" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trace" JSONB NOT NULL,
    "formResponseId" INTEGER,
    "queuedFormResponseId" TEXT,
    "bookingUid" TEXT,
    "assignmentReasonId" INTEGER,

    CONSTRAINT "RoutingTrace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingRoutingTrace_formResponseId_key" ON "PendingRoutingTrace"("formResponseId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingRoutingTrace_queuedFormResponseId_key" ON "PendingRoutingTrace"("queuedFormResponseId");

-- CreateIndex
CREATE UNIQUE INDEX "RoutingTrace_formResponseId_key" ON "RoutingTrace"("formResponseId");

-- CreateIndex
CREATE UNIQUE INDEX "RoutingTrace_queuedFormResponseId_key" ON "RoutingTrace"("queuedFormResponseId");

-- CreateIndex
CREATE UNIQUE INDEX "RoutingTrace_bookingUid_key" ON "RoutingTrace"("bookingUid");

-- CreateIndex
CREATE UNIQUE INDEX "RoutingTrace_assignmentReasonId_key" ON "RoutingTrace"("assignmentReasonId");

-- AddForeignKey
ALTER TABLE "PendingRoutingTrace" ADD CONSTRAINT "PendingRoutingTrace_formResponseId_fkey" FOREIGN KEY ("formResponseId") REFERENCES "App_RoutingForms_FormResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingRoutingTrace" ADD CONSTRAINT "PendingRoutingTrace_queuedFormResponseId_fkey" FOREIGN KEY ("queuedFormResponseId") REFERENCES "App_RoutingForms_QueuedFormResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingTrace" ADD CONSTRAINT "RoutingTrace_formResponseId_fkey" FOREIGN KEY ("formResponseId") REFERENCES "App_RoutingForms_FormResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingTrace" ADD CONSTRAINT "RoutingTrace_queuedFormResponseId_fkey" FOREIGN KEY ("queuedFormResponseId") REFERENCES "App_RoutingForms_QueuedFormResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingTrace" ADD CONSTRAINT "RoutingTrace_bookingUid_fkey" FOREIGN KEY ("bookingUid") REFERENCES "Booking"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingTrace" ADD CONSTRAINT "RoutingTrace_assignmentReasonId_fkey" FOREIGN KEY ("assignmentReasonId") REFERENCES "AssignmentReason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheckConstraint: Ensure at least one of formResponseId or queuedFormResponseId is set
ALTER TABLE "PendingRoutingTrace" ADD CONSTRAINT "PendingRoutingTrace_at_least_one_response_id" CHECK ("formResponseId" IS NOT NULL OR "queuedFormResponseId" IS NOT NULL);

-- AddCheckConstraint: Ensure at least one of formResponseId or queuedFormResponseId is set
ALTER TABLE "RoutingTrace" ADD CONSTRAINT "RoutingTrace_at_least_one_response_id" CHECK ("formResponseId" IS NOT NULL OR "queuedFormResponseId" IS NOT NULL);
