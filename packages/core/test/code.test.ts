import { describe, expect, it } from "vitest";
import {
  CODE_DRAWS,
  dataToken,
  decodeChallengeCode,
  encodeChallengeCode,
  generate,
  isChallengeCode,
  parseWorld,
  renderManual,
  setupOptions,
  type GeneratorConfig,
} from "../src/index.js";
import { readDataSet } from "./ds1.js";

describe("challenge code", () => {
  const world = parseWorld(readDataSet());
  const options = setupOptions(world);
  const versions = { generator: "8", data: "0.7.0" };
  const encode = (settings: Omit<GeneratorConfig, "seed">, draw = 12345) =>
    encodeChallengeCode(options, settings, draw, versions);

  it("writes the versions before the dash and twelve characters after it", () => {
    const code = encode({ difficulty: "medium", length: "full" });
    expect(code).toMatch(/^8\.07-[0-9A-HJKMNP-TV-Z]{12}$/);
    expect(isChallengeCode(code)).toBe(true);
    expect(dataToken("0.7.0")).toBe("07");
    expect(dataToken("0.7.1")).toBe("071");
    expect(dataToken("1.10.0")).toBe("110");
  });

  it("reads back every combination of settings", () => {
    const drawn = <T>(list: readonly T[]) => [undefined, ...list];
    let count = 0;
    for (const startingClass of drawn(options.classes.map((c) => c.name)))
      for (const giftRow of drawn(options.gifts.map((g) => g.row)))
        for (const difficulty of options.difficulties)
          for (const length of options.lengths)
            for (const curve of drawn(options.curves))
              for (const levelCap of [undefined, 1, 30, 1023]) {
                const settings = {
                  difficulty,
                  length,
                  ...(curve !== undefined && { curve }),
                  ...(startingClass !== undefined && { startingClass }),
                  ...(giftRow !== undefined && { giftRow }),
                  ...(levelCap !== undefined && { levelCap }),
                };
                const draw = (count * 2_654_435_761) % CODE_DRAWS;
                const code = encode(settings, draw);
                expect(decodeChallengeCode(code, options)).toEqual({
                  code,
                  generatorVersion: "8",
                  dataToken: "07",
                  config: { seed: code, ...settings },
                });
                count++;
              }
    expect(count).toBeGreaterThan(10_000);
  });

  it("gives different codes for different draws, and for the same draw with other settings", () => {
    const settings = { difficulty: "hard", length: "short" } as const;
    expect(encode(settings, 0)).not.toBe(encode(settings, 1));
    expect(encode(settings, 7)).not.toBe(encode({ ...settings, length: "epic" }, 7));
    expect(encode(settings, CODE_DRAWS - 1)).toMatch(/^8\.07-/);
    expect(() => encode(settings, CODE_DRAWS)).toThrow(RangeError);
    expect(() => encode({ ...settings, startingClass: "Wizard" })).toThrow(RangeError);
    expect(() => encode({ ...settings, levelCap: 1024 })).toThrow(RangeError);
  });

  it("reads a code as typed: any case, spaces, O for 0 and I or L for 1", () => {
    const code = encode({ difficulty: "easy", length: "epic", startingClass: "Knight" }, 1);
    const decoded = decodeChallengeCode(code, options);
    const payload = code.slice(code.indexOf("-") + 1);
    const sloppy = `  ${code.slice(0, code.indexOf("-") + 1)}${payload.toLowerCase().replace(/0/g, "o").replace(/1/g, "l")} `;
    expect(decodeChallengeCode(sloppy, options)).toEqual(decoded);
  });

  it("refuses text that is not a code, and a code with one character mistyped", () => {
    const code = encode({ difficulty: "medium", length: "full" }, 99);
    for (const text of ["", "ashen-one", "8.07", "8.07-ABC", `${code}0`, "8-07-0000000000000"])
      expect(decodeChallengeCode(text, options), text).toBeUndefined();
    const head = code.slice(0, code.indexOf("-") + 1);
    const payload = code.slice(head.length);
    for (let i = 0; i < payload.length; i++) {
      const c = payload[i] === "Y" ? "X" : "Y";
      const typo = `${head}${payload.slice(0, i)}${c}${payload.slice(i + 1)}`;
      expect(decodeChallengeCode(typo, options), typo).toBeUndefined();
    }
  });

  it("is the seed of its challenge: same code, same manual", () => {
    const code = encode({ difficulty: "medium", length: "short", startingClass: "Pyromancer" }, 4);
    const decoded = decodeChallengeCode(code, options);
    if (decoded === undefined) throw new Error("no code");
    const manual = renderManual(world, generate(world, decoded.config));
    expect(manual).toBe(renderManual(world, generate(world, decoded.config)));
    expect(manual).toContain(`code ${code}`);
    expect(manual).toContain("Same code, same challenge.");
    expect(manual).toContain("**Class:** Pyromancer");
  }, 60_000);
});
