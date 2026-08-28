import { useCallback, useRef, useState } from "react";
import { FileText, Loader2, Paperclip, Trash2, Upload } from "lucide-react";

import { useAttachments, useDeleteAttachment, useUploadAttachment } from "@/api/hooks";
import { attachmentThumbnailUrl, attachmentUrl, type Attachment } from "@/api/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/** Was der Server annimmt. Steht auch im `accept` des Dateidialogs. */
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf";

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Belege einer Buchung: Kassenzettel, Rechnungen, Quittungen.
 *
 * Drei Wege hinein, weil je nach Situation ein anderer der kürzeste ist: Datei
 * wählen, hineinziehen, oder einen Screenshot mit Strg+V einfügen.
 */
export function AttachmentDialog({
  txnId,
  label,
  open,
  onOpenChange,
}: {
  txnId: number;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Belege</DialogTitle>
          <DialogDescription>{label}</DialogDescription>
        </DialogHeader>
        {/* Erst rendern, wenn offen: sonst lädt der Dialog Belege für jede Zeile
            der Buchungsliste, obwohl niemand sie sehen will. */}
        {open && <AttachmentBody txnId={txnId} />}
      </DialogContent>
    </Dialog>
  );
}

function AttachmentBody({ txnId }: { txnId: number }) {
  const { data: attachments = [], isLoading } = useAttachments(txnId);
  const upload = useUploadAttachment(txnId);
  const remove = useDeleteAttachment(txnId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (files: FileList | File[] | null) => {
      const list = Array.from(files ?? []);
      if (list.length === 0) return;
      setError(null);
      // Nacheinander, nicht parallel: bei einem Fehler soll klar sein, welche
      // Datei ihn ausgelöst hat.
      for (const file of list) {
        try {
          await upload.mutateAsync(file);
        } catch (cause) {
          setError(
            `${file.name}: ${cause instanceof Error ? cause.message : t.app.error}`,
          );
          break;
        }
      }
    },
    [upload],
  );

  return (
    <div
      className="space-y-3"
      onPaste={(event) => {
        const files = Array.from(event.clipboardData.files);
        if (files.length > 0) {
          event.preventDefault();
          void send(files);
        }
      }}
    >
      {isLoading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-32" />
          ))}
        </div>
      ) : attachments.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {attachments.map((attachment) => (
            <AttachmentCard
              key={attachment.id}
              attachment={attachment}
              onDelete={() => {
                if (window.confirm(`„${attachment.filename}" wirklich löschen?`)) {
                  remove.mutate(attachment.id);
                }
              }}
            />
          ))}
        </div>
      ) : null}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void send(event.dataTransfer.files);
        }}
        className={cn(
          "rounded-lg border border-dashed p-5 text-center transition-colors",
          dragging ? "border-primary bg-accent" : "border-border",
        )}
      >
        <Paperclip className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-1.5 text-sm">
          Datei hierher ziehen, mit <kbd className="rounded border px-1 text-xs">Strg</kbd>+
          <kbd className="rounded border px-1 text-xs">V</kbd> einfügen oder
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          disabled={upload.isPending}
          onClick={() => fileRef.current?.click()}
        >
          {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
          Datei wählen
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          aria-label="Beleg hochladen"
          onChange={(event) => {
            void send(event.target.files);
            // Zurücksetzen, damit dieselbe Datei ein zweites Mal ausgelöst wird.
            event.target.value = "";
          }}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Bilder (JPEG, PNG, WebP, GIF) und PDF. Fotos werden beim Speichern verkleinert —
          ein Kassenzettel muss lesbar sein, nicht ausstellungsreif.
        </p>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function AttachmentCard({
  attachment,
  onDelete,
}: {
  attachment: Attachment;
  onDelete: () => void;
}) {
  const isPdf = attachment.content_type === "application/pdf";
  return (
    <figure className="group relative overflow-hidden rounded-md border bg-card">
      <a
        href={attachmentUrl(attachment.id)}
        target="_blank"
        rel="noreferrer"
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title={`${attachment.filename} öffnen`}
      >
        {isPdf || !attachment.has_thumbnail ? (
          <div className="flex h-28 items-center justify-center bg-muted">
            <FileText className="size-7 text-muted-foreground" />
          </div>
        ) : (
          <img
            src={attachmentThumbnailUrl(attachment.id)}
            alt={attachment.filename}
            loading="lazy"
            // contain statt cover: ein hochkant fotografierter Kassenzettel soll als
            // solcher erkennbar bleiben und nicht auf einen Ausschnitt zusammenschrumpfen.
            className="h-28 w-full bg-muted object-contain"
          />
        )}
      </a>
      <figcaption className="flex items-center gap-1 px-2 py-1.5">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs" title={attachment.filename}>
            {attachment.filename}
          </span>
          <span className="block text-xs text-muted-foreground tabular">
            {humanSize(attachment.size_bytes)}
          </span>
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`${attachment.filename} löschen`}
          onClick={onDelete}
          className="shrink-0 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
        >
          <Trash2 />
        </Button>
      </figcaption>
    </figure>
  );
}
