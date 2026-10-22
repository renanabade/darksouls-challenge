import { pathToFileURL } from "node:url";
import { z } from "zod";

const Env = z.object({
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** The data set directory; the repository's `data/ds1/` by default. */
  DATA_DIR: z.string().min(1).optional(),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  RABBITMQ_URL: z.url({ protocol: /^amqps?$/ }),
  /** Deliveries of a message before it goes to the dead letter queue. */
  MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
});

export interface Config {
  readonly logLevel: z.infer<typeof Env>["LOG_LEVEL"];
  readonly dataDir: URL;
  readonly databaseUrl: string;
  readonly rabbitUrl: string;
  readonly maxAttempts: number;
}

/** Reads the configuration once, at startup: a bad value stops the process. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) throw new Error(`invalid environment: ${z.prettifyError(parsed.error)}`);
  const { LOG_LEVEL, DATA_DIR, DATABASE_URL, RABBITMQ_URL, MAX_ATTEMPTS } = parsed.data;
  return {
    logLevel: LOG_LEVEL,
    dataDir:
      DATA_DIR === undefined
        ? new URL("../../../data/ds1/", import.meta.url)
        : pathToFileURL(DATA_DIR.replace(/[\\/]?$/, "/")),
    databaseUrl: DATABASE_URL,
    rabbitUrl: RABBITMQ_URL,
    maxAttempts: MAX_ATTEMPTS,
  };
}
