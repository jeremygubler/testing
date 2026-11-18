<?php
/**
 * Kalendereinträge (.ics) für einzelne Trainings.
 *
 * Eine Textdatei nach RFC 5545 — kein Dienst, keine Bibliothek. Zeiten werden
 * in UTC geschrieben, damit keine Zeitzonen-Tabelle mitgeliefert werden muss:
 * Ein Kalender rechnet sie selbst in die Zeit der Nutzerin zurück.
 */
declare(strict_types=1);

require_once __DIR__ . '/core.php';
require_once __DIR__ . '/schema.php';   // ff_content()
require_once __DIR__ . '/events.php';

const FF_TZ = 'Europe/Zurich';

/** Sonderzeichen nach RFC 5545 maskieren. */
function ics_escape(string $s): string {
    return str_replace(["\\", "\n", ";", ","], ["\\\\", "\\n", "\;", "\\,"], trim($s));
}

/** Zeilen über 75 Zeichen falten — sonst verwerfen manche Kalender die Datei. */
function ics_fold(string $zeile): string {
    if (strlen($zeile) <= 75) return $zeile;
    $out = substr($zeile, 0, 75);
    $rest = substr($zeile, 75);
    foreach (str_split($rest, 74) as $stueck) $out .= "\r\n " . $stueck;
    return $out;
}

/**
 * Start und Ende aus dem Zeitfeld lesen. «10:00–11:30» ergibt beides,
 * «10:00» eine Stunde, nichts einen ganztägigen Eintrag.
 */
function ics_zeitraum(array $ev): array {
    $tz    = new DateTimeZone(FF_TZ);
    $datum = (string)$ev['date'];
    $zeit  = (string)($ev['time'] ?? '');

    if (preg_match('/(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/u', $zeit, $m)) {
        return [new DateTimeImmutable("$datum {$m[1]}:{$m[2]}", $tz),
                new DateTimeImmutable("$datum {$m[3]}:{$m[4]}", $tz), false];
    }
    if (preg_match('/(\d{1,2}):(\d{2})/', $zeit, $m)) {
        $start = new DateTimeImmutable("$datum {$m[1]}:{$m[2]}", $tz);
        return [$start, $start->modify('+1 hour'), false];
    }
    $start = new DateTimeImmutable($datum, $tz);
    return [$start, $start->modify('+1 day'), true];
}

/** Die vollständige Datei für einen Termin. */
function ics_for_event(array $ev): string {
    $c = ff_content();
    [$start, $ende, $ganztags] = ics_zeitraum($ev);

    $ort = trim(($c['contact']['address'] ?? '') . ', ' . zip_city(), ', ');
    $was = [];
    if (!empty($ev['note']))  $was[] = (string)$ev['note'];
    if (!empty($ev['price'])) $was[] = 'CHF ' . $ev['price'] . ' — bezahlt wird vor Ort.';
    $was[] = 'Fragen: ' . (string)$c['contact']['email'];

    $utc = new DateTimeZone('UTC');
    $z   = fn(DateTimeImmutable $d) => $d->setTimezone($utc)->format('Ymd\THis\Z');
    $tag = fn(DateTimeImmutable $d) => $d->format('Ymd');

    $zeilen = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//COMBAT MIND//Termine//DE',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        'UID:' . ics_escape((string)($ev['id'] ?? uniqid())) . '@' . ics_escape(
            parse_url((string)$c['contact']['site_url'], PHP_URL_HOST) ?: 'combat-mind.ch'),
        'DTSTAMP:' . $z(new DateTimeImmutable('now')),
        $ganztags ? 'DTSTART;VALUE=DATE:' . $tag($start) : 'DTSTART:' . $z($start),
        $ganztags ? 'DTEND;VALUE=DATE:' . $tag($ende)   : 'DTEND:' . $z($ende),
        'SUMMARY:' . ics_escape((string)$ev['title']),
        'DESCRIPTION:' . ics_escape(implode("\n", $was)),
        'LOCATION:' . ics_escape($ort),
        'STATUS:CONFIRMED',
        'END:VEVENT',
        'END:VCALENDAR',
    ];
    return implode("\r\n", array_map('ics_fold', $zeilen)) . "\r\n";
}

function ics_filename(array $ev): string {
    $name = preg_replace('/[^A-Za-z0-9]+/', '-', (string)$ev['title']);
    return trim(strtolower((string)$name), '-') . '-' . date('Y-m-d', strtotime((string)$ev['date'])) . '.ics';
}
