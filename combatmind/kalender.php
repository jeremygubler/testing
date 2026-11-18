<?php
/** Liefert einen Termin als Kalenderdatei. Aufruf: kalender.php?t=<Kennung> */
declare(strict_types=1);
require __DIR__ . '/inc/ics.php';

$ev = event_by_id(trim((string)($_GET['t'] ?? '')));
if ($ev === null) { header('Location: index.php#termine'); exit; }

header('Content-Type: text/calendar; charset=UTF-8');
header('Content-Disposition: attachment; filename="' . ics_filename($ev) . '"');
header('X-Content-Type-Options: nosniff');
echo ics_for_event($ev);
