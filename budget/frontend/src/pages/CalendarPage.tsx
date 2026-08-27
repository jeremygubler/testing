import { useMemo, useState } from "react";
import { CalendarPlus, Check, SkipForward, Trash2 } from "lucide-react";

import {
  useCalendarEntries,
  useConfirmOccurrences,
  useCreateCalendarEntry,
  useDeleteCalendarEntry,
  useMembers,
  useOccurrences,
  useTransactions,
} from "@/api/hooks";
import type { CalendarEntry, Occurrence, Transaction } from "@/api/types";
import { Money } from "@/components/Money";
import { useHouseholdContext } from "@/components/HouseholdProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMonth } from "@/hooks/useMonth";
import { t } from "@/i18n";
import { daysInMonth, monthRange, todayIso, toIso, weekdayIndex } from "@/lib/date";
import { monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const NO_MEMBER = "__none__";

export function CalendarPage() {
  const { month } = useMonth();
  const range = monthRange(month);
  const { date: formatDate } = useHouseholdContext();

  const { data: occurrences = [] } = useOccurrences(month.year, month.month);
  const { data: entries = [] } = useCalendarEntries(range.from, range.to);
  const { data: page } = useTransactions({ date_from: range.from, date_to: range.to, limit: 500 });
  const { data: members = [] } = useMembers();

  const [selected, setSelected] = useState<string | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);

  const byDay = useMemo(() => {
    const map = new Map<
      string,
      { occurrences: Occurrence[]; entries: CalendarEntry[]; transactions: Transaction[] }
    >();
    const bucket = (iso: string) => {
      let value = map.get(iso);
      if (!value) {
        value = { occurrences: [], entries: [], transactions: [] };
        map.set(iso, value);
      }
      return value;
    };
    for (const occurrence of occurrences) bucket(occurrence.due_date).occurrences.push(occurrence);
    for (const entry of entries) bucket(entry.date).entries.push(entry);
    for (const transaction of page?.items ?? []) bucket(transaction.date).transactions.push(transaction);
    return map;
  }, [occurrences, entries, page]);

  const total = daysInMonth(month);
  const leading = weekdayIndex(range.from);
  const cells: (string | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: total }, (_, index) => toIso(month.year, month.month, index + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const today = todayIso();
  const selectedDay = selected ? byDay.get(selected) : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-semibold">
          {t.nav.calendar} ·{" "}
          <span className="font-normal text-muted-foreground">{monthLabel(month.year, month.month)}</span>
        </h1>
        <Button size="sm" onClick={() => setEntryOpen(true)}>
          <CalendarPlus />
          Termin
        </Button>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="grid grid-cols-7 border-b bg-muted/40">
            {t.month.weekdays.map((day) => (
              <div key={day} className="px-2 py-1 text-[11px] font-medium uppercase text-muted-foreground">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((iso, index) => {
              if (!iso) return <div key={`empty-${index}`} className="min-h-20 border-b border-r bg-muted/20" />;
              const day = byDay.get(iso);
              const open = day?.occurrences.filter((entry) => entry.status === "OPEN") ?? [];
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelected(iso)}
                  aria-pressed={selected === iso}
                  className={cn(
                    "min-h-20 border-b border-r p-1.5 text-left align-top transition-colors",
                    "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    selected === iso && "bg-accent",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-5 items-center justify-center rounded-full text-xs tabular",
                      iso === today ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground",
                    )}
                  >
                    {Number(iso.slice(8))}
                  </span>
                  <span className="mt-1 flex flex-col gap-0.5">
                    {day?.entries.slice(0, 2).map((entry) => (
                      <span key={entry.id} className="truncate text-[11px] text-foreground">
                        {entry.title}
                      </span>
                    ))}
                    {open.length > 0 && (
                      <span className="truncate text-[11px] text-amber-700 dark:text-amber-400">
                        {open.length} erwartet
                      </span>
                    )}
                    {day && day.transactions.length > 0 && (
                      <span className="truncate text-[11px] text-muted-foreground tabular">
                        {day.transactions.length} gebucht
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{selected ? formatDate(selected) : "Tag wählen"}</CardTitle>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Klick auf einen Tag zeigt die Details.
              </p>
            ) : (
              <DayDetail day={selectedDay} members={members} />
            )}
          </CardContent>
        </Card>
      </div>

      <EntryDialog
        open={entryOpen}
        onOpenChange={setEntryOpen}
        defaultDate={selected ?? range.from}
        members={members}
      />
    </div>
  );
}

function DayDetail({
  day,
  members,
}: {
  day: { occurrences: Occurrence[]; entries: CalendarEntry[]; transactions: Transaction[] } | undefined;
  members: { id: number; name: string; color: string }[];
}) {
  const confirm = useConfirmOccurrences();
  const removeEntry = useDeleteCalendarEntry();
  const memberById = new Map(members.map((member) => [member.id, member]));

  if (!day || (day.occurrences.length === 0 && day.entries.length === 0 && day.transactions.length === 0)) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nichts an diesem Tag.</p>;
  }

  const open = day.occurrences.filter((entry) => entry.status === "OPEN");

  return (
    <div className="space-y-4">
      {day.entries.length > 0 && (
        <section className="space-y-1.5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Termine</h3>
          <ul className="space-y-1">
            {day.entries.map((entry) => (
              <li key={entry.id} className="group flex items-center gap-2 text-sm">
                {entry.member_id && (
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: memberById.get(entry.member_id)?.color }}
                  />
                )}
                <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`${t.app.delete}: ${entry.title}`}
                  className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={() => removeEntry.mutate(entry.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {open.length > 0 && (
        <section className="space-y-1.5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Erwartet</h3>
          <ul className="space-y-1">
            {open.map((entry) => (
              <li key={`${entry.rule_id}-${entry.due_date}`} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{entry.description}</span>
                <Money value={entry.amount_minor} bare colored={false} className="shrink-0" />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`${t.app.confirm}: ${entry.description}`}
                  title={t.app.confirm}
                  disabled={confirm.isPending}
                  onClick={() =>
                    confirm.mutate([{ rule_id: entry.rule_id, due_date: entry.due_date }])
                  }
                >
                  <Check />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {day.occurrences.some((entry) => entry.status === "SKIPPED") && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <SkipForward className="size-3.5" />
          {day.occurrences.filter((entry) => entry.status === "SKIPPED").length} übersprungen
        </p>
      )}

      {day.transactions.length > 0 && (
        <section className="space-y-1.5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gebucht</h3>
          <ul className="space-y-1">
            {day.transactions.map((transaction) => (
              <li key={transaction.id} className="flex items-baseline gap-2 text-sm">
                <span
                  aria-hidden
                  className="size-2 shrink-0 self-center rounded-full"
                  style={{ backgroundColor: transaction.category_color }}
                />
                <span className="min-w-0 flex-1 truncate">
                  {transaction.description || transaction.category_name}
                </span>
                <Money
                  value={
                    transaction.category_flow === "INCOME"
                      ? transaction.amount_minor
                      : -transaction.amount_minor
                  }
                  bare
                  className="shrink-0"
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function EntryDialog({
  open,
  onOpenChange,
  defaultDate,
  members,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: string;
  members: { id: number; name: string; is_active: boolean }[];
}) {
  const create = useCreateCalendarEntry();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [memberId, setMemberId] = useState<string>(NO_MEMBER);
  const [note, setNote] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setDate(defaultDate);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Neuer Termin</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!title.trim()) return;
            create.mutate(
              {
                title: title.trim(),
                date,
                member_id: memberId === NO_MEMBER ? null : Number(memberId),
                note: note.trim() || null,
              },
              {
                onSuccess: () => {
                  setTitle("");
                  setNote("");
                  onOpenChange(false);
                },
              },
            );
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="entry-title">Titel</Label>
            <Input id="entry-title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="entry-date">Datum</Label>
              <Input
                id="entry-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="tabular"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="entry-member">Person (optional)</Label>
              <Select value={memberId} onValueChange={setMemberId}>
                <SelectTrigger id="entry-member">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MEMBER}>— alle —</SelectItem>
                  {members
                    .filter((member) => member.is_active)
                    .map((member) => (
                      <SelectItem key={member.id} value={String(member.id)}>
                        {member.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="entry-note">Notiz (optional)</Label>
            <Input id="entry-note" value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t.app.cancel}
            </Button>
            <Button type="submit" disabled={!title.trim() || create.isPending}>
              {t.app.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
