/*
  Warnings:

  - The primary key for the `sync_operations` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "sync_operations" DROP CONSTRAINT "sync_operations_pkey",
ADD CONSTRAINT "sync_operations_pkey" PRIMARY KEY ("userId", "clientOpId");
