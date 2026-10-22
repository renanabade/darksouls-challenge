import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { CONFIG, ConfigError, loadConfig, type Config } from "../src/config.js";

describe("loadConfig", () => {
  it("defaults to port 3000 and the repository's data set", () => {
    const config = loadConfig({});
    expect(config.port).toBe(3000);
    expect(config.dataDir.href).toMatch(/\/data\/ds1\/$/);
  });

  it("stops on a bad value", () => {
    expect(() => loadConfig({ PORT: "http" })).toThrow(ConfigError);
    expect(() => loadConfig({ LOG_LEVEL: "loud" })).toThrow(ConfigError);
  });
});

describe("the API", () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    const config: Config = { ...loadConfig({}), logLevel: "silent" };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CONFIG)
      .useValue(config)
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it("answers the health check with the versions it serves", async () => {
    const response = await fetch(`${url}/health`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["status"]).toBe("ok");
    expect(body["generatorVersion"]).toMatch(/^\d+$/);
    expect(body["dataVersion"]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("keeps the caller's correlation ID, or makes one", async () => {
    const kept = await fetch(`${url}/health`, { headers: { "x-request-id": "run-42" } });
    expect(kept.headers.get("x-request-id")).toBe("run-42");
    const made = await fetch(`${url}/health`, { headers: { "x-request-id": "bad id!" } });
    expect(made.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });
});
