"use client";

import type { Attribute, SetupOptions } from "@darksouls-challenge/core";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { FormState } from "./permalink";

type Row = "startingClass" | "giftRow" | "difficulty" | "length" | "seed";
const ROWS: readonly Row[] = ["startingClass", "giftRow", "difficulty", "length", "seed"];
const LABELS: Readonly<Record<Row, string>> = {
  startingClass: "Class",
  giftRow: "Gift",
  difficulty: "Difficulty",
  length: "Length",
  seed: "Seed",
};
const DRAWN = "Drawn by the seed";
/** Rows whose values are the core's lowercase ids ("medium"), shown capitalized. */
const SETTING_ROWS = new Set<Row>(["difficulty", "length"]);

const DIFFICULTY_NOTES: Readonly<Record<string, string>> = {
  easy: "Light rules and a generous level cap. For a first replay.",
  medium: "Rules that change how you play, without asking for perfection.",
  hard: "Heavy rules and a low level cap. For players who know the game well.",
  extreme: "The heaviest rules, a level cap near the class's own. Expect to fail.",
};
const LENGTH_NOTES: Readonly<Record<string, string>> = {
  short: "Four acts and a handful of rules.",
  full: "Nine chapters, each with its own rules.",
  epic: "Nine chapters with rules for every stretch of the run.",
};
const ATTRIBUTES: readonly [Attribute, string][] = [
  ["str", "Strength"],
  ["dex", "Dexterity"],
  ["int", "Intelligence"],
  ["fth", "Faith"],
  ["att", "Attunement"],
];

interface Props {
  readonly options: SetupOptions;
  readonly form: FormState;
  readonly onChange: (form: FormState) => void;
  readonly onGenerate: () => void;
  readonly busy: boolean;
}

/**
 * The settings as a menu in the spirit of the game's character creation: a list of rows on the left, each
 * cycled with its arrows (or the arrow keys), and what the focused row means on the right.
 */
export function SetupMenu({ options, form, onChange, onGenerate, busy }: Props) {
  const [focused, setFocused] = useState<Row>("startingClass");
  const rows = useRef<Partial<Record<Row, HTMLElement | null>>>({});

  const choices: Readonly<
    Record<Exclude<Row, "seed">, readonly { value: string; label: string }[]>
  > = {
    startingClass: [
      { value: "", label: DRAWN },
      ...options.classes.map((c) => ({ value: c.name, label: c.name })),
    ],
    giftRow: [
      { value: "", label: DRAWN },
      ...options.gifts.map((g) => ({ value: String(g.row), label: g.label })),
    ],
    difficulty: options.difficulties.map((d) => ({ value: d, label: d })),
    length: options.lengths.map((l) => ({ value: l, label: l })),
  };

  const cycle = (row: Exclude<Row, "seed">, step: number) => {
    const list = choices[row];
    const index = list.findIndex((c) => c.value === form[row]);
    const next = list[(index + step + list.length) % list.length];
    if (next !== undefined) onChange({ ...form, [row]: next.value });
  };

  const onKey = (row: Row) => (event: KeyboardEvent) => {
    const move = { ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (move !== undefined) {
      event.preventDefault();
      const target = ROWS[(ROWS.indexOf(row) + move + ROWS.length) % ROWS.length];
      if (target !== undefined) rows.current[target]?.focus();
      return;
    }
    if (row === "seed") return;
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (step !== undefined) {
      event.preventDefault();
      cycle(row, step);
    }
  };

  const labelOf = (row: Exclude<Row, "seed">) =>
    choices[row].find((c) => c.value === form[row])?.label ?? DRAWN;

  return (
    <form
      className="menu"
      onSubmit={(event) => {
        event.preventDefault();
        onGenerate();
      }}
    >
      <div className="panel menu-list">
        <h2 className="panel-title">Challenge</h2>
        <ul>
          {ROWS.map((row) => (
            <li key={row} className={`menu-row${focused === row ? " is-focused" : ""}`}>
              <span className="menu-label">{LABELS[row]}</span>
              {row === "seed" ? (
                <input
                  ref={(el) => {
                    rows.current.seed = el;
                  }}
                  className="menu-input"
                  value={form.seed}
                  maxLength={64}
                  placeholder="Random"
                  aria-label="Seed"
                  spellCheck={false}
                  onFocus={() => {
                    setFocused("seed");
                  }}
                  onKeyDown={onKey("seed")}
                  onChange={(event) => {
                    onChange({ ...form, seed: event.target.value });
                  }}
                />
              ) : (
                <span
                  ref={(el) => {
                    rows.current[row] = el;
                  }}
                  className="menu-value"
                  role="spinbutton"
                  tabIndex={0}
                  aria-label={LABELS[row]}
                  aria-valuetext={labelOf(row)}
                  onFocus={() => {
                    setFocused(row);
                  }}
                  onKeyDown={onKey(row)}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={`Previous ${LABELS[row]}`}
                    onClick={() => {
                      cycle(row, -1);
                    }}
                  >
                    ‹
                  </button>
                  <span className={`menu-choice${SETTING_ROWS.has(row) ? " cap" : ""}`}>
                    {labelOf(row)}
                  </span>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={`Next ${LABELS[row]}`}
                    onClick={() => {
                      cycle(row, 1);
                    }}
                  >
                    ›
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
        <button className="prompt" type="submit" disabled={busy}>
          {busy ? "Generating…" : "Generate"}
        </button>
      </div>
      <aside className="panel menu-help" aria-live="polite">
        <Help row={focused} options={options} form={form} />
      </aside>
    </form>
  );
}

function Help({
  row,
  options,
  form,
}: {
  readonly row: Row;
  readonly options: SetupOptions;
  readonly form: FormState;
}): ReactNode {
  switch (row) {
    case "startingClass": {
      const chosen = options.classes.find((c) => c.name === form.startingClass);
      if (chosen === undefined)
        return (
          <HelpText title={DRAWN}>
            The seed picks one of the {options.classes.length} classes.
          </HelpText>
        );
      return (
        <HelpText title={chosen.name}>
          <dl className="stats">
            <div className="stat">
              <dt>Level</dt>
              <dd>{chosen.level}</dd>
            </div>
            {ATTRIBUTES.map(([key, name]) => (
              <div key={key} className="stat">
                <dt>{name}</dt>
                <dd>{chosen.stats[key]}</dd>
              </div>
            ))}
          </dl>
        </HelpText>
      );
    }
    case "giftRow": {
      const chosen = options.gifts.find((g) => String(g.row) === form.giftRow);
      return (
        <HelpText title={chosen?.label ?? DRAWN}>
          {chosen === undefined
            ? "The seed picks the gift you start with."
            : "What you carry from the start."}
        </HelpText>
      );
    }
    case "difficulty":
      return (
        <HelpText title={form.difficulty} cap>
          {DIFFICULTY_NOTES[form.difficulty]}
        </HelpText>
      );
    case "length":
      return (
        <HelpText title={form.length} cap>
          {LENGTH_NOTES[form.length]}
        </HelpText>
      );
    case "seed":
      return (
        <HelpText title="Seed">
          Same seed and settings, same challenge. Leave it empty for a random one, then share the
          link.
        </HelpText>
      );
  }
}

function HelpText({
  title,
  cap,
  children,
}: {
  readonly title: string;
  readonly cap?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <>
      <h3 className={`help-title${cap === true ? " cap" : ""}`}>{title}</h3>
      <div className="help-body">{children}</div>
    </>
  );
}
