import { loadDataSet } from "@darksouls-challenge/contracts";
import { parseWorld } from "@darksouls-challenge/core";
import { ChallengeRepository, createPrismaClient } from "@darksouls-challenge/db";
import { connect } from "amqplib";
import { pino } from "pino";
import { loadConfig } from "./config.js";
import { startWorker } from "./worker.js";

const config = loadConfig(process.env);
const logger = pino({ level: config.logLevel, base: { service: "worker" } });
const world = parseWorld(loadDataSet(config.dataDir));
const prisma = createPrismaClient(config.databaseUrl);
const connection = await connect(config.rabbitUrl);
// A lost connection ends the process; the orchestrator restarts it, and unacknowledged messages return.
connection.on("close", () => {
  logger.error("broker connection closed");
  process.exit(1);
});

const worker = await startWorker(
  connection,
  { world, repository: new ChallengeRepository(prisma), maxAttempts: config.maxAttempts },
  logger,
);
logger.info({ dataVersion: world.dataVersion }, "worker ready");

for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    logger.info({ signal }, "shutting down");
    void (async () => {
      await worker.close();
      connection.removeAllListeners("close");
      await connection.close();
      await prisma.$disconnect();
      process.exit(0);
    })();
  });
