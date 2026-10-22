import {
  Global,
  Inject,
  Injectable,
  Module,
  type ExecutionContext,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { Redis } from "ioredis";
import { CONFIG, type Config } from "../config.js";
import { RedisThrottlerStorage } from "./redis-storage.js";

/** The Redis connection, or null when none is configured (counters stay in this instance's memory). */
export const REDIS = Symbol("REDIS");

/** The throttler that limits generation requests: they are the expensive ones. */
export const GENERATION_THROTTLER = "generation";
const MINUTE = 60_000;

/** The throttler guard, reading the HTTP request out of a GraphQL resolver's context. */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  protected override getRequestResponse(context: ExecutionContext) {
    const { req } = GqlExecutionContext.create(context).getContext<{
      req: Record<string, unknown> & { res: Record<string, unknown> };
    }>();
    return { req, res: req.res };
  }
}

@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [CONFIG, REDIS],
      useFactory: (config: Config, redis: Redis | null) => ({
        throttlers: [{ name: GENERATION_THROTTLER, ttl: MINUTE, limit: config.generationLimit }],
        ...(redis !== null && { storage: new RedisThrottlerStorage(redis) }),
      }),
    }),
  ],
  providers: [GqlThrottlerGuard],
  exports: [GqlThrottlerGuard],
})
export class ThrottleModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis | null) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis?.quit();
  }
}

/** Provided apart from the throttle module, so the throttler's factory can inject it. */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [CONFIG],
      useFactory: (config: Config) =>
        config.redisUrl === undefined ? null : new Redis(config.redisUrl, { lazyConnect: true }),
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
