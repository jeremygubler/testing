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

echo "\nAusgaben absichern\n";
eq('HTML wird maskiert', h('<script>"x"'), '&lt;script&gt;&quot;x&quot;');
ok('Absätze aus Leerzeilen', substr_count(paragraphs("eins\n\nzwei"), '<p class="lede">') === 2);

// Aufräumen
array_map('unlink', glob($tmp . '/data/*') ?: []);
array_map('unlink', glob($tmp . '/assets/gallery/*') ?: []);
@rmdir($tmp . '/data'); @rmdir($tmp . '/assets/gallery'); @rmdir($tmp . '/assets'); @rmdir($tmp);

echo "\n$pass bestanden, $fail fehlgeschlagen\n";
exit($fail === 0 ? 0 : 1);
