# web

Read-only Web-Viewer für geteilte Reisen. **Kein Build-Schritt, kein Framework, kein
CDN** – reines HTML, CSS und ein ES-Modul, ausgeliefert vom Backend unter derselben
Origin wie die API.

Das ist bewusst so: ein Bundler für eine Seite, die eine Route und eine Timeline
anzeigt, wäre Maschinerie ohne Gegenwert – und ein Viewer, der zum Rendern ein fremdes
CDN braucht, widerspricht dem Zweck einer self-hosted App.

```
index.html      Gerüst und Template
style.css       gleiche Palette wie die App, inkl. Dark Mode
app.js          holt /api/v1/shared/<token> und rendert Karte + Timeline
vendor/         MapLibre GL JS 6, mitgeliefert statt nachgeladen
```

## Aufrufen

Der Viewer liegt unter `/s/<token>`; das Backend liefert dafür `index.html` aus. Den
Token liest die Seite selbst aus der URL – er taucht damit nicht im serverseitig
gerenderten HTML und nicht in Server-Logs auf.

Gleiche Origin wie die API heisst: kein CORS, kein zweiter Hostname, kein zweites
Zertifikat. Auf einem Homelab sind das drei Dinge weniger, die schiefgehen können.

## Wenn der Tile-Server nicht erreichbar ist

Der Kartenstil wird vor dem Rendern geholt. Schlägt das fehl, fällt der Viewer auf einen
Stil ohne Netzwerkabhängigkeit zurück: die Karte bleibt leer, **Route und Stops sind
trotzdem sichtbar**. Bei einem selbst betriebenen Tileserver ist das kein exotischer
Fall.

## Hinweise

- MapLibre 6 liefert ESM mit benannten Exporten und ohne Default-Export. Ein
  `import maplibregl from ...` ergibt zur Laufzeit `undefined`, nicht etwa einen
  Build-Fehler – deshalb die benannten Imports in `app.js`.
- `referrer: no-referrer` im `<head>`: ein geteilter Link soll nicht im Referrer jeder
  Kachel-Anfrage landen.
