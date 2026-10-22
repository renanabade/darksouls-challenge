/** The services' URLs the global setup (`test/services.ts`) hands to the tests: `inject("services")`. */
export interface Services {
  readonly databaseUrl: string | undefined;
  readonly redisUrl: string | undefined;
  readonly rabbitUrl: string | undefined;
}

declare module "vitest" {
  export interface ProvidedContext {
    services: Services;
  }
}
