import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client.js";

export type { Challenge, GenerationJob, JobStatus, OutboxEvent } from "./generated/client.js";
export { PrismaClient };
export {
  ChallengeRepository,
  TOPICS,
  type Generated,
  type JobEvent,
  type JobWithChallenge,
  type NewJob,
} from "./repository.js";

/** A client over the `pg` driver (Prisma 7 talks to the database through a driver adapter). */
export function createPrismaClient(url: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
