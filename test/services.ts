/**
 * Starts the services the integration tests need (PostgreSQL, Redis, RabbitMQ) once per test run, with
 * Testcontainers, and hands their URLs to the tests through `inject("services")`.
 *
 * - A URL already in the environment (DATABASE_URL, REDIS_URL, RABBITMQ_URL) is used as is: no container.
 * - Without Docker, the missing services stay undefined and the tests that need them are skipped, unless
 *   REQUIRE_SERVICES=1 (CI), which fails the run instead.
 * - TESTCONTAINERS=off never starts containers.
 * - The database is migrated here, once.
 */
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { RabbitMQContainer } from "@testcontainers/rabbitmq";
import { RedisContainer } from "@testcontainers/redis";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";
import type {} from "./provided.js";

interface Started {
  readonly url: string;
  stop(): Promise<unknown>;
}

async function start(
  name: string,
  given: string | undefined,
  run: () => Promise<Started>,
  stops: (() => Promise<unknown>)[],
): Promise<string | undefined> {
  if (given !== undefined || process.env["TESTCONTAINERS"] === "off") return given;
  try {
    const started = await run();
    stops.push(() => started.stop());
    return started.url;
  } catch (error) {
    if (process.env["REQUIRE_SERVICES"] === "1") throw error;
    console.warn(`${name}: no container (${String(error)}); its tests are skipped`);
    return undefined;
  }
}

export default async function setup(project: TestProject) {
  const stops: (() => Promise<unknown>)[] = [];
  const env = process.env;
  const [databaseUrl, redisUrl, rabbitUrl] = await Promise.all([
    start(
      "PostgreSQL",
      env["DATABASE_URL"],
      async () => {
        const c = await new PostgreSqlContainer("postgres:17-alpine").start();
        return { url: c.getConnectionUri(), stop: () => c.stop() };
      },
      stops,
    ),
    start(
      "Redis",
      env["REDIS_URL"],
      async () => {
        const c = await new RedisContainer("redis:8-alpine").start();
        return { url: c.getConnectionUrl(), stop: () => c.stop() };
      },
      stops,
    ),
    start(
      "RabbitMQ",
      env["RABBITMQ_URL"],
      async () => {
        const c = await new RabbitMQContainer("rabbitmq:4-alpine").start();
        return { url: c.getAmqpUrl(), stop: () => c.stop() };
      },
      stops,
    ),
  ]);
  if (databaseUrl !== undefined)
    // Once per run, before any test: the tests then only truncate.
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: fileURLToPath(new URL("../packages/db", import.meta.url)),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      shell: true,
      stdio: "ignore",
    });
  project.provide("services", { databaseUrl, redisUrl, rabbitUrl });
  return async () => {
    await Promise.all(stops.map((stop) => stop()));
  };
}
