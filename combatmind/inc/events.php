<?php
/** Termine: chronologische Liste, im Admin gepflegt. */
declare(strict_types=1);

require_once __DIR__ . '/core.php';

function events_all(): array {
    $rows = array_filter(json_read('events.json'), fn($e) => is_array($e) && !empty($e['date']));
    usort($rows, fn($a, $b) => [$a['date'], $a['time'] ?? ''] <=> [$b['date'], $b['time'] ?? '']);
    return array_values($rows);
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
