import { useEffect, useState } from "react";
import { FileJson, FileUp, Plus, Table2, Undo2 } from "lucide-react";

import {
  useCreateMember,
  useDeactivateMember,
  useHousehold,
  useMembers,
  useUpdateHousehold,
  useUpdateMember,
} from "@/api/hooks";
import type { Member, SettlementBasis } from "@/api/types";
import { DangerZone } from "@/components/settings/DangerZone";
import { ImportDialog } from "@/components/settings/ImportDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t } from "@/i18n";
import { parseAmountInput, toDecimalString } from "@/lib/money";

const MEMBER_COLORS = [
  "#2563eb", "#c2410c", "#0f766e", "#7c3aed", "#b45309", "#be123c",
];

export function SettingsPage() {
  const { data: household } = useHousehold();
  const { data: members = [] } = useMembers();
  const updateHousehold = useUpdateHousehold();
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="space-y-3">
      <h1 className="text-base font-semibold">{t.nav.settings}</h1>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Haushalt</CardTitle>
          </CardHeader>
          <CardContent>
            {household && <HouseholdForm household={household} onSave={(patch) => updateHousehold.mutate(patch)} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daten</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Export</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href="/api/io/export/transactions.csv" download>
                    <Table2 />
                    Buchungen als CSV
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href="/api/io/export/household.json" download>
                    <FileJson />
                    Vollständiges Backup (JSON)
                  </a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Das JSON-Backup enthält Haushalt, Personen, Kategorien, Budgets, Buchungen samt
                Aufteilung, Regeln, Sparziele und Termine.
              </p>
            </div>

            <div className="space-y-1.5 border-t pt-3">
              <p className="text-sm font-medium">Import</p>
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <FileUp />
                CSV importieren
              </Button>
              <p className="text-xs text-muted-foreground">
                Mit Spaltenzuordnung, Vorschau und Dublettenerkennung über Datum, Betrag und
                Beschreibung.
              </p>
            </div>

            <div className="space-y-1.5 border-t pt-3">
              <p className="text-sm font-medium">Sicherung</p>
              <p className="text-xs text-muted-foreground">
                Die gesamte Anwendung liegt in einer SQLite-Datei. Ein Backup ist ein Kopieren
                dieser Datei — der JSON-Export darüber hinaus ist lesbar, versionierbar und
                lässt sich unten wieder zurückspielen.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personen</CardTitle>
        </CardHeader>
        <CardContent>
          <MemberList members={members} />
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Nicht umkehrbar</CardTitle>
        </CardHeader>
        <CardContent>
          <DangerZone />
        </CardContent>
      </Card>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

function HouseholdForm({
  household,
  onSave,
}: {
  household: { name: string; currency: string; locale: string; opening_balance_minor: number; settlement_basis: SettlementBasis };
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(household.name);
  const [currency, setCurrency] = useState(household.currency);
  const [locale, setLocale] = useState(household.locale);
  const [opening, setOpening] = useState(toDecimalString(household.opening_balance_minor));
  const [basis, setBasis] = useState<SettlementBasis>(household.settlement_basis);

  useEffect(() => {
    setName(household.name);
    setCurrency(household.currency);
    setLocale(household.locale);
    setOpening(toDecimalString(household.opening_balance_minor));
    setBasis(household.settlement_basis);
  }, [household]);

  const openingMinor = parseAmountInput(opening);
  const dirty =
    name !== household.name ||
    currency !== household.currency ||
    locale !== household.locale ||
    basis !== household.settlement_basis ||
    (openingMinor !== null && openingMinor !== household.opening_balance_minor);

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          name,
          currency: currency.toUpperCase(),
          locale,
          settlement_basis: basis,
          ...(openingMinor !== null ? { opening_balance_minor: openingMinor } : {}),
        });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="household-name">Name</Label>
        <Input id="household-name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="household-currency">Währung</Label>
          <Input
            id="household-currency"
            value={currency}
            maxLength={3}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            className="uppercase"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="household-locale">Sprache / Format</Label>
          <Select value={locale} onValueChange={setLocale}>
            <SelectTrigger id="household-locale">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["de-CH", "de-DE", "de-AT"].map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {entry}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="household-opening">Startsaldo</Label>
        <Input
          id="household-opening"
          inputMode="decimal"
          value={opening}
          onChange={(event) => setOpening(event.target.value)}
          className="text-right tabular"
        />
        <p className="text-xs text-muted-foreground">
          Kontostand vor der ersten erfassten Buchung. „Verfügbar" rechnet darauf auf.
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="household-basis">Ausgleich rechnet nach</Label>
        <Select value={basis} onValueChange={(value) => setBasis(value as SettlementBasis)}>
          <SelectTrigger id="household-basis">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="WEIGHT">Verteilschlüssel der Personen</SelectItem>
            <SelectItem value="INCOME">Einkommensanteil der Periode</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Bestimmt, welchen Anteil an den Ausgaben eine Person tragen sollte.
        </p>
      </div>

      <Button type="submit" disabled={!dirty}>
        {t.app.save}
      </Button>
    </form>
  );
}

function MemberList({ members }: { members: Member[] }) {
  const create = useCreateMember();
  const update = useUpdateMember();
  const deactivate = useDeactivateMember();
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const activeCount = members.filter((member) => member.is_active).length;
  const totalWeight = members
    .filter((member) => member.is_active)
    .reduce((sum, member) => sum + member.share_weight, 0);

  async function add() {
    if (!newName.trim()) return;
    setError(null);
    try {
      await create.mutateAsync({
        name: newName.trim(),
        color: MEMBER_COLORS[members.length % MEMBER_COLORS.length],
        sort_order: members.length,
        share_weight: 1,
      });
      setNewName("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.app.error);
    }
  }

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="w-[6rem]">Farbe</TableHead>
            <TableHead className="w-[7rem] text-right">Schlüssel</TableHead>
            <TableHead className="w-[6rem] text-right">Anteil</TableHead>
            <TableHead className="w-[7rem]">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.id}>
              <TableCell>
                <Input
                  defaultValue={member.name}
                  aria-label={`Name ${member.name}`}
                  className="h-8"
                  onBlur={(event) => {
                    const value = event.target.value.trim();
                    if (value && value !== member.name) update.mutate({ id: member.id, patch: { name: value } });
                  }}
                />
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {MEMBER_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Farbe ${color} für ${member.name}`}
                      aria-pressed={member.color === color}
                      onClick={() => update.mutate({ id: member.id, patch: { color } })}
                      className="size-4 rounded-full ring-offset-1 ring-offset-background aria-pressed:ring-2 aria-pressed:ring-foreground"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Input
                  type="number"
                  min={1}
                  defaultValue={member.share_weight}
                  aria-label={`Verteilschlüssel ${member.name}`}
                  className="h-8 text-right tabular"
                  onBlur={(event) => {
                    const value = Number(event.target.value);
                    if (value >= 1 && value !== member.share_weight) {
                      update.mutate({ id: member.id, patch: { share_weight: value } });
                    }
                  }}
                />
              </TableCell>
              <TableCell className="text-right tabular text-muted-foreground">
                {member.is_active && totalWeight > 0
                  ? `${Math.round((member.share_weight / totalWeight) * 100)} %`
                  : "–"}
              </TableCell>
              <TableCell>
                {member.is_active ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={activeCount <= 1}
                    onClick={() => deactivate.mutate(member.id)}
                  >
                    Deaktivieren
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => update.mutate({ id: member.id, patch: { is_active: true } })}
                  >
                    <Undo2 />
                    Aktivieren
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <p className="text-xs text-muted-foreground">
        Personen werden nie gelöscht, nur deaktiviert — sonst würden historische Buchungen ihre
        Zuordnung verlieren. Der Verteilschlüssel wirkt nur auf neue Buchungen; bereits
        gespeicherte Aufteilungen bleiben unverändert.
      </p>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <Input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="Neue Person"
          className="max-w-xs"
          aria-label="Name der neuen Person"
        />
        <Button type="submit" disabled={!newName.trim() || create.isPending}>
          <Plus />
          {t.app.add}
        </Button>
      </form>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
