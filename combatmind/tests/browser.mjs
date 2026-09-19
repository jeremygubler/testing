/**
 * Ende-zu-Ende-Tests. Aufruf: node tests/browser.mjs
 *
 * Kopiert die Seite in ein temporäres Verzeichnis und startet dort einen
 * eigenen PHP-Server — echte Inhalte werden dabei nie angefasst.
 */
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8100 + Math.floor(Math.random() * 800);
const B = `http://127.0.0.1:${PORT}`;
const PW = 'test-passwort-combat-mind';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`); }
};
const group = (t) => console.log(`\n${t}`);

// ── Arbeitskopie aufsetzen ────────────────────────────────────────────────
const work = mkdtempSync(join(tmpdir(), 'cm-e2e-'));
cpSync(ROOT, work, { recursive: true, filter: (s) => !s.includes('/.git') });
for (const dir of ['data', 'assets/gallery']) {
  for (const f of readdirSync(join(work, dir))) {
    if (f !== '.htaccess') rmSync(join(work, dir, f), { force: true });
  }
}
execSync(`php ${join(work, 'tests/fixtures.php')} ${work}`);

const php = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', work], { cwd: work, stdio: 'ignore' });
const stop = () => { php.kill(); rmSync(work, { recursive: true, force: true }); };
process.on('exit', stop);
await new Promise((r) => setTimeout(r, 1500));

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const ctx = await browser.newContext();
await ctx.route('**/tally.so/**', (r) => r.abort());   // nie an Dritte funken
const page = await ctx.newPage();

const body = async (path) => (await ctx.request.get(B + path)).text();
const status = async (path) => (await ctx.request.get(B + path, { maxRedirects: 0 })).status();

try {
  // ── Öffentliche Seiten ──────────────────────────────────────────────────
  group('Öffentliche Seiten');
  for (const [p, code] of [['/index.php', 200], ['/agb.php', 200], ['/impressum.php', 200],
                           ['/datenschutz.php', 200], ['/danke.php', 200], ['/sitemap.php', 200],
                           ['/robots.txt', 200], ['/404.php', 404]]) {
    const s = await status(p);
    ok(`${p} liefert ${code}`, s === code, `erhalten ${s}`);
  }
  const home = await body('/index.php');
  ok('keine PHP-Meldungen im Seitentext', !/Warning:|Fatal error|Notice:|Deprecated:/.test(home));
  ok('genau eine H1', (home.match(/<h1[ >]/g) || []).length === 1);
  ok('keine Reste der alten Marke', !/fightfit/i.test(home));

  group('Schutz der Ablage');
  writeFileSync(join(work, 'data/content.json.php'), '<?php exit; ?>\n{"geheim":"wert"}\n');
  ok('Datendatei gibt nichts preis', !(await body('/data/content.json.php')).includes('geheim'));
  rmSync(join(work, 'data/content.json.php'));
  for (const p of ['/admin/texte.php', '/admin/galerie.php', '/admin/termine.php', '/admin/backup.php']) {
    ok(`${p} ohne Login abgewiesen`, (await status(p)) === 302);
  }

  // ── Admin ───────────────────────────────────────────────────────────────
  group('Admin einrichten');
  await page.goto(B + '/admin/index.php');
  ok('fordert zur Ersteinrichtung auf', await page.locator('input[name=pw2]').count() === 1);
  await page.fill('input[name=pw]', PW);
  await page.fill('input[name=pw2]', PW);
  await page.click('button[type=submit]');
  await page.waitForLoadState('networkidle');
  ok('nach der Einrichtung angemeldet', await page.locator('h1:has-text("Übersicht")').isVisible());

  group('Texte bearbeiten');
  await page.goto(B + '/admin/texte.php');
  ok('alle Felder vorhanden', (await page.locator('form [name^="c["]').count()) > 100);
  await page.fill('input[name="c[contact][form_url]"]', 'https://tally.so/r/TESTID');
  await page.fill('input[name="c[contact][form_id]"]', 'TESTID');
  await page.fill('input[name="c[program][seats_left]"]', '6');
  await page.fill('input[name="c[faqs][0][q]"]', 'Eine Testfrage?');
  await page.click('button[type=submit]');
  await page.waitForLoadState('networkidle');
  ok('Speichern bestätigt', await page.locator('.flash.ok').isVisible());

  let h = await body('/index.php');
  ok('Buttons zeigen aufs eigene Formular', h.includes('href="anmeldung.php"'));
  ok('Platzanzeige erscheint', h.includes('Noch 6 von 16 Plätzen frei'));
  ok('geänderte FAQ sichtbar', h.includes('Eine Testfrage?'));
  ok('unberührte Standardtexte stehen noch', h.includes('>299<') && h.includes('Jocelyn'));

  group('Rechtsseiten');
  let imp = await body('/impressum.php');
  ok('Rechtsform steht im Impressum', imp.includes('Einzelunternehmen'));
  ok('ohne UID keine halbe Zeile', !imp.includes('UID/MWST'));
  const recht = imp + (await body('/agb.php')) + (await body('/datenschutz.php'));
  ok('keine offenen Platzhalter mehr', !recht.includes('class="todo"'));
  ok('Stornofristen stehen in den AGB', recht.includes('Mehr als 14 Tage vor Kursstart'));
  ok('Telefon auf den Rechtsseiten', recht.includes('tel:+41765277493'));
  await page.goto(B + '/admin/texte.php');
  await page.fill('input[name="c[legal][uid]"]', 'CHE-123.456.789');
  await page.click('button[type=submit]');
  await page.waitForLoadState('networkidle');
  ok('eingetragene UID erscheint', (await body('/impressum.php')).includes('CHE-123.456.789'));

  group('Anmeldung');
  await ctx.request.post(B + '/admin/index.php');   // Sitzung wachhalten
  let a = await body('/anmeldung.php');
  ok('Anmeldeseite erreichbar', a.includes('Anmeldung absenden'));
  ok('Buttons führen aufs eigene Formular', (await body('/index.php')).includes('href="anmeldung.php"'));
  ok('ohne Tally kein fremdes Skript', !(await body('/index.php')).includes('tally.so/widgets'));

  const p3 = await ctx.newPage();
  const füllen = async (werte) => {
    await p3.goto(B + '/anmeldung.php');
    await p3.evaluate(() => { document.querySelector('input[name=ts]').value = String(Math.floor(Date.now()/1000) - 30); });
    for (const [k, v] of Object.entries(werte)) {
      if (k === 'gesundheit') await p3.check(`input[name=gesundheit][value="${v}"]`);
      else if (k === 'agb' || k === 'fotos') { if (v) await p3.check(`input[name=${k}]`); }
      else await p3.fill(`input[name=${k}], textarea[name=${k}]`, v);
    }
    await p3.click('button[type=submit]');
    await p3.waitForLoadState('networkidle');
  };
  const jahrVor = (n) => {
    const d = new Date(); d.setFullYear(d.getFullYear() - n);
    return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
  };

  // Bedingtes Feld: erscheint bei 17, verschwindet bei 30.
  await p3.goto(B + '/anmeldung.php');
  await p3.fill('input[name=geburtsdatum]', jahrVor(17));
  ok('Einwilligungsfeld erscheint bei 17', await p3.locator('#gv').isVisible());
  await p3.fill('input[name=geburtsdatum]', jahrVor(30));
  ok('und verschwindet bei 30', !(await p3.locator('#gv').isVisible()));
  // Die Häkchen-Grösse aus der Gruppe hatte einmal auch die Textfelder getroffen.
  await p3.fill('input[name=geburtsdatum]', jahrVor(17));
  const breit = async (sel) => (await p3.locator(sel).boundingBox()).width;
  const voll = await breit('input[name=vorname]');
  ok('Name der Einwilligung so breit wie andere Felder', await breit('input[name=gv_name]') > voll * 0.9,
     `${await breit('input[name=gv_name]')}px statt ~${voll}px`);
  ok('E-Mail der Einwilligung ebenso', await breit('input[name=gv_email]') > voll * 0.9);
  ok('Häkchen bleiben klein', await breit('input[name=agb]') < 30);
  await p3.fill('input[name=geburtsdatum]', jahrVor(30));

  // Das zurückgespiegelte Alter macht ein vertauschtes Datum sichtbar.
  // Ziffern tippen, die Punkte muss das Feld selbst setzen.
  await p3.fill('input[name=geburtsdatum]', '');
  await p3.type('input[name=geburtsdatum]', '10031988');
  ok('Punkte entstehen beim Tippen', await p3.inputValue('input[name=geburtsdatum]') === '10.03.1988',
     await p3.inputValue('input[name=geburtsdatum]'));
  const echo = await p3.textContent('#alter-echo');
  ok('Alter wird zurückgespiegelt', /ergibt \d+ Jahre/.test(echo), echo);
  ok('Tag zuerst gelesen, nicht der Monat', echo.includes('10. März 1988'), echo);

  ok('Gesundheitsfeld zunächst verborgen', !(await p3.locator('#ges').isVisible()));
  await p3.check('input[name=gesundheit][value=ja]');
  ok('erscheint bei «ja»', await p3.locator('#ges').isVisible());

  await füllen({ vorname: 'Anna', name: 'Muster', email: 'anna@example.ch',
                 telefon: '076 527 74 93', geburtsdatum: jahrVor(30), gesundheit: 'nein', agb: true });
  ok('Anmeldung landet auf der Dankesseite', p3.url().endsWith('/danke.php'));
  ok('Platz wurde abgezogen', (await body('/index.php')).includes('Noch 5 von 16 Plätzen frei'));

  await füllen({ vorname: 'Tim', name: 'Jung', email: 'tim@example.ch',
                 telefon: '076 527 74 93', geburtsdatum: jahrVor(17), gesundheit: 'nein', agb: true });
  ok('minderjährig ohne Einwilligung abgewiesen', p3.url().includes('anmeldung.php'));
  ok('Grund wird genannt', (await p3.textContent('body')).includes('erziehungsberechtigten Person fehlt'));

  await page.goto(B + '/admin/anmeldungen.php');
  ok('Anmeldung steht im Admin', (await page.textContent('body')).includes('Anna Muster'));
  ok('Geburtsdatum steht im Admin', /Geboren/.test(await page.textContent('body')));
  ok('abgewiesene steht nicht drin', !(await page.textContent('body')).includes('Tim Jung'));
  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.goto(B + '/admin/anmeldungen.php?csv=1').catch(() => {}),
  ]);
  const inhalt = execSync(`cat "${await csv.path()}"`).toString();
  ok('CSV enthält die Anmeldung', inhalt.includes('anna@example.ch'));

  const [zip2] = await Promise.all([
    page.waitForEvent('download'),
    page.goto(B + '/admin/backup.php?download=1').catch(() => {}),
  ]);
  const inh = execSync(`unzip -Z1 "${await zip2.path()}"`).toString();
  ok('Backup enthält keine Personendaten', !inh.includes('signups'));
  await p3.close();

  group('Platzzähler');
  // Auf einen bekannten Stand setzen — vorherige Gruppen haben Plätze verbraucht.
  await page.goto(B + '/admin/texte.php');
  await page.fill('input[name="c[program][seats_left]"]', '6');
  await page.click('button[type=submit]');
  await page.waitForLoadState('networkidle');
  await page.goto(B + '/admin/index.php');
  ok('Zählerstand auf der Übersicht', /6\s*<\/strong>/.test(await page.innerHTML('body')));
  await page.click('button[name=seats][value=minus]');
  await page.waitForLoadState('networkidle');
  ok('ein Platz weniger', (await body('/index.php')).includes('Noch 5 von 16 Plätzen frei'));
  await page.click('button[name=seats][value=plus]');
  await page.waitForLoadState('networkidle');
  ok('Rückgängig stellt wieder her', (await body('/index.php')).includes('Noch 6 von 16 Plätzen frei'));

  // Bis auf null klicken: die Website muss von selbst auf ausgebucht gehen.
  // Abbruch über den gesperrten Knopf statt über eine feste Zahl.
  for (let i = 0; i < 25; i++) {
    if (await page.locator('button[name=seats][value=minus][disabled]').count()) break;
    await page.click('button[name=seats][value=minus]');
    await page.waitForLoadState('networkidle');
  }
  let hs = (await body('/index.php')).split('</style>')[1];
  ok('bei null automatisch ausgebucht', hs.includes('badge--out'));
  ok('Knopf bei null gesperrt', await page.locator('button[name=seats][value=minus][disabled]').count() === 1);
  await page.click('button[name=seats][value=plus]');
  await page.waitForLoadState('networkidle');
  hs = (await body('/index.php')).split('</style>')[1];
  ok('ein Platz zurück hebt ausgebucht auf', !hs.includes('badge--out'));
  ok('andere Texte unberührt', (await body('/index.php')).includes('Eine Testfrage?'));

  group('Ausgebucht-Schalter');
  await page.goto(B + '/admin/texte.php');
  await page.check('input[type=checkbox][name="c[program][sold_out]"]');
  await page.fill('input[name="c[program][waitlist_url]"]', 'https://tally.so/r/WARTE');
  await page.fill('input[name="c[program][waitlist_id]"]', 'WARTE');
  await page.click('button[type=submit]');
  await page.waitForLoadState('networkidle');
  h = (await body('/index.php')).split('</style>')[1];
  ok('alle Buttons führen zur Warteliste', h.includes('data-tally-open="WARTE"') && !h.includes('TESTID'));
  ok('Badge wechselt auf Ausgebucht', h.includes('badge--out'));
  await page.goto(B + '/admin/texte.php');
  await page.uncheck('input[type=checkbox][name="c[program][sold_out]"]');
  await page.click('button[type=submit]');
  await page.waitForLoadState('networkidle');
  h = (await body('/index.php')).split('</style>')[1];
  ok('Zurückschalten stellt alles wieder her',
     h.includes('href="anmeldung.php"') && !h.includes('badge--out'));

  group('Tally als Alternative');
  await page.goto(B + '/admin/texte.php');
  await page.uncheck('input[type=checkbox][name="c[signup][own]"]');
  await page.click('button[type=submit]');
  await page.waitForLoadState('networkidle');
  h = await body('/index.php');
  ok('Overlay ist scharf', h.includes('data-tally-open="TESTID"'));
  ok('Tally-Skript wird geladen', h.includes('tally.so/widgets'));
  ok('eigenes Formular nicht verlinkt', !h.includes('href="anmeldung.php"'));
  await page.goto(B + '/admin/texte.php');
  await page.check('input[type=checkbox][name="c[signup][own]"]');
  await page.click('button[type=submit]');
  await page.waitForLoadState('networkidle');
  ok('Umschalten zurück wirkt', (await body('/index.php')).includes('href="anmeldung.php"'));

  group('Galerie');
  await page.goto(B + '/admin/galerie.php');
  await page.setInputFiles('input[name="photos[]"]', [join(work, 'tests/tmp/foto1.jpg'), join(work, 'tests/tmp/foto2.jpg')]);
  await page.click('button[type=submit]');
  await page.waitForLoadState('networkidle');
  ok('zwei Bilder hochgeladen', (await page.locator('.shots figure').count()) === 2);
  const files = readdirSync(join(work, 'assets/gallery')).filter((f) => f.endsWith('.jpg'));
  ok('kleine Fassung mit erzeugt', files.filter((f) => f.endsWith('-s.jpg')).length === 2, files.join(', '));
  h = await body('/index.php');
  ok('Galerie erscheint mit srcset', h.includes('id="galerie"') && h.includes('srcset="assets/gallery/'));

  await page.setInputFiles('input[name="photos[]"]', [join(work, 'tests/tmp/getarnt.jpg')]);
  await page.click('button[type=submit]');
  await page.waitForLoadState('networkidle');
  ok('als Bild getarnte PHP-Datei abgelehnt', (await page.locator('.shots figure').count()) === 2);

  await page.setInputFiles('input[name="photos[]"]', [join(work, 'tests/tmp/polyglott.jpg')]);
  await page.click('button[type=submit]');
  await page.waitForLoadState('networkidle');
  const infected = readdirSync(join(work, 'assets/gallery'))
    .filter((f) => execSync(`grep -c PWNED "${join(work, 'assets/gallery', f)}" || true`).toString().trim() !== '0');
  ok('angehängter Code beim Neuzeichnen entfernt', infected.length === 0, infected.join(', '));

  group('Termine');
  await page.goto(B + '/admin/termine.php');
  await page.click('#add');
  await page.fill('input[name="ev[0][date]"]', '2020-01-01');
  await page.fill('input[name="ev[0][title]"]', 'Lange vorbei');
  await page.click('#add');
  await page.fill('input[name="ev[1][date]"]', new Date(Date.now() + 9e8).toISOString().slice(0, 10));
  await page.fill('input[name="ev[1][title]"]', 'Kommt bald');
  await page.click('button[type=submit]');
  await page.waitForLoadState('networkidle');
  h = await body('/index.php');
  ok('kommender Termin steht auf der Seite', h.includes('Kommt bald'));
  ok('vergangener Termin ausgeblendet', !h.includes('Lange vorbei'));
  ok('Datum wird ausgeschrieben angezeigt',
     /\b(Mo|Di|Mi|Do|Fr|Sa|So), \d{1,2}\. \w{3} \d{4}/.test(await page.textContent('body')));

  // Löschen: ein Knopf je Zeile, der Rest bleibt stehen.
  ok('zwei Zeilen vorhanden', await page.locator('.row').count() === 2);
  page.once('dialog', (d) => d.accept());
  await page.locator('button[name=remove]').first().click();
  await page.waitForLoadState('networkidle');
  ok('Löschen wird bestätigt', await page.locator('.flash.ok').isVisible());
  ok('eine Zeile weniger', await page.locator('.row').count() === 1);
  // Die Titel stehen in Eingabefeldern — deren Inhalt steht nicht im Text der Seite.
  const titel = await page.locator('input[name$="[title]"]').evaluateAll(
    (els) => els.map((e) => e.value));
  ok('der richtige Termin ist weg', !titel.includes('Lange vorbei'), titel.join(', '));
  ok('der andere steht noch', titel.includes('Kommt bald'), titel.join(', '));
  ok('und weiterhin auf der Website', (await body('/index.php')).includes('Kommt bald'));

  group('Backup');
  const [zip] = await Promise.all([
    page.waitForEvent('download'),
    page.goto(B + '/admin/backup.php?download=1').catch(() => {}),
  ]);
  const zipPath = await zip.path();
  const list = execSync(`unzip -Z1 "${zipPath}"`).toString();
  ok('Backup enthält Inhalte', list.includes('data/content.json.php'));
  ok('Backup enthält Bilder', list.includes('assets/gallery/'));
  ok('Backup enthält kein Passwort', !list.includes('auth.json'));

  group('Backup einspielen');
  // Erst den Inhalt verfälschen und ein Bild löschen, dann das Backup zurückholen.
  await page.goto(B + '/admin/texte.php');
  await page.fill('input[name="c[faqs][0][q]"]', 'ÜBERSCHRIEBEN');
  await page.click('button[type=submit]');
  await page.waitForLoadState('networkidle');
  ok('Stand vor dem Einspielen verfälscht', (await body('/index.php')).includes('ÜBERSCHRIEBEN'));
  const weg = readdirSync(join(work, 'assets/gallery')).find((f) => f.endsWith('.jpg') && !f.endsWith('-s.jpg'));
  rmSync(join(work, 'assets/gallery', weg));

  await page.goto(B + '/admin/backup.php');
  page.once('dialog', (d) => d.accept());
  await page.setInputFiles('input[name=backup]', zipPath);
  await page.click('button[type=submit]');
  await page.waitForLoadState('networkidle');
  ok('Einspielen bestätigt', await page.locator('.flash.ok').isVisible(),
     await page.textContent('.flash').catch(() => ''));
  h = await body('/index.php');
  ok('alter Textstand ist zurück', h.includes('Eine Testfrage?') && !h.includes('ÜBERSCHRIEBEN'));
  ok('gelöschtes Bild wieder da', readdirSync(join(work, 'assets/gallery')).includes(weg));
  ok('weiterhin angemeldet', (await status('/admin/texte.php')) === 200);
  ok('Sicherung des alten Stands angelegt', readdirSync(join(work, 'data')).includes('vorher'));

  group('Absicherung');
  const noToken = await ctx.request.post(B + '/admin/termine.php', { form: { ev: '' } });
  ok('POST ohne CSRF-Token abgewiesen', noToken.status() === 400, `HTTP ${noToken.status()}`);

  await page.goto(B + '/admin/logout.php');
  for (let i = 1; i <= 6; i++) {
    await page.goto(B + '/admin/index.php');
    if (await page.locator('input[name=pw][disabled]').count()) break;
    await page.fill('input[name=pw]', 'falsch' + i);
    await page.click('button[type=submit]');
    await page.waitForLoadState('networkidle');
  }
  await page.goto(B + '/admin/index.php');
  ok('nach 6 Fehlversuchen gesperrt', await page.locator('input[name=pw][disabled]').count() === 1);
  ok('Grund wird ohne Absenden erklärt', /Zu viele Fehlversuche/.test(await page.textContent('body')));

  group('Darstellung');
  const ext = new Set();
  const p2 = await ctx.newPage();
  p2.on('request', (r) => { const hn = new URL(r.url()).hostname; if (hn !== '127.0.0.1') ext.add(hn); });
  await p2.goto(B + '/index.php', { waitUntil: 'networkidle' });
  // tally.so ist erwartet, sobald ein Formular hinterlegt ist, und in der
  // Datenschutzerklärung genannt. Alles andere wäre ein Leck.
  const fremd = [...ext].filter((h) => h !== 'tally.so');
  ok('keine Aufrufe an Dritte ausser dem Anmeldeformular', fremd.length === 0, fremd.join(', '));
  ok('Schriften kommen vom eigenen Server',
     (await body('/index.php')).includes('assets/fonts/') &&
     !(await body('/index.php')).includes('fonts.googleapis.com'));
  for (const w of [320, 390, 768, 1080, 1440, 1920]) {
    await p2.setViewportSize({ width: w, height: 900 });
    await p2.waitForTimeout(150);
    const over = await p2.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`bei ${w}px kein seitliches Scrollen`, over === 0, `${over}px Überhang`);
  }
} finally {
  await browser.close();
}

console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail === 0 ? 0 : 1);
