<?php
/**
 * Anmeldungen auf dem eigenen Server.
 *
 * Zwei Grundsätze:
 *  1. Die gespeicherte Anmeldung ist die Wahrheit, nicht die E-Mail. Scheitert
 *     der Versand, steht der Eintrag trotzdem im Admin — bei Tally war die Mail
 *     der einzige Kanal, und genau das war das Risiko.
 *  2. Die Sichtbarkeitsregeln im Browser sind Bequemlichkeit. Verbindlich sind
 *     allein die Prüfungen hier, denn ein Formular lässt sich umgehen.
 */
declare(strict_types=1);

require_once __DIR__ . '/core.php';

const FF_MIN_AGE      = 16;
const FF_SIGNUP_TRIES = 3;       // je Gerät und Stunde
const FF_SIGNUP_FILL  = 3;       // Sekunden; schneller füllt nur ein Skript aus

/** Alter in vollen Jahren am heutigen Tag, oder null bei unbrauchbarem Datum. */
function signup_age(string $date): ?int {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return null;
    [$y, $m, $d] = array_map('intval', explode('-', $date));
    if (!checkdate($m, $d, $y)) return null;
    $geb = new DateTimeImmutable(sprintf('%04d-%02d-%02d', $y, $m, $d));
    $heute = new DateTimeImmutable('today');
    if ($geb > $heute) return null;
    return (int)$geb->diff($heute)->y;
}

/**
 * Prüft eine abgeschickte Anmeldung. Liefert die bereinigten Daten oder die
 * Fehler je Feld — nie beides halb.
 */
function signup_validate(array $p): array {
    $f = [];
    $v = fn(string $k) => trim((string)($p[$k] ?? ''));

    foreach (['vorname' => 'Vorname', 'name' => 'Name'] as $k => $label) {
        $val = $v($k);
        if ($val === '')            $f[$k] = $label . ' fehlt.';
        elseif (mb_strlen($val) > 80) $f[$k] = $label . ' ist zu lang.';
    }

    $email = $v('email');
    if ($email === '')                                  $f['email'] = 'E-Mail-Adresse fehlt.';
    elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) $f['email'] = 'Diese E-Mail-Adresse stimmt nicht.';
    elseif (mb_strlen($email) > 120)                    $f['email'] = 'Die Adresse ist zu lang.';

    $tel = $v('telefon');
    if ($tel === '')                                $f['telefon'] = 'Telefonnummer fehlt.';
    elseif (strlen(preg_replace('/\D+/', '', $tel)) < 9) $f['telefon'] = 'Diese Nummer sieht unvollständig aus.';

    $alter = signup_age($v('geburtsdatum'));
    if ($alter === null)          $f['geburtsdatum'] = 'Geburtsdatum fehlt oder ist ungültig.';
    elseif ($alter < FF_MIN_AGE)  $f['geburtsdatum'] = 'Die Teilnahme ist ab ' . FF_MIN_AGE . ' Jahren möglich.';
    elseif ($alter > 100)         $f['geburtsdatum'] = 'Bitte prüf das Geburtsjahr.';

    // Regel 1: Minderjährige brauchen die Einwilligung der Erziehungsberechtigten.
    $minder = $alter !== null && $alter >= FF_MIN_AGE && $alter < 18;
    if ($minder) {
        if ($v('gv_name') === '')  $f['gv_name'] = 'Name der erziehungsberechtigten Person fehlt.';
        $ge = $v('gv_email');
        if ($ge === '')                                  $f['gv_email'] = 'E-Mail der erziehungsberechtigten Person fehlt.';
        elseif (!filter_var($ge, FILTER_VALIDATE_EMAIL)) $f['gv_email'] = 'Diese E-Mail-Adresse stimmt nicht.';
    }

    // Regel 2: Wer «ja» ankreuzt, muss auch sagen, worum es geht.
    $ges = $v('gesundheit');
    if ($ges !== 'ja' && $ges !== 'nein') $f['gesundheit'] = 'Bitte beantworte die Gesundheitsfrage.';
    if ($ges === 'ja' && $v('gesundheit_text') === '') {
        $f['gesundheit_text'] = 'Bitte beschreib es kurz — es bleibt vertraulich.';
    }

    if (empty($p['agb'])) $f['agb'] = 'Ohne Zustimmung zu den AGB geht es leider nicht.';

    if ($f !== []) return ['ok' => false, 'errors' => $f];

    return ['ok' => true, 'errors' => [], 'data' => [
        'id'         => date('Ymd-His') . '-' . bin2hex(random_bytes(3)),
        'ts'         => time(),
        'vorname'    => $v('vorname'),
        'name'       => $v('name'),
        'email'      => $email,
        'telefon'    => $tel,
        'geburtsdatum' => $v('geburtsdatum'),
        'alter'      => $alter,
        'gv_name'    => $minder ? $v('gv_name') : '',
        'gv_email'   => $minder ? $v('gv_email') : '',
        'gesundheit' => $ges,
        'gesundheit_text' => $ges === 'ja' ? mb_substr($v('gesundheit_text'), 0, 1000) : '',
        'fotos'      => !empty($p['fotos']),
        'nachricht'  => mb_substr($v('nachricht'), 0, 1000),
        'status'     => 'neu',
    ]];
}

/** Honigtopf und Mindestdauer — hält die einfachen Massenversender fern. */
function signup_looks_human(array $p): bool {
    if (trim((string)($p['website'] ?? '')) !== '') return false;      // unsichtbares Feld
    $ts = (int)($p['ts'] ?? 0);
    return $ts > 0 && (time() - $ts) >= FF_SIGNUP_FILL && (time() - $ts) < 86400;
}

/**
 * Gezählt werden nur zustandegekommene Anmeldungen, nicht Versuche. Sonst
 * sperrt sich aus, wer sich dreimal vertippt — und getroffen wären genau die
 * Leute, die sich anmelden wollen. Gegen Skripte stehen Honigtopf und
 * Mindestdauer, die kosten niemanden etwas.
 *
 * Gespeichert wird nur ein gesalzener Hash, nie die IP-Adresse selbst.
 */
function signup_rate_state(): array {
    $r    = json_read('signup_rate.json');
    $salt = (string)($r['salt'] ?? '');
    if ($salt === '') $salt = bin2hex(random_bytes(16));
    $now  = time();
    $hits = [];
    foreach ((array)($r['hits'] ?? []) as $k => $liste) {
        $frisch = array_values(array_filter((array)$liste, fn($t) => $now - (int)$t < 3600));
        if ($frisch !== []) $hits[$k] = $frisch;
    }
    $key = substr(hash_hmac('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? ''), $salt), 0, 24);
    return [$salt, $hits, $key];
}

function signup_rate_ok(): bool {
    [, $hits, $key] = signup_rate_state();
    return count($hits[$key] ?? []) < FF_SIGNUP_TRIES;
}

/** Erst nach einer gespeicherten Anmeldung aufrufen. */
function signup_rate_hit(): void {
    [$salt, $hits, $key] = signup_rate_state();
    $hits[$key][] = time();
    json_write('signup_rate.json', ['salt' => $salt, 'hits' => $hits]);
}

function signup_all(): array {
    $rows = array_values(array_filter(json_read('signups.json'), 'is_array'));
    usort($rows, fn($a, $b) => (int)($b['ts'] ?? 0) <=> (int)($a['ts'] ?? 0));
    return $rows;
}

function signup_save(array $rows): bool { return json_write('signups.json', array_values($rows)); }

/** Anmeldung ablegen und einen Platz abziehen. */
function signup_store(array $data): bool {
    $rows = signup_all();
    array_unshift($rows, $data);
    if (!signup_save($rows)) return false;

    $saved  = json_read('content.json');
    $prog   = ff_content()['program'];
    $gesamt = max(0, (int)$prog['seats_total']);
    $frei   = $prog['seats_left'] === '' ? $gesamt : max(0, (int)$prog['seats_left']);
    $neu    = max(0, $frei - 1);

    $saved['program'] = ($saved['program'] ?? []) + [];
    $saved['program']['seats_left'] = (string)$neu;
    $saved['program']['sold_out']   = $neu === 0;
    json_write('content.json', $saved);
    ff_content(true);
    return true;
}

function signup_name(array $r): string {
    return trim((string)($r['vorname'] ?? '') . ' ' . (string)($r['name'] ?? ''));
}
