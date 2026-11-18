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
require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/ics.php';

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
 * Erinnerungen an alle, die morgen oder heute ein Training haben und noch
 * keine bekommen haben.
 *
 * Zwei Dinge entscheiden hier über die Qualität. Erstens: Vermerkt wird
 * *vor* dem Versand. Bricht etwas mittendrin ab, fehlt im schlimmsten Fall
 * eine Erinnerung — eine doppelte wäre ärgerlicher, und beim nächsten Lauf
 * ginge sie sonst erneut an alle hinaus. Zweitens: Der Vermerk wird unter
 * der Sperre gesetzt, versendet wird danach ohne sie, damit ein langsamer
 * Mailserver keine Anmeldung blockiert.
 */
function cron_reminders(?int $jetzt = null): array {
    $jetzt   = $jetzt ?? time();
    $bericht = ['gesendet' => 0, 'fehlgeschlagen' => 0];
    $c       = ff_content();
    if (empty($c['signup']['remind'])) return $bericht;

    $heute  = date('Y-m-d', $jetzt);
    $morgen = date('Y-m-d', $jetzt + 86400);

    $faellig = [];
    $sperre  = data_lock('signups');
    try {
        $rows = signup_all();
        $aenderung = false;
        foreach ($rows as &$r) {
            if (!empty($r['reminded'])) continue;
            $id = (string)($r['event'] ?? '');
            if ($id === '') continue;                       // der Kurs hat kein Einzeldatum
            $ev = event_by_id($id);
            if ($ev === null) continue;
            $datum = (string)$ev['date'];
            // Heute mitnehmen: Fällt ein Lauf aus, ist eine Erinnerung am
            // Trainingstag immer noch besser als gar keine.
            if ($datum !== $heute && $datum !== $morgen) continue;
            $r['reminded'] = $jetzt;
            $faellig[] = [$r, $ev, $datum === $heute];
            $aenderung = true;
        }
        unset($r);
        if ($aenderung) signup_save($rows);
    } finally { data_unlock($sperre); }

    foreach ($faellig as [$r, $ev, $istHeute]) {
        $wann = ($istHeute ? 'heute' : 'morgen')
              . ', ' . event_day($ev['date']) . '. ' . event_month($ev['date'])
              . (!empty($ev['time']) ? ', ' . $ev['time'] : '');
        $text = str_replace(
            ['{vorname}', '{training}', '{wann}'],
            [(string)$r['vorname'], (string)$ev['title'], $wann],
            (string)$c['signup']['remind_text']);

        $ok = mail_send((string)$r['email'],
            'Erinnerung: ' . $ev['title'] . ' ' . ($istHeute ? 'heute' : 'morgen'),
            $text, trim((string)$c['contact']['email']),
            ['name' => ics_filename($ev),
             'type' => 'text/calendar; charset=UTF-8; method=PUBLISH',
             'data' => ics_for_event($ev)]);
        $ok ? $bericht['gesendet']++ : $bericht['fehlgeschlagen']++;
    }
    return $bericht;
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

    try {
        $er = cron_reminders($bericht['ts']);
        $bericht['erinnerungen'] = $er['gesendet'];
        if ($er['fehlgeschlagen']) {
            $bericht['fehler'][] = $er['fehlgeschlagen'] . ' Erinnerung(en) nicht zugestellt.';
        }
    } catch (Throwable $e) {
        $bericht['fehler'][] = 'Erinnerungen: ' . $e->getMessage();
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
