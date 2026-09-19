<?php
/**
 * Backup herunterladen und wieder einspielen.
 *
 * Gesichert wird nur, was bei einem Hoster-Ausfall unwiederbringlich wäre: die
 * JSON-Dateien aus data/ und sämtliche Bilder. Der Code selbst liegt im
 * Repository und kommt über den Deploy zurück.
 */
declare(strict_types=1);
require_once __DIR__ . '/_layout.php';
require_once __DIR__ . '/../inc/media.php';
require_once __DIR__ . '/../inc/restore.php';
auth_require();

/* ── Herunterladen ──────────────────────────────────────────────────────── */

if (isset($_GET['download'])) {
    if (!class_exists('ZipArchive')) {
        flash('Der Server unterstützt keine ZIP-Dateien. Sichere data/ und assets/ stattdessen per FTP.', 'err');
        header('Location: backup.php'); exit;
    }
    $tmp = tempnam(sys_get_temp_dir(), 'cmbk');
    $zip = new ZipArchive();
    if ($tmp === false || $zip->open($tmp, ZipArchive::OVERWRITE) !== true) {
        flash('Das Backup konnte nicht erstellt werden.', 'err');
        header('Location: backup.php'); exit;
    }

    $count = 0;
    foreach (glob(FF_DATA . '/*.json.php') ?: [] as $f) {
        // Passwort-Hash bleibt draussen: ein Backup wandert per Mail und Cloud herum.
        // Anmeldungen bleiben draussen: Dieses ZIP soll bedenkenlos per Mail
        // und in der Cloud liegen dürfen, Personendaten dürfen das nicht.
        if (in_array(basename($f), ['auth.json.php', 'throttle.json.php', 'signups.json.php',
                                    'waitlist.json.php', 'signup_rate.json.php'], true)) continue;
        $zip->addFile($f, 'data/' . basename($f));
        $count++;
    }
    foreach (glob(FF_GALLERY . '/*.jpg') ?: [] as $f) {
        $zip->addFile($f, 'assets/gallery/' . basename($f));
        $count++;
    }
    foreach (['coach.jpg', 'hero.jpg', 'og.jpg'] as $name) {
        $f = FF_ROOT . '/assets/' . $name;
        if (is_file($f)) { $zip->addFile($f, 'assets/' . $name); $count++; }
    }
    $zip->addFromString('LIESMICH.txt',
        "COMBAT MIND — Inhalts-Backup vom " . date('d.m.Y H:i') . "\r\n\r\n" .
        "Zurückspielen im Admin unter Backup → «Backup einspielen».\r\n" .
        "Diese Datei unverändert lassen und nicht entpacken.\r\n\r\n" .
        "Nicht enthalten: das Admin-Passwort. Es bleibt beim Einspielen unverändert.\r\n");
    $zip->close();

    if ($count === 0) {
        @unlink($tmp);
        flash('Es gibt noch nichts zu sichern.', 'err');
        header('Location: backup.php'); exit;
    }

    $name = 'combat-mind-backup-' . date('Y-m-d') . '.zip';
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $name . '"');
    header('Content-Length: ' . filesize($tmp));
    header('X-Content-Type-Options: nosniff');
    readfile($tmp);
    @unlink($tmp);
    exit;
}

/* ── Einspielen ─────────────────────────────────────────────────────────── */

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Sprengt der Upload post_max_size, kommt die Anfrage ohne Felder an — auch
    // ohne CSRF-Token. Das zuerst abfangen, sonst wirkt es wie eine abgelaufene
    // Sitzung und man sucht an der falschen Stelle.
    if ($_POST === [] && $_FILES === []) {
        flash('Die Datei ist grösser, als der Server annimmt (Grenze: '
            . ini_get('post_max_size') . '). Spiel sie per FTP ein.', 'err');
        header('Location: backup.php'); exit;
    }
    csrf_check();

    $up  = $_FILES['backup'] ?? [];
    $err = (int)($up['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) {
        flash('Die Datei ist zu gross (Grenze: ' . ini_get('upload_max_filesize') . ').', 'err');
    } elseif ($err !== UPLOAD_ERR_OK || !is_uploaded_file((string)($up['tmp_name'] ?? ''))) {
        flash('Keine gültige Datei empfangen.', 'err');
    } else {
        $b = restore_apply((string)$up['tmp_name']);
        $teile = [];
        if ($b['texte'])  $teile[] = $b['texte'] . ' Textdatei' . ($b['texte'] === 1 ? '' : 'en');
        if ($b['bilder']) $teile[] = $b['bilder'] . ' Bild' . ($b['bilder'] === 1 ? '' : 'er');
        if ($b['ok']) {
            $msg = 'Eingespielt: ' . implode(' und ', $teile) . '.';
            if ($b['uebergangen']) $msg .= ' ' . $b['uebergangen'] . ' fremde Einträge übergangen.';
            if ($b['fehler'])      $msg .= ' Nicht übernommen: ' . implode(' ', array_slice($b['fehler'], 0, 3));
            flash($msg, $b['fehler'] ? 'err' : 'ok');
        } else {
            flash(implode(' ', $b['fehler']) ?: 'Es wurde nichts eingespielt.', 'err');
        }
    }
    header('Location: backup.php'); exit;
}

/* ── Seite ──────────────────────────────────────────────────────────────── */

$bilder = count(glob(FF_GALLERY . '/*.jpg') ?: []);
$stand  = is_dir(FF_DATA . '/vorher') ? filemtime(FF_DATA . '/vorher') : 0;

admin_head('Backup');
admin_tabs('backup.php');
?>
<h1>Backup</h1>
<p class="sub">Texte, Termine und Bilder sichern — und im Notfall zurückholen.</p>

<div class="card">
  <h2 style="margin-top:0">Herunterladen</h2>
  <p style="color:var(--mute)">
    Ein ZIP mit allen Inhalten: <?= $bilder ?> <?= $bilder === 1 ? 'Bild' : 'Bilder' ?>
    und sämtliche Texte und Termine. <strong>Ohne Passwort</strong> — die Datei darf
    also gefahrlos in der Cloud oder im Mailfach liegen.
  </p>
  <a class="btn" href="backup.php?download=1">Backup herunterladen</a>
</div>

<div class="card">
  <h2 style="margin-top:0">Backup einspielen</h2>
  <p style="color:var(--mute)">
    Lädt ein zuvor heruntergeladenes ZIP wieder ein. Texte und Termine werden
    <strong>ersetzt</strong>, Bilder <strong>ergänzt</strong> — ein Foto, das seither
    dazugekommen ist, verschwindet also nicht vom Server, taucht aber nicht mehr in
    der Galerie auf, wenn es im Backup fehlt.
  </p>
  <p style="color:var(--mute)">
    Dein <strong>Passwort bleibt unverändert</strong>, es steckt nicht im Backup.
    Der bisherige Textstand wird vorher automatisch beiseitegelegt<?php
      if ($stand): ?> (zuletzt am <?= h(date('d.m.Y H:i', $stand)) ?>)<?php endif ?>.
  </p>
  <form method="post" enctype="multipart/form-data">
    <?= csrf_field() ?>
    <label><span class="lbl">Backup-Datei (.zip)</span>
      <input type="file" name="backup" accept=".zip,application/zip" required>
    </label>
    <button class="btn btn--danger" type="submit"
      onclick="return confirm('Texte und Termine werden durch den Stand aus dem Backup ersetzt. Fortfahren?')">
      Backup einspielen
    </button>
  </form>
</div>
<?php admin_foot();
