-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Buttons" AS ENUM ('COMMON', 'BUY');

-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "button" "Buttons" NOT NULL DEFAULT 'COMMON';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'USER';
