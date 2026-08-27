/**
 * Auflösen der Aufteilungsvorlagen im Frontend.
 *
 * Spiegelt `backend/app/services/splits.py`. Der Server bleibt die Instanz, die
 * validiert und speichert — diese Kopie existiert nur, damit die Vorschau im
 * Erfassungsformular ohne Netzwerk-Roundtrip sofort dasselbe Ergebnis zeigt.
 */

import type { Member, SplitLine, SplitTemplate } from "@/api/types";
import { allocate } from "./money";

export interface SplitResult {
  lines: SplitLine[];
  /** Was noch fehlt, damit die Summe stimmt (nur bei MANUAL relevant). */
  remainderMinor: number;
  valid: boolean;
  error?: string;
}

export function resolveSplit(
  template: SplitTemplate,
  totalMinor: number,
  activeMembers: Member[],
  options: { singleMemberId?: number | null; manual?: SplitLine[] } = {},
): SplitResult {
  const ordered = [...activeMembers].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

  if (totalMinor === 0) {
    return { lines: [], remainderMinor: 0, valid: false, error: "Der Betrag darf nicht 0 sein." };
  }

  if (template === "SINGLE") {
    const memberId = options.singleMemberId ?? ordered[0]?.id;
    if (!memberId) {
      return { lines: [], remainderMinor: totalMinor, valid: false, error: "Keine Person gewählt." };
    }
    return { lines: [{ member_id: memberId, amount_minor: totalMinor }], remainderMinor: 0, valid: true };
  }

  if (template === "EQUAL" || template === "KEY") {
    if (ordered.length === 0) {
      return { lines: [], remainderMinor: totalMinor, valid: false, error: "Keine aktiven Personen." };
    }
    const weights = template === "EQUAL" ? ordered.map(() => 1) : ordered.map((m) => m.share_weight);
    if (weights.reduce((a, b) => a + b, 0) <= 0) {
      return { lines: [], remainderMinor: totalMinor, valid: false, error: "Verteilschlüssel ist leer." };
    }
    const amounts = allocate(totalMinor, weights);
    const lines = ordered
      .map((member, index) => ({ member_id: member.id, amount_minor: amounts[index] }))
      .filter((line) => line.amount_minor !== 0);
    return { lines, remainderMinor: 0, valid: lines.length > 0 };
  }

  const manual = (options.manual ?? []).filter((line) => line.amount_minor !== 0);
  const sum = manual.reduce((total, line) => total + line.amount_minor, 0);
  const remainder = totalMinor - sum;
  const mixedSigns = manual.some((line) => line.amount_minor > 0) && manual.some((line) => line.amount_minor < 0);

  if (mixedSigns) {
    return {
      lines: manual,
      remainderMinor: remainder,
      valid: false,
      error: "Alle Anteile müssen dasselbe Vorzeichen haben.",
    };
  }
  return {
    lines: manual,
    remainderMinor: remainder,
    valid: remainder === 0 && manual.length > 0,
  };
}

/** Die Aufteilung einer bestehenden Buchung als Vorlage erkennen (für die Bearbeitung). */
export function detectTemplate(splits: SplitLine[], activeMembers: Member[]): SplitTemplate {
  if (splits.length === 1) return "SINGLE";
  const total = splits.reduce((sum, line) => sum + line.amount_minor, 0);
  for (const template of ["EQUAL", "KEY"] as const) {
    const candidate = resolveSplit(template, total, activeMembers);
    if (sameLines(candidate.lines, splits)) return template;
  }
  return "MANUAL";
}

function sameLines(a: SplitLine[], b: SplitLine[]): boolean {
  if (a.length !== b.length) return false;
  const map = new Map(b.map((line) => [line.member_id, line.amount_minor]));
  return a.every((line) => map.get(line.member_id) === line.amount_minor);
}
