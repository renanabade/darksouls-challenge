import type { ChallengeView, RuleView } from "@darksouls-challenge/core";
import type { ReactNode } from "react";

/**
 * The generated challenge, as the core describes it, laid out like a wiki infobox: the code as the item's
 * name over a table of its settings, then each chapter as a framed table and its rules as menu rows.
 */
export function ChallengeSheet({ view }: { readonly view: ChallengeView }) {
  // The last three are the core's lowercase ids ("medium"), shown capitalized.
  const settings: [string, string, boolean?][] = [
    ["Class", view.startingClass],
    ["Gift", view.gift.length > 0 ? view.gift.join(", ") : "None"],
    ["Level cap", String(view.levelCap)],
    ["Difficulty", view.difficulty, true],
    ["Length", view.length, true],
    ["Curve", view.curve, true],
  ];
  return (
    <article className="sheet">
      <header className="frame infobox">
        <p className="eyebrow">{view.code === undefined ? "Seed" : "Challenge code"}</p>
        <h2 className="code">{view.seed}</h2>
        <dl className="facts">
          {settings.map(([term, value, cap]) => (
            <Fact key={term} term={term} short>
              <span className={cap === true ? "cap" : undefined}>{value}</span>
            </Fact>
          ))}
        </dl>
        <p className="oath">
          Follow every order. Break one, and the challenge is over: there is no penalty, only the
          end.
        </p>
      </header>

      <section className="frame">
        <h3 className="frame-head">Rules of the journey</h3>
        <Rules rules={view.journey} />
      </section>

      {view.chapters.map((chapter) => (
        <section key={chapter.heading} className="frame chapter">
          <header className="frame-head">
            <h3>
              {chapter.heading}
              <span className="chapter-difficulty cap">{chapter.difficulty}</span>
            </h3>
            <p className="chapter-until">Until {chapter.until}</p>
          </header>
          <dl className="facts">
            <Fact term="Areas">
              <Names names={chapter.areas} />
            </Fact>
            {chapter.bosses.length > 0 && (
              <Fact term="Bosses">
                <Names names={chapter.bosses} />
              </Fact>
            )}
          </dl>
          <Rules rules={chapter.rules} />
        </section>
      ))}

      {view.definitions.length > 0 && (
        <section className="frame">
          <h3 className="frame-head">Definitions</h3>
          <dl className="facts notes">
            {view.definitions.map((d) => (
              <Fact key={d.term} term={d.term}>
                {d.text}
              </Fact>
            ))}
          </dl>
        </section>
      )}

      {view.warnings.length > 0 && (
        <section className="frame">
          <h3 className="frame-head">Before you go</h3>
          <dl className="facts notes">
            {view.warnings.map((w) => (
              <Fact key={w.npc} term={<span className="name">{w.npc}</span>}>
                {w.text}
              </Fact>
            ))}
          </dl>
        </section>
      )}

      <p className="fine">
        Generator {view.generatorVersion} · data {view.dataVersion}.{" "}
        {view.code === undefined
          ? "Same seed and settings, same challenge."
          : "Same code, same challenge."}
      </p>
    </article>
  );
}

/** One row of a framed table: a dim label and its value; a short value keeps beside its label on a phone. */
function Fact({
  term,
  short,
  children,
}: {
  readonly term: ReactNode;
  readonly short?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div className={short === true ? "fact fact-short" : "fact"}>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Areas or bosses, one per line (a chip each on a phone), so a name with a comma reads as one name. */
function Names({ names }: { readonly names: readonly string[] }) {
  return (
    <ul className="names">
      {names.map((name) => (
        <li key={name} className="name">
          {name}
        </li>
      ))}
    </ul>
  );
}

/** Rules as the game's menu rows: the title, the order, and the advice under it like flavor text. */
function Rules({ rules }: { readonly rules: readonly RuleView[] }) {
  return (
    <ul className="rules">
      {rules.map((rule) => (
        <li key={rule.number} className="rule">
          <p>
            <span className="rule-title">{rule.title}.</span> {rule.text}
          </p>
          {rule.advice !== undefined && <p className="rule-advice">{rule.advice}</p>}
        </li>
      ))}
    </ul>
  );
}
