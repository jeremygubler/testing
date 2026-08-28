import { describe, expect, it } from "vitest";

import { detectDelimiter, guessMapping, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("liest eine einfache Datei mit Semikolon", () => {
    const result = parseCsv("Datum;Betrag;Text\n2026-03-01;12.50;Kaffee\n");
    expect(result.delimiter).toBe(";");
    expect(result.header).toEqual(["Datum", "Betrag", "Text"]);
    expect(result.rows).toEqual([["2026-03-01", "12.50", "Kaffee"]]);
  });

  it("erkennt Komma als Trennzeichen", () => {
    const result = parseCsv("date,amount\n2026-03-01,12.50\n");
    expect(result.delimiter).toBe(",");
    expect(result.rows[0]).toEqual(["2026-03-01", "12.50"]);
  });

  it("lässt Trennzeichen innerhalb von Anführungszeichen in Ruhe", () => {
    const result = parseCsv('a;b\n"Migros; Filiale Bern";10.00\n');
    expect(result.rows[0]).toEqual(["Migros; Filiale Bern", "10.00"]);
  });

  it("versteht verdoppelte Anführungszeichen", () => {
    const result = parseCsv('a\n"Er sagte ""hallo"""\n');
    expect(result.rows[0]).toEqual(['Er sagte "hallo"']);
  });

  it("verträgt Zeilenumbrüche im Feld", () => {
    const result = parseCsv('a;b\n"Zeile 1\nZeile 2";x\n');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0][0]).toBe("Zeile 1\nZeile 2");
  });

  it("kommt mit CRLF und einem BOM zurecht", () => {
    const result = parseCsv("﻿a;b\r\n1;2\r\n");
    expect(result.header).toEqual(["a", "b"]);
    expect(result.rows).toEqual([["1", "2"]]);
  });

  it("überspringt leere Zeilen", () => {
    const result = parseCsv("a;b\n1;2\n\n\n3;4\n");
    expect(result.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("gibt bei leerer Eingabe nichts zurück", () => {
    expect(parseCsv("").rows).toEqual([]);
  });
});

describe("detectDelimiter", () => {
  it("nimmt das häufigste Zeichen ausserhalb von Anführungszeichen", () => {
    expect(detectDelimiter('a;b;c\n"x,y,z";2;3')).toBe(";");
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a\tb\n1\t2")).toBe("\t");
  });
});

describe("guessMapping", () => {
  it("erkennt deutsche Spaltennamen", () => {
    expect(guessMapping(["Datum", "Beschreibung", "Betrag", "Kategorie"])).toEqual({
      date: 0,
      description: 1,
      amount: 2,
      category: 3,
    });
  });

  it("erkennt englische Spaltennamen", () => {
    const mapping = guessMapping(["Date", "Description", "Amount"]);
    expect(mapping.date).toBe(0);
    expect(mapping.amount).toBe(2);
  });

  it("erkennt Bank-Spaltennamen über Teilstrings", () => {
    const mapping = guessMapping(["Buchungsdatum", "Buchungstext", "Belastung CHF"]);
    expect(mapping.date).toBe(0);
    expect(mapping.description).toBe(1);
    expect(mapping.amount).toBe(2);
  });

  it("ordnet eine Spalte nie zwei Feldern zu", () => {
    const mapping = guessMapping(["Datum", "Name"]);
    const indices = Object.values(mapping);
    expect(new Set(indices).size).toBe(indices.length);
  });

  it("lässt unbekannte Spalten weg", () => {
    expect(guessMapping(["foo", "bar"])).toEqual({});
  });
});
