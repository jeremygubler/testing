# FIGHTFIT — Website

Statische Seite mit kleinem Admin. Kein Framework, kein Build-Schritt, keine
Datenbank — läuft auf jedem Webhosting mit PHP 8 (Hostpoint, Infomaniak, cyon).

## Hochladen

Den gesamten Ordnerinhalt ins Web-Root des Hosters legen (`httpdocs`, `public_html`
oder `www` — je nach Anbieter). Danach:

1. `https://fightfit-bs.ch/admin/` aufrufen
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
agb.html           AGB (statisch, kein Admin nötig)
admin/             Login, Texte, Galerie, Termine, Passwort ändern
inc/               core (Speicher/Auth/CSRF), schema, media, events
data/              Inhalte als JSON. Nicht öffentlich abrufbar.
assets/            Logo, Coach-Foto
assets/gallery/    hochgeladene Galeriebilder
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

`data/` und `assets/gallery/` per FTP sichern. Das sind alle Inhalte.
Zum Zurückspielen einfach wieder hochladen.

## Passwort vergessen

`data/auth.json.php` per FTP löschen. Beim nächsten Aufruf von `/admin/` kannst
du ein neues Passwort setzen. Die Inhalte bleiben erhalten.
