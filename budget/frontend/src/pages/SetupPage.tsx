import { useState } from "react";
import { Loader2, Plus, Trash2, Wallet } from "lucide-react";

import { useCreateHousehold } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { t } from "@/i18n";
import { parseAmountInput } from "@/lib/money";

const MAX_MEMBERS = 6;

/**
 * Erstinbetriebnahme. Erscheint genau dann, wenn die API noch keinen Haushalt kennt —
 * eine frische Installation soll nicht auf eine leere Übersicht schauen.
 */
export function SetupPage() {
  const create = useCreateHousehold();
  const [name, setName] = useState("Mein Haushalt");
  const [currency, setCurrency] = useState("CHF");
  const [locale, setLocale] = useState("de-CH");
  const [opening, setOpening] = useState("0.00");
  const [members, setMembers] = useState<string[]>(["", ""]);
  const [starter, setStarter] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cleanMembers = members.map((entry) => entry.trim()).filter(Boolean);
  const duplicate = new Set(cleanMembers).size !== cleanMembers.length;
  const canSubmit = Boolean(name.trim()) && cleanMembers.length > 0 && !duplicate && !create.isPending;

  async function submit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await create.mutateAsync({
        name: name.trim(),
        currency: currency.toUpperCase(),
        locale,
        opening_balance_minor: parseAmountInput(opening) ?? 0,
        member_names: cleanMembers,
        with_starter_categories: starter,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.app.error);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center px-4 py-10">
      <div className="mb-5 flex items-center gap-2.5">
        <Wallet className="size-5" />
        <div>
          <h1 className="text-base font-semibold">{t.app.title} einrichten</h1>
          <p className="text-sm text-muted-foreground">
            Einmalig — danach geht es direkt ans Erfassen.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Haushalt</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="setup-name">Name</Label>
              <Input id="setup-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="setup-currency">Währung</Label>
                <Input
                  id="setup-currency"
                  value={currency}
                  maxLength={3}
                  onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                  className="uppercase"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="setup-locale">Format</Label>
                <Select value={locale} onValueChange={setLocale}>
                  <SelectTrigger id="setup-locale">
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
              <div className="space-y-1">
                <Label htmlFor="setup-opening">Startsaldo</Label>
                <Input
                  id="setup-opening"
                  inputMode="decimal"
                  value={opening}
                  onChange={(event) => setOpening(event.target.value)}
                  className="text-right tabular"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Personen ({cleanMembers.length} von {MAX_MEMBERS})</Label>
              <div className="space-y-1.5">
                {members.map((member, index) => (
                  <div key={index} className="flex gap-1.5">
                    <Input
                      value={member}
                      placeholder={`Person ${index + 1}`}
                      aria-label={`Name Person ${index + 1}`}
                      onChange={(event) =>
                        setMembers((state) => state.map((entry, i) => (i === index ? event.target.value : entry)))
                      }
                    />
                    {members.length > 1 && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Person ${index + 1} entfernen`}
                        onClick={() => setMembers((state) => state.filter((_, i) => i !== index))}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {members.length < MAX_MEMBERS && (
                <Button type="button" size="sm" variant="outline" onClick={() => setMembers((state) => [...state, ""])}>
                  <Plus />
                  Person
                </Button>
              )}
              {duplicate && <p className="text-xs text-destructive">Die Namen müssen sich unterscheiden.</p>}
            </div>

            <label className="flex items-start gap-2.5 text-sm">
              <Switch checked={starter} onCheckedChange={setStarter} className="mt-0.5" />
              <span>
                Startkategorien anlegen
                <span className="block text-xs text-muted-foreground">
                  Ein kurzer Satz gängiger Kategorien. Ergänzen ist leichter als aufräumen.
                </span>
              </span>
            </label>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <Button type="submit" disabled={!canSubmit} className="w-full">
              {create.isPending && <Loader2 className="animate-spin" />}
              Loslegen
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
