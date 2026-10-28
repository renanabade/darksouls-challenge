"use client";

import {
  CODE_DRAWS,
  decodeChallengeCode,
  encodeChallengeCode,
  type ChallengeView,
  type GeneratorConfig,
} from "@darksouls-challenge/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChallengeSheet } from "../challenge-sheet";
import {
  configOf,
  DEFAULT_FORM,
  formOf,
  fromQuery,
  settingsOf,
  toQuery,
  versionNotices,
  type FormState,
} from "../permalink";
import { SetupMenu } from "../setup-menu";
import { useCore, type Core } from "../use-core";

/** A random draw for a new challenge code. */
function drawCode(): number {
  const [value = 0] = crypto.getRandomValues(new Uint32Array(1));
  return value % CODE_DRAWS;
}

/** A new code for the form's settings, so every challenge asked without one can be shared. */
function newCode(core: Core, form: FormState): string {
  return encodeChallengeCode(core.options, settingsOf(form), drawCode(), {
    generator: core.generatorVersion,
    data: core.dataVersion,
  });
}

export default function Home() {
  const { core, generate } = useCore();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [view, setView] = useState<ChallengeView | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  // Why the challenge shown may not be the one that was shared: another version, a value dropped.
  const [notices, setNotices] = useState<readonly string[]>([]);
  const [copied, setCopied] = useState<"code" | "link" | undefined>(undefined);
  const sheet = useRef<HTMLDivElement>(null);
  const opened = useRef(false);

  /**
   * Generates a challenge under its address: "push" makes it a new entry of the history (back walks to the
   * last one), "replace" corrects the address in place, "keep" leaves it as it is.
   */
  const run = useCallback(
    async (config: GeneratorConfig, query: string, address: "push" | "replace" | "keep") => {
      setBusy(true);
      setError(undefined);
      try {
        const challenge = await generate(config);
        setView(challenge);
        if (address !== "keep" && window.location.search !== `?${query}`)
          window.history[address === "push" ? "pushState" : "replaceState"](null, "", `?${query}`);
        sheet.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [generate],
  );

  /** What the address asks for, when the page opens or the history is walked. */
  const openLink = useCallback(() => {
    if (core === undefined) return;
    const versions = { generator: core.generatorVersion, data: core.dataVersion };
    const { link, notices: found } = fromQuery(window.location.search, core.options, versions);
    setNotices(found);
    if (link === undefined) {
      setView(undefined);
      return;
    }
    switch (link.kind) {
      case "code":
        setForm(formOf(link.code));
        void run(link.code.config, toQuery(link.code.code), "keep");
        return;
      // A link from before the codes: its seed and settings, under the address it came with.
      case "seed":
        setForm(link.form);
        void run(configOf(link.form, link.seed), "", "keep");
        return;
      // Settings without a seed: a new challenge with them, under its own code.
      case "settings": {
        setForm(link.form);
        const code = newCode(core, link.form);
        void run(configOf(link.form, code), toQuery(code), "replace");
        return;
      }
    }
  }, [core, run]);

  // A link opens straight on its challenge.
  useEffect(() => {
    if (core === undefined || opened.current) return;
    opened.current = true;
    openLink();
  }, [core, openLink]);

  // Back and forward walk through the challenges.
  useEffect(() => {
    window.addEventListener("popstate", openLink);
    return () => {
      window.removeEventListener("popstate", openLink);
    };
  }, [openLink]);

  const onGenerate = () => {
    if (core === undefined) return;
    const typed = form.code.trim();
    // A typed code overrides the form: it brings its own settings.
    if (typed !== "") {
      const decoded = decodeChallengeCode(typed, core.options);
      if (decoded === undefined) {
        setNotices([
          `"${typed.slice(0, 40)}" is not a challenge code. Check it, or clear the field for a new challenge.`,
        ]);
        return;
      }
      setNotices(
        versionNotices(decoded, { generator: core.generatorVersion, data: core.dataVersion }),
      );
      setForm(formOf(decoded));
      void run(decoded.config, toQuery(decoded.code), "push");
      return;
    }
    setNotices([]);
    const code = newCode(core, form);
    setForm({ ...form, code: "" });
    void run(configOf(form, code), toQuery(code), "push");
  };

  const copy = (what: "code" | "link", text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(what);
      window.setTimeout(() => {
        setCopied(undefined);
      }, 2000);
    });
  };

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
            onGenerate={onGenerate}
            busy={busy}
          />
        )}

        {notices.map((notice) => (
          <p key={notice} className="notice" role="alert">
            {notice}
          </p>
        ))}
        {error !== undefined && (
          <p className="notice" role="alert">
            No challenge could be generated: {error}
          </p>
        )}

        {/* The copy buttons come after the sheet, so on a phone they stay pinned under it. */}
        <div ref={sheet} className="result">
          {view !== undefined && (
            <>
              <ChallengeSheet view={view} />
              <div className="actions">
                {view.code !== undefined && (
                  <button
                    type="button"
                    className="prompt"
                    onClick={() => {
                      copy("code", view.code ?? "");
                    }}
                  >
                    {copied === "code" ? "Code copied" : "Copy code"}
                  </button>
                )}
                <button
                  type="button"
                  className="prompt"
                  onClick={() => {
                    copy("link", window.location.href);
                  }}
                >
                  {copied === "link" ? "Link copied" : "Copy link"}
                </button>
              </div>
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
