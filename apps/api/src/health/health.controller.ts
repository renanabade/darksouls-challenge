import { GENERATOR_VERSION, type World } from "@darksouls-challenge/core";
import { Controller, Get, Inject } from "@nestjs/common";
import { WORLD } from "../game/game.module.js";

/** Liveness for orchestrators and a quick look at what the instance serves. */
@Controller("health")
export class HealthController {
  constructor(@Inject(WORLD) private readonly world: World) {}

  @Get()
  check() {
    return {
      status: "ok",
      dataVersion: this.world.dataVersion,
      generatorVersion: GENERATOR_VERSION,
    };
  }
}
