-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "challenge" (
    "id" UUID NOT NULL,
    "game" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "data_version" TEXT NOT NULL,
    "generator_version" TEXT NOT NULL,
    "documents" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_job" (
    "id" UUID NOT NULL,
    "status" "job_status" NOT NULL DEFAULT 'QUEUED',
    "game" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "challenge_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generation_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_event" (
    "id" BIGSERIAL NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "challenge_game_seed_idx" ON "challenge"("game", "seed");

-- CreateIndex
CREATE UNIQUE INDEX "generation_job_challenge_id_key" ON "generation_job"("challenge_id");

-- CreateIndex
CREATE INDEX "outbox_event_published_at_id_idx" ON "outbox_event"("published_at", "id");

-- AddForeignKey
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

