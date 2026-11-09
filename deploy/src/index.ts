import { Container, getContainer } from '@cloudflare/containers';

interface Env {
  SERVER: DurableObjectNamespace<Server>;
  JWT_SECRET: string;
  DATABASE_URL: string;
  DATABASE_USERNAME: string;
  DATABASE_PASSWORD: string;
}

/** The Spring server. It sleeps when nobody is playing, so an idle site costs nothing but a slower first visit. */
export class Server extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = '15m';
  enableInternet = true;

  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env);
    this.envVars = {
      JWT_SECRET: env.JWT_SECRET,
      SPRING_DATASOURCE_URL: env.DATABASE_URL,
      SPRING_DATASOURCE_USERNAME: env.DATABASE_USERNAME,
      SPRING_DATASOURCE_PASSWORD: env.DATABASE_PASSWORD,

      // Every request reaches the container from this Worker: the player's address is what Cloudflare says it is.
      RATE_LIMITS_CLIENT_HEADER: 'CF-Connecting-IP',
    };
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return getContainer(env.SERVER).fetch(request);
  },
} satisfies ExportedHandler<Env>;
