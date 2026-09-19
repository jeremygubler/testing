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
  ok('Anmelde-Overlay ist scharf', h.includes('data-tally-open="TESTID"'));
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

  group('Platzzähler');
  await page.goto(B + '/admin/index.php');
  ok('Zählerstand auf der Übersicht', /6\s*<\/strong>/.test(await page.innerHTML('body')));
  await page.click('button[name=seats][value=minus]');
  await page.waitForLoadState('networkidle');
  ok('ein Platz weniger', (await body('/index.php')).includes('Noch 5 von 16 Plätzen frei'));
  await page.click('button[name=seats][value=plus]');
  await page.waitForLoadState('networkidle');
  ok('Rückgängig stellt wieder her', (await body('/index.php')).includes('Noch 6 von 16 Plätzen frei'));

  // Bis auf null klicken: die Website muss von selbst auf ausgebucht gehen.
  for (let i = 0; i < 6; i++) {
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
  ok('Zurückschalten stellt alles wieder her', h.includes('TESTID') && !h.includes('badge--out'));

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
