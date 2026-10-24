import {
  describeChallenge,
  generate,
  GENERATOR_VERSION,
  parseWorld,
  setupOptions,
} from "@darksouls-challenge/core";
import { dataSet } from "./data";
import type { GenerateRequest, WorkerMessage } from "./protocol";

/**
 * Runs the core off the page's thread: a journey takes seconds to draw and validate, and the page stays
 * responsive meanwhile. The world is parsed once, when the worker starts.
 */
const scope = self as unknown as {
  postMessage: (message: WorkerMessage) => void;
  onmessage: ((event: MessageEvent<GenerateRequest>) => void) | null;
};

const world = parseWorld(dataSet);

scope.onmessage = ({ data }) => {
  try {
    const view = describeChallenge(world, generate(world, data.config));
    scope.postMessage({ type: "challenge", id: data.id, view });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    scope.postMessage({ type: "error", id: data.id, message });
  }
};

scope.postMessage({
  type: "ready",
  options: setupOptions(world),
  generatorVersion: GENERATOR_VERSION,
  dataVersion: world.dataVersion,
});
