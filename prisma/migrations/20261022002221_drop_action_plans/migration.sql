/*
  Warnings:

  - You are about to drop the `action_plans` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "action_plans" DROP CONSTRAINT "action_plans_placementId_fkey";

-- DropTable
DROP TABLE "action_plans";
