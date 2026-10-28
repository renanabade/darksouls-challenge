import { encodeChallengeCode, type SetupOptions } from "@darksouls-challenge/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_FORM, formOf, fromQuery, toQuery } from "../src/permalink.js";

const options: SetupOptions = {
  classes: [{ name: "Knight", level: 9, stats: { str: 11, dex: 11, int: 9, fth: 11, att: 10 } }],
  gifts: [
    { row: 2400, label: "None" },
    { row: 2406, label: "Master Key" },
  ],
  difficulties: ["easy", "medium", "hard", "extreme"],
  lengths: ["short", "full", "epic"],
  curves: ["constant", "rising", "peaks", "rollercoaster"],
};
const versions = { generator: "8", data: "0.7.0" };
const code = (generator = "8", data = "0.7.0") =>
  encodeChallengeCode(
    options,
    { difficulty: "hard", length: "epic", startingClass: "Knight", giftRow: 2406 },
    42,
    { generator, data },
  );

describe("permalink", () => {
  it("links a challenge by its code, and reads the code's settings back", () => {
    const query = toQuery(code());
    expect(query).toBe(`c=${code()}`);
    const { link, notices } = fromQuery(`?${query}`, options, versions);
    expect(notices).toEqual([]);
    if (link?.kind !== "code") throw new Error("not a code link");
    expect(link.code.config.seed).toBe(code());
    expect(formOf(link.code)).toEqual({
      code: "",
      startingClass: "Knight",
      giftRow: "2406",
      difficulty: "hard",
      length: "epic",
    });
  });

  it("warns when the code's generator or data is not the site's", () => {
    const { notices } = fromQuery(`?c=${code("7", "0.6.0")}`, options, versions);
    expect(notices).toHaveLength(2);
    expect(notices[0]).toContain("generator 7");
    expect(notices[1]).toContain("data 06");
  });

  it("says so when the code does not read", () => {
    const { link, notices } = fromQuery("?c=8.07-NOTACODE", options, versions);
    expect(link).toBeUndefined();
    expect(notices).toEqual(['"8.07-NOTACODE" in this link is not a challenge code.']);
  });

  it("still reads a legacy seed link, with a notice for its older generator", () => {
    const { link, notices } = fromQuery(
      "?seed=ashen-one&class=Knight&gift=2406&difficulty=hard&length=epic&v=7",
      options,
      versions,
    );
    expect(link).toEqual({
      kind: "seed",
      seed: "ashen-one",
      form: {
        code: "",
        startingClass: "Knight",
        giftRow: "2406",
        difficulty: "hard",
        length: "epic",
      },
    });
    expect(notices).toEqual([
      "This link was made with generator 7. This site runs generator 8, so the same seed and settings now give a different challenge.",
    ]);
  });

  it("names every value it drops instead of falling back silently", () => {
    const { link, notices } = fromQuery(
      "?seed=x&class=Wizard&gift=1&difficulty=insane&length=long&v=8",
      options,
      versions,
    );
    expect(link).toEqual({ kind: "seed", seed: "x", form: DEFAULT_FORM });
    expect(notices).toEqual([
      'The link\'s class "Wizard" is not one of the options: it is drawn.',
      'The link\'s gift "1" is not one of the options: it is drawn.',
      'The link\'s difficulty "insane" is not one of the options: medium is used.',
      'The link\'s length "long" is not one of the options: full is used.',
    ]);
  });

  it("keeps the settings of a link without a seed, for a new challenge", () => {
    expect(fromQuery("?seed=&difficulty=hard", options, versions)).toEqual({
      link: { kind: "settings", form: { ...DEFAULT_FORM, difficulty: "hard" } },
      notices: [],
    });
    expect(fromQuery("", options, versions)).toEqual({ notices: [] });
    expect(fromQuery("?utm_source=x", options, versions)).toEqual({ notices: [] });
  });
});
