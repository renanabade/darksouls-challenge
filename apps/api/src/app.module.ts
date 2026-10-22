import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { CONFIG, ConfigModule, type Config } from "./config.js";
import { GameModule } from "./game/game.module.js";
import { HealthController } from "./health/health.controller.js";

const REQUEST_ID = "x-request-id";

/**
 * The correlation ID of a request: the caller's, when it sends one, or a new one. It is logged with every
 * line of the request and returned, and later travels with the generation job.
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
  ],
  controllers: [HealthController],
})
export class AppModule {}
