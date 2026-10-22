-- CreateTable
CREATE TABLE "action_plans" (
    "placementId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "action_plans_pkey" PRIMARY KEY ("placementId")
);

-- AddForeignKey
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "placements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
