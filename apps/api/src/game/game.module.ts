import { loadDataSet } from "@darksouls-challenge/contracts";
import { parseWorld } from "@darksouls-challenge/core";
import { Global, Module } from "@nestjs/common";
import { CONFIG, type Config } from "../config.js";

/** Injection token of the game's world, parsed once at startup and shared: it never changes at runtime. */
export const WORLD = Symbol("WORLD");

@Global()
@Module({
  providers: [
    {
      provide: WORLD,
      inject: [CONFIG],
      useFactory: (config: Config) => parseWorld(loadDataSet(config.dataDir)),
    },
  ],
  exports: [WORLD],
})
export class GameModule {}
