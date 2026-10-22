import { Global, Module } from "@nestjs/common";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** The data set directory; the repository's `data/ds1/` by default. */
  DATA_DIR: z.string().min(1).optional(),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** Shared rate limit counters. Without it, each instance counts on its own, in memory. */
  REDIS_URL: z.url({ protocol: /^rediss?$/ }).optional(),
  /** The broker. Without it, accepted jobs wait in the outbox. */
  RABBITMQ_URL: z.url({ protocol: /^amqps?$/ }).optional(),
  /** Generation requests allowed per client per minute. */
  GENERATION_LIMIT: z.coerce.number().int().positive().default(10),
});

export interface Config {
  readonly port: number;
  readonly logLevel: z.infer<typeof Env>["LOG_LEVEL"];
  readonly dataDir: URL;
  readonly databaseUrl: string;
  readonly redisUrl?: string;
  readonly rabbitUrl?: string;
  readonly generationLimit: number;
}

/** Injection token of the validated configuration. */
export const CONFIG = Symbol("CONFIG");

export class ConfigError extends Error {}

/** Reads the configuration from the environment once, at startup: a bad value stops the process. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success)
    throw new ConfigError(`invalid environment: ${z.prettifyError(parsed.error)}`);
  const { PORT, LOG_LEVEL, DATA_DIR, DATABASE_URL, REDIS_URL, RABBITMQ_URL, GENERATION_LIMIT } =
    parsed.data;
  return {
    port: PORT,
    logLevel: LOG_LEVEL,
    dataDir:
      DATA_DIR === undefined
        ? new URL("../../../data/ds1/", import.meta.url)
        : pathToFileURL(DATA_DIR.replace(/[\\/]?$/, "/")),
    databaseUrl: DATABASE_URL,
    ...(REDIS_URL !== undefined && { redisUrl: REDIS_URL }),
    ...(RABBITMQ_URL !== undefined && { rabbitUrl: RABBITMQ_URL }),
    generationLimit: GENERATION_LIMIT,
  };
}

@Global()
@Module({
  providers: [{ provide: CONFIG, useFactory: () => loadConfig(process.env) }],
  exports: [CONFIG],
})
export class ConfigModule {}
