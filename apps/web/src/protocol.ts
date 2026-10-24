import type { ChallengeView, GeneratorConfig, SetupOptions } from "@darksouls-challenge/core";

/** Messages between the page and the worker that runs the core. */
export interface GenerateRequest {
  readonly type: "generate";
  readonly id: number;
  readonly config: GeneratorConfig;
}

export type WorkerMessage =
  | {
      readonly type: "ready";
      readonly options: SetupOptions;
      readonly generatorVersion: string;
      readonly dataVersion: string;
    }
  | { readonly type: "challenge"; readonly id: number; readonly view: ChallengeView }
  | { readonly type: "error"; readonly id: number; readonly message: string };
