import { Global, Module } from "@nestjs/common";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** The data set directory; the repository's `data/ds1/` by default. */
  DATA_DIR: z.string().min(1).optional(),
});

export interface Config {
  readonly port: number;
  readonly logLevel: z.infer<typeof Env>["LOG_LEVEL"];
  readonly dataDir: URL;
}

/** Injection token of the validated configuration. */
export const CONFIG = Symbol("CONFIG");

export class ConfigError extends Error {}

/** Reads the configuration from the environment once, at startup: a bad value stops the process. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success)
    throw new ConfigError(`invalid environment: ${z.prettifyError(parsed.error)}`);
  const { PORT, LOG_LEVEL, DATA_DIR } = parsed.data;
  return {
    port: PORT,
    logLevel: LOG_LEVEL,
    dataDir:
      DATA_DIR === undefined
        ? new URL("../../../data/ds1/", import.meta.url)
        : pathToFileURL(DATA_DIR.replace(/[\\/]?$/, "/")),
  };
}

@Global()
@Module({
  providers: [{ provide: CONFIG, useFactory: () => loadConfig(process.env) }],
  exports: [CONFIG],
})
export class ConfigModule {}
