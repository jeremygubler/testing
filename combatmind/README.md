# COMBAT MIND — Website

Combat Fitness in Basel. Statische Seite mit kleinem Admin — kein Framework,
kein Build-Schritt, keine Datenbank. Läuft auf jedem Webhosting mit PHP 8.
Zielhosting: cyon (Apache, PHP 8, SSH) — dort greift auch die .htaccess.

## Hochladen

Den gesamten Ordnerinhalt ins Web-Root legen — bei cyon ist das
`/home/<benutzer>/public_html`. Danach:

1. `https://combat-mind.ch/admin/` aufrufen
2. Passwort festlegen (mind. 10 Zeichen) — das passiert genau einmal
3. Fertig. Unter «Texte», «Galerie» und «Termine» pflegst du ab jetzt alles selbst.

**Schreibrechte:** Die Ordner `data/` und `assets/gallery/` müssen für PHP
beschreibbar sein (meist 755, bei manchen Hostern 775). Wenn beim Speichern
«Speichern fehlgeschlagen» erscheint, liegt es daran.

**Voraussetzungen:** PHP 8.0+ mit den Erweiterungen `gd` (Bildverarbeitung),
`json`, `mbstring`, `fileinfo` und `session`. Alle sind bei den genannten
Hostern standardmässig aktiv.

## Aufbau

```
index.php          Startseite — baut sich aus data/content.json.php auf
404.php            Fehlerseite
sitemap.php        Sitemap, erreichbar als /sitemap.xml
.htaccess          HTTPS, Komprimierung, Caching, Sicherheits-Header
danke.php          Bestätigungsseite nach der Anmeldung (Tally-Redirect)
impressum.php      Impressum
agb.php            AGB / Teilnahmebedingungen
datenschutz.php    Datenschutzerklärung
admin/             Login, Texte, Galerie, Termine, Backup, Passwort ändern
inc/               core (Speicher/Auth/CSRF), schema, media, events, legal
data/              Inhalte als JSON. Nicht öffentlich abrufbar.
assets/            Hero-Bild, Coach-Foto, Logo
assets/fonts/      Schriften, lokal statt über Google Fonts
assets/gallery/    hochgeladene Galeriebilder, je in voller und kleiner Fassung
```

## Inhalte ändern

Alle Texte kommen aus `inc/schema.php`. Dort ist jedes Feld einmal beschrieben —
Label, Typ und Standardwert. Ein neues Feld dort eintragen genügt: Es erscheint
automatisch im Admin-Formular. Was noch nie gespeichert wurde, zeigt den
Standardwert aus dem Schema.

Galerie und Termine erscheinen auf der Startseite nur, wenn Inhalt da ist —
keine leeren Sektionen.

## Sicherheit

- Passwort nur als Hash (`password_hash`), Anmeldung nach 6 Fehlversuchen
  15 Minuten gesperrt
- Jedes Formular mit CSRF-Token
- Hochgeladene Bilder werden mit GD **neu gezeichnet** statt gespeichert.
  Eingebetteter Code überlebt das nicht. Der Dateiname wird selbst vergeben.
- Dateien in `data/` heissen `*.json.php` und beginnen mit `<?php exit; ?>`.
  Ruft sie jemand direkt auf, kommt nichts zurück — unabhängig davon, ob der
  Server `.htaccess` beachtet.

## Backup

Im Admin unter «Übersicht → Backup herunterladen» gibt es alle Inhalte als ZIP:
Texte, Termine, Galerie und Bilder. Das Admin-Passwort ist bewusst **nicht**
enthalten — ein Backup wandert per Mail und Cloud herum.

Zum Zurückspielen die Ordner `data/` und `assets/` aus dem ZIP per FTP ins
Web-Root hochladen und bestehende Dateien überschreiben.

## Passwort vergessen

`data/auth.json.php` per FTP löschen. Beim nächsten Aufruf von `/admin/` kannst
du ein neues Passwort setzen. Die Inhalte bleiben erhalten.

## Noch offen vor dem Livegang

- COMBAT-MIND-Logo einsetzen (Hauptlogo, horizontale Version, CM-Emblem)
- Social-Vorschaubild als `assets/og.jpg` ablegen (1200×630 px) — sonst wird
  ersatzweise das Hero-Bild verwendet, und ohne beides gar keines gesetzt
- Wartelisten-Formular anlegen und im Admin unter «12 Week Program» hinterlegen
- Geschäftsadresse, E-Mail-Adresse und Rechtsform in den Admin eintragen
- Tally-Formular neu aufsetzen und Link + Formular-ID im Admin hinterlegen
- Tally-Redirect nach dem Absenden auf `danke.php` setzen
- AGB und Datenschutzerklärung durch die bestehenden Dokumente ersetzen
- Echte Fotos von Jocelyn und aus dem Training hochladen
- Stripe / TWINT Business einrichten, IBAN erst nach Konto-Eröffnung ergänzen

## Plätze und Warteliste

Unter «Texte → 12 Week Program» stehen drei zusammengehörige Felder:

- **Noch freie Plätze** — leer lassen, dann erscheint keine Anzeige. Mit einer
  Zahl zeigt die Programmkarte «Noch X von 16 Plätzen frei» samt Balken.
- **Kurs ist ausgebucht** — dieses Häkchen schaltet die ganze Seite um: alle
  Anmelde-Buttons führen zur Warteliste, das Badge wechselt auf «Ausgebucht»,
  das Schlussbanner formuliert um.
- **Warteliste** — Link und Tally-ID des Wartelisten-Formulars.

## Serverkonfiguration

Die `.htaccess` erzwingt HTTPS, komprimiert, setzt Cache- und Sicherheits-Header
und leitet `/sitemap.xml` auf `sitemap.php`. Sie gilt nur auf Apache. Falls der
Hoster auf nginx läuft, müssen die Regeln dort hinterlegt werden — sonst fehlen
sie ersatzlos, die Seite funktioniert aber weiterhin.

HSTS ist bewusst nicht gesetzt: Ein falsch konfigurierter HSTS-Header sperrt die
Domain für Monate auf HTTPS fest. Sinnvoll erst, wenn das Zertifikat sicher steht.
