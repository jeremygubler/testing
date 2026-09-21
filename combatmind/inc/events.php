<?php
/** Termine: chronologische Liste, im Admin gepflegt. */
declare(strict_types=1);

require_once __DIR__ . '/core.php';

/** Kennung für einen Termin. Anmeldungen zeigen darauf. */
function event_new_id(): string { return 't' . bin2hex(random_bytes(5)); }

/**
 * Alle Termine, chronologisch.
 *
 * Termine waren früher eine reine Liste und wurden beim Speichern neu
 * durchnummeriert. Sobald eine Anmeldung auf einen Termin zeigt, geht das
 * nicht mehr — sie hinge nach dem nächsten Speichern am falschen Training.
 * Ältere Einträge bekommen ihre Kennung deshalb hier einmalig nachgereicht.
 */
function events_all(): array {
    $rows = array_values(array_filter(json_read('events.json'),
        fn($e) => is_array($e) && !empty($e['date'])));

    $nachtragen = false;
    foreach ($rows as &$e) {
        if (empty($e['id'])) { $e['id'] = event_new_id(); $nachtragen = true; }
    }
    unset($e);
    if ($nachtragen) json_write('events.json', $rows);

    usort($rows, fn($a, $b) => [$a['date'], $a['time'] ?? ''] <=> [$b['date'], $b['time'] ?? '']);
    return $rows;
}

/** Einen Termin über seine Kennung finden. */
function event_by_id(string $id): ?array {
    if ($id === '') return null;
    foreach (events_all() as $e) if (($e['id'] ?? '') === $id) return $e;
    return null;
}

/** Bis wann man sich eintragen kann — ohne eigenen Schluss bis zum Termin selbst. */
function event_deadline(array $e): string {
    return !empty($e['deadline']) ? (string)$e['deadline'] : (string)$e['date'];
}

/** Nur was heute oder später stattfindet — Vergangenes verschwindet von selbst. */
function events_upcoming(int $limit = 6): array {
    $today = date('Y-m-d');
    return array_slice(array_values(array_filter(events_all(), fn($e) => $e['date'] >= $today)), 0, $limit);
}

function events_save(array $rows): bool { return json_write('events.json', array_values($rows)); }

const FF_MONTHS = [1=>'Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const FF_DAYS   = ['Mo','Di','Mi','Do','Fr','Sa','So'];

function event_day(string $date): string   { return date('j', strtotime($date)); }
function event_month(string $date): string { return FF_MONTHS[(int)date('n', strtotime($date))] ?? ''; }
function event_weekday(string $date): string {
    return FF_DAYS[(int)date('N', strtotime($date)) - 1] ?? '';
}
function event_year(string $date): string  { return date('Y', strtotime($date)); }
