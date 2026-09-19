<?php
/**
 * COMBAT MIND — Kern: Pfade, Speicher, Auth, CSRF.
 * Bewusst ohne Datenbank: JSON-Dateien reichen für diese Menge an Inhalt
 * und lassen sich per FTP sichern und zurückspielen.
 */
declare(strict_types=1);

/*
 * Fehler werden protokolliert, aber nie ausgegeben. Eine PHP-Meldung im
 * Browser verriete Dateipfade und Codezeilen — und ob sie erscheint, hinge
 * sonst allein an der Serverkonfiguration.
 */
@ini_set('display_errors', '0');
@ini_set('log_errors', '1');
error_reporting(E_ALL);

defined('FF_ROOT')    || define('FF_ROOT', __DIR__ . '/..');

// Als define statt const, damit Tests die Ablage auf ein temporäres
// Verzeichnis umlenken können und echte Inhalte nie anfassen.
defined('FF_DATA')    || define('FF_DATA', FF_ROOT . '/data');
defined('FF_GALLERY') || define('FF_GALLERY', FF_ROOT . '/assets/gallery');
const FF_LOGIN_TRIES   = 6;              // Fehlversuche je Gerät
const FF_LOCKOUT       = 900;            // 15 Minuten Sperre für dieses Gerät
const FF_GLOBAL_TRIES  = 30;             // Notbremse: Versuche aus allen Quellen
const FF_GLOBAL_WINDOW = 3600;           // innerhalb einer Stunde
const FF_KNOWN_DAYS    = 30;             // so lange gilt ein Gerät als bekannt

/**
 * Wie array_is_list(), aber ohne PHP 8.1 vorauszusetzen — das war die einzige
 * Stelle, die eine neuere Version verlangt hätte als der Rest des Codes.
 */
function is_list_array(array $a): bool {
    return $a === [] || array_keys($a) === range(0, count($a) - 1);
}

/** HTML-Escaping. Jede Ausgabe von Benutzerinhalt läuft hierdurch. */
function h(?string $s): string {
    return htmlspecialchars($s ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Absolute URL auf Basis der im Admin gesetzten Domain. Leer, wenn keine gesetzt. */
function site_url(string $path = ''): string {
    $base = rtrim((string)(ff_content()['contact']['site_url'] ?? ''), '/');
    if ($base === '') return '';
    return $base . ($path === '' ? '/' : '/' . ltrim($path, '/'));
}

/**
 * Attribute für einen Anmelde-Button. Ohne Formular-Link zeigt er auf den
 * Anmelde-Abschnitt, statt ins Leere zu führen. Mit Tally-ID öffnet er ein
 * Overlay, ohne ID die Formularseite.
 */
function cta_attrs(string $url, string $id = '', string $fallback = '#anmeldung'): string {
    if ($url === '') return 'href="' . h($fallback) . '"';
    // Kein auto-close: Tally leitet nach dem Absenden auf danke.php weiter, und
    // ein sich selbst schliessendes Fenster würde genau das verhindern.
    return 'href="' . h($url) . '"' . ($id
        ? ' data-tally-open="' . h($id) . '" data-tally-layout="modal" data-tally-width="720"'
          . ' data-tally-overlay="1"'
        : '');
}

/** PLZ und Ort als eine Zeile, ohne führendes Leerzeichen wenn eines fehlt. */
function zip_city(): string {
    $c = ff_content()['contact'];
    return trim(($c['zip'] ?? '') . ' ' . ($c['city'] ?? ''));
}

/**
 * Telefonnummer als tel:-Ziel in internationaler Form. Eine führende 0 wird zu
 * +41, damit der Link auch aus dem Ausland wählt und Google die Nummer
 * eindeutig zuordnen kann. Leere Eingabe ergibt einen leeren String.
 */
function phone_href(string $nr = ''): string {
    if ($nr === '') $nr = (string)(ff_content()['contact']['phone'] ?? '');
    $intl = str_starts_with(ltrim($nr), '+');
    $d = preg_replace('/\D+/', '', $nr);
    if ($d === '') return '';
    if ($intl)                     return '+' . $d;
    if (str_starts_with($d, '00')) return '+' . substr($d, 2);
    if (str_starts_with($d, '0'))  return '+41' . substr($d, 1);
    if (str_starts_with($d, '41')) return '+' . $d;
    return '+41' . $d;
}

/** Zeilenumbrüche aus dem Admin zu Absätzen machen (nach dem Escaping). */
function paragraphs(?string $s): string {
    $out = '';
    foreach (preg_split('/\n\s*\n/', trim((string)$s)) as $p) {
        if ($p === '') continue;
        $out .= '<p class="lede">' . nl2br(h($p)) . '</p>';
    }
    return $out;
}

/**
 * Datendateien heissen *.json.php und beginnen mit einem exit-Guard. Ruft sie
 * jemand direkt im Browser auf, führt PHP die erste Zeile aus und liefert
 * nichts. Das schützt auch dort, wo .htaccess ignoriert wird (nginx) — der
 * Guard hängt an keiner Serverkonfiguration.
 */
const FF_GUARD = "<?php exit; ?>\n";

function data_path(string $file): string {
    return FF_DATA . '/' . basename($file) . '.php';
}

function json_read(string $file, array $fallback = []): array {
    $path = data_path($file);
    if (!is_file($path)) return $fallback;
    $raw = file_get_contents($path);
    if ($raw === false || $raw === '') return $fallback;
    if (str_starts_with($raw, '<?php')) {
        $nl = strpos($raw, "\n");
        $raw = $nl === false ? '' : substr($raw, $nl + 1);
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : $fallback;
}

/** Atomar schreiben: erst temporär, dann umbenennen — nie eine halbe Datei. */
function json_write(string $file, array $data): bool {
    if (!is_dir(FF_DATA) && !@mkdir(FF_DATA, 0775, true)) return false;
    $path = data_path($file);
    $tmp  = $path . '.' . bin2hex(random_bytes(6)) . '.tmp';
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) return false;
    if (file_put_contents($tmp, FF_GUARD . $json, LOCK_EX) === false) { @unlink($tmp); return false; }
    if (!@rename($tmp, $path)) { @unlink($tmp); return false; }
    return true;
}

/* ── Session ──────────────────────────────────────────────────────────── */

function session_boot(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
          || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_set_cookie_params([
        'lifetime' => 0, 'path' => '/', 'secure' => $https,
        'httponly' => true, 'samesite' => 'Lax',
    ]);
    session_name('ff_admin');
    session_start();
}

/* ── CSRF ─────────────────────────────────────────────────────────────── */

function csrf_token(): string {
    session_boot();
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return $_SESSION['csrf'];
}

function csrf_field(): string {
    return '<input type="hidden" name="_csrf" value="' . h(csrf_token()) . '">';
}

/** Jeder POST muss ein gültiges Token mitbringen, sonst bricht die Anfrage ab. */
function csrf_check(): void {
    session_boot();
    $sent = (string)($_POST['_csrf'] ?? '');
    if ($sent === '' || empty($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], $sent)) {
        http_response_code(400);
        exit('Sitzung abgelaufen. Bitte die Seite neu laden und erneut speichern.');
    }
}

/* ── Auth ─────────────────────────────────────────────────────────────── */

function auth_config(): array { return json_read('auth.json'); }
function auth_is_setup(): bool { return (auth_config()['hash'] ?? '') !== ''; }

function auth_set_password(string $pw): bool {
    return json_write('auth.json', [
        'hash'    => password_hash($pw, PASSWORD_DEFAULT),
        'created' => date('c'),
    ]);
}

/**
 * Sperrzustand. Gespeichert wird je Gerät ein Zähler, nie die IP-Adresse
 * selbst: sie wird mit einem zufälligen Wert gehasht, der nur auf diesem
 * Server liegt. Damit enthält die Datei keine Personendaten.
 */
function throttle_load(): array {
    $t = json_read('throttle.json', []);
    if (empty($t['salt'])) $t['salt'] = bin2hex(random_bytes(16));
    foreach (['ips', 'known'] as $k) if (!isset($t[$k]) || !is_array($t[$k])) $t[$k] = [];
    if (!isset($t['global']) || !is_array($t['global'])) $t['global'] = ['count' => 0, 'start' => 0];

    // Aufräumen, sonst wächst die Datei mit jedem Besucher weiter.
    $now = time();
    $t['ips']   = array_filter($t['ips'],   fn($e) => ($e['seen'] ?? 0) > $now - FF_GLOBAL_WINDOW);
    $t['known'] = array_filter($t['known'], fn($exp) => $exp > $now);
    if (($t['global']['start'] ?? 0) < $now - FF_GLOBAL_WINDOW) $t['global'] = ['count' => 0, 'start' => $now];
    return $t;
}

/** Kennung dieses Geräts. REMOTE_ADDR bewusst ohne Proxy-Header — die kann
 *  ein Angreifer frei setzen und die Sperre damit umgehen. */
function client_key(array $t): string {
    return substr(hash_hmac('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? ''), $t['salt']), 0, 24);
}

/** Verbleibende Sperrzeit für dieses Gerät, in Sekunden. */
function auth_locked_for(): int {
    $t   = throttle_load();
    $key = client_key($t);
    $now = time();

    $mine = max(0, (int)($t['ips'][$key]['until'] ?? 0) - $now);
    if ($mine > 0) return $mine;

    // Notbremse bei einem verteilten Angriff. Geräte, die sich hier schon
    // erfolgreich angemeldet haben, sind ausgenommen — sonst würde genau
    // dieser Schutz die Betreiberinnen aussperren.
    if (isset($t['known'][$key])) return 0;
    if (($t['global']['count'] ?? 0) >= FF_GLOBAL_TRIES) {
        return max(0, (int)($t['global']['start'] ?? 0) + FF_GLOBAL_WINDOW - $now);
    }
    return 0;
}

function auth_note_failure(): void {
    $t   = throttle_load();
    $key = client_key($t);
    $now = time();

    $fails = (int)($t['ips'][$key]['fails'] ?? 0) + 1;
    $t['ips'][$key] = [
        'fails' => $fails,
        'until' => $fails >= FF_LOGIN_TRIES ? $now + FF_LOCKOUT : 0,
        'seen'  => $now,
    ];
    if (($t['global']['start'] ?? 0) === 0) $t['global']['start'] = $now;
    $t['global']['count'] = (int)($t['global']['count'] ?? 0) + 1;
    json_write('throttle.json', $t);
}

function auth_note_success(): void {
    $t   = throttle_load();
    $key = client_key($t);
    unset($t['ips'][$key]);
    $t['known'][$key] = time() + FF_KNOWN_DAYS * 86400;
    json_write('throttle.json', $t);
}

function auth_login(string $pw): bool {
    if (auth_locked_for() > 0) return false;
    $hash = auth_config()['hash'] ?? '';
    if ($hash !== '' && password_verify($pw, $hash)) {
        auth_note_success();
        session_boot();
        session_regenerate_id(true);
        $_SESSION['ff_user'] = true;
        $_SESSION['ff_seen'] = time();
        return true;
    }
    auth_note_failure();
    return false;
}

function auth_logout(): void {
    session_boot();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
}

function auth_check(): bool {
    session_boot();
    if (empty($_SESSION['ff_user'])) return false;
    if (time() - (int)($_SESSION['ff_seen'] ?? 0) > 7200) { auth_logout(); return false; }
    $_SESSION['ff_seen'] = time();
    return true;
}

function auth_require(): void {
    if (!auth_check()) { header('Location: index.php'); exit; }
}

/* ── Flash-Meldungen ──────────────────────────────────────────────────── */

function flash(?string $msg = null, string $type = 'ok'): ?array {
    session_boot();
    if ($msg !== null) { $_SESSION['flash'] = ['msg' => $msg, 'type' => $type]; return null; }
    $f = $_SESSION['flash'] ?? null;
    unset($_SESSION['flash']);
    return $f;
}
