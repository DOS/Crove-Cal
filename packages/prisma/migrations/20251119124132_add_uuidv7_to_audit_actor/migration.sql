/*
  Warnings:

  - The primary key for the `AuditActor` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Changed the type of `id` on the `AuditActor` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `actorId` on the `BookingAudit` table to UUID.

*/

ALTER TABLE "BookingAudit" DROP CONSTRAINT "BookingAudit_actorId_fkey";

ALTER TABLE "BookingAudit" ALTER COLUMN "actorId" TYPE UUID USING "actorId"::UUID;

ALTER TABLE "AuditActor" DROP CONSTRAINT "AuditActor_pkey";

ALTER TABLE "AuditActor" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;

ALTER TABLE "AuditActor" ADD CONSTRAINT "AuditActor_pkey" PRIMARY KEY ("id");

ALTER TABLE "BookingAudit" ADD CONSTRAINT "BookingAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AuditActor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
