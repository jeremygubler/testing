<?php
/**
 * Einstiegspunkt für den Cronjob.
 *
 * Von der Kommandozeile ohne weiteres aufrufbar. Über das Netz nur mit dem
 * Schlüssel aus dem Admin — sonst 404, damit die Datei nicht als Angriffsfläche
 * im Web-Verzeichnis steht.
 */
declare(strict_types=1);
require __DIR__ . '/inc/cron.php';

$ueberKonsole = PHP_SAPI === 'cli';

if (!$ueberKonsole) {
    $gesendet = (string)($_GET['key'] ?? '');
    // hash_equals, damit die Antwortzeit nichts über den Schlüssel verrät.
    if ($gesendet === '' || !hash_equals(cron_key(), $gesendet)) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=UTF-8');
        exit("Nicht gefunden\n");
    }
    header('Content-Type: text/plain; charset=UTF-8');
    header('X-Robots-Tag: noindex');
}

$b = cron_run();
printf("COMBAT MIND Cron %s\n", date('d.m.Y H:i'));
printf("Anmeldungen gelöscht: %d\n", $b['anmeldungen'] ?? 0);
printf("Warteliste gelöscht:  %d\n", $b['warteliste'] ?? 0);
printf("Erinnerungen:         %d\n", $b['erinnerungen'] ?? 0);
printf("Dauer: %s s\n", $b['dauer']);
foreach ($b['fehler'] as $f) printf("FEHLER: %s\n", $f);
exit($b['fehler'] === [] ? 0 : 1);
