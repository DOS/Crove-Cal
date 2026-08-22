-- CreateEnum
CREATE TYPE "WorkflowStepAutoTranslatedField" AS ENUM ('REMINDER_BODY', 'EMAIL_SUBJECT');

-- AlterTable
ALTER TABLE "WorkflowStep" ADD COLUMN     "autoTranslateEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sourceLocale" TEXT;

-- CreateTable
CREATE TABLE "WorkflowStepTranslation" (
    "uid" TEXT NOT NULL,
    "workflowStepId" INTEGER NOT NULL,
    "field" "WorkflowStepAutoTranslatedField" NOT NULL,
    "sourceLocale" TEXT NOT NULL,
    "targetLocale" TEXT NOT NULL,
    "translatedText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowStepTranslation_pkey" PRIMARY KEY ("uid")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStepTranslation_workflowStepId_field_targetLocale_key" ON "WorkflowStepTranslation"("workflowStepId", "field", "targetLocale");

-- AddForeignKey
ALTER TABLE "WorkflowStepTranslation" ADD CONSTRAINT "WorkflowStepTranslation_workflowStepId_fkey" FOREIGN KEY ("workflowStepId") REFERENCES "WorkflowStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
