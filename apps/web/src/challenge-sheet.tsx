import type { ChallengeView, RuleView } from "@darksouls-challenge/core";

/** The generated challenge, as the core describes it: settings, rules of the journey, chapters, notes. */
export function ChallengeSheet({ view }: { readonly view: ChallengeView }) {
  // The last three are the core's lowercase ids ("medium"), shown capitalized.
  const settings: [string, string, boolean?][] = [
    ["Class", view.startingClass],
    ["Starting gift", view.gift.length > 0 ? view.gift.join(", ") : "None"],
    ["Soul level cap", String(view.levelCap)],
    ["Difficulty", view.difficulty, true],
    ["Curve", view.curve, true],
    ["Length", view.length, true],
  ];
  return (
    <article className="sheet">
      <header className="panel sheet-head">
        <p className="eyebrow">Seed</p>
        <h2 className="seed">{view.seed}</h2>
        <dl className="settings">
          {settings.map(([term, value, cap]) => (
            <div key={term} className="setting">
              <dt>{term}</dt>
              <dd className={cap === true ? "cap" : undefined}>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="oath">
          Follow every order. Break one, and the challenge is over: there is no penalty, only the
          end.
        </p>
      </header>

      <section className="panel">
        <h3 className="panel-title">Rules of the journey</h3>
        <Rules rules={view.journey} />
      </section>

      {view.chapters.map((chapter) => (
        <section key={chapter.heading} className="panel chapter">
          <h3 className="panel-title">{chapter.heading}</h3>
          <p className="chapter-until">Until {chapter.until}</p>
          <dl className="chapter-facts">
            <div>
              <dt>Areas</dt>
              <dd>{chapter.areas.join(", ")}</dd>
            </div>
            {chapter.bosses.length > 0 && (
              <div>
                <dt>Bosses</dt>
                <dd>{chapter.bosses.join(", ")}</dd>
              </div>
            )}
            <div>
              <dt>Difficulty</dt>
              <dd>{chapter.difficulty}</dd>
            </div>
          </dl>
          <Rules rules={chapter.rules} />
        </section>
      ))}

      {view.definitions.length > 0 && (
        <section className="panel">
          <h3 className="panel-title">Definitions</h3>
          <dl className="notes">
            {view.definitions.map((d) => (
              <div key={d.term}>
                <dt>{d.term}</dt>
                <dd>{d.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {view.warnings.length > 0 && (
        <section className="panel">
          <h3 className="panel-title">Before you go</h3>
          <dl className="notes">
            {view.warnings.map((w) => (
              <div key={w.npc}>
                <dt>{w.npc}</dt>
                <dd>{w.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <p className="fine">
        Generator {view.generatorVersion} · data {view.dataVersion}. Same seed and settings, same
        challenge.
      </p>
    </article>
  );
}

function Rules({ rules }: { readonly rules: readonly RuleView[] }) {
  return (
    <ol className="rules">
      {rules.map((rule) => (
        <li key={rule.number} value={rule.number}>
          <span className="rule-title">{rule.title}.</span> {rule.text}
          {rule.advice !== undefined && <em className="rule-advice"> {rule.advice}</em>}
        </li>
      ))}
    </ol>
  );
}
