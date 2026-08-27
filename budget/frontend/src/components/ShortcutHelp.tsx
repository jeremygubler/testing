import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SHORTCUTS: { keys: string[]; description: string }[] = [
  { keys: ["←", "→"], description: "Einen Monat zurück oder vor" },
  { keys: ["h"], description: "Zum aktuellen Monat" },
  { keys: ["n"], description: "Neue Buchung erfassen" },
  { keys: ["1", "…", "6"], description: "Bereich wechseln" },
  { keys: ["d"], description: "Hell / Dunkel umschalten" },
  { keys: ["?"], description: "Diese Übersicht" },
];

const FORM_SHORTCUTS: { keys: string[]; description: string }[] = [
  { keys: ["Enter"], description: "Im Betragsfeld: Kategoriesuche öffnen" },
  { keys: ["Enter"], description: "In der Kategoriesuche: übernehmen" },
  { keys: ["Enter"], description: "Im Formular: speichern, Formular bleibt offen" },
  { keys: ["Esc"], description: "Dialog oder Auswahl schliessen" },
];

export function ShortcutHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tastenkürzel</DialogTitle>
          <DialogDescription>Gelten überall ausserhalb von Eingabefeldern.</DialogDescription>
        </DialogHeader>

        <Section title="Navigation" items={SHORTCUTS} />
        <Section title="Erfassen" items={FORM_SHORTCUTS} />
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, items }: { title: string; items: { keys: string[]; description: string }[] }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li key={index} className="flex items-baseline gap-3 text-sm">
            <span className="flex shrink-0 gap-1">
              {item.keys.map((key) => (
                <kbd
                  key={key}
                  className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted-foreground"
                >
                  {key}
                </kbd>
              ))}
            </span>
            <span className="text-muted-foreground">{item.description}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
