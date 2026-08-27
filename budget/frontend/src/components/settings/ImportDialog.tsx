import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Copy, FileUp, Loader2 } from "lucide-react";

import { useCategories, useCommitImport, usePreviewImport } from "@/api/hooks";
import type { ImportPreview, ImportRequest, SplitTemplate } from "@/api/types";
import { Money } from "@/components/Money";
import { useHouseholdContext } from "@/components/HouseholdProvider";
import { CategoryCombobox } from "@/components/transactions/CategoryCombobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t } from "@/i18n";
import { guessMapping, parseCsv, type ImportField, type ParsedCsv } from "@/lib/csv";

const FIELDS: { field: ImportField; label: string; required?: boolean }[] = [
  { field: "date", label: "Datum", required: true },
  { field: "amount", label: "Betrag", required: true },
  { field: "description", label: "Beschreibung" },
  { field: "category", label: "Kategorie" },
  { field: "member", label: "Person" },
  { field: "note", label: "Notiz" },
];

const NONE = "__none__";

/**
 * CSV-Import in drei Schritten: Datei wählen, Spalten zuordnen, Vorschau prüfen.
 * Geschrieben wird erst im letzten Schritt — und Dubletten sind standardmässig aus.
 */
export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: categories = [] } = useCategories();
  const { date: formatDate } = useHouseholdContext();
  const previewMutation = usePreviewImport();
  const commit = useCommitImport();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<ImportField, number>>>({});
  const [fallbackCategoryId, setFallbackCategoryId] = useState<number | null>(null);
  const [fallbackTemplate, setFallbackTemplate] = useState<SplitTemplate>("KEY");
  const [keepSign, setKeepSign] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFileName("");
    setParsed(null);
    setMapping({});
    setPreview(null);
    setResult(null);
    setError(null);
  }

  async function onFile(file: File) {
    reset();
    const text = await file.text();
    const result = parseCsv(text);
    setFileName(file.name);
    setParsed(result);
    setMapping(guessMapping(result.header));
  }

  const request: ImportRequest | null = useMemo(() => {
    if (!parsed || mapping.date === undefined || mapping.amount === undefined) return null;
    const cell = (row: string[], field: ImportField) => {
      const index = mapping[field];
      return index === undefined ? undefined : (row[index] ?? "").trim();
    };
    return {
      rows: parsed.rows.map((row, index) => ({
        row_number: index + 2, // +1 für die Kopfzeile, +1 weil Menschen ab 1 zählen
        date: cell(row, "date") ?? "",
        amount: cell(row, "amount") ?? "",
        description: cell(row, "description") ?? "",
        note: cell(row, "note") || null,
        category: cell(row, "category") || null,
        member: cell(row, "member") || null,
      })),
      fallback_category_id: fallbackCategoryId,
      fallback_split: { template: fallbackTemplate },
      keep_sign: keepSign,
    };
  }, [parsed, mapping, fallbackCategoryId, fallbackTemplate, keepSign]);

  async function runPreview() {
    if (!request) return;
    setError(null);
    try {
      setPreview(await previewMutation.mutateAsync(request));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.app.error);
    }
  }

  async function runImport() {
    if (!request) return;
    setError(null);
    try {
      setResult(await commit.mutateAsync({ input: request, skipDuplicates }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.app.error);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Buchungen importieren</DialogTitle>
          <DialogDescription>
            CSV auswählen, Spalten zuordnen, Vorschau prüfen. Erst dann wird geschrieben.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium">{result.created}</span> Buchungen übernommen,{" "}
              <span className="font-medium">{result.skipped}</span> übersprungen.
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>
                Weitere Datei
              </Button>
              <Button onClick={() => onOpenChange(false)}>Fertig</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onFile(file);
                }}
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <FileUp />
                CSV wählen
              </Button>
              {fileName && (
                <span className="text-sm text-muted-foreground">
                  {fileName} · {parsed?.rows.length ?? 0} Zeilen
                </span>
              )}
            </div>

            {parsed && (
              <>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {FIELDS.map(({ field, label, required }) => (
                    <div key={field} className="space-y-1">
                      <Label htmlFor={`map-${field}`}>
                        {label}
                        {required && <span className="text-destructive"> *</span>}
                      </Label>
                      <Select
                        value={mapping[field] === undefined ? NONE : String(mapping[field])}
                        onValueChange={(value) =>
                          setMapping((state) => ({
                            ...state,
                            [field]: value === NONE ? undefined : Number(value),
                          }))
                        }
                      >
                        <SelectTrigger id={`map-${field}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>— nicht zuordnen —</SelectItem>
                          {parsed.header.map((name, index) => (
                            <SelectItem key={`${name}-${index}`} value={String(index)}>
                              {name || `Spalte ${index + 1}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Kategorie für Zeilen ohne Zuordnung</Label>
                    <CategoryCombobox
                      categories={categories}
                      value={fallbackCategoryId}
                      onChange={setFallbackCategoryId}
                      className="w-full"
                      placeholder="keine — solche Zeilen bleiben stehen"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Aufteilung für Zeilen ohne Person</Label>
                    <Select value={fallbackTemplate} onValueChange={(value) => setFallbackTemplate(value as SplitTemplate)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["KEY", "EQUAL"] as SplitTemplate[]).map((template) => (
                          <SelectItem key={template} value={template}>
                            {t.splitTemplate[template]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={keepSign} onCheckedChange={setKeepSign} />
                    Vorzeichen aus der Datei behalten
                    <span className="text-xs text-muted-foreground">
                      (sonst zählt die Kategorie)
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={skipDuplicates} onCheckedChange={setSkipDuplicates} />
                    Dubletten überspringen
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <Button onClick={() => void runPreview()} disabled={!request || previewMutation.isPending}>
                    {previewMutation.isPending ? <Loader2 className="animate-spin" /> : null}
                    Vorschau
                  </Button>
                  {!request && (
                    <span className="text-xs text-muted-foreground">
                      Datum und Betrag müssen zugeordnet sein.
                    </span>
                  )}
                </div>
              </>
            )}

            {preview && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span>
                    <span className="font-medium tabular">{preview.importable}</span> importierbar
                  </span>
                  {preview.duplicates > 0 && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Copy className="size-3.5" />
                      {preview.duplicates} Dubletten
                    </span>
                  )}
                  {preview.errors > 0 && (
                    <span className="inline-flex items-center gap-1 text-destructive">
                      <AlertTriangle className="size-3.5" />
                      {preview.errors} mit Fehler
                    </span>
                  )}
                </div>

                <div className="max-h-64 overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead className="w-[7rem]">Datum</TableHead>
                        <TableHead>Beschreibung</TableHead>
                        <TableHead className="w-[9rem]">Kategorie</TableHead>
                        <TableHead className="w-[7rem] text-right">Betrag</TableHead>
                        <TableHead className="w-[8rem]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.rows.map((row) => (
                        <TableRow key={row.row_number}>
                          <TableCell className="tabular text-muted-foreground">{row.row_number}</TableCell>
                          <TableCell className="tabular">{row.date ? formatDate(row.date) : "–"}</TableCell>
                          <TableCell className="max-w-[1px] truncate">{row.description || "–"}</TableCell>
                          <TableCell className="truncate">{row.category_name ?? "–"}</TableCell>
                          <TableCell className="text-right">
                            {row.amount_minor === null ? "–" : <Money value={row.amount_minor} bare colored={false} />}
                          </TableCell>
                          <TableCell>
                            {row.error ? (
                              <span className="text-xs text-destructive" title={row.error}>
                                {row.error}
                              </span>
                            ) : row.is_duplicate ? (
                              <Badge variant="warning">Dublette</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">bereit</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {t.app.cancel}
              </Button>
              <Button
                onClick={() => void runImport()}
                disabled={!preview || preview.importable === 0 || commit.isPending}
              >
                {commit.isPending ? <Loader2 className="animate-spin" /> : null}
                Übernehmen
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
