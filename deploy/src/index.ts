import { Container, getContainer } from '@cloudflare/containers';

interface Env {
  SERVER: DurableObjectNamespace<Server>;
  VERSION: WorkerVersionMetadata;
  JWT_SECRET: string;
  DATABASE_URL: string;
  DATABASE_USERNAME: string;
  DATABASE_PASSWORD: string;
}

/**
 * The Spring server. It sleeps two minutes after its last request: memory is billed while it is awake, and a player who generates a
 * challenge and goes to play needs nothing more from it. The site itself is static assets, which never wake it.
 */
export class Server extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = '2m';
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

/**
 * Public answers that do not change, kept at the edge so they do not wake the server, in seconds. A code always makes the same
 * challenge, and the options are the data's, so both last until the next deploy: the cache key carries the version.
 */
const CACHED: Record<string, number> = {
  '/api/options': 24 * 60 * 60,
  '/api/previews': 24 * 60 * 60,
  '/api/ranking': 30,
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const seconds = CACHED[url.pathname];
    const server = getContainer(env.SERVER);
    if (request.method !== 'GET' || seconds === undefined || request.headers.has('Authorization')) return server.fetch(request);

    const key = new URL(url);
    key.searchParams.set('version', env.VERSION.id);
    const cache = caches.default;
    const kept = await cache.match(key.toString());
    if (kept) return kept;

    const response = await server.fetch(request);
    if (response.status !== 200) return response;

    // The player gets the server's own headers; only the copy kept here says how long it lasts.
    const copy = new Response(response.clone().body, response);
    copy.headers.set('Cache-Control', `public, max-age=${seconds}`);
    copy.headers.delete('Set-Cookie');
    ctx.waitUntil(cache.put(key.toString(), copy));
    return response;
  },
} satisfies ExportedHandler<Env>;
