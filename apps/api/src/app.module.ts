import { ApolloDriver, type ApolloDriverConfig } from "@nestjs/apollo";
import { Module } from "@nestjs/common";
import { GraphQLModule } from "@nestjs/graphql";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { CONFIG, ConfigModule, type Config } from "./config.js";
import { DatabaseModule } from "./database.module.js";
import { GameModule } from "./game/game.module.js";
import { ChallengeResolver } from "./graphql/challenge.resolver.js";
import { complexityLimit, depthLimit, MAX_COMPLEXITY, MAX_DEPTH } from "./graphql/limits.js";
import { HealthController } from "./health/health.controller.js";
import { RedisModule, ThrottleModule } from "./throttle/throttle.module.js";

const REQUEST_ID = "x-request-id";

/**
 * The correlation ID of a request: the caller's, when it sends one, or a new one. It is logged with every
 * line of the request and returned, and travels with the generation job.
 */
export function requestId(request: IncomingMessage, response: ServerResponse): string {
  const sent = request.headers[REQUEST_ID];
  const id = typeof sent === "string" && /^[\w-]{1,64}$/.test(sent) ? sent : randomUUID();
  response.setHeader(REQUEST_ID, id);
  return id;
}

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [CONFIG],
      useFactory: (config: Config) => ({
        pinoHttp: { level: config.logLevel, genReqId: requestId },
      }),
    }),
    GameModule,
    DatabaseModule,
    RedisModule,
    ThrottleModule,
    // Code first: the schema is generated in memory from the decorated classes.
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      sortSchema: true,
      context: ({ req, res }: { req: unknown; res: unknown }) => ({ req, res }),
      validationRules: [depthLimit(MAX_DEPTH)],
      plugins: [complexityLimit(MAX_COMPLEXITY)],
    }),
  ],
  controllers: [HealthController],
  providers: [ChallengeResolver],
})
export class AppModule {}
