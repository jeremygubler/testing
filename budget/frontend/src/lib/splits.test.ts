import { describe, expect, it } from "vitest";

import type { Member } from "@/api/types";
import { detectTemplate, resolveSplit } from "./splits";

const anna: Member = { id: 1, name: "Anna", color: "#000", is_active: true, sort_order: 0, share_weight: 60 };
const ben: Member = { id: 2, name: "Ben", color: "#111", is_active: true, sort_order: 1, share_weight: 40 };
const cara: Member = { id: 3, name: "Cara", color: "#222", is_active: true, sort_order: 2, share_weight: 1 };
const members = [anna, ben];

describe("resolveSplit", () => {
  it("legt bei SINGLE alles auf eine Person", () => {
    const result = resolveSplit("SINGLE", 12_345, members, { singleMemberId: ben.id });
    expect(result.lines).toEqual([{ member_id: 2, amount_minor: 12_345 }]);
    expect(result.valid).toBe(true);
  });

  it("teilt bei EQUAL gleichmässig, Rest an die erste Person", () => {
    const result = resolveSplit("EQUAL", 1000, [anna, ben, cara]);
    expect(result.lines.map((l) => l.amount_minor)).toEqual([334, 333, 333]);
  });

  it("nutzt bei KEY die Gewichte des Haushalts", () => {
    const result = resolveSplit("KEY", 10_000, members);
    expect(result.lines).toEqual([
      { member_id: 1, amount_minor: 6000 },
      { member_id: 2, amount_minor: 4000 },
    ]);
  });

  it("respektiert die Reihenfolge der Personen, nicht die Array-Reihenfolge", () => {
    const result = resolveSplit("EQUAL", 101, [ben, anna]);
    expect(result.lines[0].member_id).toBe(anna.id);
    expect(result.lines[0].amount_minor).toBe(51);
  });

  it("meldet bei MANUAL den offenen Rest", () => {
    const result = resolveSplit("MANUAL", 10_000, members, {
      manual: [{ member_id: 1, amount_minor: 6000 }],
    });
    expect(result.remainderMinor).toBe(4000);
    expect(result.valid).toBe(false);
  });

  it("akzeptiert MANUAL, sobald der Rest 0 ist", () => {
    const result = resolveSplit("MANUAL", 10_000, members, {
      manual: [
        { member_id: 1, amount_minor: 7500 },
        { member_id: 2, amount_minor: 2500 },
      ],
    });
    expect(result.remainderMinor).toBe(0);
    expect(result.valid).toBe(true);
  });

  it("lehnt gemischte Vorzeichen ab", () => {
    const result = resolveSplit("MANUAL", 4000, members, {
      manual: [
        { member_id: 1, amount_minor: 5000 },
        { member_id: 2, amount_minor: -1000 },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Vorzeichen/);
  });

  it("lehnt den Betrag 0 ab", () => {
    expect(resolveSplit("EQUAL", 0, members).valid).toBe(false);
  });

  it("verliert auch bei krummen Beträgen keinen Rappen", () => {
    for (let total = 1; total < 500; total++) {
      const sum = resolveSplit("KEY", total, [anna, ben, cara]).lines.reduce(
        (acc, line) => acc + line.amount_minor,
        0,
      );
      expect(sum).toBe(total);
    }
  });
});

describe("detectTemplate", () => {
  it("erkennt eine Ein-Personen-Buchung", () => {
    expect(detectTemplate([{ member_id: 1, amount_minor: 500 }], members)).toBe("SINGLE");
  });

  it("erkennt die Schlüssel-Aufteilung", () => {
    expect(
      detectTemplate(
        [
          { member_id: 1, amount_minor: 6000 },
          { member_id: 2, amount_minor: 4000 },
        ],
        members,
      ),
    ).toBe("KEY");
  });

  it("erkennt eine gleichmässige Aufteilung", () => {
    expect(
      detectTemplate(
        [
          { member_id: 1, amount_minor: 500 },
          { member_id: 2, amount_minor: 500 },
        ],
        members,
      ),
    ).toBe("EQUAL");
  });

  it("fällt sonst auf MANUAL zurück", () => {
    expect(
      detectTemplate(
        [
          { member_id: 1, amount_minor: 300 },
          { member_id: 2, amount_minor: 700 },
        ],
        members,
      ),
    ).toBe("MANUAL");
  });
});
