<?php
/**
 * Logiktests ohne Browser. Aufruf: php tests/unit.php
 * Läuft gegen ein temporäres data/-Verzeichnis, fasst echte Inhalte nie an.
 */
declare(strict_types=1);

$tmp = sys_get_temp_dir() . '/cm-tests-' . bin2hex(random_bytes(4));
mkdir($tmp . '/data', 0775, true);
mkdir($tmp . '/assets/gallery', 0775, true);
// FF_DATA und FF_GALLERY zeigen auf das temporäre Verzeichnis.
define('FF_TEST_ROOT', $tmp);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/../inc/core.php';
require __DIR__ . '/../inc/schema.php';
require __DIR__ . '/../inc/media.php';
require __DIR__ . '/../inc/events.php';
require __DIR__ . '/../inc/restore.php';
require __DIR__ . '/../inc/signup.php';

$pass = 0; $fail = 0;
function ok(string $name, bool $cond, string $detail = ''): void {
    global $pass, $fail;
    if ($cond) { $pass++; echo "  PASS  $name\n"; }
    else { $fail++; echo "  FAIL  $name" . ($detail ? "  — $detail" : '') . "\n"; }
}
function eq(string $name, $got, $want): void {
    ok($name, $got === $want, 'erwartet ' . var_export($want, true) . ', erhalten ' . var_export($got, true));
}

echo "\nListen erkennen\n";
eq('leeres Array gilt als Liste', is_list_array([]), true);
eq('Repeater-Liste', is_list_array([['a' => 1], ['a' => 2]]), true);
eq('Feld-Map ist keine Liste', is_list_array(['brand' => 'Combat']), false);
eq('Liste mit Lücke ist keine', is_list_array([0 => 'a', 2 => 'b']), false);

echo "\nAdresse und URLs\n";
eq('PLZ und Ort zusammengesetzt', zip_city(), '4054 Basel');
eq('site_url ohne Pfad', site_url(), 'https://combat-mind.ch/');
eq('site_url mit Pfad', site_url('agb.php'), 'https://combat-mind.ch/agb.php');
ok('cta_attrs ohne Formular zeigt auf den Abschnitt', cta_attrs('', '') === 'href="#anmeldung"');
ok('cta_attrs mit ID öffnet das Overlay', str_contains(cta_attrs('https://tally.so/r/X1', 'X1'), 'data-tally-open="X1"'));
ok('cta_attrs ohne ID nur als Link', !str_contains(cta_attrs('https://tally.so/r/X1', ''), 'data-tally-open'));

echo "\nTelefonnummer\n";
eq('Schweizer Nummer wird international',  phone_href('076 527 74 93'), '+41765277493');
eq('Trennzeichen sind egal',               phone_href('076-527.74.93'), '+41765277493');
eq('bereits international bleibt gleich',  phone_href('+41 76 527 74 93'), '+41765277493');
eq('00-Vorwahl wird zum Plus',             phone_href('0041765277493'), '+41765277493');
eq('41 ohne Plus bekommt eines',           phone_href('41 76 527 74 93'), '+41765277493');
eq('leere Nummer ergibt leeren Link',      phone_href(' '), '');
eq('Nummer aus dem Admin wird genommen',   phone_href(), '+41765277493');

echo "\nDatenablage\n";
json_write('probe.json', ['geheim' => 'wert']);
$raw = file_get_contents(data_path('probe.json'));
ok('Datei beginnt mit exit-Guard', str_starts_with($raw, '<?php exit; ?>'));
eq('gelesen wird wieder dasselbe', json_read('probe.json'), ['geheim' => 'wert']);
eq('fehlende Datei liefert Rückfallwert', json_read('gibtsnicht.json', ['x' => 1]), ['x' => 1]);

echo "\nInhalte zusammenführen\n";
// Das ist der Fehler, der einmal alle Texte gelöscht hat: ein Teil-Speichern
// darf die übrigen Felder nie leeren.
json_write('content.json', ['coach' => ['name' => 'Jocelyn']]);

$c = ff_content(true);
eq('geänderter Wert kommt an', $c['coach']['name'], 'Jocelyn');
eq('unberührtes Feld bleibt', $c['program']['price'], '299');
eq('Standardtext bleibt', $c['hero']['brand'], 'Combat');
eq('Repeater bleibt vollständig', count($c['weeks']), 12);

echo "\nTermine\n";
events_save([
    ['date' => '2020-01-01', 'title' => 'Vergangen'],
    ['date' => date('Y-m-d', strtotime('+10 days')), 'title' => 'Kommt'],
    ['date' => date('Y-m-d', strtotime('+2 days')), 'title' => 'Bald'],
]);
$up = events_upcoming();
eq('Vergangenes fällt weg', count($up), 2);
eq('chronologisch sortiert', $up[0]['title'], 'Bald');

echo "\nBilder\n";
eq('Name der kleinen Fassung', thumb_name('20260101-abc.jpg'), '20260101-abc-s.jpg');
eq('ohne kleine Fassung das Original', thumb_or_full('fehlt.jpg'), 'fehlt.jpg');

echo "\nLogin-Sperre\n";
auth_set_password('test-passwort-lang-genug');
$als = function (string $ip, callable $fn) { $_SERVER['REMOTE_ADDR'] = $ip; return $fn(); };

for ($i = 0; $i < FF_LOGIN_TRIES; $i++) $als('203.0.113.5', fn() => auth_login("falsch$i"));
ok('Gerät nach 6 Fehlversuchen gesperrt', $als('203.0.113.5', 'auth_locked_for') > 0);
ok('zweites Gerät bleibt frei', $als('198.51.100.9', 'auth_locked_for') === 0);
ok('gesperrtes Gerät auch mit richtigem Passwort abgewiesen',
    $als('203.0.113.5', fn() => @auth_login('test-passwort-lang-genug')) === false);

// Verteilter Angriff, nachdem sich ein Gerät erfolgreich angemeldet hat.
$als('198.51.100.9', fn() => @auth_login('test-passwort-lang-genug'));
for ($i = 0; $i < FF_GLOBAL_TRIES + 5; $i++) $als("192.0.2.$i", fn() => auth_login('raten'));
ok('Notbremse sperrt unbekannte Geräte', $als('203.0.113.77', 'auth_locked_for') > 0);
ok('bekanntes Gerät bleibt ausgenommen', $als('198.51.100.9', 'auth_locked_for') === 0);
ok('Sperrdatei enthält keine IP-Adressen',
    !preg_match('/192\.0\.2\.|198\.51\.100|203\.0\.113/', file_get_contents(data_path('throttle.json'))));

echo "\nAnmeldung — Alter\n";
$vor = fn(int $j) => (new DateTimeImmutable('today'))->modify("-$j years")->format('d.m.Y');
eq('genau 16 heute',        signup_age($vor(16)), 16);
eq('auch als ISO',          signup_age((new DateTimeImmutable('today'))->modify('-16 years')->format('Y-m-d')), 16);
eq('30 Jahre',              signup_age($vor(30)), 30);
eq('unbrauchbares Datum',   signup_age('irgendwas'), null);
eq('31. Februar gibt es nicht', signup_age('31.02.2000'), null);
eq('Datum in der Zukunft',  signup_age('01.01.2099'), null);
eq('einen Tag vor dem 16.', signup_age((new DateTimeImmutable('today'))->modify('-16 years')->modify('+1 day')->format('d.m.Y')), 15);

echo "\nAnmeldung — Datum lesen\n";
eq('TT.MM.JJJJ',              signup_parse_date('10.03.1988'), '1988-03-10');
eq('einstellige Zahlen',      signup_parse_date('1.3.1988'),   '1988-03-01');
eq('Schrägstriche',           signup_parse_date('10/03/1988'), '1988-03-10');
eq('ISO bleibt lesbar',       signup_parse_date('1988-03-10'), '1988-03-10');
eq('Monat 13 abgelehnt',      signup_parse_date('03.13.1988'), null);
eq('zweistelliges Jahr abgelehnt', signup_parse_date('10.03.88'), null);
eq('31. Februar abgelehnt',   signup_parse_date('31.02.2000'), null);
eq('Text abgelehnt',          signup_parse_date('irgendwas'), null);
// Der Kern der Sache: Tag zuerst, nie der Monat.
eq('03.10.1988 ist der 3. Oktober', signup_parse_date('03.10.1988'), '1988-10-03');
eq('10.03.1988 ist der 10. März',   signup_parse_date('10.03.1988'), '1988-03-10');

echo "\nAnmeldung — Regeln\n";
$gut = ['vorname'=>'Anna','name'=>'Muster','email'=>'anna@example.ch','telefon'=>'076 527 74 93',
        'geburtsdatum'=>$vor(30),'gesundheit'=>'nein','agb'=>'1'];
$r = signup_validate($gut);
ok('vollständige Anmeldung geht durch', $r['ok'] === true, implode(' ', $r['errors']));
eq('Alter wird mitgespeichert', $r['data']['alter'], 30);
ok('Geburtsdatum wird als ISO abgelegt', (bool)preg_match('/^\d{4}-\d{2}-\d{2}$/', $r['data']['geburtsdatum']),
   $r['data']['geburtsdatum']);

ok('ohne AGB-Haken abgelehnt',   !signup_validate(array_diff_key($gut, ['agb'=>0]))['ok']);
ok('ohne Vorname abgelehnt',     !signup_validate(['vorname'=>''] + $gut)['ok']);
ok('krumme E-Mail abgelehnt',    !signup_validate(['email'=>'keine-adresse'] + $gut)['ok']);
ok('kurze Telefonnummer abgelehnt', !signup_validate(['telefon'=>'123'] + $gut)['ok']);
ok('unter 16 abgelehnt',         !signup_validate(['geburtsdatum'=>$vor(15)] + $gut)['ok']);
// Mit 16 ist man zugelassen — und braucht laut AGB die Einwilligung. Die
// Ablehnung darf also nicht am Alter hängen.
$r16 = signup_validate(['geburtsdatum'=>$vor(16)] + $gut);
ok('16 scheitert nicht am Alter', !isset($r16['errors']['geburtsdatum']));
ok('16 braucht die Einwilligung', isset($r16['errors']['gv_name']));

// Bedingung 1: 16 und 17 brauchen die Einwilligung, Erwachsene nicht.
$jung = ['geburtsdatum'=>$vor(17)] + $gut;
$rj = signup_validate($jung);
ok('minderjährig ohne Einwilligung abgelehnt', !$rj['ok'] && isset($rj['errors']['gv_name']));
$rj2 = signup_validate(['gv_name'=>'Maria Muster','gv_email'=>'maria@example.ch'] + $jung);
ok('minderjährig mit Einwilligung geht durch', $rj2['ok']);
eq('Einwilligung wird gespeichert', $rj2['data']['gv_email'], 'maria@example.ch');
$re = signup_validate(['gv_name'=>'Unnötig','gv_email'=>'x@example.ch'] + $gut);
eq('bei Erwachsenen wird sie verworfen', $re['data']['gv_name'], '');

// Bedingung 2: «ja» verlangt eine Beschreibung, «nein» verwirft sie.
$rg = signup_validate(['gesundheit'=>'ja'] + $gut);
ok('«ja» ohne Text abgelehnt', !$rg['ok'] && isset($rg['errors']['gesundheit_text']));
$rg2 = signup_validate(['gesundheit'=>'ja','gesundheit_text'=>'Knie operiert'] + $gut);
ok('«ja» mit Text geht durch', $rg2['ok']);
eq('Text kommt mit', $rg2['data']['gesundheit_text'], 'Knie operiert');
$rg3 = signup_validate(['gesundheit'=>'nein','gesundheit_text'=>'wird verworfen'] + $gut);
eq('bei «nein» kein Text gespeichert', $rg3['data']['gesundheit_text'], '');
ok('erfundene Antwort abgelehnt', !signup_validate(['gesundheit'=>'vielleicht'] + $gut)['ok']);

echo "\nAnmeldung — Skripte abwehren\n";
ok('gefüllter Honigtopf fliegt raus', !signup_looks_human(['website'=>'http://spam','ts'=>time()-60]));
ok('sofort abgeschickt fliegt raus',  !signup_looks_human(['ts'=>time()]));
ok('ohne Zeitstempel fliegt raus',    !signup_looks_human([]));
ok('in Ruhe ausgefüllt geht durch',    signup_looks_human(['ts'=>time()-45,'website'=>'']));

echo "\nAnmeldung — Ablage\n";
json_write('content.json', ['program'=>['seats_total'=>'16','seats_left'=>'2']]);
ff_content(true);
signup_store(signup_validate($gut)['data']);
eq('ein Platz weniger', ff_content(true)['program']['seats_left'], '1');
signup_store(signup_validate(['email'=>'zwei@example.ch'] + $gut)['data']);
eq('bei null ausgebucht', ff_content(true)['program']['seats_left'], '0');
ok('Schalter springt um', ff_content()['program']['sold_out'] === true);
eq('beide Anmeldungen liegen vor', count(signup_all()), 2);
ok('neueste zuerst', signup_all()[0]['email'] === 'zwei@example.ch');
ok('Sperrliste enthält keine IP', !str_contains((string)@file_get_contents(data_path('signup_rate.json')), '127.0.0'));
ok('Anmeldungen sind vom Einspielen ausgenommen', restore_target('data/signups.json.php') === null);

echo "\nBackup einspielen — was hinein darf\n";
eq('Textdatei erlaubt',        restore_target('data/content.json.php')['name'] ?? null, 'content.json');
ok('Galeriebild erlaubt',      restore_target('assets/gallery/20260919-ab12.jpg') !== null);
ok('Coachbild erlaubt',        restore_target('assets/coach.jpg') !== null);
ok('Passwortdatei abgelehnt',  restore_target('data/auth.json.php') === null);
ok('Sperrliste abgelehnt',     restore_target('data/throttle.json.php') === null);
ok('Pfadwechsel abgelehnt',    restore_target('data/../../../etc/passwd') === null);
ok('absoluter Pfad abgelehnt', restore_target('/etc/passwd') === null);
ok('Programmcode abgelehnt',   restore_target('index.php') === null);
ok('PHP im Bildordner abgelehnt', restore_target('assets/gallery/hintertuer.php') === null);
ok('Doppelendung abgelehnt',   restore_target('assets/gallery/bild.jpg.php') === null);
ok('Backslash abgelehnt',      restore_target('data\\content.json.php') === null);
ok('Nullbyte abgelehnt',       restore_target("data/content.json.php\0.txt") === null);

echo "\nBackup einspielen — der Durchlauf\n";
// Ein Archiv bauen, wie der Download es erzeugt, plus drei Einträge, die ein
// Angreifer hineinschmuggeln würde.
$bild = imagecreatetruecolor(400, 300);
imagefill($bild, 0, 0, imagecolorallocate($bild, 30, 30, 30));
ob_start(); imagejpeg($bild, null, 80); $jpeg = (string)ob_get_clean();
imagedestroy($bild);

$zipDatei = $tmp . '/backup.zip';
$z = new ZipArchive();
$z->open($zipDatei, ZipArchive::CREATE | ZipArchive::OVERWRITE);
$z->addFromString('data/content.json.php', FF_GUARD . json_encode(['hero' => ['claim' => 'AUS DEM BACKUP']]));
$z->addFromString('data/events.json.php',  FF_GUARD . json_encode([['date' => '2030-01-01', 'title' => 'Aus dem Backup']]));
$z->addFromString('assets/gallery/20260919-wiederher.jpg', $jpeg);
$z->addFromString('LIESMICH.txt', 'Hinweis');
$z->addFromString('data/auth.json.php', FF_GUARD . json_encode(['hash' => 'uebernommen']));
$z->addFromString('../../../tmp/ausbruch.txt', 'entwischt');
$z->addFromString('assets/gallery/hintertuer.php', '<?php echo "PWNED";');
$z->close();

// Ausgangslage, die überschrieben werden soll
json_write('content.json', ['hero' => ['claim' => 'ALTER STAND']]);
json_write('auth.json', ['hash' => 'mein-echter-hash']);

$b = restore_apply($zipDatei);
ok('Einspielen gemeldet als erfolgreich', $b['ok'] === true);
eq('zwei Textdateien übernommen', $b['texte'], 2);
eq('ein Bild übernommen',         $b['bilder'], 1);
eq('drei Einträge übergangen',    $b['uebergangen'], 3);
eq('Text kommt aus dem Backup',   ff_content()['hero']['claim'], 'AUS DEM BACKUP');
eq('Passwort unangetastet',       json_read('auth.json')['hash'], 'mein-echter-hash');
ok('Bild liegt im Galerieordner', is_file(FF_GALLERY . '/20260919-wiederher.jpg'));
ok('keine PHP-Datei geschrieben', !is_file(FF_GALLERY . '/hintertuer.php'));
ok('nichts ausserhalb gelandet',  !is_file('/tmp/ausbruch.txt'));
ok('vorheriger Stand beiseitegelegt', is_file(FF_DATA . '/vorher/content.json.php'));
ok('Sicherung enthält den alten Text',
    str_contains((string)file_get_contents(FF_DATA . '/vorher/content.json.php'), 'ALTER STAND'));

// Ein Archiv ohne passenden Inhalt darf nichts anfassen und sagt das auch.
$leer = $tmp . '/fremd.zip';
$z = new ZipArchive(); $z->open($leer, ZipArchive::CREATE | ZipArchive::OVERWRITE);
$z->addFromString('urlaub/strand.png', 'nicht unseres'); $z->close();
$b2 = restore_apply($leer);
ok('fremdes Archiv wird abgewiesen', $b2['ok'] === false && $b2['fehler'] !== []);
eq('Text dabei unverändert', ff_content(true)['hero']['claim'], 'AUS DEM BACKUP');

// Ein als ZIP getarnter Text bleibt wirkungslos.
file_put_contents($tmp . '/kaputt.zip', 'das ist kein ZIP');
ok('unlesbares Archiv abgewiesen', restore_apply($tmp . '/kaputt.zip')['ok'] === false);

// Ein Eintrag mit .jpg-Namen, der kein Bild ist, wird nicht geschrieben.
$fake = $tmp . '/fake.zip';
$z = new ZipArchive(); $z->open($fake, ZipArchive::CREATE | ZipArchive::OVERWRITE);
$z->addFromString('assets/gallery/20260919-getarnt.jpg', '<?php echo "PWNED";'); $z->close();
$b3 = restore_apply($fake);
eq('getarntes Bild nicht übernommen', $b3['bilder'], 0);
ok('getarnte Datei nicht abgelegt', !is_file(FF_GALLERY . '/20260919-getarnt.jpg'));
ok('kein halbfertiger Rest im Ordner', glob(FF_GALLERY . '/.restore-*') === []);

echo "\nAusgaben absichern\n";
eq('HTML wird maskiert', h('<script>"x"'), '&lt;script&gt;&quot;x&quot;');
ok('Absätze aus Leerzeilen', substr_count(paragraphs("eins\n\nzwei"), '<p class="lede">') === 2);

// Aufräumen
array_map('unlink', glob($tmp . '/data/vorher/*') ?: []);
@rmdir($tmp . '/data/vorher');
array_map('unlink', glob($tmp . '/*.zip') ?: []);
array_map('unlink', glob($tmp . '/data/*') ?: []);
array_map('unlink', glob($tmp . '/assets/gallery/*') ?: []);
@rmdir($tmp . '/data'); @rmdir($tmp . '/assets/gallery'); @rmdir($tmp . '/assets'); @rmdir($tmp);

echo "\n$pass bestanden, $fail fehlgeschlagen\n";
exit($fail === 0 ? 0 : 1);
