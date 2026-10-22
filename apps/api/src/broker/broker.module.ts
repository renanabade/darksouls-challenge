import {
  ChallengeRepository,
  TOPICS,
  type JobEvent,
  type OutboxEvent,
} from "@darksouls-challenge/db";
import { assertTopology, bodyOf, publish, TOPOLOGY } from "@darksouls-challenge/messaging";
import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { connect, type ChannelModel, type ConfirmChannel } from "amqplib";
import { PubSub } from "graphql-subscriptions";
import { CONFIG, type Config } from "../config.js";

/** In-process pub/sub of the GraphQL subscriptions. */
export const PUB_SUB = Symbol("PUB_SUB");
export const CHALLENGE_READY = "challengeReady";

const RELAY_INTERVAL_MS = 250;
const RELAY_BATCH = 50;

/**
 * Connects to RabbitMQ, when configured, and runs the two broker loops of the API:
 *
 * - the **outbox relay**: publishes the committed outbox events, confirmed by the broker, then marks them;
 * - the **ready listener**: each instance binds its own exclusive queue to `challenge.ready`, so the broker
 *   fans every event out to every instance, and each one tells its own subscribers. No shared pub/sub needed.
 *
 * Without `RABBITMQ_URL` the API still accepts jobs: their events wait in the outbox.
 */
@Injectable()
export class Broker implements OnApplicationBootstrap, OnApplicationShutdown {
  readonly #logger = new Logger(Broker.name);
  #connection: ChannelModel | undefined;
  #timer: NodeJS.Timeout | undefined;
  #relaying: Promise<void> = Promise.resolve();

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Inject(ChallengeRepository) private readonly repository: ChallengeRepository,
    @Inject(PUB_SUB) private readonly pubSub: PubSub,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.rabbitUrl === undefined) {
      this.#logger.warn("RABBITMQ_URL is not set: jobs stay in the outbox");
      return;
    }
    this.#connection = await connect(this.config.rabbitUrl);
    this.#connection.on("close", () => {
      // A lost broker ends the process; the orchestrator restarts it. The outbox keeps every event.
      if (this.#timer !== undefined) {
        this.#logger.error("broker connection closed");
        process.exit(1);
      }
    });
    const channel = await this.#connection.createConfirmChannel();
    await assertTopology(channel);
    await this.listen(channel);
    this.#timer = setInterval(() => {
      this.#relaying = this.#relaying.then(() => this.relayOnce(channel));
    }, RELAY_INTERVAL_MS);
  }

  async onApplicationShutdown(): Promise<void> {
    const timer = this.#timer;
    this.#timer = undefined;
    clearInterval(timer);
    await this.#relaying;
    await this.#connection?.close();
  }

  private async relayOnce(channel: ConfirmChannel): Promise<void> {
    try {
      await this.repository.relay(RELAY_BATCH, async (events: OutboxEvent[]) => {
        await Promise.all(
          events.map((event) => {
            const payload = event.payload as unknown as JobEvent;
            return publish(channel, {
              exchange: TOPOLOGY.events,
              routingKey: event.topic,
              payload,
              correlationId: payload.correlationId,
              messageId: String(event.id),
            });
          }),
        );
      });
    } catch (error) {
      // The events stay unpublished and the next pass tries again.
      this.#logger.error(error, "outbox relay failed");
    }
  }

  private async listen(channel: ConfirmChannel): Promise<void> {
    const { queue } = await channel.assertQueue("", { exclusive: true, autoDelete: true });
    await channel.bindQueue(queue, TOPOLOGY.events, TOPICS.challengeReady);
    await channel.consume(queue, (msg) => {
      if (msg === null) return;
      void this.pubSub.publish(CHALLENGE_READY, bodyOf(msg)).finally(() => {
        channel.ack(msg);
      });
    });
  }
}

@Global()
@Module({
  providers: [{ provide: PUB_SUB, useFactory: () => new PubSub() }, Broker],
  exports: [PUB_SUB],
})
export class BrokerModule {}
