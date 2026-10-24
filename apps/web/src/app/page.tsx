"use client";

import type { ChallengeView, GeneratorConfig } from "@darksouls-challenge/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChallengeSheet } from "../challenge-sheet";
import { DEFAULT_FORM, fromQuery, toQuery, type FormState } from "../permalink";
import { SetupMenu } from "../setup-menu";
import { useCore } from "../use-core";

/** A short random seed, so a challenge asked without one can still be shared. */
function drawSeed(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function configOf(form: FormState, seed: string): GeneratorConfig {
  return {
    seed,
    difficulty: form.difficulty,
    length: form.length,
    ...(form.startingClass !== "" && { startingClass: form.startingClass }),
    ...(form.giftRow !== "" && { giftRow: Number(form.giftRow) }),
  };
}

export default function Home() {
  const { core, generate } = useCore();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [view, setView] = useState<ChallengeView | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  // The generator version of the link the page was opened with, when it is not this site's.
  const [staleVersion, setStaleVersion] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const opened = useRef(false);

  const run = useCallback(
    async (state: FormState) => {
      if (core === undefined) return;
      const seed = state.seed.trim() === "" ? drawSeed() : state.seed.trim();
      const next = { ...state, seed };
      setForm(next);
      setBusy(true);
      setError(undefined);
      try {
        const challenge = await generate(configOf(next, seed));
        setView(challenge);
        window.history.replaceState(null, "", `?${toQuery(next, core.generatorVersion)}`);
        sheet.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [core, generate],
  );

  // A link with a seed opens straight on its challenge.
  useEffect(() => {
    if (core === undefined || opened.current) return;
    opened.current = true;
    const link = fromQuery(window.location.search, core.options);
    if (link === undefined) return;
    if (link.version !== undefined && link.version !== core.generatorVersion)
      setStaleVersion(link.version);
    void run(link.form);
  }, [core, run]);

  return (
    <div className="page">
      <header className="title">
        <h1>
          <span className="title-small">Dark Souls</span>
          Challenge
        </h1>
        <p className="tagline">
          A manual of orders for your next run. Every challenge can be beaten.
        </p>
      </header>

      <main>
        {core === undefined ? (
          <p className="kindling">Kindling the bonfire…</p>
        ) : (
          <SetupMenu
            options={core.options}
            form={form}
            onChange={(f) => {
              setForm(f);
            }}
            onGenerate={() => {
              setStaleVersion(undefined);
              void run(form);
            }}
            busy={busy}
          />
        )}

        {staleVersion !== undefined && (
          <p className="notice" role="alert">
            This link was made with generator {staleVersion}. This site runs generator{" "}
            {core?.generatorVersion}, so the same seed and settings now give a different challenge.
          </p>
        )}
        {error !== undefined && (
          <p className="notice" role="alert">
            No challenge could be generated: {error}
          </p>
        )}

        <div ref={sheet}>
          {view !== undefined && (
            <>
              <div className="actions">
                <button
                  type="button"
                  className="prompt"
                  onClick={() => {
                    void navigator.clipboard.writeText(window.location.href).then(() => {
                      setCopied(true);
                      window.setTimeout(() => {
                        setCopied(false);
                      }, 2000);
                    });
                  }}
                >
                  {copied ? "Link copied" : "Copy link"}
                </button>
              </div>
              <ChallengeSheet view={view} />
            </>
          )}
        </div>
      </main>

      <footer className="footer">
        A fan project, not affiliated with FromSoftware or Bandai Namco. It never modifies the game,
        and uses none of its art.{" "}
        <a href="https://github.com/renanabade/darksouls-challenge">Source</a>
      </footer>
    </div>
  );
}
