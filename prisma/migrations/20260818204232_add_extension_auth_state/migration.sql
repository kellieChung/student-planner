/*
  Warnings:

  - A unique constraint covering the columns `[state]` on the table `ExtensionSession` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `state` to the `ExtensionSession` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ExtensionSession" ADD COLUMN     "state" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ExtensionSession_state_key" ON "ExtensionSession"("state");
