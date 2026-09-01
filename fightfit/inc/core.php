<?php
/**
 * FIGHTFIT — Kern: Pfade, Speicher, Auth, CSRF.
 * Bewusst ohne Datenbank: JSON-Dateien reichen für diese Menge an Inhalt
 * und lassen sich per FTP sichern und zurückspielen.
 */
declare(strict_types=1);

const FF_ROOT      = __DIR__ . '/..';
const FF_DATA      = FF_ROOT . '/data';
const FF_GALLERY   = FF_ROOT . '/assets/gallery';
const FF_MAX_UPLOAD = 6 * 1024 * 1024;   // 6 MB
const FF_MAX_EDGE   = 2000;              // px, längere Kante wird verkleinert
const FF_LOGIN_TRIES = 6;
const FF_LOCKOUT     = 900;              // 15 Minuten

/** HTML-Escaping. Jede Ausgabe von Benutzerinhalt läuft hierdurch. */
function h(?string $s): string {
    return htmlspecialchars($s ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
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

/** Fehlversuche zählen und nach FF_LOGIN_TRIES für FF_LOCKOUT Sekunden sperren. */
function auth_throttle_state(): array {
    $t = json_read('throttle.json', ['fails' => 0, 'until' => 0]);
    if (($t['until'] ?? 0) > time()) return $t;
    if (($t['until'] ?? 0) !== 0) $t = ['fails' => 0, 'until' => 0];
    return $t;
}

function auth_locked_for(): int {
    return max(0, (int)(auth_throttle_state()['until'] ?? 0) - time());
}

function auth_login(string $pw): bool {
    if (auth_locked_for() > 0) return false;
    $hash = auth_config()['hash'] ?? '';
    if ($hash !== '' && password_verify($pw, $hash)) {
        json_write('throttle.json', ['fails' => 0, 'until' => 0]);
        session_boot();
        session_regenerate_id(true);
        $_SESSION['ff_user'] = true;
        $_SESSION['ff_seen'] = time();
        return true;
    }
    $t = auth_throttle_state();
    $fails = (int)($t['fails'] ?? 0) + 1;
    json_write('throttle.json', [
        'fails' => $fails,
        'until' => $fails >= FF_LOGIN_TRIES ? time() + FF_LOCKOUT : 0,
    ]);
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

function flash(string $msg = null, string $type = 'ok'): ?array {
    session_boot();
    if ($msg !== null) { $_SESSION['flash'] = ['msg' => $msg, 'type' => $type]; return null; }
    $f = $_SESSION['flash'] ?? null;
    unset($_SESSION['flash']);
    return $f;
}
