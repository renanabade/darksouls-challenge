"use client";

import type { ChallengeView, GeneratorConfig, SetupOptions } from "@darksouls-challenge/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GenerateRequest, WorkerMessage } from "./protocol";

export interface Core {
  readonly options: SetupOptions;
  readonly generatorVersion: string;
  readonly dataVersion: string;
}

/**
 * The core, in a worker: undefined until the worker has parsed the world. `generate` answers the latest
 * request only, so a click while another challenge is drawn never shows the older one.
 */
export function useCore(): {
  core: Core | undefined;
  generate: (config: GeneratorConfig) => Promise<ChallengeView>;
} {
  const worker = useRef<Worker | undefined>(undefined);
  const requests = useRef(0);
  const pending = useRef<
    | { id: number; resolve: (view: ChallengeView) => void; reject: (error: Error) => void }
    | undefined
  >(undefined);
  const [core, setCore] = useState<Core | undefined>(undefined);

  useEffect(() => {
    const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
      if (data.type === "ready") {
        const { options, generatorVersion, dataVersion } = data;
        setCore({ options, generatorVersion, dataVersion });
        return;
      }
      const request = pending.current;
      if (request?.id !== data.id) return;
      pending.current = undefined;
      if (data.type === "challenge") request.resolve(data.view);
      else request.reject(new Error(data.message));
    };
    return () => {
      w.terminate();
    };
  }, []);

  const generate = useCallback((config: GeneratorConfig) => {
    return new Promise<ChallengeView>((resolve, reject) => {
      const w = worker.current;
      if (w === undefined) {
        reject(new Error("the generator is not ready"));
        return;
      }
      const id = ++requests.current;
      pending.current = { id, resolve, reject };
      const request: GenerateRequest = { type: "generate", id, config };
      w.postMessage(request);
    });
  }, []);

  return { core, generate };
}
