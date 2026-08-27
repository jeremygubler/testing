import { describe, expect, it } from "vitest";

import { allocate, parseAmountInput, share, toDecimalString } from "./money";

describe("allocate", () => {
  it("verteilt gleichmaessig und gibt den Rest an die erste Person", () => {
    expect(allocate(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(allocate(10, [1, 1, 1, 1, 1, 1])).toEqual([2, 2, 2, 2, 1, 1]);
  });

  it("verteilt nach Schluessel", () => {
    expect(allocate(10_000, [60, 40])).toEqual([6000, 4000]);
    expect(allocate(1000, [3, 1])).toEqual([750, 250]);
  });

  it("verliert unter keiner Gewichtung einen Rappen", () => {
    for (let total = -200; total <= 200; total++) {
      for (const weights of [[1, 1], [1, 1, 1], [60, 40], [3, 2, 1], [7, 5, 3, 1], [1, 1, 1, 1, 1, 1]]) {
        const parts = allocate(total, weights);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
        expect(parts).toHaveLength(weights.length);
      }
    }
  });

  it("behaelt das Vorzeichen bei Korrekturbuchungen", () => {
    expect(allocate(-1000, [1, 1, 1])).toEqual([-334, -333, -333]);
  });

  it("lehnt unbrauchbare Gewichtungen ab", () => {
    expect(() => allocate(100, [])).toThrow();
    expect(() => allocate(100, [0, 0])).toThrow();
    expect(() => allocate(100, [1, -1])).toThrow();
  });
});

describe("parseAmountInput", () => {
  it.each([
    ["12.50", 1250],
    ["12,50", 1250],
    ["1'234.50", 123_450],
    ["1 234,50", 123_450],
    ["1.234,50", 123_450],
    ["1,234.50", 123_450],
    ["42", 4200],
    ["42.-", 4200],
    ["-12.50", -1250],
    ["CHF 8", 800],
    ["0.005", 1],
    [".5", 50],
  ])("liest %s als %i", (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected);
  });

  it("rechnet einfache Ketten aus, wie man sie von einer Quittung abtippt", () => {
    expect(parseAmountInput("12.50+3")).toBe(1550);
    expect(parseAmountInput("20-4.25")).toBe(1575);
  });

  it("gibt null zurueck, wenn die Eingabe kein Betrag ist", () => {
    expect(parseAmountInput("")).toBeNull();
    expect(parseAmountInput("zwoelf")).toBeNull();
    expect(parseAmountInput("1.2.3")).toBeNull();
  });
});

describe("toDecimalString", () => {
  it("stellt Minoreinheiten verlustfrei dar", () => {
    expect(toDecimalString(123_456)).toBe("1234.56");
    expect(toDecimalString(-5)).toBe("-0.05");
    expect(toDecimalString(0)).toBe("0.00");
  });

  it("ist die Umkehrung von parseAmountInput", () => {
    for (const value of [-123_456, -1, 0, 1, 99, 100, 123_456]) {
      expect(parseAmountInput(toDecimalString(value))).toBe(value);
    }
  });
});

describe("share", () => {
  it("liefert null statt 0 %, wenn es nichts zu teilen gibt", () => {
    expect(share(500, 0)).toBeNull();
    expect(share(0, 1000)).toBe(0);
    expect(share(250, 1000)).toBe(25);
  });
});
