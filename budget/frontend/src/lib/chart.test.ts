import { describe, expect, it } from "vitest";

import { axisTick, CHART_SERIES, MAX_SLICES, toSlices } from "./chart";

const make = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `K${index + 1}`,
    value: (count - index) * 1000,
  }));

describe("toSlices", () => {
  it("lässt kleine Listen unverändert und färbt in fixer Reihenfolge", () => {
    const slices = toSlices(make(3));
    expect(slices.map((s) => s.name)).toEqual(["K1", "K2", "K3"]);
    expect(slices.map((s) => s.color)).toEqual(CHART_SERIES.slice(0, 3));
    expect(slices.every((s) => !s.isOther)).toBe(true);
  });

  it("faltet alles ab dem sechsten Eintrag zu „Übrige“", () => {
    const slices = toSlices(make(12));
    expect(slices).toHaveLength(MAX_SLICES);
    expect(slices.at(-1)?.isOther).toBe(true);
    expect(slices.at(-1)?.name).toBe("Übrige");
  });

  it("verliert dabei keinen Rappen", () => {
    const items = make(12);
    const total = items.reduce((sum, item) => sum + item.value, 0);
    expect(toSlices(items).reduce((sum, slice) => sum + slice.value, 0)).toBe(total);
  });

  it("sortiert absteigend", () => {
    const slices = toSlices([
      { id: 1, name: "klein", value: 10 },
      { id: 2, name: "gross", value: 900 },
      { id: 3, name: "mittel", value: 100 },
    ]);
    expect(slices.map((s) => s.name)).toEqual(["gross", "mittel", "klein"]);
  });

  it("lässt Nullwerte weg", () => {
    expect(toSlices([{ id: 1, name: "leer", value: 0 }])).toEqual([]);
  });
});

describe("axisTick", () => {
  it("kürzt grosse Beträge lesbar", () => {
    expect(axisTick(0)).toBe("0");
    expect(axisTick(45_000)).toBe("450");
    expect(axisTick(250_000)).toBe("2.5k");
    expect(axisTick(1_500_000)).toBe("15k");
  });
});
