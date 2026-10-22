import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module.js";
import { CONFIG, type Config } from "./config.js";

const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
app.enableShutdownHooks();
await app.listen(app.get<Config>(CONFIG).port);
