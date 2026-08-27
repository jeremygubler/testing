/**
 * Minimaler CSV-Leser für den Import.
 *
 * Die Datei wird im Browser gelesen: der Nutzer sieht die Spaltenzuordnung und die
 * Vorschau, bevor irgendetwas zum Server geht. Der Parser beherrscht das, was
 * Bankauszüge und Tabellenkalkulationen tatsächlich produzieren — Anführungszeichen
 * mit verdoppelten Quotes, eingebettete Zeilenumbrüche, `;` oder `,` als Trennzeichen.
 */

export interface ParsedCsv {
  header: string[];
  rows: string[][];
  delimiter: string;
}

const CANDIDATES = [";", ",", "\t", "|"];

/** Rät das Trennzeichen anhand der ersten Zeilen — ausserhalb von Anführungszeichen. */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 5).join("\n");
  let best = CANDIDATES[0];
  let bestCount = 0;
  for (const candidate of CANDIDATES) {
    let count = 0;
    let inQuotes = false;
    for (let index = 0; index < sample.length; index++) {
      const char = sample[index];
      if (char === '"') inQuotes = !inQuotes;
      else if (!inQuotes && char === candidate) count++;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(input: string, delimiter?: string): ParsedCsv {
  const text = input.replace(/^﻿/, "");
  const sep = delimiter ?? detectDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let hasContent = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    if (hasContent) rows.push(row);
    row = [];
    hasContent = false;
  };

  for (let index = 0; index < text.length; index++) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      hasContent = true;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      hasContent = true;
    } else if (char === sep) {
      endField();
    } else if (char === "\n") {
      endRow();
    } else if (char === "\r") {
      // Zeilenende \r\n — das \n macht die Arbeit.
    } else {
      field += char;
      if (char.trim() !== "") hasContent = true;
    }
  }
  if (hasContent || row.length > 0) endRow();

  const [header = [], ...body] = rows;
  return { header: header.map((cell) => cell.trim()), rows: body, delimiter: sep };
}

/** Spaltennamen, die typischerweise auf ein bestimmtes Feld hindeuten. */
const HINTS: Record<string, string[]> = {
  date: ["datum", "date", "buchungsdatum", "valuta", "buchung", "tag"],
  amount: ["betrag", "amount", "wert", "summe", "belastung", "gutschrift", "chf", "eur"],
  description: ["beschreibung", "description", "text", "buchungstext", "verwendungszweck", "titel", "zweck"],
  note: ["notiz", "note", "bemerkung", "kommentar"],
  category: ["kategorie", "category", "konto", "rubrik"],
  member: ["person", "member", "wer", "name", "zahler", "zahlerin"],
};

export type ImportField = keyof typeof HINTS;

/**
 * Schlägt eine Spaltenzuordnung vor. Der Nutzer kann sie im Dialog überschreiben —
 * geraten wird nur, um die häufigsten Fälle abzukürzen.
 */
export function guessMapping(header: string[]): Partial<Record<ImportField, number>> {
  const mapping: Partial<Record<ImportField, number>> = {};
  const used = new Set<number>();

  for (const [field, hints] of Object.entries(HINTS) as [ImportField, string[]][]) {
    let match = header.findIndex(
      (name, index) => !used.has(index) && hints.includes(name.trim().toLowerCase()),
    );
    if (match === -1) {
      match = header.findIndex(
        (name, index) =>
          !used.has(index) && hints.some((hint) => name.trim().toLowerCase().includes(hint)),
      );
    }
    if (match !== -1) {
      mapping[field] = match;
      used.add(match);
    }
  }
  return mapping;
}
