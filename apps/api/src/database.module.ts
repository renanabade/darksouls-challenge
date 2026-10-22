import { ChallengeRepository, createPrismaClient, PrismaClient } from "@darksouls-challenge/db";
import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { CONFIG, type Config } from "./config.js";

/** The database client connects on its first query, so the API starts even while the database is down. */
@Global()
@Module({
  providers: [
    {
      provide: PrismaClient,
      inject: [CONFIG],
      useFactory: (config: Config) => createPrismaClient(config.databaseUrl),
    },
    {
      provide: ChallengeRepository,
      inject: [PrismaClient],
      useFactory: (prisma: PrismaClient) => new ChallengeRepository(prisma),
    },
  ],
  exports: [ChallengeRepository],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
