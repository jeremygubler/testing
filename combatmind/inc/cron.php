<?php
/**
 * Zeitgesteuerte Arbeiten.
 *
 * Aufgerufen wird das von `cron.php` im Wurzelverzeichnis — entweder von der
 * Kommandozeile (so richtet man es bei cyon ein) oder über das Netz mit einem
 * Schlüssel. Ohne Schlüssel antwortet die Datei mit 404, als gäbe es sie nicht:
 * Sie liegt im Web-Verzeichnis und wäre sonst für jeden auslösbar.
 *
 * Jeder Lauf wird festgehalten. Ein Cronjob, dessen Ausfall niemand bemerkt,
 * ist schlimmer als keiner — der Admin zeigt deshalb an, wann er zuletzt lief.
 */
declare(strict_types=1);

require_once __DIR__ . '/core.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/events.php';
require_once __DIR__ . '/signup.php';

const FF_CRON_STALE = 3;   // Tage ohne Lauf, ab denen gewarnt wird

/** Schlüssel für den Aufruf über das Netz. Wird beim ersten Mal erzeugt. */
function cron_key(): string {
    $s = json_read('cron.json');
    if (!empty($s['key']) && is_string($s['key'])) return $s['key'];
    $s['key'] = bin2hex(random_bytes(16));
    json_write('cron.json', $s);
    return $s['key'];
}

function cron_state(): array { return json_read('cron.json'); }

/** Wann lief es zuletzt? 0 heisst: noch nie. */
function cron_last_run(): int { return (int)(cron_state()['last_run'] ?? 0); }

/** Überfällig — oder noch nie gelaufen, obwohl eingerichtet. */
function cron_overdue(): bool {
    $letzter = cron_last_run();
    return $letzter > 0 && (time() - $letzter) > FF_CRON_STALE * 86400;
}

/**
 * Die Arbeiten ausführen und festhalten, was dabei herauskam.
 * Absichtlich kurz: Was hier scheitert, scheitert unbeobachtet.
 */
function cron_run(): array {
    $begonnen = microtime(true);
    $bericht  = ['ts' => time(), 'fehler' => []];

    try {
        $weg = signup_purge();
        $bericht['anmeldungen'] = $weg['anmeldungen'];
        $bericht['warteliste']  = $weg['warteliste'];
    } catch (Throwable $e) {
        $bericht['fehler'][] = 'Bereinigung: ' . $e->getMessage();
    }

    $bericht['dauer'] = round(microtime(true) - $begonnen, 3);

    $sperre = data_lock('cron');
    try {
        $s = json_read('cron.json');
        $s['last_run']    = $bericht['ts'];
        $s['last_result'] = $bericht;
        json_write('cron.json', $s);
    } finally { data_unlock($sperre); }

    return $bericht;
}
